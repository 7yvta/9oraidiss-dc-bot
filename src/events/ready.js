const { Events, ActivityType, REST, Routes } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const { initializeInviteCache } = require("../utils/inviteTracker");
const { enforceGuildLock } = require("../utils/guildLock");
const { startAutoMessageScheduler } = require("../utils/autoMessageScheduler");
const { startAutoVouchScheduler } = require("../utils/autoVouchScheduler");
const { getGuildSettingsSync } = require("../utils/guildSettings");
const { syncLevelRewardRolePermissionsForGuild } = require("../utils/levelRolePermissions");
const { filterCommandsForGuild, getCommandPublishPolicy } = require("../utils/commandPublishPolicy");
const { normalizeCommandPayloads } = require("../utils/commandPayload");
const { initPostgres } = require("../utils/postgres");
const { startJobScheduler } = require("../utils/jobScheduler");
const { startInstanceWatchdog } = require("../utils/instanceWatchdog");
const { sendAlert } = require("../utils/alerts");
const { enforceProtectedLogChannelsForGuild } = require("../utils/logChannelProtection");
const { syncRoleThemeForConfiguredGuilds } = require("../utils/roleThemeSync");
const { syncChannelThemeForConfiguredGuilds } = require("../utils/channelThemeSync");
const {
  syncTicketPanelPlacementForConfiguredGuilds
} = require("../utils/ticketPanelPlacementSync");
const { startAutoBackupScheduler } = require("../utils/backupManager");
const config = require("../config");

function resolveActivityType(rawType) {
  const normalized = String(rawType || "Watching").trim().toLowerCase();
  if (normalized === "playing" || normalized === "game") return ActivityType.Playing;
  if (normalized === "listening" || normalized === "listen") return ActivityType.Listening;
  if (normalized === "competing" || normalized === "compete") return ActivityType.Competing;
  if (normalized === "streaming" || normalized === "stream") return ActivityType.Streaming;
  return ActivityType.Watching;
}

function syncBotPresence(clientReady) {
  const activityText = String(process.env.BOT_ACTIVITY_TEXT || "Tickets + Services").trim();
  if (!activityText) {
    return;
  }
  clientReady.user.setActivity(activityText, {
    type: resolveActivityType(process.env.BOT_ACTIVITY_TYPE)
  });
}

function readCommandFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...readCommandFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function resolveCommandSyncGuildIds(client) {
  const guildIds = new Set(Array.from(client.guilds.cache.keys()));
  if (guildIds.size > 0 || typeof client.guilds.fetch !== "function") {
    return Array.from(guildIds);
  }

  const fetched = await client.guilds.fetch().catch(() => null);
  if (fetched?.keys) {
    for (const guildId of fetched.keys()) {
      guildIds.add(String(guildId));
    }
  }
  return Array.from(guildIds);
}

async function syncGuildCommands(client) {
  const shouldSync =
    String(process.env.AUTO_SYNC_COMMANDS_ON_READY || "true").toLowerCase() ===
    "true";
  if (!shouldSync) {
    return { skipped: true, reason: "disabled" };
  }

  const guildIds = await resolveCommandSyncGuildIds(client);
  if (guildIds.length === 0) {
    return { skipped: true, reason: "no_guilds" };
  }

  const commandsPath = path.join(__dirname, "..", "commands");
  const commandFiles = readCommandFiles(commandsPath);
  const allCommands = [];

  for (const filePath of commandFiles) {
    const command = require(filePath);
    if (!command?.data?.toJSON || !command?.execute) {
      continue;
    }
    const payload = command.data.toJSON();
    allCommands.push({
      name: payload.name,
      payload
    });
  }

  const commandPolicy = getCommandPublishPolicy();
  const results = [];

  for (const targetGuildId of guildIds) {
    const commands = normalizeCommandPayloads(
      filterCommandsForGuild(allCommands, targetGuildId, commandPolicy)
        .map((record) => record.payload)
    );

    try {
      const result = await client.application.commands.set(commands, targetGuildId);
      const registered = Number(result?.size ?? (Array.isArray(result) ? result.length : commands.length));
      const expected = commands.length;
      console.log(
        `Synced ${registered || expected} slash commands to guild ${targetGuildId}`
      );
      if (registered !== expected) {
        await sendAlert(client, {
          level: "warn",
          title: "Command Sync Mismatch",
          message: "Guild command sync completed with mismatched command count.",
          guildId: targetGuildId,
          fields: [
            { name: "Guild ID", value: targetGuildId },
            { name: "Expected", value: String(expected) },
            { name: "Registered", value: String(registered) }
          ],
          dedupeKey: `command_sync_mismatch:${targetGuildId}:${expected}:${registered}`,
          ttlMs: 10 * 60_000
        }).catch(() => null);
      }
      results.push({
        ok: true,
        guildId: targetGuildId,
        expected,
        registered
      });
    } catch (error) {
      console.error(`Failed to auto-sync guild commands for guild ${targetGuildId}:`, error);
      await sendAlert(client, {
        level: "error",
        title: "Command Sync Failed",
        message: "Guild command sync failed on ready.",
        guildId: targetGuildId,
        fields: [{ name: "Guild ID", value: targetGuildId }],
        error,
        dedupeKey: `command_sync_error:${targetGuildId}`,
        ttlMs: 60_000
      }).catch(() => null);
      results.push({
        ok: false,
        guildId: targetGuildId,
        expected: commands.length,
        registered: 0,
        error: String(error?.message || error)
      });
    }
  }

  const expected = results.reduce((sum, item) => sum + Number(item.expected || 0), 0);
  const registered = results.reduce((sum, item) => sum + Number(item.registered || 0), 0);
  const failed = results.filter((item) => !item.ok);
  return {
    ok: failed.length === 0,
    guildCount: guildIds.length,
    expected,
    registered,
    results
  };
}

async function clearGlobalCommandsIfRequested(client) {
  const explicitClear =
    String(process.env.CLEAR_GLOBAL_COMMANDS || "false").toLowerCase() === "true";
  const autoClearWithGuildSync =
    String(process.env.AUTO_CLEAR_GLOBAL_ON_GUILD_SYNC || "true").toLowerCase() === "true" &&
    String(process.env.AUTO_SYNC_COMMANDS_ON_READY || "true").toLowerCase() === "true";
  const shouldClear = explicitClear || autoClearWithGuildSync;
  if (!shouldClear) {
    return;
  }

  if (!config.token || !config.clientId) {
    return;
  }

  try {
    const rest = new REST({ version: "10" }).setToken(config.token);
    await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
    console.log("Cleared global slash commands (CLEAR_GLOBAL_COMMANDS=true).");
  } catch (error) {
    console.error("Failed to clear global slash commands:", error);
  }
}

async function syncLevelRolePermissionsForAllGuilds(client) {
  const guilds = Array.from(client.guilds.cache.values());
  for (const guild of guilds) {
    const settings = getGuildSettingsSync(guild.id);
    const result = await syncLevelRewardRolePermissionsForGuild(guild, settings).catch(
      () => null
    );
    if (!result) {
      continue;
    }
    if (result.failed.length > 0) {
      console.warn(
        `[LevelRolePerms] Guild ${guild.id} failures: ${JSON.stringify(result.failed)}`
      );
    }
  }
}

async function syncBotNicknamesForAllGuilds(client) {
  const syncEnabled =
    String(process.env.SYNC_BOT_NICKNAME_ON_READY || "false").toLowerCase() ===
    "true";
  if (!syncEnabled) {
    return;
  }

  const desiredNickname = String(process.env.BOT_NICKNAME || "").trim();
  const clearWhenUnset =
    String(process.env.CLEAR_BOT_NICKNAME_ON_READY || "false").toLowerCase() ===
    "true";

  const guilds = Array.from(client.guilds.cache.values());
  for (const guild of guilds) {
    try {
      const me = guild.members.me || (await guild.members.fetchMe());
      if (!desiredNickname) {
        if (!clearWhenUnset) {
          continue;
        }
        if (me?.nickname) {
          await me.setNickname(null, "Startup bot nickname clear");
          console.log(`[Nickname] Cleared bot nickname in guild ${guild.id}.`);
        }
        continue;
      }

      if (me?.nickname !== desiredNickname) {
        await me.setNickname(desiredNickname, "Startup bot nickname sync");
        console.log(`[Nickname] Synced bot nickname in guild ${guild.id}.`);
      }
    } catch (error) {
      console.warn(
        `[Nickname] Could not sync bot nickname in guild ${guild.id}: ${error?.message || error}`
      );
    }
  }
}

async function enforceProtectedLogChannelsForAllGuilds(client) {
  const guilds = Array.from(client.guilds.cache.values());
  for (const guild of guilds) {
    const result = await enforceProtectedLogChannelsForGuild(guild).catch(() => null);
    if (!result) {
      continue;
    }
    if (result.failed.length > 0) {
      console.warn(
        `[LogProtection] Guild ${guild.id} failures: ${JSON.stringify(result.failed)}`
      );
    }
  }
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(clientReady) {
    console.log(`Logged in as ${clientReady.user.tag}`);
    syncBotPresence(clientReady);

    await initPostgres().catch((error) => {
      console.error("Postgres initialization failed:", error);
    });

    const watchdogEnabled =
      String(process.env.INSTANCE_WATCHDOG_ENABLED || "true").trim().toLowerCase() !== "false";
    if (watchdogEnabled) {
      const watchdog = await startInstanceWatchdog(clientReady).catch((error) => ({
        enabled: false,
        healthy: false,
        lastError: String(error?.message || error)
      }));
      if (watchdog?.enabled && watchdog?.blockStartup) {
        console.error("Instance watchdog blocked startup: duplicate active host detected.");
        process.exit(1);
        return;
      }
    } else {
      console.warn("Ready watchdog check skipped: INSTANCE_WATCHDOG_ENABLED=false.");
    }

    startJobScheduler(clientReady);
    startAutoBackupScheduler(clientReady);

    await clearGlobalCommandsIfRequested(clientReady);
    await syncGuildCommands(clientReady);

    initializeInviteCache(clientReady).catch((error) => {
      console.error("Invite cache initialization failed:", error);
    });

    syncLevelRolePermissionsForAllGuilds(clientReady).catch((error) => {
      console.error("Level role permission sync failed:", error);
    });

    syncBotNicknamesForAllGuilds(clientReady).catch((error) => {
      console.error("Bot nickname sync failed:", error);
    });

    enforceProtectedLogChannelsForAllGuilds(clientReady).catch((error) => {
      console.error("Protected log channel lock sync failed:", error);
    });

    syncRoleThemeForConfiguredGuilds(clientReady)
      .then((outcome) => {
        if (outcome?.skipped) {
          console.log(`[RoleTheme] Skipped: ${outcome.reason}`);
          return;
        }
        for (const item of outcome.results || []) {
          console.log(
            `[RoleTheme] Guild ${item.guildId}: changed=${item.changed} failed=${item.failed} skipped=${item.skipped}`
          );
          if (Array.isArray(item.details) && item.details.length > 0) {
            console.log(`[RoleTheme] ${item.details.slice(0, 20).join(" | ")}`);
          }
        }
      })
      .catch((error) => {
        console.error("Role theme sync failed:", error);
      });

    syncChannelThemeForConfiguredGuilds(clientReady)
      .then((outcome) => {
        if (outcome?.skipped) {
          console.log(`[ChannelTheme] Skipped: ${outcome.reason}`);
          return;
        }
        for (const item of outcome.results || []) {
          console.log(
            `[ChannelTheme] Guild ${item.guildId}: changed=${item.changed} failed=${item.failed} skipped=${item.skipped}`
          );
          if (Array.isArray(item.details) && item.details.length > 0) {
            console.log(`[ChannelTheme] ${item.details.slice(0, 20).join(" | ")}`);
          }
        }
      })
      .catch((error) => {
        console.error("Channel theme sync failed:", error);
      });

    syncTicketPanelPlacementForConfiguredGuilds(clientReady)
      .then((outcome) => {
        if (outcome?.skipped) {
          console.log(`[TicketPanelSync] Skipped: ${outcome.reason}`);
          return;
        }
        for (const item of outcome.results || []) {
          console.log(
            `[TicketPanelSync] Guild ${item.guildId}: changed=${item.changed} failed=${item.failed} skipped=${item.skipped}`
          );
          if (Array.isArray(item.details) && item.details.length > 0) {
            console.log(
              `[TicketPanelSync] ${item.details.slice(0, 20).join(" | ")}`
            );
          }
        }
      })
      .catch((error) => {
        console.error("Ticket panel placement sync failed:", error);
      });

    const shouldAutoSync =
      String(process.env.AUTO_SYNC_COMMANDS_ON_READY || "false").toLowerCase() ===
      "true";
    const resyncMinutes = Number(process.env.GUILD_COMMAND_RESYNC_MINUTES || 15);
    if (shouldAutoSync && resyncMinutes > 0 && Number.isFinite(resyncMinutes)) {
      setInterval(() => {
        syncGuildCommands(clientReady).catch((error) => {
          console.error("Scheduled guild command resync failed:", error);
          sendAlert(clientReady, {
            level: "error",
            title: "Scheduled Command Resync Failed",
            message: "Automatic command resync task failed.",
            error,
            dedupeKey: "scheduled_command_resync_failed",
            ttlMs: 60_000
          }).catch(() => null);
        });
      }, Math.floor(resyncMinutes * 60 * 1000));
      console.log(`Scheduled guild command resync every ${resyncMinutes} minute(s).`);
    } else {
      console.log("Guild command auto-sync is disabled.");
    }

    const lockRecheckMinutes = Number(process.env.LOG_CHANNEL_LOCK_RECHECK_MINUTES || 5);
    if (lockRecheckMinutes > 0 && Number.isFinite(lockRecheckMinutes)) {
      setInterval(() => {
        enforceProtectedLogChannelsForAllGuilds(clientReady).catch((error) => {
          console.error("Protected log channel recheck failed:", error);
        });
      }, Math.floor(lockRecheckMinutes * 60 * 1000));
      console.log(
        `Scheduled protected log channel recheck every ${lockRecheckMinutes} minute(s).`
      );
    }

    // await enforceGuildLock(clientReady); // Temporarily disabled to allow bot to join new servers
    startAutoMessageScheduler(clientReady);
    startAutoVouchScheduler(clientReady);
  }
};

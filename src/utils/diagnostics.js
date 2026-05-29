const os = require("node:os");
const { getPostgresStatus, initPostgres } = require("./postgres");
const { getSchedulerStats } = require("./jobScheduler");
const { getPersistenceBackend } = require("./persistentStore");
const { getGuildSettingsSync } = require("./guildSettings");
const { getInstanceWatchdogState } = require("./instanceWatchdog");
const { getTicketTypeConfig } = require("./tickets");

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = bytes;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function getIntentsSummary(client) {
  const bitfield = Number(client?.options?.intents?.bitfield || 0);
  return {
    bitfield,
    guilds: Boolean(bitfield & (1 << 0)),
    guildMembers: Boolean(bitfield & (1 << 1)),
    guildMessages: Boolean(bitfield & (1 << 9)),
    guildModeration: Boolean(bitfield & (1 << 2)),
    messageContent: Boolean(bitfield & (1 << 15))
  };
}

async function getRuntimeDiagnostics(client, guildId = null) {
  await initPostgres().catch(() => null);
  const postgres = getPostgresStatus();
  const scheduler = await getSchedulerStats().catch(() => ({
    backend: getPersistenceBackend(),
    runningNow: 0,
    processed: 0,
    failed: 0,
    lastPollAt: null,
    queue: { queued: 0, running: 0, other: 0 }
  }));
  const memory = process.memoryUsage();
  const instanceWatchdog = getInstanceWatchdogState();
  const intents = getIntentsSummary(client);
  const settings = guildId ? getGuildSettingsSync(guildId) : null;
  const ticketConfig = guildId ? getTicketTypeConfig(guildId) : null;

  let commandSync = null;
  try {
    const localLoaded = Number(client?.commands?.size || 0);
    const app = client?.application;
    if (app?.commands?.fetch) {
      let guildRegistered = null;
      if (guildId) {
        const guildCommands = await app.commands.fetch({ guildId }).catch(() => null);
        if (guildCommands) {
          guildRegistered = Number(guildCommands.size || 0);
        }
      }
      const globalCommands = await app.commands.fetch().catch(() => null);
      const globalRegistered = globalCommands ? Number(globalCommands.size || 0) : null;
      const comparedCount = guildRegistered != null ? guildRegistered : globalRegistered;
      commandSync = {
        localLoaded,
        guildRegistered,
        globalRegistered,
        healthy: comparedCount != null ? comparedCount === localLoaded : null
      };
    }
  } catch {
    commandSync = null;
  }

  return {
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString(),
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    persistenceBackend: getPersistenceBackend(),
    postgres,
    scheduler,
    instanceWatchdog,
    intents,
    guilds: client?.guilds?.cache?.size || 0,
    commands: client?.commands?.size || 0,
    memory: {
      rss: formatBytes(memory.rss),
      heapUsed: formatBytes(memory.heapUsed),
      heapTotal: formatBytes(memory.heapTotal),
      external: formatBytes(memory.external)
    },
    commandSync,
    channels: settings
      ? {
          modLogChannelId: settings.modLogChannelId || null,
          serverUpdateChannelId: settings.serverUpdateChannelId || null,
          ticketTranscriptLogId: settings.ticketTranscriptLogId || null,
          levelUpChannelId: settings.levelUpChannelId || null
        }
      : null,
    ticketConfig: ticketConfig
      ? Object.fromEntries(
          Object.entries(ticketConfig).map(([type, entry]) => [
            type,
            {
              enabled: entry.enabled !== false,
              panelChannelId: entry.panelChannelId || null,
              categoryId: entry.categoryId || null,
              teamRoleCount: Array.isArray(entry.teamRoleIds) ? entry.teamRoleIds.length : 0,
              transcriptLogChannelId: entry.transcriptLogChannelId || null
            }
          ])
        )
      : null
  };
}

module.exports = {
  getRuntimeDiagnostics
};

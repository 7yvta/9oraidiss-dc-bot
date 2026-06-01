const { ChannelType, PermissionFlagsBits } = require("discord.js");
const {
  getGuildOverridesSync,
  getGuildSettingsSync,
  patchGuildOverrides
} = require("./guildSettings");
const { buildLogEmbed, sendLogToChannel } = require("./logger");
const config = require("../config");
const PROTECTION_AUDIT_CHANNEL_ID =
  process.env.LOG_PROTECTION_AUDIT_CHANNEL_ID || "1500634156315578510";

const PROTECTED_LOG_CHANNEL_KEYS = [
  "modLogChannelId",
  "serverUpdateChannelId",
  "reportChannelId",
  "ticketTranscriptLogId"
];

const DEFAULT_PROTECTED_LOG_CHANNEL_NAMES = {
  modLogChannelId: "mod-logs",
  serverUpdateChannelId: "server-logs",
  reportChannelId: "report-logs",
  ticketTranscriptLogId: "ticket-transcripts"
};

const DEFAULT_LOG_PROTECTION_BYPASS_ROLE_IDS = [
  "1479263062065152111",
  "1479263536797454489"
];

function isLogChannelAutoRestoreEnabled() {
  return (
    String(process.env.LOG_CHANNEL_AUTO_RESTORE_ENABLED || "false")
      .trim()
      .toLowerCase() === "true"
  );
}

function parseIdList(rawValue, fallback = []) {
  const text = String(rawValue || "").trim();
  if (!text) {
    return [...fallback];
  }

  const ids = text
    .split(/[,\s]+/)
    .map((value) => normalizeSnowflake(value))
    .filter(Boolean);
  return ids.length > 0 ? ids : [...fallback];
}

// Locked to explicit owner-requested bypass roles only.
const LOG_PROTECTION_BYPASS_ROLE_IDS = [...DEFAULT_LOG_PROTECTION_BYPASS_ROLE_IDS];

function normalizeSnowflake(value) {
  const text = String(value || "").trim();
  if (!/^\d{17,20}$/.test(text)) {
    return null;
  }
  return text;
}

function normalizeChannelId(value) {
  return normalizeSnowflake(value);
}

function collectProtectedLogChannelsFromSettings(settings) {
  const byChannelId = new Map();

  for (const key of PROTECTED_LOG_CHANNEL_KEYS) {
    const channelId = normalizeChannelId(settings?.[key]);
    if (!channelId) {
      continue;
    }

    if (!byChannelId.has(channelId)) {
      byChannelId.set(channelId, {
        channelId,
        keys: []
      });
    }

    byChannelId.get(channelId).keys.push(key);
  }

  return Array.from(byChannelId.values());
}

function getProtectedLogChannelsForGuild(guild) {
  const guildId = normalizeSnowflake(guild?.id);
  if (!guildId) {
    return [];
  }

  const settings = getGuildSettingsSync(guildId);
  const overrides = getGuildOverridesSync(guildId);
  const primaryGuildId = normalizeSnowflake(config.guildId);

  const byChannelId = new Map();
  for (const key of PROTECTED_LOG_CHANNEL_KEYS) {
    let channelId = normalizeChannelId(overrides?.[key]);
    if (!channelId && primaryGuildId && guildId === primaryGuildId) {
      channelId = normalizeChannelId(settings?.[key]);
    }
    if (!channelId) {
      continue;
    }

    if (!byChannelId.has(channelId)) {
      byChannelId.set(channelId, {
        channelId,
        keys: []
      });
    }

    byChannelId.get(channelId).keys.push(key);
  }

  return Array.from(byChannelId.values());
}

function isProtectedLogChannelId(guild, channelId) {
  const normalizedId = normalizeChannelId(channelId);
  if (!guild?.id || !normalizedId) {
    return false;
  }

  const protectedChannels = getProtectedLogChannelsForGuild(guild);
  return protectedChannels.some((entry) => entry.channelId === normalizedId);
}

function buildCreateOptionsFromDeletedChannel(channel) {
  const safeType =
    Number.isInteger(channel?.type) &&
    channel.type !== ChannelType.DM &&
    channel.type !== ChannelType.GroupDM &&
    channel.type !== ChannelType.PublicThread &&
    channel.type !== ChannelType.PrivateThread &&
    channel.type !== ChannelType.AnnouncementThread
      ? channel.type
      : ChannelType.GuildText;

  const options = {
    name: channel?.name || "restored-log",
    type: safeType
  };

  if (channel?.parentId) {
    options.parent = channel.parentId;
  }

  if (safeType === ChannelType.GuildText || safeType === ChannelType.GuildAnnouncement) {
    if (typeof channel.topic === "string") {
      options.topic = channel.topic;
    }
    if (typeof channel.nsfw === "boolean") {
      options.nsfw = channel.nsfw;
    }
    if (typeof channel.rateLimitPerUser === "number") {
      options.rateLimitPerUser = channel.rateLimitPerUser;
    }
  }

  if (safeType === ChannelType.GuildVoice || safeType === ChannelType.GuildStageVoice) {
    if (typeof channel.bitrate === "number") {
      options.bitrate = channel.bitrate;
    }
    if (typeof channel.userLimit === "number") {
      options.userLimit = channel.userLimit;
    }
  }

  return options;
}

async function enforceLogChannelLock(channel, reason = "Protect log channel from edits/deletes") {
  if (!channel?.guild || typeof channel?.permissionOverwrites?.edit !== "function") {
    return false;
  }

  const botId = channel.client?.user?.id;
  if (!botId) {
    return false;
  }

  try {
    await channel.permissionOverwrites.edit(
      channel.guild.roles.everyone.id,
      {
        [PermissionFlagsBits.ManageChannels]: false,
        [PermissionFlagsBits.ManageMessages]: false,
        [PermissionFlagsBits.SendMessages]: false,
        [PermissionFlagsBits.SendMessagesInThreads]: false,
        [PermissionFlagsBits.CreatePublicThreads]: false,
        [PermissionFlagsBits.CreatePrivateThreads]: false,
        [PermissionFlagsBits.AddReactions]: false,
        [PermissionFlagsBits.MentionEveryone]: false
      },
      { reason }
    );

    for (const bypassRoleId of LOG_PROTECTION_BYPASS_ROLE_IDS) {
      const role =
        channel.guild.roles.cache.get(bypassRoleId) ||
        (await channel.guild.roles.fetch(bypassRoleId).catch(() => null));
      if (!role) {
        continue;
      }

      await channel.permissionOverwrites.edit(
        role.id,
        {
          [PermissionFlagsBits.ViewChannel]: true,
          [PermissionFlagsBits.ReadMessageHistory]: true,
          [PermissionFlagsBits.SendMessages]: true,
          [PermissionFlagsBits.SendMessagesInThreads]: true,
          [PermissionFlagsBits.ManageMessages]: true,
          [PermissionFlagsBits.ManageChannels]: true
        },
        { reason: `${reason} (bypass role)` }
      );
    }

    await channel.permissionOverwrites.edit(
      botId,
      {
        [PermissionFlagsBits.ViewChannel]: true,
        [PermissionFlagsBits.SendMessages]: true,
        [PermissionFlagsBits.EmbedLinks]: true,
        [PermissionFlagsBits.AttachFiles]: true,
        [PermissionFlagsBits.ManageMessages]: true,
        [PermissionFlagsBits.ReadMessageHistory]: true
      },
      { reason }
    );

    return true;
  } catch (error) {
    console.warn(
      `[LogProtection] Could not lock channel ${channel.id} in guild ${channel.guild.id}: ${error?.message || error}`
    );
    return false;
  }
}

async function enforceProtectedLogChannelsForGuild(guild) {
  if (!guild?.id) {
    return { checked: 0, locked: 0, failed: [] };
  }

  const entries = getProtectedLogChannelsForGuild(guild);
  let locked = 0;
  const failed = [];

  for (const entry of entries) {
    let channel =
      guild.channels.cache.get(entry.channelId) ||
      (await guild.channels.fetch(entry.channelId).catch(() => null));
    if (!channel) {
      if (!isLogChannelAutoRestoreEnabled()) {
        failed.push({
          channelId: entry.channelId,
          keys: entry.keys,
          reason: "channel_not_found_auto_restore_disabled"
        });
        continue;
      }
      const restored = await autoCreateMissingProtectedChannel(guild, entry).catch(
        () => null
      );
      if (restored?.channel) {
        channel = restored.channel;
      } else {
        failed.push({
          channelId: entry.channelId,
          keys: entry.keys,
          reason: "channel_not_found"
        });
        continue;
      }
    }

    const success = await enforceLogChannelLock(channel);
    if (success) {
      locked += 1;
      continue;
    }

    failed.push({
      channelId: entry.channelId,
      keys: entry.keys,
      reason: "lock_failed"
    });
  }

  return {
    checked: entries.length,
    locked,
    failed
  };
}

async function autoCreateMissingProtectedChannel(guild, entry) {
  if (!isLogChannelAutoRestoreEnabled()) {
    return null;
  }

  const key = Array.isArray(entry?.keys) && entry.keys.length > 0 ? entry.keys[0] : null;
  const fallbackName = key ? DEFAULT_PROTECTED_LOG_CHANNEL_NAMES[key] : null;
  const channelName = fallbackName || "protected-logs";

  const created = await guild.channels
    .create({
      name: channelName,
      type: ChannelType.GuildText,
      reason: "Auto-restore missing protected log channel"
    })
    .catch((error) => {
      console.error(
        `[LogProtection] Failed to create missing protected log channel in guild ${guild.id}:`,
        error
      );
      return null;
    });

  if (!created) {
    return null;
  }

  const patch = {};
  for (const protectedKey of entry.keys) {
    patch[protectedKey] = created.id;
  }
  await patchGuildOverrides(guild.id, patch).catch(() => null);
  await enforceLogChannelLock(created, "Lock auto-created protected log channel");

  await notifyProtectedLogRestore(
    guild,
    created.id,
    Array.from(new Set(entry.keys)),
    entry.channelId || "missing"
  ).catch(() => null);

  return { channel: created };
}

async function notifyProtectedLogRestore(guild, restoredChannelId, restoredKeys, oldChannelId) {
  const settings = getGuildSettingsSync(guild.id);
  const candidates = [
    PROTECTION_AUDIT_CHANNEL_ID,
    settings.serverUpdateChannelId,
    settings.modLogChannelId,
    restoredChannelId
  ]
    .map((value) => normalizeChannelId(value))
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

  const embed = buildLogEmbed({
    title: "Protected Log Channel Restored",
    color: 0xfaa61a,
    fields: [
      { name: "Old Channel ID", value: oldChannelId },
      { name: "New Channel", value: `<#${restoredChannelId}>` },
      { name: "Config Keys", value: restoredKeys.join(", ") || "-" }
    ],
    footer: "Log Protection"
  });

  for (const channelId of candidates) {
    const sent = await sendLogToChannel(guild, channelId, embed);
    if (sent) {
      return true;
    }
  }

  return false;
}

async function autoRestoreDeletedLogChannel(channel) {
  if (!channel?.guild?.id) {
    return { restored: false, reason: "missing_guild" };
  }

  if (!isLogChannelAutoRestoreEnabled()) {
    return { restored: false, reason: "auto_restore_disabled" };
  }

  const protectedEntries = getProtectedLogChannelsForGuild(channel.guild);
  const affectedEntries = protectedEntries.filter(
    (entry) => entry.channelId === normalizeChannelId(channel.id)
  );

  if (affectedEntries.length === 0) {
    return { restored: false, reason: "not_protected_channel" };
  }

  const createOptions = buildCreateOptionsFromDeletedChannel(channel);
  const restoredChannel = await channel.guild.channels
    .create(createOptions)
    .catch((error) => {
      console.error(
        `[LogProtection] Failed to recreate deleted protected channel ${channel.id} in guild ${channel.guild.id}:`,
        error
      );
      return null;
    });

  if (!restoredChannel) {
    return { restored: false, reason: "create_failed" };
  }

  if (typeof channel.rawPosition === "number") {
    await restoredChannel.setPosition(channel.rawPosition).catch(() => null);
  }

  const overridePatch = {};
  const restoredKeys = [];
  for (const entry of affectedEntries) {
    for (const key of entry.keys) {
      overridePatch[key] = restoredChannel.id;
      restoredKeys.push(key);
    }
  }
  await patchGuildOverrides(channel.guild.id, overridePatch).catch(() => null);

  await enforceLogChannelLock(restoredChannel, "Auto-restored protected log channel");
  await notifyProtectedLogRestore(
    channel.guild,
    restoredChannel.id,
    Array.from(new Set(restoredKeys)),
    channel.id
  ).catch(() => null);

  return {
    restored: true,
    oldChannelId: channel.id,
    restoredChannelId: restoredChannel.id,
    restoredKeys: Array.from(new Set(restoredKeys))
  };
}

async function isLogProtectionBypassUser(guild, userId) {
  const normalizedUserId = normalizeSnowflake(userId);
  if (!guild?.id || !normalizedUserId) {
    return false;
  }

  const member =
    guild.members.cache.get(normalizedUserId) ||
    (await guild.members.fetch(normalizedUserId).catch(() => null));
  if (!member) {
    return false;
  }

  return LOG_PROTECTION_BYPASS_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
}

module.exports = {
  PROTECTED_LOG_CHANNEL_KEYS,
  LOG_PROTECTION_BYPASS_ROLE_IDS,
  autoRestoreDeletedLogChannel,
  collectProtectedLogChannelsFromSettings,
  enforceLogChannelLock,
  enforceProtectedLogChannelsForGuild,
  getProtectedLogChannelsForGuild,
  isLogProtectionBypassUser,
  isProtectedLogChannelId
};

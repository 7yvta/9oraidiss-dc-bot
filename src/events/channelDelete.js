const { AuditLogEvent, Events } = require("discord.js");
const { buildLogEmbed, sendServerUpdate } = require("../utils/logger");
const { monitorAntiNuke } = require("../utils/antiNuke");
const {
  autoRestoreDeletedLogChannel,
  isLogProtectionBypassUser
} = require("../utils/logChannelProtection");

async function resolveChannelDeleter(channel) {
  if (!channel?.guild || !channel?.id) {
    return null;
  }

  const logs = await channel.guild
    .fetchAuditLogs({
      type: AuditLogEvent.ChannelDelete,
      limit: 8
    })
    .catch(() => null);
  if (!logs) {
    return null;
  }

  const now = Date.now();
  for (const entry of logs.entries.values()) {
    const targetId = entry.targetId || entry.target?.id || null;
    if (String(targetId || "") !== String(channel.id)) {
      continue;
    }
    if (now - entry.createdTimestamp > 20_000) {
      continue;
    }
    const executor = entry.executor;
    if (!executor) {
      continue;
    }
    return {
      id: executor.id,
      label: `${executor.tag} (${executor.id})`
    };
  }

  return null;
}

module.exports = {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!channel?.guild) {
      return;
    }

    const deletedBy = await resolveChannelDeleter(channel).catch(() => null);
    const bypassAllowed = deletedBy?.id
      ? await isLogProtectionBypassUser(channel.guild, deletedBy.id).catch(() => false)
      : false;

    const restoreResult = bypassAllowed
      ? { restored: false, reason: "bypass_role" }
      : await autoRestoreDeletedLogChannel(channel).catch(() => ({
          restored: false,
          reason: "restore_error"
        }));

    const fields = [
      { name: "Name", value: channel.name || "Unknown" },
      { name: "Type", value: channel.type },
      { name: "ID", value: channel.id },
      { name: "Deleted By", value: deletedBy?.label || "Unknown" }
    ];

    if (restoreResult?.restored && restoreResult.restoredChannelId) {
      fields.push({
        name: "Protection",
        value: `Auto-restored as <#${restoreResult.restoredChannelId}>`
      });
    } else if (bypassAllowed) {
      fields.push({
        name: "Protection",
        value: "Bypass role used, auto-restore skipped"
      });
    }

    const embed = buildLogEmbed({
      title: "Channel Deleted",
      color: 0xed4245,
      fields
    });

    // Normal channel deletions go to server logs.
    // Protection audit channel is reserved for protected-log security events.
    await sendServerUpdate(channel.guild, embed);
    await monitorAntiNuke({
      guild: channel.guild,
      actionType: "channel_delete",
      targetId: channel.id,
      label: "Channel Delete"
    }).catch(() => null);
  }
};


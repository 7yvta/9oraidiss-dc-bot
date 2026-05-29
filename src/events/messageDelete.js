const { AuditLogEvent, Events } = require("discord.js");
const { buildLogEmbed, sendLogToChannel, sendServerUpdate } = require("../utils/logger");
const { deleteCachedMessage, getCachedMessage } = require("../utils/messageCache");
const { setSnipe } = require("../utils/snipeStore");
const {
  isLogProtectionBypassUser,
  isProtectedLogChannelId
} = require("../utils/logChannelProtection");

const PROTECTION_AUDIT_CHANNEL_ID =
  process.env.LOG_PROTECTION_AUDIT_CHANNEL_ID || "1500634156315578510";

function trimText(text, max = 1000) {
  if (!text) {
    return "*No text content*";
  }
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 3)}...`;
}

async function resolveMessageDeleter(message, deletedAuthorId) {
  if (!message?.guild) {
    return null;
  }

  const logs = await message.guild
    .fetchAuditLogs({
      type: AuditLogEvent.MessageDelete,
      limit: 10
    })
    .catch(() => null);
  if (!logs) {
    return null;
  }

  const now = Date.now();
  for (const entry of logs.entries.values()) {
    if (now - entry.createdTimestamp > 20_000) {
      continue;
    }

    const auditChannelId =
      entry.extra?.channel?.id || entry.extra?.channelId || entry.extra?.channel?.channelId;
    if (auditChannelId && message.channelId && String(auditChannelId) !== String(message.channelId)) {
      continue;
    }

    const targetId = entry.targetId || entry.target?.id || null;
    if (deletedAuthorId && targetId && String(targetId) !== String(deletedAuthorId)) {
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
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild) {
      return;
    }

    let fetchedMessage = null;
    if (message.partial) {
      fetchedMessage = await message.fetch().catch(() => null);
    }

    const cached = getCachedMessage(message.client, message.id);
    const deletedMessage =
      fetchedMessage?.content?.trim() ||
      fetchedMessage?.cleanContent?.trim() ||
      message.content?.trim() ||
      message.cleanContent?.trim() ||
      cached?.content?.trim() ||
      "*Message content could not be captured.*";
    const attachmentValue =
      (fetchedMessage?.attachments?.size || message.attachments?.size || cached?.attachments || 0) > 0
        ? `${fetchedMessage?.attachments?.size || message.attachments?.size || cached?.attachments || 0} attachment(s)`
        : null;
    const userValue = fetchedMessage?.author
      ? `${fetchedMessage.author.tag} (${fetchedMessage.author.id})`
      : message.author
      ? `${message.author.tag} (${message.author.id})`
      : cached?.authorTag && cached?.authorId
        ? `${cached.authorTag} (${cached.authorId})`
        : "Unknown User";
    const deletedAuthorId =
      fetchedMessage?.author?.id || message.author?.id || cached?.authorId || null;
    const deletedBy = await resolveMessageDeleter(message, deletedAuthorId).catch(() => null);
    const bypassAllowed = deletedBy?.id
      ? await isLogProtectionBypassUser(message.guild, deletedBy.id).catch(() => false)
      : false;
    const channelValue = message.channel
      ? `${message.channel}`
      : cached?.channelId
        ? `<#${cached.channelId}>`
        : "Unknown Channel";
    const channelId = message.channelId || message.channel?.id || cached?.channelId || null;
    setSnipe(channelId, {
      content: deletedMessage,
      authorTag:
        fetchedMessage?.author?.tag || message.author?.tag || cached?.authorTag || "Unknown User",
      authorId: deletedAuthorId,
      attachmentCount:
        fetchedMessage?.attachments?.size || message.attachments?.size || cached?.attachments || 0
    });

    const fields = [
      {
        name: "User",
        value: userValue
      },
      {
        name: "Deleted By",
        value: deletedBy?.label || "Unknown"
      },
      { name: "Channel", value: channelValue },
      { name: "Message Deleted", value: trimText(deletedMessage) }
    ];

    if (attachmentValue) {
      fields.push({ name: "Attachments", value: attachmentValue });
    }

    const embed = buildLogEmbed({
      title: "Message Deleted",
      color: 0xed4245,
      fields
    });

    if (isProtectedLogChannelId(message.guild, channelId) && !bypassAllowed) {
      const restoreEmbed = buildLogEmbed({
        title: "Protected Log Message Restored",
        color: 0xfaa61a,
        description: "A message in a protected log channel was deleted. The bot restored a summary copy.",
        fields: [
          { name: "Channel", value: channelValue },
          { name: "User", value: userValue },
          { name: "Message", value: trimText(deletedMessage, 900) }
        ],
        footer: "Log Protection"
      });

      if (attachmentValue) {
        restoreEmbed.addFields({ name: "Attachments", value: attachmentValue });
      }

      await sendLogToChannel(message.guild, channelId, restoreEmbed);
      await sendLogToChannel(message.guild, PROTECTION_AUDIT_CHANNEL_ID, restoreEmbed);
      deleteCachedMessage(message.client, message.id);
      return;
    }

    if (isProtectedLogChannelId(message.guild, channelId) && bypassAllowed) {
      const bypassEmbed = buildLogEmbed({
        title: "Protected Log Message Deleted (Bypass Role)",
        color: 0xf1c40f,
        description: "A bypass role deleted a message in a protected log channel.",
        fields: [
          { name: "Deleted By", value: deletedBy?.label || "Unknown" },
          { name: "Channel", value: channelValue },
          { name: "User", value: userValue },
          { name: "Message", value: trimText(deletedMessage, 900) }
        ],
        footer: "Log Protection"
      });
      await sendLogToChannel(message.guild, PROTECTION_AUDIT_CHANNEL_ID, bypassEmbed);
      deleteCachedMessage(message.client, message.id);
      return;
    }

    // Normal message deletions go to server logs only.
    // Protection audit channel is reserved for protected-log security events.
    await sendServerUpdate(message.guild, embed);
    deleteCachedMessage(message.client, message.id);
  }
};

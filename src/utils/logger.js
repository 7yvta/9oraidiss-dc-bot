const { EmbedBuilder } = require("discord.js");
const { getGuildSettingsSync } = require("./guildSettings");
const { makePayloadHash, runOnce } = require("./idempotency");

function normalizeFields(fields = []) {
  return fields.map((field) => ({
    name: field.name,
    value: String(field.value ?? "-"),
    inline: Boolean(field.inline)
  }));
}

function buildResultEmbed({
  title,
  color = 0x2b2d31,
  description,
  fields = [],
  footer = "Command Result",
  timestamp = true
}) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title);

  if (description) {
    embed.setDescription(description);
  }

  if (fields.length > 0) {
    embed.addFields(normalizeFields(fields));
  }

  if (timestamp) {
    embed.setTimestamp();
  }

  if (footer) {
    embed.setFooter({ text: footer });
  }

  return embed;
}

async function sendModLog(guild, embed, extraPayload = {}) {
  const settings = getGuildSettingsSync(guild?.id);
  const channelId = settings.modLogChannelId || settings.reportChannelId;
  if (!channelId) {
    return;
  }

  await sendLogToChannel(guild, channelId, embed, extraPayload);
}

async function sendServerUpdate(guild, embed) {
  const settings = getGuildSettingsSync(guild?.id);
  const channelId = settings.serverUpdateChannelId || settings.reportChannelId;
  if (!channelId) {
    return;
  }

  await sendLogToChannel(guild, channelId, embed);
}

async function sendLogToChannel(guild, channelId, embed, extraPayload = {}) {
  if (!channelId) {
    return false;
  }

  let channel = guild.channels.cache.get(channelId);
  if (!channel) {
    channel = await guild.channels.fetch(channelId).catch(() => null);
  }
  if (!channel || !channel.isTextBased()) {
    return false;
  }

  try {
    const payload = {
      ...extraPayload
    };
    if (embed) {
      payload.embeds = [embed];
    }
    const dedupeKey = `${guild?.id || "noguild"}:${channelId}:${makePayloadHash({
      content: payload.content || "",
      embeds: payload.embeds || [],
      files: (payload.files || []).map((file) =>
        typeof file === "string" ? file : file?.name || file?.attachment || "file"
      )
    })}`;
    const execution = await runOnce({
      scope: "log_send",
      key: dedupeKey,
      ttlMs: 8000,
      action: async () => channel.send(payload)
    });
    if (execution.skipped) {
      return true;
    }
    return true;
  } catch (error) {
    console.error("Failed to send mod log:", error);
    return false;
  }
}

function buildLogEmbed({
  title,
  color = 0xffa500,
  description,
  fields = [],
  footer = "Moderation Log"
}) {
  return buildResultEmbed({
    title,
    color,
    description,
    fields,
    footer,
    timestamp: true
  });
}

async function sendTicketLog(guild, embed, extraPayload = {}) {
  const settings = getGuildSettingsSync(guild?.id);
  const candidates = [
    settings.ticketTranscriptLogId,
    process.env.TICKET_TRANSCRIPT_LOG_ID,
    settings.modLogChannelId,
    settings.reportChannelId
  ].filter(Boolean);

  const uniqueCandidates = Array.from(new Set(candidates));
  for (const channelId of uniqueCandidates) {
    const sent = await sendLogToChannel(guild, channelId, embed, extraPayload);
    if (sent) {
      return true;
    }
  }

  return false;
}

module.exports = {
  sendModLog,
  sendServerUpdate,
  sendTicketLog,
  sendLogToChannel,
  buildLogEmbed,
  buildResultEmbed
};

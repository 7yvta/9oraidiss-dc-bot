const { buildLogEmbed, sendLogToChannel } = require("./logger");
const { runOnce, makePayloadHash } = require("./idempotency");
const { getGuildSettingsSync } = require("./guildSettings");
const config = require("../config");

const ALERT_CHANNEL_ENV_ID = String(process.env.ALERT_CHANNEL_ID || "").trim();
const ALERT_WEBHOOK_URL = String(process.env.ALERT_WEBHOOK_URL || "").trim();

const LEVEL_COLORS = {
  info: 0x3498db,
  warn: 0xf1c40f,
  error: 0xed4245
};

function normalizeLevel(level) {
  const raw = String(level || "").trim().toLowerCase();
  if (raw === "error" || raw === "warn" || raw === "info") {
    return raw;
  }
  return "warn";
}

function resolveAlertGuild(client, guildId) {
  const preferredGuildId = String(guildId || "").trim();
  if (preferredGuildId) {
    return (
      client.guilds.cache.get(preferredGuildId) ||
      client.guilds.cache.first() ||
      null
    );
  }

  const controlGuildId = String(config.guildId || "").trim();
  if (controlGuildId) {
    return (
      client.guilds.cache.get(controlGuildId) ||
      client.guilds.cache.first() ||
      null
    );
  }

  return client.guilds.cache.first() || null;
}

function resolveAlertChannelId(guild) {
  if (ALERT_CHANNEL_ENV_ID) {
    return ALERT_CHANNEL_ENV_ID;
  }
  const settings = getGuildSettingsSync(guild?.id);
  return (
    settings.serverUpdateChannelId ||
    settings.modLogChannelId ||
    settings.reportChannelId ||
    null
  );
}

async function sendWebhookAlert(payload) {
  if (!ALERT_WEBHOOK_URL) {
    return false;
  }
  try {
    const response = await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return response.ok;
  } catch {
    return false;
  }
}

function truncate(value, max = 1000) {
  const text = String(value || "");
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(0, max - 14))}... (trimmed)`;
}

async function sendAlert(client, {
  level = "warn",
  title = "Bot Alert",
  message = "",
  guildId = null,
  fields = [],
  error = null,
  dedupeKey = null,
  ttlMs = 60_000,
  footer = "Monitoring"
} = {}) {
  if (!client) {
    return { ok: false, reason: "missing_client" };
  }

  const normalizedLevel = normalizeLevel(level);
  const embed = buildLogEmbed({
    title,
    color: LEVEL_COLORS[normalizedLevel],
    description: truncate(message, 900) || undefined,
    fields: [
      ...fields,
      ...(error
        ? [{ name: "Error", value: truncate(error?.message || String(error), 1000) }]
        : [])
    ].map((entry) => ({
      name: truncate(entry?.name || "Detail", 120),
      value: truncate(entry?.value || "-", 1000),
      inline: Boolean(entry?.inline)
    })),
    footer
  });

  const key = dedupeKey || makePayloadHash({
    level: normalizedLevel,
    title,
    message: String(message || ""),
    fields
  });

  const execution = await runOnce({
    scope: "monitoring_alert",
    key,
    ttlMs: Math.max(5000, Number(ttlMs) || 60_000),
    action: async () => {
      let channelSent = false;
      const guild = resolveAlertGuild(client, guildId);
      if (guild) {
        const channelId = resolveAlertChannelId(guild);
        if (channelId) {
          channelSent = await sendLogToChannel(guild, channelId, embed).catch(() => false);
        }
      }

      const webhookSent = await sendWebhookAlert({
        content: `**${title}**`,
        embeds: [
          {
            title,
            description: truncate(message, 1800) || undefined,
            color: LEVEL_COLORS[normalizedLevel],
            fields: [
              ...fields,
              ...(error
                ? [{ name: "Error", value: truncate(error?.message || String(error), 1000) }]
                : [])
            ].map((entry) => ({
              name: truncate(entry?.name || "Detail", 120),
              value: truncate(entry?.value || "-", 1000),
              inline: Boolean(entry?.inline)
            })),
            footer: { text: footer },
            timestamp: new Date().toISOString()
          }
        ]
      });

      return { channelSent, webhookSent };
    }
  });

  if (execution.skipped) {
    return { ok: true, skipped: true };
  }

  return {
    ok: true,
    skipped: false,
    channelSent: Boolean(execution.result?.channelSent),
    webhookSent: Boolean(execution.result?.webhookSent)
  };
}

module.exports = {
  sendAlert
};

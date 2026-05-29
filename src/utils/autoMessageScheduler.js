let ticker = null;
const lastSentByGuild = new Map();
const { getGuildSettingsSync } = require("./guildSettings");

async function trySendAutoMessage(client, guild) {
  const settings = getGuildSettingsSync(guild?.id);
  if (!settings.autoMessageEnabled) {
    return;
  }

  const channelId = settings.autoMessageChannelId;
  const content = String(settings.autoMessageContent || "").trim();
  if (!channelId || !content) {
    return;
  }

  const intervalMinutes = Number(settings.autoMessageIntervalMinutes) || 60;
  const intervalMs = Math.max(1, Math.min(10080, intervalMinutes)) * 60 * 1000;
  const now = Date.now();
  const lastSentAt = lastSentByGuild.get(guild.id) || 0;
  if (now - lastSentAt < intervalMs) {
    return;
  }

  let targetChannel = guild.channels?.cache?.get(channelId) || null;
  if (!targetChannel) {
    targetChannel = await guild.channels.fetch(channelId).catch(() => null);
  }
  if (!targetChannel?.isTextBased?.() || !targetChannel?.isSendable?.()) {
    return;
  }

  await targetChannel.send(content).catch(() => null);
  lastSentByGuild.set(guild.id, Date.now());
}

function startAutoMessageScheduler(client) {
  if (ticker) {
    clearInterval(ticker);
  }

  ticker = setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      trySendAutoMessage(client, guild).catch(() => null);
    }
  }, 30 * 1000);

  for (const guild of client.guilds.cache.values()) {
    trySendAutoMessage(client, guild).catch(() => null);
  }
}

module.exports = {
  startAutoMessageScheduler
};

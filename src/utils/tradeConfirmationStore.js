const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const trades = new Map();

function createTrade({ messageId, channelId, guildId, creatorId, user1Id, user2Id, info }) {
  const trade = {
    id: messageId,
    messageId,
    channelId,
    guildId,
    creatorId,
    user1Id,
    user2Id,
    info,
    createdAt: Date.now(),
    confirmedBy: {}
  };
  trades.set(messageId, trade);
  return trade;
}

function getTrade(messageId) {
  return trades.get(messageId) || null;
}

function markConfirmed(messageId, userId) {
  const trade = getTrade(messageId);
  if (!trade) {
    return { ok: false, reason: "missing" };
  }

  if (userId !== trade.user1Id && userId !== trade.user2Id) {
    return { ok: false, reason: "not-participant" };
  }

  trade.confirmedBy[userId] = Date.now();
  trades.set(messageId, trade);
  return { ok: true, trade };
}

function isFullyConfirmed(trade) {
  return Boolean(trade.confirmedBy[trade.user1Id] && trade.confirmedBy[trade.user2Id]);
}

function buildTradeEmbed(trade) {
  const user1Done = Boolean(trade.confirmedBy[trade.user1Id]);
  const user2Done = Boolean(trade.confirmedBy[trade.user2Id]);
  const done = isFullyConfirmed(trade);

  return new EmbedBuilder()
    .setColor(done ? 0x57f287 : 0x5865f2)
    .setTitle(done ? "Trade Confirmation Completed" : "Trade Confirmation")
    .setDescription(
      done
        ? "Both users confirmed this trade. You may continue."
        : "Waiting for both users to confirm this trade."
    )
    .addFields(
      { name: "User 1", value: `<@${trade.user1Id}>`, inline: true },
      { name: "User 1 Status", value: user1Done ? "Confirmed" : "Pending", inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "User 2", value: `<@${trade.user2Id}>`, inline: true },
      { name: "User 2 Status", value: user2Done ? "Confirmed" : "Pending", inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "Info", value: trade.info.slice(0, 1024) }
    )
    .setFooter({ text: `Created by ${trade.creatorId}` })
    .setTimestamp();
}

function buildTradeButtons(trade) {
  const user1Done = Boolean(trade.confirmedBy[trade.user1Id]);
  const user2Done = Boolean(trade.confirmedBy[trade.user2Id]);
  const disabledAll = isFullyConfirmed(trade);

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_trade:${trade.messageId}:${trade.user1Id}`)
        .setLabel("Confirm User 1")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabledAll || user1Done),
      new ButtonBuilder()
        .setCustomId(`confirm_trade:${trade.messageId}:${trade.user2Id}`)
        .setLabel("Confirm User 2")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabledAll || user2Done)
    )
  ];
}

module.exports = {
  createTrade,
  getTrade,
  markConfirmed,
  isFullyConfirmed,
  buildTradeEmbed,
  buildTradeButtons
};


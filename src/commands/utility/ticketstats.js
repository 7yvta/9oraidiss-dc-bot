const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const { getTicketAnalytics } = require("../../utils/ticketAnalyticsStore");

function formatDuration(ms) {
  const totalSeconds = Math.floor(Number(ms || 0) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticketstats")
    .setDescription("Show ticket analytics for this server"),

  async execute(interaction) {
    const analytics = await getTicketAnalytics(interaction.guildId);
    const topClosers =
      analytics.topClosers.length > 0
        ? analytics.topClosers.map((entry) => `<@${entry.id}> (${entry.value})`).join(", ")
        : "None";
    const topClaimers =
      analytics.topClaimers.length > 0
        ? analytics.topClaimers.map((entry) => `<@${entry.id}> (${entry.value})`).join(", ")
        : "None";

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Ticket Analytics",
          color: 0x5865f2,
          fields: [
            { name: "Total Closed", value: `${analytics.totalClosed}`, inline: true },
            {
              name: "Avg Open -> Close",
              value: formatDuration(analytics.averageCloseMs),
              inline: true
            },
            {
              name: "Avg Open -> Claim",
              value: formatDuration(analytics.averageClaimMs),
              inline: true
            },
            {
              name: "Tracked Open Tickets",
              value: `${analytics.openTicketsTracked}`,
              inline: true
            },
            { name: "Top Closers", value: topClosers },
            { name: "Top Claimers", value: topClaimers }
          ],
          footer: "Ticket Analytics"
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  }
};

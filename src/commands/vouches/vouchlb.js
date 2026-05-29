const { SlashCommandBuilder } = require("discord.js");
const { listVouches } = require("../../utils/vouchStatsStore");
const { economyEmbed, SUCCESS_COLOR } = require("../../utils/economyUi");
module.exports = {
  data: new SlashCommandBuilder().setName("vouchlb").setDescription("Top 10 most vouched users"),
  async execute(interaction) {
    const rows = (await listVouches(interaction.guild.id)).slice(0, 10);
    const medals = ["??", "??", "??"];
    const desc = rows.length ? rows.map((r, i) => `${medals[i] || `**${i + 1}.**`} <@${r.userId}> — **${r.count}**`).join("\n") : "No vouches yet.";
    await interaction.reply({ embeds: [economyEmbed({ title: "? Vouch Leaderboard — Top 10", color: SUCCESS_COLOR, description: desc })], allowedMentions: { parse: [] } });
  }
};

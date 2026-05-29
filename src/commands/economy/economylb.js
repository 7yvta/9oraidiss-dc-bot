const { SlashCommandBuilder } = require("discord.js");
const { listAccounts } = require("../../utils/economyStore");
const { coins, economyEmbed } = require("../../utils/economyUi");

function medal(index) {
  return ["🥇", "🥈", "🥉"][index] || `**${index + 1}.**`;
}

module.exports = {
  data: new SlashCommandBuilder().setName("economylb").setDescription("Top 10 richest users (wallet + bank)").setDMPermission(false),
  async execute(interaction) {
    const rows = (await listAccounts(interaction.guild.id)).sort((a, b) => b.total - a.total).slice(0, 10);
    const desc = rows.length
      ? rows.map((r, i) => `${medal(i)} <@${r.userId}> — ${coins(r.total)}`).join("\n")
      : "No economy data yet.";
    await interaction.reply({
      embeds: [
        economyEmbed({
          title: "🏆 Economy Leaderboard — Top 10",
          description: desc
        })
      ]
    });
  }
};

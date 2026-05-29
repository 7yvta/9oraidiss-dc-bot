const { SlashCommandBuilder } = require("discord.js");
const { getLeaderboard } = require("../../utils/levelStore");
const { buildResultEmbed } = require("../../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show top leveled users")
    .setDMPermission(false),

  async execute(interaction) {
    const top = await getLeaderboard({
      guildId: interaction.guild.id,
      limit: 10
    });

    if (top.length === 0) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Leaderboard",
            color: 0x5865f2,
            fields: [{ name: "Status", value: "No leaderboard data yet." }]
          })
        ]
      });
      return;
    }

    const lines = top.map(
      (entry, index) =>
        `${index + 1}. <@${entry.userId}> - Level ${entry.level} (${entry.xp} XP)`
    );

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Leaderboard",
          color: 0xfaa61a,
          fields: [{ name: "Top Players", value: lines.join("\n") }]
        })
      ]
    });
  }
};

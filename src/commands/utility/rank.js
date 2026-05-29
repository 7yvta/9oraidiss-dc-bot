const { SlashCommandBuilder } = require("discord.js");
const { getUserLevel } = require("../../utils/levelStore");
const { buildResultEmbed } = require("../../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show a user's level and XP")
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to check")
        .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    const stats = await getUserLevel({
      guildId: interaction.guild.id,
      userId: user.id
    });

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Level Stats",
          color: 0x57f287,
          fields: [
            { name: "User", value: `${user}` },
            { name: "Level", value: `${stats.level}` },
            { name: "XP", value: `${stats.xp}/${stats.neededXp}` }
          ]
        })
      ]
    });
  }
};

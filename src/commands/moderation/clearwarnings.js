const { SlashCommandBuilder } = require("discord.js");
const { clearWarnings } = require("../../utils/warnStore");
const { buildLogEmbed, buildResultEmbed, sendModLog } = require("../../utils/logger");
const { sendClearWarningsDM } = require("../../utils/dmHelper");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clearwarnings")
    .setDescription("Clear all warnings for a user")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for clearing warnings")
        .setRequired(true)
        .setMaxLength(300)
    ),

  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const targetUser = interaction.options.getUser("user", true);
    const reasonRaw = interaction.options.getString("reason", true);
    const reason = reasonRaw.trim();

    if (targetUser.id === interaction.user.id) {
      await interaction.editReply({
        embeds: [
          buildResultEmbed({
            title: "Clear Warnings Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "You cannot clear your own warnings." }]
          })
        ]
      });
      return;
    }

    if (!reason) {
      await interaction.editReply({
        embeds: [
          buildResultEmbed({
            title: "Clear Warnings Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Valid reason is required." }]
          })
        ]
      });
      return;
    }

    const removedCount = await clearWarnings({
      guildId: interaction.guild.id,
      userId: targetUser.id
    });

    const logEmbed = buildLogEmbed({
      title: "Warnings Cleared",
      color: 0x57f287,
      fields: [
        { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
        { name: "Moderator", value: `${interaction.user.username}` },
        { name: "Removed Warnings", value: `${removedCount}` },
        { name: "Reason", value: reason }
      ]
    });

    const resultEmbed = buildResultEmbed({
      title: `\u2705 Cleared ${removedCount} warning${removedCount === 1 ? "" : "s"} for ${targetUser.username}`,
      color: 0x57f287,
      footer: "Command Result"
    });

    await interaction.editReply({
      embeds: [resultEmbed]
    });

    await sendModLog(interaction.guild, logEmbed);
    
    // Send DM to user about cleared warnings
    await sendClearWarningsDM(interaction.client, targetUser, interaction.guild.name, interaction.user.tag, removedCount);
  }
};

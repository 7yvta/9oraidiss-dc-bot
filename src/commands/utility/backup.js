const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const { createBackupSnapshot } = require("../../utils/backupManager");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Create a bot backup")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a backup snapshot")
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for backup")
            .setRequired(false)
            .setMaxLength(120)
        )
    ),

  async execute(interaction) {
    const reason = interaction.options.getString("reason") || "manual";
    const result = await createBackupSnapshot(reason);

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Backup Created",
          color: 0x57f287,
          fields: [
            { name: "File", value: result.fileName },
            { name: "Reason", value: reason },
            { name: "Backend", value: result.snapshot.backend }
          ],
          footer: "Backup Manager"
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  }
};

const { SlashCommandBuilder } = require("discord.js");
const { buildLogEmbed, buildResultEmbed, sendModLog } = require("../../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete a batch of recent messages")
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("How many messages to delete (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for purging messages")
        .setRequired(true)
        .setMaxLength(300)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount", true);
    const reasonRaw = interaction.options.getString("reason", true);
    const reason = reasonRaw.trim();

    if (!reason) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Purge Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Valid reason is required." }]
          })
        ]
      });
      return;
    }

    const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
    if (!deleted) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Purge Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "I could not delete messages here. Check my permissions."
              }
            ]
          })
        ]
      });
      return;
    }
    const embed = buildLogEmbed({
      title: "Messages Purged",
      color: 0x95a5a6,
      fields: [
        { name: "Moderator", value: `${interaction.user.username}` },
        { name: "Channel", value: `${interaction.channel}` },
        { name: "Deleted", value: `${deleted.size}` },
        { name: "Reason", value: reason }
      ]
    });

    await interaction.reply({
      embeds: [embed]
    });

    await sendModLog(interaction.guild, embed).catch((error) => {
      console.error("Failed to send purge mod log:", error);
    });
  }
};

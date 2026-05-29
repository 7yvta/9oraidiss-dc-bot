const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const { triggerAutoVouchNow } = require("../../utils/autoVouchScheduler");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autovouchnow")
    .setDescription("Send one auto-vouch message now (manual test)")
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);

    const result = await triggerAutoVouchNow(interaction.guild, {
      requestedById: interaction.user.id
    }).catch(() => ({ ok: false, reason: "unexpected_error" }));

    if (!result?.ok) {
      let reasonText = "Could not send auto vouch.";
      if (result?.reason === "disabled") {
        reasonText = "Auto vouch is disabled in settings.";
      } else
      if (result?.reason === "manual_cooldown") {
        reasonText = "Please wait a few seconds before running this again.";
      } else if (result?.reason === "missing_channel") {
        reasonText = "Auto-vouch channel is not configured.";
      } else if (result?.reason === "channel_unavailable") {
        reasonText = "Auto-vouch channel is unavailable or not sendable.";
      } else if (result?.reason === "no_member_with_target_role") {
        reasonText = "No member with the required MM role was found.";
      }

      await interaction.editReply({
        embeds: [
          buildResultEmbed({
            title: "Auto Vouch Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: reasonText }]
          })
        ]
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        buildResultEmbed({
          title: "Auto Vouch Sent",
          color: 0x57f287,
          fields: [
            { name: "Vouched For", value: `<@${result.vouchedForId}>`, inline: true },
            { name: "Vouched By", value: `<@${result.vouchedById}>`, inline: true },
            { name: "Reason", value: String(result.reason || "trusted mm") },
            { name: "Total Vouches", value: String(result.totalVouches || 1), inline: true }
          ]
        })
      ]
    });
  }
};

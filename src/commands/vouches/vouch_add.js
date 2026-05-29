const { SlashCommandBuilder } = require("discord.js");
const { economyEmbed, SUCCESS_COLOR, FAIL_COLOR } = require("../../utils/economyUi");
const { triggerSubmittedVouch } = require("../../utils/autoVouchScheduler");
module.exports = {
  data: new SlashCommandBuilder().setName("vouch_add").setDescription("Manually add a vouch")
    .addUserOption((option) => option.setName("user").setDescription("User receiving the vouch").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Vouch reason").setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") || "fast and legit service";
    const result = await triggerSubmittedVouch(interaction.guild, { vouchedForId: user.id, vouchedById: interaction.user.id, reason, requestId: `slash:${interaction.id}` });
    if (!result?.ok) return interaction.reply({ embeds: [economyEmbed({ title: "? Vouch Failed", color: FAIL_COLOR, description: String(result?.reason || "unknown") })] });
    await interaction.reply({ embeds: [economyEmbed({ title: "? Vouch Added", color: SUCCESS_COLOR, description: `Added vouch for ${user}.\nTotal: **${result.totalVouches || "updated"}**` })], allowedMentions: { parse: [] } });
  }
};

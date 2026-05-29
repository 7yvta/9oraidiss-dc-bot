const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { addVouches } = require("../../utils/vouchStatsStore");
const { buildResultEmbed } = require("../../utils/logger");
const { economyEmbed } = require("../../utils/economyUi");
const { isOwner } = require("../../utils/ownerOnly");
module.exports = {
  data: new SlashCommandBuilder().setName("remove_vouches").setDescription("Remove vouches from a user (Owner only)")
    .addUserOption((option) => option.setName("user").setDescription("Target user").setRequired(true))
    .addIntegerOption((option) => option.setName("amount").setDescription("Amount to remove").setMinValue(1).setRequired(true)),
  async execute(interaction) {
    if (!isOwner(interaction)) return interaction.reply({ embeds: [buildResultEmbed({ title: "Owner Only", color: 0xed4245 })], flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const next = await addVouches(interaction.guild.id, user.id, -amount);
    await interaction.reply({ embeds: [economyEmbed({ title: "?? Vouches Removed", color: 0xfaa61a, description: `${user} now has **${next}** vouches.` })], allowedMentions: { parse: [] } });
  }
};

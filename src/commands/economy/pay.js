const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { updateAccount } = require("../../utils/economyStore");
const { buildResultEmbed } = require("../../utils/logger");
const { coins, economyEmbed, SUCCESS_COLOR } = require("../../utils/economyUi");

module.exports = {
  data: new SlashCommandBuilder().setName("pay").setDescription("Transfer coins to another user").setDMPermission(false)
    .addUserOption((option) => option.setName("user").setDescription("User to pay").setRequired(true))
    .addIntegerOption((option) => option.setName("amount").setDescription("Coins to transfer").setMinValue(1).setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    if (user.bot || user.id === interaction.user.id) return interaction.reply({ embeds: [buildResultEmbed({ title: "Invalid User", color: 0xed4245, description: "Choose another non-bot user." })], flags: MessageFlags.Ephemeral });
    let ok = false;
    await updateAccount(interaction.guild.id, interaction.user.id, async (acc) => { if (Number(acc.wallet || 0) >= amount) { acc.wallet -= amount; ok = true; } });
    if (!ok) return interaction.reply({ embeds: [buildResultEmbed({ title: "Not Enough Coins", color: 0xed4245, description: "You do not have enough coins in your wallet." })], flags: MessageFlags.Ephemeral });
    await updateAccount(interaction.guild.id, user.id, async (acc) => { acc.wallet = Number(acc.wallet || 0) + amount; });
    await interaction.reply({
      embeds: [
        economyEmbed({
          title: "✅ Payment Sent",
          color: SUCCESS_COLOR,
          description: `${interaction.user} paid ${user} ${coins(amount)}.`
        })
      ]
    });
  }
};

const { SlashCommandBuilder } = require("discord.js");
const { getAccount } = require("../../utils/economyStore");
const { coins, economyEmbed } = require("../../utils/economyUi");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your or another user's wallet balance")
    .setDMPermission(false)
    .addUserOption((option) => option.setName("user").setDescription("User to check").setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    const account = await getAccount(interaction.guild.id, user.id);
    const total = Number(account.wallet || 0) + Number(account.bank || 0);
    await interaction.reply({
      embeds: [
        economyEmbed({
          title: `💰 Balance — ${user.username}`,
          user,
          thumbnail: true,
          fields: [
            { name: "👛 Wallet", value: coins(account.wallet), inline: true },
            { name: "🏦 Bank", value: coins(account.bank), inline: true },
            { name: "💎 Total", value: coins(total), inline: true }
          ]
        })
      ]
    });
  }
};

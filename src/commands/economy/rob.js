const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { getAccount, updateAccount } = require("../../utils/economyStore");
const { buildResultEmbed } = require("../../utils/logger");
const { coins, economyEmbed, SUCCESS_COLOR, FAIL_COLOR } = require("../../utils/economyUi");

const ROB_COOLDOWN = 30 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder().setName("rob").setDescription("Attempt to rob another user's wallet").setDMPermission(false)
    .addUserOption((option) => option.setName("user").setDescription("Target user").setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    if (user.bot || user.id === interaction.user.id) {
      return interaction.reply({ embeds: [buildResultEmbed({ title: "Invalid Target", color: FAIL_COLOR })], flags: MessageFlags.Ephemeral });
    }

    const now = Date.now();
    const robber = await getAccount(interaction.guild.id, interaction.user.id);
    const lastRob = Number(robber.lastRob || 0);
    if (now - lastRob < ROB_COOLDOWN) {
      return interaction.reply({
        embeds: [
          economyEmbed({
            title: "🕒 Rob Cooldown",
            color: FAIL_COLOR,
            description: `Try again <t:${Math.floor((lastRob + ROB_COOLDOWN) / 1000)}:R>.`
          })
        ]
      });
    }

    const target = await getAccount(interaction.guild.id, user.id);
    const targetWallet = Math.floor(Number(target.wallet || 0));
    if (targetWallet < 10) {
      await updateAccount(interaction.guild.id, interaction.user.id, async (acc) => { acc.lastRob = now; });
      return interaction.reply({
        embeds: [
          economyEmbed({
            title: "❌ Rob Failed",
            color: FAIL_COLOR,
            description: `${user} does not have enough wallet money to rob.`
          })
        ]
      });
    }

    const success = Math.random() < 0.5;
    if (!success) {
      let penalty = 0;
      const updated = await updateAccount(interaction.guild.id, interaction.user.id, async (acc) => {
        const total = Math.floor(Number(acc.wallet || 0) + Number(acc.bank || 0));
        penalty = Math.floor(total * 0.1);
        let left = penalty;
        const walletLoss = Math.min(Math.floor(Number(acc.wallet || 0)), left);
        acc.wallet = Math.floor(Number(acc.wallet || 0)) - walletLoss;
        left -= walletLoss;
        const bankLoss = Math.min(Math.floor(Number(acc.bank || 0)), left);
        acc.bank = Math.floor(Number(acc.bank || 0)) - bankLoss;
        acc.lastRob = now;
      });
      return interaction.reply({
        embeds: [
          economyEmbed({
            title: "🚨 Rob Failed",
            color: FAIL_COLOR,
            description: `${interaction.user} got caught trying to rob ${user} and paid ${coins(penalty)}.\nWallet: ${coins(updated.wallet)} | Bank: ${coins(updated.bank)}`
          })
        ]
      });
    }

    const amount = Math.max(1, Math.floor(targetWallet * (0.1 + Math.random() * 0.15)));
    await updateAccount(interaction.guild.id, user.id, async (acc) => { acc.wallet = Math.floor(Number(acc.wallet || 0)) - amount; });
    const updated = await updateAccount(interaction.guild.id, interaction.user.id, async (acc) => {
      acc.wallet = Math.floor(Number(acc.wallet || 0)) + amount;
      acc.lastRob = now;
    });
    await interaction.reply({
      embeds: [
        economyEmbed({
          title: "✅ Rob Success",
          color: SUCCESS_COLOR,
          description: `${interaction.user} robbed ${coins(amount)} from ${user}'s wallet.\nNew wallet: ${coins(updated.wallet)}`
        })
      ]
    });
  }
};

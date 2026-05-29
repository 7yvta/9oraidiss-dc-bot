const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { updateAccount } = require("../../utils/economyStore");
const { buildResultEmbed } = require("../../utils/logger");
const { coins, economyEmbed, SUCCESS_COLOR } = require("../../utils/economyUi");

function parseAmountInput(raw, maxAmount) {
  const input = String(raw || "").trim().toLowerCase();
  if (!input) {
    return { error: "Enter a valid amount or `all`." };
  }
  if (input === "all" || input === "max") {
    if (maxAmount <= 0) {
      return { error: "You have no coins to move." };
    }
    return { amount: maxAmount };
  }

  const normalized = input.replace(/,/g, "");
  if (!/^\d+$/.test(normalized)) {
    return { error: "Enter a number or `all`." };
  }

  const amount = Math.floor(Number(normalized));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be greater than 0." };
  }
  return { amount };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Withdraw coins from your bank")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("amount")
        .setDescription("Coins to withdraw (number or all)")
        .setRequired(true)
    ),

  async execute(interaction) {
    const rawAmount = interaction.options.getString("amount", true);

    const before = await updateAccount(interaction.guild.id, interaction.user.id, async () => {});
    const maxMovable = Number(before.bank || 0);
    const parsed = parseAmountInput(rawAmount, maxMovable);

    if (!parsed.amount) {
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Invalid Amount",
            color: 0xed4245,
            description: parsed.error || "Enter a valid amount or `all`."
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const amount = parsed.amount;
    let ok = false;
    const account = await updateAccount(interaction.guild.id, interaction.user.id, async (acc) => {
      if (Number(acc.bank || 0) < amount) return;
      acc.bank -= amount;
      acc.wallet = Number(acc.wallet || 0) + amount;
      ok = true;
    });

    if (!ok) {
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Not Enough Coins",
            color: 0xed4245,
            description: "You do not have that much in your bank."
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.reply({
      embeds: [
        economyEmbed({
          title: `Withdrew ${coins(amount)} to wallet. Wallet: ${coins(account.wallet)}`,
          color: SUCCESS_COLOR,
          footer: null,
          timestamp: false
        })
      ],
      flags: 0
    });
  }
};

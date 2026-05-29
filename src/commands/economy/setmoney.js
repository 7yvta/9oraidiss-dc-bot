const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { updateAccount } = require("../../utils/economyStore");
const { buildResultEmbed } = require("../../utils/logger");
const { isOwner } = require("../../utils/ownerOnly");
const { coins, economyEmbed, SUCCESS_COLOR } = require("../../utils/economyUi");

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;

function parseOwnerAmount(raw) {
  const input = String(raw || "").trim().toLowerCase();
  if (!input) {
    return { error: "Enter a valid amount." };
  }

  if (input === "max" || input === "infinite" || input === "inf") {
    return { amount: MAX_BALANCE, capped: true, fromKeyword: true };
  }

  const normalized = input.replace(/[,_\s]/g, "");
  if (!/^\d+$/.test(normalized)) {
    return { error: "Use numbers only, or `max` / `infinite`." };
  }

  try {
    const valueBigInt = BigInt(normalized);
    if (valueBigInt < 0n) {
      return { error: "Amount cannot be negative." };
    }
    const maxBigInt = BigInt(MAX_BALANCE);
    if (valueBigInt > maxBigInt) {
      return { amount: MAX_BALANCE, capped: true };
    }
    return { amount: Number(valueBigInt), capped: false };
  } catch {
    return { error: "Invalid amount format." };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setmoney")
    .setDescription("Set a user's wallet balance (Owner only)")
    .setDMPermission(false)
    .addUserOption((option) => option.setName("user").setDescription("Target user").setRequired(true))
    .addStringOption((option) =>
      option
        .setName("amount")
        .setDescription("Wallet amount (number or max/infinite)")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!isOwner(interaction)) {
      return interaction.reply({
        embeds: [buildResultEmbed({ title: "Owner Only", color: 0xed4245 })],
        flags: MessageFlags.Ephemeral
      });
    }

    const user = interaction.options.getUser("user", true);
    const rawAmount = interaction.options.getString("amount", true);
    const parsed = parseOwnerAmount(rawAmount);

    if (parsed.amount == null) {
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Invalid Amount",
            color: 0xed4245,
            description: parsed.error || "Enter a valid amount."
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const amount = parsed.amount;
    const account = await updateAccount(interaction.guild.id, user.id, async (acc) => {
      acc.wallet = amount;
    });

    const note = parsed.capped
      ? `\nNote: amount was capped at ${coins(MAX_BALANCE)} (safe max).`
      : "";

    await interaction.reply({
      embeds: [
        economyEmbed({
          title: "Money Set",
          color: SUCCESS_COLOR,
          description: `${user}'s wallet is now ${coins(account.wallet)}.${note}`
        })
      ],
      flags: 0
    });
  }
};

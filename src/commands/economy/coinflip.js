const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { updateAccount } = require("../../utils/economyStore");
const { buildResultEmbed } = require("../../utils/logger");
const { coins, economyEmbed, SUCCESS_COLOR, FAIL_COLOR } = require("../../utils/economyUi");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin, optionally bet some coins")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("choice")
        .setDescription("Heads or tails")
        .setRequired(true)
        .addChoices({ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" })
    )
    .addIntegerOption((option) =>
      option.setName("bet").setDescription("Optional coin bet").setMinValue(1).setRequired(false)
    ),

  async execute(interaction) {
    const choice = interaction.options.getString("choice") || null;
    const bet = interaction.options.getInteger("bet") || 0;
    const result = Math.random() < 0.5 ? "heads" : "tails";
    const prettyChoice = choice === "heads" ? "heads" : choice === "tails" ? "tails" : null;

    if (bet > 0 && !prettyChoice) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Missing Choice",
            color: FAIL_COLOR,
            fields: [
              {
                name: "Reason",
                value: "Pick a `choice` (heads/tails) if you want to bet."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (bet > 0 && prettyChoice) {
      const won = prettyChoice === result;
      let ok = false;
      const updated = await updateAccount(interaction.guild.id, interaction.user.id, async (acc) => {
        if (Number(acc.wallet || 0) < bet) {
          return;
        }
        ok = true;
        acc.wallet = Number(acc.wallet || 0) + (won ? bet : -bet);
      });

      if (!ok) {
        await interaction.reply({
          embeds: [buildResultEmbed({ title: "Not Enough Coins", color: FAIL_COLOR })],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const title = won ? "You Win" : "You Lose";
      const color = won ? SUCCESS_COLOR : FAIL_COLOR;
      const outcomeLine = won
        ? `You won ${coins(bet)}. Wallet: ${coins(updated.wallet)}`
        : `You lost ${coins(bet)}. Wallet: ${coins(updated.wallet)}`;
      const description = `You chose **${prettyChoice}** and it landed **${result}**.\n${outcomeLine}`;

      await interaction.reply({
        embeds: [economyEmbed({ title, color, description, footer: null })],
        flags: 0
      });
      return;
    }

    await interaction.reply({
      embeds: [
        economyEmbed({
          title: "Coin Flip",
          color: 0xffd000,
          description: `The coin landed on **${result}**.`,
          footer: null
        })
      ],
      flags: 0
    });
  }
};

const { SlashCommandBuilder } = require("discord.js");
const { updateAccount } = require("../../utils/economyStore");
const { coins, economyEmbed, SUCCESS_COLOR, FAIL_COLOR } = require("../../utils/economyUi");

const DAILY_AMOUNT = 500;
const COOLDOWN = 24 * 60 * 60 * 1000;
module.exports = {
  data: new SlashCommandBuilder().setName("daily").setDescription("Claim your daily coins (24h cooldown)").setDMPermission(false),
  async execute(interaction) {
    const now = Date.now();
    let claimed = false;
    let wait = 0;
    const account = await updateAccount(interaction.guild.id, interaction.user.id, async (acc) => {
      const last = Number(acc.lastDaily || 0);
      if (now - last < COOLDOWN) { wait = COOLDOWN - (now - last); return; }
      acc.wallet = Number(acc.wallet || 0) + DAILY_AMOUNT;
      acc.lastDaily = now;
      claimed = true;
    });
    if (!claimed) {
      await interaction.reply({
        embeds: [
          economyEmbed({
            title: "☀️ Daily Cooldown",
            color: FAIL_COLOR,
            description: `Come back <t:${Math.floor((now + wait) / 1000)}:R>.`
          })
        ]
      });
      return;
    }
    await interaction.reply({
      embeds: [
        economyEmbed({
          title: "☀️ Daily Claimed!",
          color: SUCCESS_COLOR,
          description: `You received ${coins(DAILY_AMOUNT)}!\nNew wallet: ${coins(account.wallet)}`,
          footer: "Come back in 24 hours"
        })
      ]
    });
  }
};

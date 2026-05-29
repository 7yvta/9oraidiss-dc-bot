const { SlashCommandBuilder } = require("discord.js");
const { updateAccount } = require("../../utils/economyStore");
const { coins, economyEmbed, SUCCESS_COLOR, FAIL_COLOR } = require("../../utils/economyUi");

const COOLDOWN = 60 * 60 * 1000;
function reward() { return 80 + Math.floor(Math.random() * 171); }
module.exports = {
  data: new SlashCommandBuilder().setName("work").setDescription("Work for coins (1h cooldown)").setDMPermission(false),
  async execute(interaction) {
    const now = Date.now();
    const amount = reward();
    let ok = false;
    let wait = 0;
    const account = await updateAccount(interaction.guild.id, interaction.user.id, async (acc) => {
      const last = Number(acc.lastWork || 0);
      if (now - last < COOLDOWN) { wait = COOLDOWN - (now - last); return; }
      acc.wallet = Number(acc.wallet || 0) + amount;
      acc.lastWork = now;
      ok = true;
    });
    if (!ok) {
      await interaction.reply({
        embeds: [
          economyEmbed({
            title: "🧳 Work Cooldown",
            color: FAIL_COLOR,
            description: `Work again <t:${Math.floor((now + wait) / 1000)}:R>.`
          })
        ]
      });
      return;
    }
    const jobs = ["flipped burgers", "carried crates", "cleaned the shop", "delivered orders", "fixed a booth"];
    const job = jobs[Math.floor(Math.random() * jobs.length)];
    await interaction.reply({
      embeds: [
        economyEmbed({
          title: "💼 Work Complete!",
          color: SUCCESS_COLOR,
          description: `You ${job} and made ${coins(amount)}!\nNew wallet: ${coins(account.wallet)}`,
          footer: "Work again in 1 hour"
        })
      ]
    });
  }
};

const { SlashCommandBuilder } = require("discord.js");
const { updateAccount } = require("../../utils/economyStore");
const { economyEmbed } = require("../../utils/economyUi");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set your AFK status")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Optional AFK reason")
        .setRequired(false)
        .setMaxLength(120)
    ),

  async execute(interaction) {
    const reasonInput = String(interaction.options.getString("reason") || "").trim();
    const account = await updateAccount(interaction.guild.id, interaction.user.id, async (acc) => {
      const nextState = !acc.afk;
      acc.afk = nextState;
      if (nextState) {
        acc.afkSince = Date.now();
        acc.afkReason = reasonInput || null;
      } else {
        acc.afkSince = null;
        acc.afkReason = null;
      }
    });

    const description = account.afk
      ? `${interaction.user}, AFK is now **on**.${account.afkReason ? `\nReason: ${account.afkReason}` : ""}`
      : `${interaction.user}, AFK is now **off**.`;

    await interaction.reply({
      embeds: [
        economyEmbed({
          title: "AFK Updated",
          color: 0x5865f2,
          description
        })
      ]
    });
  }
};

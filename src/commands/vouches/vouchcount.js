const { SlashCommandBuilder } = require("discord.js");
const { getVouchCount } = require("../../utils/vouchStatsStore");
const { economyEmbed, SUCCESS_COLOR } = require("../../utils/economyUi");
module.exports = {
  data: new SlashCommandBuilder().setName("vouchcount").setDescription("Check vouch count for a user")
    .addUserOption((option) => option.setName("user").setDescription("User to check").setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const count = await getVouchCount(interaction.guild.id, user.id);
    await interaction.reply({ embeds: [economyEmbed({ title: "? Vouch Count", color: SUCCESS_COLOR, fields: [{ name: "User", value: `${user}` }, { name: "Total Vouches", value: String(count) }], user, thumbnail: true })], allowedMentions: { parse: [] } });
  }
};

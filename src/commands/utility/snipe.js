const { SlashCommandBuilder } = require("discord.js");
const { economyEmbed, FAIL_COLOR } = require("../../utils/economyUi");
const { getSnipe } = require("../../utils/snipeStore");

module.exports = {
  data: new SlashCommandBuilder().setName("snipe").setDescription("Show the last deleted message in this channel").setDMPermission(false),
  async execute(interaction) {
    const snipe = getSnipe(interaction.channelId);
    if (!snipe) return interaction.reply({ embeds: [economyEmbed({ title: "? No Snipe", color: FAIL_COLOR, description: "No deleted message cached for this channel." })] });
    await interaction.reply({ embeds: [economyEmbed({ title: "?? Last Deleted Message", color: 0xfaa61a, fields: [
      { name: "User", value: snipe.authorId ? `${snipe.authorTag} (${snipe.authorId})` : snipe.authorTag },
      { name: "Message", value: String(snipe.content || "No content").slice(0, 1000) },
      { name: "Deleted", value: `<t:${Math.floor(snipe.deletedAt / 1000)}:R>` },
      { name: "Attachments", value: String(snipe.attachmentCount || 0), inline: true }
    ], footer: "Snipe" })] });
  }
};

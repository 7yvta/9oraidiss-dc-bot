const { SlashCommandBuilder } = require("discord.js");
const { economyEmbed } = require("../../utils/economyUi");

module.exports = {
  data: new SlashCommandBuilder().setName("botinfo").setDescription("Show bot stats and uptime"),
  async execute(interaction) {
    const uptime = Math.floor(process.uptime());
    const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
    await interaction.reply({ embeds: [economyEmbed({ title: "?? Bot Info", color: 0x5865f2, user: interaction.client.user, thumbnail: true, fields: [
      { name: "Username", value: interaction.client.user.tag, inline: true },
      { name: "Bot ID", value: interaction.client.user.id, inline: true },
      { name: "Uptime", value: `<t:${Math.floor((Date.now() - uptime * 1000) / 1000)}:R>`, inline: true },
      { name: "Servers", value: String(interaction.client.guilds.cache.size), inline: true },
      { name: "Users", value: String(interaction.client.users.cache.size), inline: true },
      { name: "Memory", value: `${mem}MB`, inline: true },
      { name: "Node.js", value: process.version, inline: true },
      { name: "Commands", value: String(interaction.client.commands?.size || 0), inline: true }
    ], footer: "Bot Info" })] });
  }
};

const { SlashCommandBuilder } = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency"),

  async execute(interaction) {
    const apiLatency = interaction.client.ws.ping;
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Pong",
          color: 0x5865f2,
          fields: [{ name: "API Latency", value: `${apiLatency}ms` }]
        })
      ]
    });
  }
};

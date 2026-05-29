const { SlashCommandBuilder, ChannelType } = require("discord.js");
const { economyEmbed } = require("../../utils/economyUi");

module.exports = {
  data: new SlashCommandBuilder().setName("channelinfo").setDescription("Get information about a channel")
    .addChannelOption((option) => option.setName("channel").setDescription("Channel to inspect").setRequired(false)),
  async execute(interaction) {
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    await interaction.reply({ embeds: [economyEmbed({ title: "?? Channel Info", color: 0x5865f2, fields: [
      { name: "Channel", value: `${channel}`, inline: true },
      { name: "ID", value: channel.id, inline: true },
      { name: "Type", value: ChannelType[channel.type] || String(channel.type), inline: true },
      { name: "Created", value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:F>` }
    ], footer: "Utility" })] });
  }
};

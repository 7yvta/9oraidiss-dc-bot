const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags
} = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vouchpanel")
    .setDescription("Post a panel so users can submit vouches")
    .setDMPermission(false)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to post the panel in")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
    if (!targetChannel?.isTextBased?.() || !targetChannel?.isSendable?.()) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Vouch Panel Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Selected channel is not sendable." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const panelEmbed = buildResultEmbed({
      title: "✅ Vouch Submission",
      color: 0x57f287,
      description:
        "Click the button below to submit a vouch.\n" +
        "Use a valid member mention, user ID, or username.",
      fields: [
        { name: "Rules", value: "Fake vouches are not allowed." },
        { name: "Note", value: "Mentions are shown in embed but sent without ping." }
      ],
      footer: "Vouch System"
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("vouch_submit_open")
        .setLabel("Submit Vouch")
        .setStyle(ButtonStyle.Success)
    );

    await targetChannel.send({
      embeds: [panelEmbed],
      components: [row]
    });

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Vouch Panel Posted",
          color: 0x57f287,
          fields: [{ name: "Channel", value: `${targetChannel}` }]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  }
};


const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const { isOwner } = require("../../utils/ownerOnly");

const DISCORD_MESSAGE_LIMIT = 2000;
const CHUNK_LIMIT = 1950;
const EMBED_DESCRIPTION_LIMIT = 4096;
const EMBED_CHUNK_LIMIT = 3900;

function splitMessageContent(input, maxLength = DISCORD_MESSAGE_LIMIT, chunkLimit = CHUNK_LIMIT) {
  const normalized = String(input || "").replace(/\\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const chunks = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    const window = remaining.slice(0, chunkLimit);
    const breakAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
    const cut = breakAt > 250 ? breakAt : chunkLimit;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function buildSayEmbed(description, index, total) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setDescription(description);

  if (total > 1) {
    embed.setFooter({ text: `Message ${index + 1}/${total}` });
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send a message as the bot (Owner only)")
    .setDMPermission(false)
    .addStringOption((option) =>
      option.setName("message").setDescription("Message to send").setRequired(true)
    )
    .addChannelOption((option) =>
      option.setName("channel").setDescription("Target channel").setRequired(false)
    )
    .addBooleanOption((option) =>
      option.setName("embed").setDescription("Send the message as a larger embed").setRequired(false)
    ),

  async execute(interaction) {
    if (!isOwner(interaction)) {
      return interaction.reply({
        embeds: [buildResultEmbed({ title: "Owner Only", color: 0xed4245 })],
        flags: MessageFlags.Ephemeral
      });
    }

    const message = interaction.options.getString("message", true);
    const asEmbed = interaction.options.getBoolean("embed") || false;
    const channel = interaction.options.getChannel("channel") || interaction.channel;

    if (!channel?.isTextBased?.()) {
      return interaction.reply({
        embeds: [buildResultEmbed({ title: "Invalid Channel", color: 0xed4245 })],
        flags: MessageFlags.Ephemeral
      });
    }

    const chunks = asEmbed
      ? splitMessageContent(message, EMBED_DESCRIPTION_LIMIT, EMBED_CHUNK_LIMIT)
      : splitMessageContent(message);

    if (!chunks.length) {
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Empty Message",
            color: 0xed4245,
            description: "Write something for the bot to send."
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    for (const [index, chunk] of chunks.entries()) {
      if (asEmbed) {
        await channel.send({
          embeds: [buildSayEmbed(chunk, index, chunks.length)],
          allowedMentions: { parse: [] }
        });
      } else {
        await channel.send({ content: chunk, allowedMentions: { parse: [] } });
      }
    }

    await interaction.editReply({
      embeds: [
        buildResultEmbed({
          title: "Message Sent",
          color: 0x57f287,
          description: `Sent ${chunks.length} ${asEmbed ? "embed" : "message"}${chunks.length === 1 ? "" : "s"} in ${channel}.`
        })
      ]
    });
  }
};

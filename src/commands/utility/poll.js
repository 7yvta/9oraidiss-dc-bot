const {
  ChannelType,
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder
} = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");

const OPTION_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
const COOLDOWN_MS = 2 * 60 * 1000;
const userCooldowns = new Map();

function getCooldownKey(interaction) {
  return `${interaction.guildId}:${interaction.user.id}`;
}

function formatCooldown(msRemaining) {
  const totalSeconds = Math.max(1, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function collectPollOptions(interaction) {
  const values = [
    interaction.options.getString("option1", true),
    interaction.options.getString("option2", true),
    interaction.options.getString("option3"),
    interaction.options.getString("option4"),
    interaction.options.getString("option5")
  ];

  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("Poll question")
        .setRequired(true)
        .setMaxLength(250)
    )
    .addStringOption((option) =>
      option
        .setName("option1")
        .setDescription("First option")
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("option2")
        .setDescription("Second option")
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("option3")
        .setDescription("Third option (optional)")
        .setRequired(false)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("option4")
        .setDescription("Fourth option (optional)")
        .setRequired(false)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("option5")
        .setDescription("Fifth option (optional)")
        .setRequired(false)
        .setMaxLength(100)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to send poll in (defaults to current channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),

  async execute(interaction) {
    const key = getCooldownKey(interaction);
    const now = Date.now();
    const lastUsed = Number(userCooldowns.get(key) || 0);
    const elapsed = now - lastUsed;
    if (elapsed < COOLDOWN_MS) {
      const remaining = COOLDOWN_MS - elapsed;
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Poll Cooldown",
            color: 0xed4245,
            fields: [
              {
                name: "Try Again In",
                value: formatCooldown(remaining)
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const question = String(interaction.options.getString("question", true) || "").trim();
    const options = collectPollOptions(interaction);
    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

    if (!targetChannel?.isTextBased?.() || !targetChannel?.isSendable?.()) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Poll Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Selected channel is not sendable." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (options.length < 2) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Poll Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "At least 2 options are required." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const optionLines = options
      .map((option, index) => `${OPTION_EMOJIS[index]} ${option}`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📊 New Poll")
      .setDescription(`**${question}**\n\n${optionLines}`)
      .addFields({ name: "Created By", value: `<@${interaction.user.id}>` })
      .setFooter({ text: "React below to vote" })
      .setTimestamp();

    const pollMessage = await targetChannel.send({
      embeds: [embed]
    });

    for (let index = 0; index < options.length; index += 1) {
      await pollMessage.react(OPTION_EMOJIS[index]).catch(() => null);
    }

    userCooldowns.set(key, now);

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Poll Created",
          color: 0x57f287,
          fields: [
            { name: "Channel", value: `${targetChannel}` },
            { name: "Question", value: question }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  }
};


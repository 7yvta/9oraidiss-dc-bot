const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  buildLogEmbed,
  buildResultEmbed,
  sendModLog
} = require("../../utils/logger");
const { canModerate } = require("../../utils/moderation");
const {
  clearRecentAction,
  markRecentAction
} = require("../../utils/actionDeduper");
const { sendTimeoutDM } = require("../../utils/dmHelper");

function toEmbedFieldValue(value, fallback = "-", max = 1024) {
  const text = String(value ?? "").trim();
  if (!text) {
    return fallback;
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function resolveTimeoutErrorReason(error) {
  const code = Number(error?.code || error?.rawError?.code || 0);
  if (code === 50013) {
    return "I am missing permission to timeout this user.";
  }
  if (code === 50001) {
    return "I cannot access required server resources for this action.";
  }
  if (code === 10007) {
    return "That member was not found in this server.";
  }
  const raw = String(error?.message || "").trim();
  return raw || "Unknown error while trying to timeout this user.";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member for a number of minutes")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("user").setDescription("User to timeout").setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("minutes")
        .setDescription("Duration in minutes (1-10080)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10080)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason")
        .setRequired(true)
        .setMaxLength(300)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user", true);
    const minutes = interaction.options.getInteger("minutes", true);
    const reasonRaw = interaction.options.getString("reason", true);
    const reason = reasonRaw.trim();

    if (!reason) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Timeout Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Timeout reason is required." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const member = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!member) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Timeout Failed",
            color: 0xed4245,
            fields: [
              { name: "Reason", value: "That user is not in this server." }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!member.moderatable || !canModerate(interaction.member, member)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Timeout Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "I cannot timeout this user because of role hierarchy."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const durationMs = minutes * 60 * 1000;
    const timeoutEndsAt = Math.floor((Date.now() + durationMs) / 1000);
    const dmSent = await sendTimeoutDM(
      interaction.client,
      targetUser,
      interaction.guild.name,
      reason,
      interaction.user.tag,
      minutes,
      timeoutEndsAt
    );

    markRecentAction("timeout", interaction.guild.id, targetUser.id);
    let timeoutError = null;
    try {
      await member.timeout(durationMs, `${reason} | By ${interaction.user.tag}`);
    } catch (error) {
      timeoutError = error;
      clearRecentAction("timeout", interaction.guild.id, targetUser.id);
    }

    if (timeoutError) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Timeout Failed",
            color: 0xed4245,
            fields: [
              { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
              { name: "Reason", value: resolveTimeoutErrorReason(timeoutError) }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const embed = buildLogEmbed({
      title: "User Timed Out",
      color: 0xf1c40f,
      fields: [
        { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
        { name: "Moderator", value: `${interaction.user.username}` },
        { name: "Duration", value: `${minutes} minute(s)` },
        { name: "Reason", value: toEmbedFieldValue(reason) },
        { name: "DM Before Timeout", value: dmSent ? "Sent" : "Failed or blocked" }
      ]
    });

    await interaction.reply({
      embeds: [embed]
    });
    await sendModLog(interaction.guild, embed).catch((error) => {
      console.error("Failed to send timeout mod log:", error);
    });
  }
};

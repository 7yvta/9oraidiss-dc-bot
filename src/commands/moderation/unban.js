const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  buildLogEmbed,
  buildResultEmbed,
  sendModLog
} = require("../../utils/logger");
const {
  clearRecentAction,
  markRecentAction
} = require("../../utils/actionDeduper");
const { sendUnbanDM } = require("../../utils/dmHelper");

function toEmbedFieldValue(value, fallback = "-", max = 1024) {
  const text = String(value ?? "").trim();
  if (!text) {
    return fallback;
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function resolveUnbanErrorReason(error) {
  const code = Number(error?.code || error?.rawError?.code || 0);
  if (code === 50013) {
    return "I am missing permission to unban this user.";
  }
  if (code === 50001) {
    return "I cannot access required server resources for this action.";
  }
  if (code === 10026) {
    return "That user is not banned.";
  }
  const raw = String(error?.message || "").trim();
  return raw || "Unknown error while trying to unban this user.";
}

function normalizeUserId(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/^<@!?(\d+)>$/);
  return match ? match[1] : trimmed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by ID")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("user_id")
        .setDescription("User ID to unban")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for unban")
        .setRequired(true)
        .setMaxLength(300)
    ),

  async execute(interaction) {
    const userId = normalizeUserId(
      interaction.options.getString("user_id", true)
    );
    const reasonRaw = interaction.options.getString("reason", true);
    const reason = reasonRaw.trim();

    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Unban Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Please provide a valid user ID." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!reason) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Unban Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Unban reason is required." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const banEntry = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!banEntry) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Unban Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "This user is not banned." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    markRecentAction("unban", interaction.guild.id, userId);
    let unbanError = null;
    try {
      await interaction.guild.bans.remove(
        userId,
        `${reason} | By ${interaction.user.tag}`
      );
    } catch (error) {
      unbanError = error;
      clearRecentAction("unban", interaction.guild.id, userId);
    }

    if (unbanError) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Unban Failed",
            color: 0xed4245,
            fields: [
              { name: "User ID", value: `${userId}` },
              { name: "Reason", value: resolveUnbanErrorReason(unbanError) }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const userLabel = `${banEntry.user.tag} (${banEntry.user.id})`;
    const embed = buildLogEmbed({
      title: "User Unbanned",
      color: 0x57f287,
      fields: [
        { name: "User", value: userLabel },
        { name: "Moderator", value: `${interaction.user.username}` },
        { name: "Reason", value: toEmbedFieldValue(reason) }
      ]
    });

    await interaction.reply({
      embeds: [embed]
    });

    await sendModLog(interaction.guild, embed).catch((error) => {
      console.error("Failed to send unban mod log:", error);
    });
    
    // Send DM to unbanned user
    await sendUnbanDM(
      interaction.client,
      banEntry.user,
      interaction.guild.name,
      interaction.user.tag
    ).catch(() => null);
  }
};

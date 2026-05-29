const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  buildLogEmbed,
  buildResultEmbed,
  sendModLog
} = require("../../utils/logger");
const { canModerate } = require("../../utils/moderation");
const {
  checkBanLimit,
  recordBanAction
} = require("../../utils/banLimiter");
const {
  clearRecentAction,
  markRecentAction
} = require("../../utils/actionDeduper");
const { clearWarningsAfterConsequence } = require("../../utils/warnStore");
const { sendBanDM } = require("../../utils/dmHelper");

function toEmbedFieldValue(value, fallback = "-", max = 1024) {
  const text = String(value ?? "").trim();
  if (!text) {
    return fallback;
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function resolveBanErrorReason(error) {
  const code = Number(error?.code || error?.rawError?.code || 0);
  if (code === 50013) {
    return "I am missing permission to ban this user.";
  }
  if (code === 50001) {
    return "I cannot access required server resources for this action.";
  }
  if (code === 10013) {
    return "That user could not be found.";
  }
  if (code === 30035) {
    return "Ban rate limit reached on Discord side. Try again shortly.";
  }
  const raw = String(error?.message || "").trim();
  return raw || "Unknown error while trying to ban this user.";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("manageban")
    .setDescription("Ban a user")
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName("target_user")
        .setDescription("User to ban")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason").setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("delete_days")
        .setDescription("Delete message history days (0-7)")
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    ),

  async execute(interaction) {
    const limitCheck = checkBanLimit(interaction.member);
    if (!limitCheck.allowed) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Ban Blocked",
            color: 0xed4245,
            fields: [{ name: "Limit Reached", value: limitCheck.reason }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetUser =
      interaction.options.getUser("target_user") ||
      interaction.options.getUser("user");
    if (!targetUser) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Ban Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value:
                  "Missing user option. Reopen slash command list and use `/manageban` again."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const reasonRaw = interaction.options.getString("reason");
    const reason = reasonRaw ? reasonRaw.trim() : "";
    const deleteDays = interaction.options.getInteger("delete_days") || 0;

    if (!reason) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Ban Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Ban reason is required." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Ban Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "You cannot ban yourself." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const member = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (member && (!member.bannable || !canModerate(interaction.member, member))) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Ban Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "I cannot ban this user because of role hierarchy."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const dmSent = await sendBanDM(
      interaction.client,
      targetUser,
      interaction.guild.name,
      reason,
      interaction.user.tag
    );

    markRecentAction("ban", interaction.guild.id, targetUser.id);
    let banError = null;
    try {
      await interaction.guild.members.ban(targetUser.id, {
        reason: `${reason} | By ${interaction.user.tag}`,
        deleteMessageSeconds: deleteDays * 86400
      });
      recordBanAction(interaction.user.id);
    } catch (error) {
      banError = error;
      clearRecentAction("ban", interaction.guild.id, targetUser.id);
    }

    if (banError) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Ban Failed",
            color: 0xed4245,
            fields: [
              { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
              { name: "Reason", value: resolveBanErrorReason(banError) }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    let clearedWarnings = 0;
    try {
      clearedWarnings = await clearWarningsAfterConsequence({
        guildId: interaction.guildId,
        userId: targetUser.id,
        consequence: "ban"
      });
    } catch (error) {
      console.error("Could not clear warnings after ban:", error);
      clearedWarnings = 0;
    }

    const rolesOwned = member
      ? member.roles.cache
          .filter((role) => role.id !== interaction.guild.id)
          .map((role) => role.name)
          .join(", ")
      : "Unknown (user not in server)";

    const embed = buildLogEmbed({
      title: "User Banned \u{1F6AB}",
      color: 0xed4245,
      fields: [
        { name: "Actioned By", value: `${interaction.user.tag} (${interaction.user.id})` },
        { name: "Target User", value: `${targetUser.tag} (${targetUser.id})` },
        { name: "Roles Owned", value: toEmbedFieldValue(rolesOwned, "None") },
        { name: "Reason", value: toEmbedFieldValue(reason) },
        {
          name: "Time",
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`
        },
        {
          name: "Warnings Cleared",
          value:
            clearedWarnings > 0
              ? `${clearedWarnings} warning(s) cleared`
              : "No warnings to clear"
        },
        { name: "DM Before Ban", value: dmSent ? "Sent" : "Failed or blocked" },
        { name: "Delete Days", value: `${deleteDays}` }
      ]
    });

    await interaction.reply({
      embeds: [embed]
    });

    try {
      await sendModLog(interaction.guild, embed);
    } catch (error) {
      console.error("Failed to send ban mod log:", error);
    }
  }
};

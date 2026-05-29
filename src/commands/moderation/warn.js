const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const config = require("../../config");
const { addWarning, getWarnings, clearWarnings, clearWarningsAfterConsequence } = require("../../utils/warnStore");
const {
  buildLogEmbed,
  buildResultEmbed,
  sendModLog
} = require("../../utils/logger");
const { canModerate } = require("../../utils/moderation");
const { sendWarnDM } = require("../../utils/dmHelper");

function toEmbedFieldValue(value, fallback = "-", max = 1024) {
  const text = String(value ?? "").trim();
  if (!text) {
    return fallback;
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function normalizeRule(raw) {
  const action = String(raw?.action || "timeout").toLowerCase();
  return {
    enabled: raw?.enabled === true,
    threshold:
      Number.isInteger(Number(raw?.threshold)) && Number(raw.threshold) > 0
        ? Number(raw.threshold)
        : 3,
    action: ["none", "timeout", "kick", "ban"].includes(action) ? action : "timeout",
    timeoutMinutes:
      Number.isFinite(Number(raw?.timeoutMinutes)) && Number(raw.timeoutMinutes) > 0
        ? Number(raw.timeoutMinutes)
        : 60,
    clearWarningsOnAction: raw?.clearWarningsOnAction !== false,
    reason:
      String(raw?.reason || "").trim() ||
      "Automatic moderation consequence after warning threshold"
  };
}

function getWarnConsequenceRules() {
  const list = Array.isArray(config.warnConsequences) ? config.warnConsequences : [];
  if (list.length > 0) {
    return list.map((rule) => normalizeRule(rule)).sort((a, b) => a.threshold - b.threshold);
  }
  return [normalizeRule(config.warnConsequence || {})];
}

function getMatchingWarnRule(totalWarnings) {
  const rules = getWarnConsequenceRules().filter((rule) => rule.enabled);
  if (rules.length === 0) {
    return null;
  }
  const eligible = rules.filter((rule) => totalWarnings >= rule.threshold);
  if (eligible.length === 0) {
    return null;
  }
  return eligible.sort((a, b) => b.threshold - a.threshold)[0];
}

async function applyWarnConsequence({ member, moderatorTag, settings }) {
  if (!member || !settings.enabled || settings.action === "none") {
    return { applied: false };
  }

  if (settings.action === "timeout") {
    if (!member.moderatable) {
      return { applied: false, failure: "I cannot timeout this user due to role hierarchy." };
    }
    const durationMs = Math.min(Math.max(settings.timeoutMinutes, 1), 10080) * 60 * 1000;
    await member.timeout(durationMs, `${settings.reason} | By ${moderatorTag}`);
    return {
      applied: true,
      actionName: "timeout",
      actionText: `Timed out for ${Math.min(Math.max(settings.timeoutMinutes, 1), 10080)} minute(s)`
    };
  }

  if (settings.action === "kick") {
    if (!member.kickable) {
      return { applied: false, failure: "I cannot kick this user due to role hierarchy." };
    }
    await member.kick(`${settings.reason} | By ${moderatorTag}`);
    return { applied: true, actionName: "kick", actionText: "User was kicked" };
  }

  if (settings.action === "ban") {
    if (!member.bannable) {
      return { applied: false, failure: "I cannot ban this user due to role hierarchy." };
    }
    await member.ban({ reason: `${settings.reason} | By ${moderatorTag}`, deleteMessageSeconds: 0 });
    return { applied: true, actionName: "ban", actionText: "User was banned" };
  }

  return { applied: false };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("user").setDescription("User to warn").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for warning")
        .setRequired(true)
        .setMaxLength(300)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user", true);
    const reasonRaw = interaction.options.getString("reason", true);
    const reason = reasonRaw.trim();

    if (!reason) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Warn Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Warning reason is required." }]
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
            title: "Warn Failed",
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

    if (!canModerate(interaction.member, member)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Warn Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "You cannot warn this user due to role hierarchy."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const warning = await addWarning({
      guildId: interaction.guild.id,
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason
    });

    const allWarnings = await getWarnings({
      guildId: interaction.guild.id,
      userId: targetUser.id
    });
    const consequence = getMatchingWarnRule(allWarnings.length);
    let consequenceResult = { applied: false };

    if (consequence) {
      try {
        consequenceResult = await applyWarnConsequence({
          member,
          moderatorTag: interaction.user.tag,
          settings: consequence
        });
      } catch (error) {
        consequenceResult = {
          applied: false,
          failure:
            error?.message ||
            "Could not apply automatic moderation consequence."
        };
      }

      // Automatically clear warnings after any consequence is applied
      if (consequenceResult.applied) {
        await clearWarningsAfterConsequence({
          guildId: interaction.guild.id,
          userId: targetUser.id,
          consequence: consequence.action
        }).catch(() => null);
      }
    }

    const embed = buildLogEmbed({
      title: "User Warned",
      color: 0xffae42,
      fields: [
        { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
        { name: "Moderator", value: `${interaction.user.username}` },
        { name: "Reason", value: toEmbedFieldValue(reason) },
        { name: "Warning ID", value: warning.id },
        { name: "Total Warnings", value: `${allWarnings.length}` },
        ...(consequenceResult.applied
          ? [
              { name: "Consequence Applied", value: consequenceResult.actionText },
              { name: "Warnings Cleared", value: "✅ Automatically cleared after consequence" }
            ]
          : []),
        ...(!consequenceResult.applied && consequenceResult.failure
          ? [{ name: "Consequence Failed", value: consequenceResult.failure }]
          : [])
      ]
    });

    await interaction.reply({
      embeds: [embed]
    });

    await sendModLog(interaction.guild, embed).catch((error) => {
      console.error("Failed to send warn mod log:", error);
    });
    
    // Send DM to warned user
    await sendWarnDM(
      interaction.client,
      targetUser, 
      interaction.guild.name, 
      reason, 
      interaction.user.tag, 
      warning.id, 
      allWarnings.length, 
      consequenceResult.applied ? consequenceResult.actionText : null,
      consequenceResult.applied ? "Your warnings have been automatically cleared after this consequence." : null
    ).catch(() => null);
  }
};

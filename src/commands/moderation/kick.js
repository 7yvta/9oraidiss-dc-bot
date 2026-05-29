const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require("discord.js");
const {
  buildLogEmbed,
  buildResultEmbed,
  sendModLog
} = require("../../utils/logger");
const { canModerate } = require("../../utils/moderation");
const { checkKickLimit, recordKickAction } = require("../../utils/banLimiter");
const { clearWarningsAfterConsequence } = require("../../utils/warnStore");
const {
  clearRecentAction,
  markRecentAction
} = require("../../utils/actionDeduper");
const { sendKickDM } = require("../../utils/dmHelper");

function toEmbedFieldValue(value, fallback = "-", max = 1024) {
  const text = String(value ?? "").trim();
  if (!text) {
    return fallback;
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function resolveKickErrorReason(error) {
  const code = Number(error?.code || error?.rawError?.code || 0);
  if (code === 50013) {
    return "I am missing permission to kick this user.";
  }
  if (code === 50001) {
    return "I cannot access required server resources for this action.";
  }
  if (code === 10007) {
    return "That member was not found in this server.";
  }
  const raw = String(error?.message || "").trim();
  return raw || "Unknown error while trying to kick this user.";
}

function canCreateInvite(channel, botMember) {
  if (!channel || typeof channel.createInvite !== "function") {
    return false;
  }
  if (!channel.permissionsFor || !botMember) {
    return false;
  }
  const perms = channel.permissionsFor(botMember);
  return Boolean(
    perms?.has(PermissionFlagsBits.ViewChannel) &&
      perms.has(PermissionFlagsBits.CreateInstantInvite)
  );
}

async function createRejoinInvite(interaction) {
  const botMember =
    interaction.guild.members.me ||
    (await interaction.guild.members.fetchMe().catch(() => null));
  if (!botMember) {
    return null;
  }

  const candidates = [];
  const seen = new Set();
  const addCandidate = (channel) => {
    if (!channel || seen.has(channel.id)) {
      return;
    }
    seen.add(channel.id);
    candidates.push(channel);
  };

  addCandidate(interaction.channel);
  addCandidate(interaction.guild.systemChannel);

  for (const channel of interaction.guild.channels.cache.values()) {
    if (candidates.length >= 12) {
      break;
    }
    if (!channel?.isTextBased?.()) {
      continue;
    }
    if (!canCreateInvite(channel, botMember)) {
      continue;
    }
    addCandidate(channel);
  }

  for (const channel of candidates) {
    if (!canCreateInvite(channel, botMember)) {
      continue;
    }

    const invite = await channel
      .createInvite({
        maxUses: 1,
        maxAge: 86400,
        unique: true,
        reason: `Kick rejoin invite for ${interaction.user.tag}`
      })
      .catch(() => null);
    if (invite?.url) {
      return invite.url;
    }
  }

  const vanityCode = interaction.guild.vanityURLCode;
  if (vanityCode) {
    return `https://discord.gg/${vanityCode}`;
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("user").setDescription("User to kick").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason")
        .setRequired(true)
        .setMaxLength(300)
    ),

  async execute(interaction) {
    const limitCheck = checkKickLimit(interaction.member);
    if (!limitCheck.allowed) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Kick Blocked",
            color: 0xed4245,
            fields: [{ name: "Limit Reached", value: limitCheck.reason }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const reasonRaw = interaction.options.getString("reason", true);
    const reason = reasonRaw.trim();

    if (!reason) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Kick Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Kick reason is required." }]
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
            title: "Kick Failed",
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

    if (!member.kickable || !canModerate(interaction.member, member)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Kick Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "I cannot kick this user because of role hierarchy."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const inviteUrl = await createRejoinInvite(interaction);
    const dmSent = await sendKickDM(
      interaction.client,
      targetUser,
      interaction.guild.name,
      reason,
      interaction.user.tag,
      inviteUrl
    );

    markRecentAction("kick", interaction.guild.id, targetUser.id);
    let kickError = null;
    try {
      await member.kick(`${reason} | By ${interaction.user.tag}`);
      recordKickAction(interaction.user.id);
    } catch (error) {
      kickError = error;
      clearRecentAction("kick", interaction.guild.id, targetUser.id);
    }

    if (kickError) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Kick Failed",
            color: 0xed4245,
            fields: [
              { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
              { name: "Reason", value: resolveKickErrorReason(kickError) }
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
        consequence: "kick"
      });
    } catch (error) {
      console.error("Could not clear warnings after kick:", error);
      clearedWarnings = 0;
    }

    const embed = buildLogEmbed({
      title: "User Kicked",
      color: 0xed4245,
      fields: [
        { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
        { name: "Moderator", value: `${interaction.user.username}` },
        { name: "Reason", value: toEmbedFieldValue(reason) },
        { name: "DM Before Kick", value: dmSent ? "Sent" : "Failed or blocked" },
        { name: "Warnings Cleared", value: clearedWarnings > 0 ? `${clearedWarnings} warnings cleared` : "No warnings to clear" }
      ]
    });

    await interaction.reply({
      embeds: [embed]
    });

    await sendModLog(interaction.guild, embed).catch((error) => {
      console.error("Failed to send kick mod log:", error);
    });
  }
};

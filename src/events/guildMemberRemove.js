const { Events, AuditLogEvent, PermissionFlagsBits } = require("discord.js");
const { buildLogEmbed, sendModLog } = require("../utils/logger");
const { markInviteeLeft } = require("../utils/inviteStore");
const { hasRecentAction } = require("../utils/actionDeduper");
const { sendKickDM } = require("../utils/dmHelper");

async function findKickEntry(guild, userId) {
  try {
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberKick,
      limit: 6
    });
    const now = Date.now();
    return logs.entries.find((entry) => {
      const targetId = entry.target?.id;
      const createdAt = entry.createdTimestamp || 0;
      return targetId === userId && now - createdAt < 15000;
    });
  } catch {
    return null;
  }
}

function toRelativeTimestamp(timestamp) {
  const value = Number(timestamp || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return "Unknown";
  }
  return `<t:${Math.floor(value / 1000)}:R>`;
}

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    if (!member.guild || member.user.bot) {
      return;
    }

    await markInviteeLeft({
      guildId: member.guild.id,
      inviteeId: member.id
    }).catch(() => null);

    if (hasRecentAction("kick", member.guild.id, member.id)) {
      return;
    }

    const kickEntry = await findKickEntry(member.guild, member.id);
    if (kickEntry && kickEntry.executor?.id !== member.client.user.id) {
      const embed = buildLogEmbed({
        title: "Member Kicked",
        color: 0xed4245,
        fields: [
          { name: "User", value: `${member.user.tag} (${member.id})` },
          {
            name: "Moderator",
            value: `${kickEntry.executor.tag} (${kickEntry.executor.id})`
          },
          { name: "Reason", value: kickEntry.reason || "No reason provided" }
        ]
      });
      await sendModLog(member.guild, embed);

      let inviteUrl = "Contact staff for a rejoin invite.";
      try {
        const inviteChannel =
          member.guild.systemChannel ||
          member.guild.channels.cache.find(
            (channel) =>
              channel.isTextBased() &&
              channel.permissionsFor(member.guild.members.me)?.has(
                PermissionFlagsBits.CreateInstantInvite
              )
          );
        if (inviteChannel) {
          const invite = await inviteChannel.createInvite({
            maxUses: 1,
            maxAge: 3600,
            reason: "Kick rejoin invite from moderation event"
          });
          inviteUrl = invite.url;
        }
      } catch {
        // Keep fallback text
      }

      await sendKickDM(
        member.client,
        member.user,
        member.guild.name,
        kickEntry.reason || "No reason provided",
        kickEntry.executor.tag,
        inviteUrl
      );
      return;
    }

    const embed = buildLogEmbed({
      title: "👋 Member Left",
      color: 0x95a5a6,
      fields: [
        { name: "🏷 Username", value: member.user.username, inline: true },
        { name: "🆔 User ID", value: member.id, inline: true },
        { name: "📆 Joined", value: toRelativeTimestamp(member.joinedTimestamp) }
      ],
      footer: `Now ${member.guild.memberCount} members • ${member.guild.name}`
    })
      .setThumbnail(
        member.user.displayAvatarURL({
          extension: "png",
          size: 512,
          forceStatic: false
        })
      );

    await sendModLog(member.guild, embed);
  }
};

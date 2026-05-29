const { Events, AuditLogEvent } = require("discord.js");
const { buildLogEmbed, sendModLog } = require("../utils/logger");
const { hasRecentAction } = require("../utils/actionDeduper");
const { sendUnbanDM } = require("../utils/dmHelper");

async function findUnbanEntry(guild, userId) {
  try {
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberBanRemove,
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

module.exports = {
  name: Events.GuildBanRemove,
  async execute(ban) {
    if (hasRecentAction("unban", ban.guild.id, ban.user.id)) {
      return;
    }

    const entry = await findUnbanEntry(ban.guild, ban.user.id);
    if (entry?.executor?.id === ban.client.user.id) {
      return;
    }

    const embed = buildLogEmbed({
      title: "Member Unbanned",
      color: 0x57f287,
      fields: [
        { name: "User", value: `${ban.user.tag} (${ban.user.id})` },
        {
          name: "Moderator",
          value: entry?.executor
            ? `${entry.executor.tag} (${entry.executor.id})`
            : "Unknown"
        },
        { name: "Reason", value: entry?.reason || "No reason provided" }
      ]
    });

    await sendModLog(ban.guild, embed);

    // Send DM to unbanned user
    try {
      const moderatorTag = entry?.executor?.tag || "Unknown";
      await sendUnbanDM(ban.client, ban.user, ban.guild.name, moderatorTag);
    } catch {
      // Non-fatal.
    }
  }
};

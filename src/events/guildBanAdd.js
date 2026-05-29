const { Events, AuditLogEvent } = require("discord.js");
const { buildLogEmbed, sendModLog } = require("../utils/logger");
const { hasRecentAction } = require("../utils/actionDeduper");
const { sendBanDM } = require("../utils/dmHelper");
const { monitorAntiNuke } = require("../utils/antiNuke");

async function findBanEntry(guild, userId) {
  try {
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberBanAdd,
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
  name: Events.GuildBanAdd,
  async execute(ban) {
    if (hasRecentAction("ban", ban.guild.id, ban.user.id)) {
      return;
    }

    const entry = await findBanEntry(ban.guild, ban.user.id);
    if (entry?.executor?.id === ban.client.user.id) {
      return;
    }

    const embed = buildLogEmbed({
      title: "Member Banned",
      color: 0x992d22,
      fields: [
        { name: "User", value: `${ban.user.tag} (${ban.user.id})` },
        {
          name: "Moderator",
          value: entry?.executor
            ? `${entry.executor.tag} (${entry.executor.id})`
            : "Unknown"
        },
        { name: "Reason", value: entry?.reason || ban.reason || "No reason provided" }
      ]
    });

    await sendModLog(ban.guild, embed);
    await monitorAntiNuke({
      guild: ban.guild,
      actionType: "member_ban_add",
      targetId: ban.user.id,
      label: "Member Ban"
    }).catch(() => null);

    // Send DM to banned user
    try {
      const reason = entry?.reason || ban.reason || "No reason provided";
      const moderatorTag = entry?.executor?.tag || "Unknown";
      await sendBanDM(ban.client, ban.user, ban.guild.name, reason, moderatorTag);
    } catch (err) {
      // DM sending failures are non-fatal.
    }
  }
};

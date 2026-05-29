const { AuditLogEvent } = require("discord.js");
const { buildLogEmbed, sendModLog } = require("./logger");
const { getGuildSettingsSync } = require("./guildSettings");

const actionWindows = new Map();

const ACTION_LIMITS = {
  channel_create: { limit: 5, windowMs: 15000, auditType: AuditLogEvent.ChannelCreate },
  channel_delete: { limit: 3, windowMs: 15000, auditType: AuditLogEvent.ChannelDelete },
  role_create: { limit: 6, windowMs: 15000, auditType: AuditLogEvent.RoleCreate },
  role_delete: { limit: 3, windowMs: 15000, auditType: AuditLogEvent.RoleDelete },
  member_ban_add: { limit: 4, windowMs: 15000, auditType: AuditLogEvent.MemberBanAdd }
};

function keyFor(guildId, userId, action) {
  return `${guildId}:${userId}:${action}`;
}

function recordAction(guildId, userId, action, windowMs) {
  const key = keyFor(guildId, userId, action);
  const now = Date.now();
  const list = actionWindows.get(key) || [];
  const filtered = list.filter((ts) => now - ts <= windowMs);
  filtered.push(now);
  actionWindows.set(key, filtered);
  return filtered.length;
}

async function findAuditExecutor(guild, actionType, targetId) {
  const config = ACTION_LIMITS[actionType];
  if (!config?.auditType) {
    return null;
  }
  try {
    const logs = await guild.fetchAuditLogs({
      type: config.auditType,
      limit: 8
    });
    const now = Date.now();
    const entry = logs.entries.find((candidate) => {
      const createdAt = Number(candidate.createdTimestamp || 0);
      const recent = now - createdAt < 15_000;
      const entryTargetId = String(candidate.target?.id || "");
      return recent && (!targetId || entryTargetId === String(targetId));
    });
    if (!entry) {
      return null;
    }
    return {
      executorId: String(entry.executor?.id || ""),
      executorTag: entry.executor?.tag || "Unknown",
      reason: entry.reason || "No reason provided"
    };
  } catch {
    return null;
  }
}

async function applyAntiNukeAction(guild, executorId, reasonText) {
  const member = await guild.members.fetch(executorId).catch(() => null);
  if (!member) {
    return { applied: false, reason: "member_not_found" };
  }
  if (member.id === guild.ownerId) {
    return { applied: false, reason: "owner" };
  }
  if (member.id === guild.client.user.id) {
    return { applied: false, reason: "bot" };
  }

  const settings = getGuildSettingsSync(guild.id);
  const bypassRoleIds = new Set([
    ...(Array.isArray(settings.fullCommandRoleIds) ? settings.fullCommandRoleIds : [])
  ]);
  const hasBypassRole = member.roles?.cache?.some?.((role) => bypassRoleIds.has(role.id));
  if (hasBypassRole) {
    return { applied: false, reason: "bypass_role" };
  }

  if (!member.moderatable) {
    return { applied: false, reason: "not_moderatable" };
  }

  await member.timeout(
    60 * 60 * 1000,
    `Anti-Nuke: suspicious mass actions detected (${reasonText})`
  ).catch(() => null);
  return { applied: true, reason: "timeout_60m" };
}

async function monitorAntiNuke({
  guild,
  actionType,
  targetId = null,
  label = "Unknown action"
}) {
  const config = ACTION_LIMITS[actionType];
  if (!guild || !config) {
    return { triggered: false };
  }

  const audit = await findAuditExecutor(guild, actionType, targetId);
  const executorId = String(audit?.executorId || "").trim();
  if (!executorId || executorId === guild.client.user.id) {
    return { triggered: false };
  }

  const count = recordAction(guild.id, executorId, actionType, config.windowMs);
  if (count < config.limit) {
    return { triggered: false, count };
  }

  const actionResult = await applyAntiNukeAction(
    guild,
    executorId,
    `${label} (${count}/${config.limit})`
  );

  const embed = buildLogEmbed({
    title: "Anti-Nuke Triggered",
    color: 0xed4245,
    fields: [
      { name: "Action", value: label },
      { name: "Executor", value: `<@${executorId}> (${executorId})` },
      { name: "Count", value: `${count} in ${Math.floor(config.windowMs / 1000)}s` },
      { name: "Audit Reason", value: audit?.reason || "No reason provided" },
      {
        name: "Protection Action",
        value: actionResult.applied
          ? "Timeout 60 minutes applied"
          : `No action (${actionResult.reason})`
      }
    ]
  });

  await sendModLog(guild, embed).catch(() => null);
  return { triggered: true, count, actionResult };
}

module.exports = {
  monitorAntiNuke
};

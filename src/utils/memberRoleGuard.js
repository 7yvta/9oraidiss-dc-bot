const PROTECTED_MEMBER_ROLE_REMOVER_ROLE_IDS = Object.freeze([
  "1479263062065152111",
  "1483555926492451118",
  "1479263836778532934"
]);
const STICKY_MEMBER_ROLE_IDS = Object.freeze(["1480011765151699054"]);
const SELF_ASSIGNED_BLOCKED_ROLE_IDS = Object.freeze(["1493298416363765941"]);
const APP_MEMBER_ROLE_ID = "1479895309802012884";
const APP_BLOCKED_MEMBER_ROLE_IDS = Object.freeze(["1480011765151699054"]);

const approvedRemovalUntil = new Map();

function buildKey(guildId, memberId) {
  return `${guildId || "0"}:${memberId || "0"}`;
}

function hasAnyRole(member, roleIds) {
  if (!member || !Array.isArray(roleIds) || roleIds.length === 0) {
    return false;
  }
  if (!member.roles?.cache) {
    return false;
  }
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function canRemoveProtectedMemberRole(member) {
  return hasAnyRole(member, PROTECTED_MEMBER_ROLE_REMOVER_ROLE_IDS);
}

function markApprovedProtectedMemberRoleRemoval({
  guildId,
  memberId,
  ttlMs = 30000
}) {
  if (!guildId || !memberId) {
    return;
  }
  approvedRemovalUntil.set(buildKey(guildId, memberId), Date.now() + ttlMs);
}

function consumeApprovedProtectedMemberRoleRemoval({ guildId, memberId }) {
  if (!guildId || !memberId) {
    return false;
  }

  const key = buildKey(guildId, memberId);
  const until = approvedRemovalUntil.get(key) || 0;
  if (until > Date.now()) {
    approvedRemovalUntil.delete(key);
    return true;
  }

  approvedRemovalUntil.delete(key);
  return false;
}

function isProtectedMemberRole(roleId, settings) {
  if (!roleId || !settings?.memberRoleId) {
    return false;
  }
  return String(roleId) === String(settings.memberRoleId);
}

function isStickyMemberRole(roleId, settings) {
  if (!roleId) {
    return false;
  }
  if (settings?.stickyMemberRoleEnabled === false) {
    return false;
  }
  const normalized = String(roleId);
  if (STICKY_MEMBER_ROLE_IDS.includes(normalized)) {
    return true;
  }
  return Boolean(settings?.memberRoleId && String(settings.memberRoleId) === normalized);
}

function getAppBlockedRoleIds(settings) {
  const blocked = new Set(APP_BLOCKED_MEMBER_ROLE_IDS.map((roleId) => String(roleId)));
  if (settings?.memberRoleId && settings.autoMemberRoleEnabled !== false) {
    blocked.add(String(settings.memberRoleId));
  }
  return Array.from(blocked);
}

async function enforceAppMemberRolePolicy(
  member,
  settings,
  reason = "App role policy enforcement"
) {
  const result = {
    removedRoleIds: [],
    addedRoleIds: [],
    failedRoleIds: []
  };

  if (!member?.guild || !member?.user?.bot) {
    return result;
  }

  const blockedRoleIds = getAppBlockedRoleIds(settings);
  for (const roleId of blockedRoleIds) {
    if (!member.roles.cache.has(roleId)) {
      continue;
    }
    const role =
      member.guild.roles.cache.get(roleId) ||
      (await member.guild.roles.fetch(roleId).catch(() => null));
    if (!role) {
      result.failedRoleIds.push(roleId);
      continue;
    }

    const removed = await member.roles.remove(role, reason).then(() => true).catch(() => false);
    if (removed) {
      result.removedRoleIds.push(roleId);
    } else {
      result.failedRoleIds.push(roleId);
    }
  }

  if (!APP_MEMBER_ROLE_ID) {
    return result;
  }

  if (member.roles.cache.has(APP_MEMBER_ROLE_ID)) {
    return result;
  }

  const appRole =
    member.guild.roles.cache.get(APP_MEMBER_ROLE_ID) ||
    (await member.guild.roles.fetch(APP_MEMBER_ROLE_ID).catch(() => null));
  if (!appRole) {
    result.failedRoleIds.push(APP_MEMBER_ROLE_ID);
    return result;
  }

  const added = await member.roles.add(appRole, reason).then(() => true).catch(() => false);
  if (added) {
    result.addedRoleIds.push(APP_MEMBER_ROLE_ID);
  } else {
    result.failedRoleIds.push(APP_MEMBER_ROLE_ID);
  }

  return result;
}

module.exports = {
  APP_MEMBER_ROLE_ID,
  APP_BLOCKED_MEMBER_ROLE_IDS,
  PROTECTED_MEMBER_ROLE_REMOVER_ROLE_IDS,
  SELF_ASSIGNED_BLOCKED_ROLE_IDS,
  STICKY_MEMBER_ROLE_IDS,
  canRemoveProtectedMemberRole,
  enforceAppMemberRolePolicy,
  consumeApprovedProtectedMemberRoleRemoval,
  isProtectedMemberRole,
  isStickyMemberRole,
  markApprovedProtectedMemberRoleRemoval
};

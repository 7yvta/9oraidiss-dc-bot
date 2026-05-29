const UNLIMITED_ROLE_IDS = new Set([
  "1479263062065152111",
  "1479263536797454489"
]);

const ACTION_LIMITS = {
  ban: {
    "1479264180866388089": { limit: 2, timeMs: 3 * 60 * 60 * 1000 },
    "1479263836778532934": { limit: 4, timeMs: 2 * 60 * 60 * 1000 },
    "1483555926492451118": { limit: 5, timeMs: 1 * 60 * 60 * 1000 }
  },
  kick: {
    "1479264180866388089": { limit: 3, timeMs: 3 * 60 * 60 * 1000 },
    "1479263836778532934": { limit: 5, timeMs: 2 * 60 * 60 * 1000 },
    "1483555926492451118": { limit: 6, timeMs: 1 * 60 * 60 * 1000 }
  }
};

const userActionHistory = new Map();

function getApplicableRule(member, actionType) {
  if (!member?.roles?.cache) {
    return null;
  }

  if (member.roles.cache.some((role) => UNLIMITED_ROLE_IDS.has(role.id))) {
    return { roleId: "unlimited", limit: Infinity, timeMs: 0 };
  }

  const rules = ACTION_LIMITS[actionType];
  if (!rules) {
    return null;
  }

  const matchingRoles = member.roles.cache
    .filter((role) => rules[role.id])
    .sort((a, b) => b.position - a.position);

  if (matchingRoles.size === 0) {
    return null;
  }

  const topRole = matchingRoles.first();
  return {
    roleId: topRole.id,
    ...rules[topRole.id]
  };
}

function formatWindow(timeMs) {
  const hours = timeMs / 3600000;
  if (Number.isInteger(hours)) {
    return `${hours}h`;
  }
  return `${hours.toFixed(2)}h`;
}

function getHistoryKey(actionType, memberId) {
  return `${actionType}:${memberId}`;
}

function checkActionLimit(actionType, member) {
  const rule = getApplicableRule(member, actionType);
  if (!rule || rule.limit === Infinity) {
    return { allowed: true };
  }

  const { roleId, limit, timeMs } = rule;
  const now = Date.now();
  const historyKey = getHistoryKey(actionType, member.id);
  const actionHistory = userActionHistory.get(historyKey) || [];
  const recentActions = actionHistory.filter((ts) => now - ts < timeMs);
  userActionHistory.set(historyKey, recentActions);

  if (recentActions.length >= limit) {
    return {
      allowed: false,
      reason: `Limit reached for <@&${roleId}>: ${limit} ${actionType} use(s) per ${formatWindow(timeMs)}`
    };
  }

  return { allowed: true };
}

function recordAction(actionType, memberId) {
  const now = Date.now();
  const historyKey = getHistoryKey(actionType, memberId);
  const actionHistory = userActionHistory.get(historyKey) || [];
  actionHistory.push(now);
  userActionHistory.set(historyKey, actionHistory);
}

function checkBanLimit(member) {
  return checkActionLimit("ban", member);
}

function recordBanAction(memberId) {
  recordAction("ban", memberId);
}

function checkKickLimit(member) {
  return checkActionLimit("kick", member);
}

function recordKickAction(memberId) {
  recordAction("kick", memberId);
}

module.exports = {
  checkBanLimit,
  recordBanAction,
  checkKickLimit,
  recordKickAction
};

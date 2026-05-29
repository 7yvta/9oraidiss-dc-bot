const recentActions = new Map();

function makeKey(type, guildId, targetId) {
  return `${type}:${guildId}:${targetId}`;
}

function markRecentAction(type, guildId, targetId, ttlMs = 20000) {
  const expiresAt = Date.now() + ttlMs;
  recentActions.set(makeKey(type, guildId, targetId), expiresAt);
}

function hasRecentAction(type, guildId, targetId) {
  const key = makeKey(type, guildId, targetId);
  const expiresAt = recentActions.get(key);
  if (!expiresAt) {
    return false;
  }
  if (Date.now() > expiresAt) {
    recentActions.delete(key);
    return false;
  }
  return true;
}

function clearRecentAction(type, guildId, targetId) {
  recentActions.delete(makeKey(type, guildId, targetId));
}

module.exports = {
  clearRecentAction,
  hasRecentAction,
  markRecentAction
};

const buckets = new Map();

function parseCooldownMs(value, fallbackMs) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallbackMs;
  }
  return Math.floor(parsed);
}

function checkCooldown({ guildId, userId, bucket, cooldownMs }) {
  const normalizedGuildId = String(guildId || "dm");
  const normalizedUserId = String(userId || "");
  const normalizedBucket = String(bucket || "default");
  const duration = Math.max(0, Number(cooldownMs) || 0);

  if (!normalizedUserId || duration <= 0) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const now = Date.now();
  const key = `${normalizedGuildId}:${normalizedUserId}:${normalizedBucket}`;
  const expiresAt = buckets.get(key) || 0;

  if (expiresAt > now) {
    return { allowed: false, retryAfterMs: expiresAt - now };
  }

  buckets.set(key, now + duration);

  for (const [cachedKey, cachedExpiresAt] of buckets) {
    if (cachedExpiresAt <= now) {
      buckets.delete(cachedKey);
    }
  }

  return { allowed: true, retryAfterMs: 0 };
}

function formatRetryAfter(ms) {
  const seconds = Math.ceil(Math.max(0, Number(ms) || 0) / 1000);
  if (seconds <= 1) {
    return "1 second";
  }
  if (seconds < 60) {
    return `${seconds} seconds`;
  }

  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

module.exports = {
  checkCooldown,
  formatRetryAfter,
  parseCooldownMs
};

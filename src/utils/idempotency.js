const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const {
  getPostgresStatus,
  claimIdempotencyKey,
  pruneExpiredIdempotencyKeys
} = require("./postgres");

const seen = new Map();
const fileStoreDir = path.join(os.homedir(), ".nexus-bot", "runtime", "idempotency");

let lastFilePruneAt = 0;
let lastPgPruneAt = 0;
const SHARED_CLAIM_TIMEOUT_MS = 450;

function cleanupExpired(now = Date.now()) {
  for (const [key, expiresAt] of seen.entries()) {
    if (Number(expiresAt || 0) <= now) {
      seen.delete(key);
    }
  }
}

function makePayloadHash(value) {
  const serialized = JSON.stringify(value ?? {});
  return crypto.createHash("sha256").update(serialized).digest("hex").slice(0, 24);
}

function normalizeCompoundKey(scope, key) {
  const normalizedScope = String(scope || "global").trim() || "global";
  const normalizedKey = String(key || "").trim();
  return {
    normalizedScope,
    normalizedKey,
    compound: `${normalizedScope}:${normalizedKey}`
  };
}

function hasSeen(key, ttlMs = 10000) {
  const normalized = String(key || "").trim();
  if (!normalized) {
    return false;
  }

  const now = Date.now();
  cleanupExpired(now);
  const expiresAt = seen.get(normalized);
  if (expiresAt && expiresAt > now) {
    return true;
  }
  seen.set(normalized, now + Math.max(1000, Number(ttlMs) || 10000));
  return false;
}

function markSeen(key, ttlMs = 10000) {
  const normalized = String(key || "").trim();
  if (!normalized) {
    return;
  }
  const now = Date.now();
  seen.set(normalized, now + Math.max(1000, Number(ttlMs) || 10000));
}

function ensureFileStoreDir() {
  fs.mkdirSync(fileStoreDir, { recursive: true });
}

function hashCompoundKey(compound) {
  return crypto.createHash("sha256").update(compound).digest("hex");
}

function pruneFileStore(now = Date.now()) {
  if (now - lastFilePruneAt < 60_000) {
    return;
  }
  lastFilePruneAt = now;

  let entries = [];
  try {
    ensureFileStoreDir();
    entries = fs.readdirSync(fileStoreDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const fullPath = path.join(fileStoreDir, entry.name);
    try {
      const raw = fs.readFileSync(fullPath, "utf8");
      const parsed = JSON.parse(raw);
      const expiresAt = Number(parsed?.expiresAt || 0);
      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        fs.unlinkSync(fullPath);
      }
    } catch {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        // ignore
      }
    }
  }
}

function acquireFileLock(lockPath) {
  try {
    fs.mkdirSync(lockPath);
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") {
      return false;
    }
  }

  try {
    const stat = fs.statSync(lockPath);
    const ageMs = Date.now() - Number(stat?.mtimeMs || 0);
    if (ageMs > 15_000) {
      fs.rmSync(lockPath, { recursive: true, force: true });
      fs.mkdirSync(lockPath);
      return true;
    }
  } catch {
    // ignore stale lock check failures
  }

  return false;
}

function releaseFileLock(lockPath) {
  try {
    fs.rmSync(lockPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function claimFileKey(scope, key, ttlMs) {
  const { compound } = normalizeCompoundKey(scope, key);
  if (!compound) {
    return true;
  }

  const now = Date.now();
  const expiresAt = now + Math.max(500, Number(ttlMs) || 10000);
  ensureFileStoreDir();
  pruneFileStore(now);

  const keyHash = hashCompoundKey(compound);
  const keyPath = path.join(fileStoreDir, `${keyHash}.json`);
  const lockPath = path.join(fileStoreDir, `${keyHash}.lock`);

  if (!acquireFileLock(lockPath)) {
    return false;
  }

  try {
    try {
      const raw = fs.readFileSync(keyPath, "utf8");
      const parsed = JSON.parse(raw);
      const existingExpiry = Number(parsed?.expiresAt || 0);
      if (Number.isFinite(existingExpiry) && existingExpiry > now) {
        return false;
      }
    } catch {
      // no existing entry or unreadable entry
    }

    const payload = {
      scope: String(scope || "global"),
      key: String(key || ""),
      expiresAt,
      updatedAt: new Date(now).toISOString()
    };
    fs.writeFileSync(keyPath, JSON.stringify(payload), "utf8");
    return true;
  } finally {
    releaseFileLock(lockPath);
  }
}

async function claimSharedKey(scope, key, ttlMs) {
  const pg = getPostgresStatus();
  if (pg.enabled && pg.connected) {
    if (Date.now() - lastPgPruneAt > 5 * 60_000) {
      lastPgPruneAt = Date.now();
      pruneExpiredIdempotencyKeys().catch(() => null);
    }
    const claimed = await claimIdempotencyKey(scope, key, ttlMs).catch(() => null);
    if (claimed != null) {
      return Boolean(claimed);
    }
  }

  return claimFileKey(scope, key, ttlMs);
}

function withTimeout(promise, timeoutMs, fallbackValue) {
  const timeout = Math.max(50, Number(timeoutMs) || SHARED_CLAIM_TIMEOUT_MS);
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallbackValue), timeout);
    })
  ]);
}

async function runOnce({ scope = "global", key, ttlMs = 10000, action }) {
  const { compound, normalizedKey } = normalizeCompoundKey(scope, key);
  if (!normalizedKey) {
    return { skipped: true };
  }

  const localSeen = hasSeen(compound, ttlMs);
  if (localSeen) {
    return { skipped: true };
  }

  let sharedClaimed = true;
  try {
    const claimed = await withTimeout(
      claimSharedKey(scope, normalizedKey, ttlMs),
      SHARED_CLAIM_TIMEOUT_MS,
      true
    );
    sharedClaimed = Boolean(claimed);
  } catch {
    // If shared dedupe backend fails, keep bot functional and rely on local memory guard.
    sharedClaimed = true;
  }
  if (!sharedClaimed) {
    markSeen(compound, ttlMs);
    return { skipped: true };
  }

  markSeen(compound, ttlMs);
  const result = await action();
  return { skipped: false, result };
}

module.exports = {
  makePayloadHash,
  hasSeen,
  runOnce
};

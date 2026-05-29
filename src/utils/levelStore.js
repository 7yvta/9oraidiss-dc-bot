const path = require("node:path");
const config = require("../config");
const { readJsonDocument, writeJsonDocument } = require("./persistentStore");

const dataDir = path.join(__dirname, "..", "..", "data");
const levelsFile = path.join(dataDir, "levels.json");
const levelsBackupFile = path.join(dataDir, "levels.backup.json");

let storeQueue = Promise.resolve();

async function ensureStore() {
  // No-op: persistentStore ensures file/dir and optional Postgres mirror.
  return true;
}

async function readStore() {
  await ensureStore();
  return readJsonDocument({
    namespace: "core_store",
    docKey: "levels",
    filePath: levelsFile,
    defaultValue: {},
    backupFilePath: levelsBackupFile
  });
}

async function writeStore(data) {
  await writeJsonDocument({
    namespace: "core_store",
    docKey: "levels",
    filePath: levelsFile,
    backupFilePath: levelsBackupFile,
    value: data
  });
}

function queueStoreOperation(operation) {
  const pending = storeQueue.then(() => operation());
  // Keep queue alive even if an operation fails.
  storeQueue = pending.then(
    () => undefined,
    () => undefined
  );
  return pending;
}

function toNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.floor(numeric));
}

function normalizeMaxLevel(value) {
  if (value == null) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const normalized = Math.floor(numeric);
  return normalized >= 0 ? normalized : null;
}

function resolveLevelCapFromRewards(levelRewards) {
  if (!Array.isArray(levelRewards) || levelRewards.length === 0) {
    return null;
  }
  let maxLevel = null;
  for (const reward of levelRewards) {
    const level = normalizeMaxLevel(reward?.level);
    if (level == null) {
      continue;
    }
    if (maxLevel == null || level > maxLevel) {
      maxLevel = level;
    }
  }
  return maxLevel;
}

function resolveLevelCap(levelRewards, configuredMaxLevel = null, options = {}) {
  const configured = normalizeMaxLevel(configuredMaxLevel);
  if (configured != null) {
    return configured;
  }

  if (options?.fallbackToRewardMax) {
    return resolveLevelCapFromRewards(levelRewards);
  }

  // No explicit cap configured.
  return null;
}

function xpForNextLevel(level) {
  const safeLevel = toNonNegativeInteger(level, 0);
  const curve = String(config.levelCurve || "linear").toLowerCase();
  const multiplierRaw =
    config.levelCurveMultiplier == null ? 1 : Number(config.levelCurveMultiplier);
  const multiplier = Number.isFinite(multiplierRaw) && multiplierRaw > 0 ? multiplierRaw : 1;

  // Arcane-like curves treat "level" as 1-based in formulas; this bot stores levels starting at 0.
  const formulaLevel = safeLevel + 1;

  let baseRequiredXp;
  if (curve === "exponential") {
    baseRequiredXp =
      5 * formulaLevel * formulaLevel + formulaLevel * 50 + 75;
  } else if (curve === "flat" || curve === "constant") {
    baseRequiredXp = 1000;
  } else {
    baseRequiredXp = formulaLevel * 100 + 75;
  }

  const required = Math.round(baseRequiredXp * multiplier);
  return Math.max(1, required);
}

function totalXpForLevel(level) {
  const safeLevel = toNonNegativeInteger(level, 0);
  let total = 0;
  for (let currentLevel = 0; currentLevel < safeLevel; currentLevel += 1) {
    total += xpForNextLevel(currentLevel);
  }
  return total;
}

function totalXpCapForMaxLevel(maxLevel) {
  const normalizedMaxLevel = normalizeMaxLevel(maxLevel);
  if (normalizedMaxLevel == null) {
    return null;
  }
  // Hard cap: once a user reaches max level, XP stays fixed at that level.
  return totalXpForLevel(normalizedMaxLevel);
}

function clampTotalXpToMaxLevel(totalXp, maxLevel) {
  const normalizedTotalXp = toNonNegativeInteger(totalXp, 0);
  const maxTotalXp = totalXpCapForMaxLevel(maxLevel);
  if (maxTotalXp == null) {
    return normalizedTotalXp;
  }
  return Math.min(normalizedTotalXp, maxTotalXp);
}

function computeProgressFromTotalXp(totalXp, options = {}) {
  const maxLevel = normalizeMaxLevel(options.maxLevel);
  const cappedTotalXp = clampTotalXpToMaxLevel(totalXp, maxLevel);

  let remaining = toNonNegativeInteger(totalXp, 0);
  if (remaining !== cappedTotalXp) {
    remaining = cappedTotalXp;
  }
  let level = 0;
  let requiredForNext = xpForNextLevel(level);
  let safety = 0;

  while (remaining >= requiredForNext && safety < 100000) {
    remaining -= requiredForNext;
    level += 1;
    requiredForNext = xpForNextLevel(level);
    safety += 1;
  }

  return {
    level,
    xp: remaining,
    neededXp: requiredForNext
  };
}

function normalizeEntry(entry) {
  const rawLevel = toNonNegativeInteger(entry?.level, 0);
  const rawXp = toNonNegativeInteger(entry?.xp, 0);
  const hasTotalXp = entry?.totalXp != null && Number.isFinite(Number(entry.totalXp));

  let totalXp = hasTotalXp
    ? toNonNegativeInteger(entry.totalXp, 0)
    : totalXpForLevel(rawLevel) + rawXp;

  if (!Number.isFinite(totalXp) || totalXp < 0) {
    totalXp = 0;
  }

  const normalizedProgress = computeProgressFromTotalXp(totalXp);
  return {
    totalXp,
    level: normalizedProgress.level,
    xp: normalizedProgress.xp
  };
}

function ensureEntry(store, guildId, userId) {
  if (!store[guildId]) {
    store[guildId] = {};
  }

  const normalized = normalizeEntry(store[guildId][userId]);
  store[guildId][userId] = normalized;
  return normalized;
}

async function addXp({ guildId, userId, amount, maxLevel = null }) {
  return queueStoreOperation(async () => {
    const store = await readStore();
    const gained = toNonNegativeInteger(amount, 0);
    const entry = ensureEntry(store, guildId, userId);
    const normalizedMaxLevel = normalizeMaxLevel(maxLevel);
    let changed = false;

    const cappedEntryTotalXp = clampTotalXpToMaxLevel(entry.totalXp, normalizedMaxLevel);
    if (cappedEntryTotalXp !== entry.totalXp) {
      const cappedProgress = computeProgressFromTotalXp(cappedEntryTotalXp, {
        maxLevel: normalizedMaxLevel
      });
      // Never move a user backwards during normal XP ticks.
      if (cappedProgress.level >= entry.level) {
        entry.totalXp = cappedEntryTotalXp;
        entry.level = cappedProgress.level;
        entry.xp = cappedProgress.xp;
        changed = true;
      }
    }

    if (gained <= 0) {
      if (changed) {
        await writeStore(store);
      }
      const progress = computeProgressFromTotalXp(entry.totalXp, {
        maxLevel: normalizedMaxLevel
      });
      return {
        leveledUp: false,
        level: progress.level,
        xp: progress.xp,
        neededXp: progress.neededXp,
        totalXp: entry.totalXp,
        maxed: normalizedMaxLevel != null && progress.level >= normalizedMaxLevel
      };
    }

    const previousLevel = entry.level;
    let nextTotalXp = clampTotalXpToMaxLevel(
      entry.totalXp + gained,
      normalizedMaxLevel
    );
    let progress = computeProgressFromTotalXp(nextTotalXp, {
      maxLevel: normalizedMaxLevel
    });

    // Guard against any level rollback caused by caps/config mismatch across restarts.
    if (progress.level < previousLevel) {
      nextTotalXp = entry.totalXp + gained;
      progress = computeProgressFromTotalXp(nextTotalXp);
    }

    entry.totalXp = nextTotalXp;
    entry.level = progress.level;
    entry.xp = progress.xp;

    await writeStore(store);
    return {
      leveledUp: progress.level > previousLevel,
      level: progress.level,
      xp: progress.xp,
      neededXp: progress.neededXp,
      totalXp: entry.totalXp,
      maxed: normalizedMaxLevel != null && progress.level >= normalizedMaxLevel
    };
  });
}

async function getUserLevel({ guildId, userId }) {
  return queueStoreOperation(async () => {
    const store = await readStore();
    const entry = normalizeEntry(store[guildId]?.[userId]);
    const progress = computeProgressFromTotalXp(entry.totalXp);
    const shouldSave =
      !store[guildId] ||
      !store[guildId][userId] ||
      Number(store[guildId][userId].totalXp) !== entry.totalXp ||
      Number(store[guildId][userId].level) !== progress.level ||
      Number(store[guildId][userId].xp) !== progress.xp;

    if (shouldSave) {
      if (!store[guildId]) {
        store[guildId] = {};
      }
      store[guildId][userId] = {
        totalXp: entry.totalXp,
        level: progress.level,
        xp: progress.xp
      };
      await writeStore(store);
    }

    return {
      level: progress.level,
      xp: progress.xp,
      neededXp: progress.neededXp,
      totalXp: entry.totalXp
    };
  });
}

async function setUserXp({ guildId, userId, totalXp, maxLevel = null }) {
  return queueStoreOperation(async () => {
    const store = await readStore();
    const normalizedTotalXp = clampTotalXpToMaxLevel(
      toNonNegativeInteger(totalXp, 0),
      maxLevel
    );
    const progress = computeProgressFromTotalXp(normalizedTotalXp, { maxLevel });

    if (!store[guildId]) {
      store[guildId] = {};
    }

    store[guildId][userId] = {
      totalXp: normalizedTotalXp,
      level: progress.level,
      xp: progress.xp
    };

    await writeStore(store);
    return {
      level: progress.level,
      xp: progress.xp,
      neededXp: progress.neededXp,
      totalXp: normalizedTotalXp
    };
  });
}

async function getLeaderboard({ guildId, limit = 10 }) {
  return queueStoreOperation(async () => {
    const store = await readStore();
    const guildData = store[guildId] || {};

    return Object.entries(guildData)
      .map(([userId, values]) => ({
        userId,
        ...normalizeEntry(values)
      }))
      .sort((a, b) => {
        if (b.level !== a.level) {
          return b.level - a.level;
        }
        if (b.totalXp !== a.totalXp) {
          return b.totalXp - a.totalXp;
        }
        return b.xp - a.xp;
      })
      .slice(0, limit);
  });
}

module.exports = {
  addXp,
  getUserLevel,
  getLeaderboard,
  resolveLevelCap,
  resolveLevelCapFromRewards,
  setUserXp,
  totalXpCapForMaxLevel,
  xpForNextLevel,
  totalXpForLevel
};

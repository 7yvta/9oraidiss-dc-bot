const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const dataDir = path.join(__dirname, "..", "..", "data");
const warningsFile = path.join(dataDir, "warnings.json");

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(warningsFile);
  } catch {
    await fs.writeFile(warningsFile, JSON.stringify({}, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(warningsFile, "utf8");
  return JSON.parse(raw);
}

async function writeStore(data) {
  await fs.writeFile(warningsFile, JSON.stringify(data, null, 2), "utf8");
}

async function addWarning({ guildId, userId, moderatorId, reason }) {
  const store = await readStore();
  if (!store[guildId]) {
    store[guildId] = {};
  }
  if (!store[guildId][userId]) {
    store[guildId][userId] = [];
  }

  const entry = {
    id: crypto.randomUUID().slice(0, 8),
    moderatorId,
    reason: reason || "No reason provided",
    timestamp: new Date().toISOString()
  };

  store[guildId][userId].push(entry);
  await writeStore(store);
  return entry;
}

async function getWarnings({ guildId, userId }) {
  const store = await readStore();
  const guildWarnings = store[guildId] || {};

  if (userId) {
    return guildWarnings[userId] || [];
  }

  const out = [];
  for (const [entryUserId, entries] of Object.entries(guildWarnings)) {
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      out.push({
        userId: entryUserId,
        id: entry?.id || null,
        moderatorId: entry?.moderatorId || null,
        reason: entry?.reason || "No reason provided",
        timestamp: entry?.timestamp || null
      });
    }
  }
  out.sort((a, b) => {
    const at = Date.parse(a.timestamp || 0) || 0;
    const bt = Date.parse(b.timestamp || 0) || 0;
    return bt - at;
  });
  return out;
}

async function clearWarnings({ guildId, userId }) {
  const store = await readStore();
  const count = store[guildId]?.[userId]?.length || 0;

  if (store[guildId]) {
    store[guildId][userId] = [];
  }

  await writeStore(store);
  return count;
}

async function clearWarningsAfterConsequence({ guildId, userId, consequence }) {
  const store = await readStore();
  const warnings = store[guildId]?.[userId] || [];
  const count = warnings.length;

  if (count > 0) {
    // Clear all warnings for this user
    if (store[guildId]) {
      store[guildId][userId] = [];
    }

    await writeStore(store);
    
    // Log the consequence action
    const consequenceEntry = {
      id: crypto.randomUUID().slice(0, 8),
      type: "consequence_clear",
      consequence: consequence,
      timestamp: new Date().toISOString(),
      clearedWarnings: count
    };

    // Store consequence log for audit trail
    if (!store[guildId].consequences) {
      store[guildId].consequences = {};
    }
    if (!store[guildId].consequences[userId]) {
      store[guildId].consequences[userId] = [];
    }
    store[guildId].consequences[userId].push(consequenceEntry);
    
    await writeStore(store);
  }

  return count;
}

module.exports = {
  addWarning,
  getWarnings,
  clearWarnings,
  clearWarningsAfterConsequence
};

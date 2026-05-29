const fs = require("node:fs/promises");
const path = require("node:path");

const dataDir = path.join(__dirname, "..", "..", "data");
const invitesFile = path.join(dataDir, "invites.json");

let writeQueue = Promise.resolve();

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(invitesFile);
  } catch {
    await fs.writeFile(invitesFile, JSON.stringify({}, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(invitesFile, "utf8");
  return JSON.parse(raw);
}

function queueWrite(data) {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(invitesFile, JSON.stringify(data, null, 2), "utf8")
  );
  return writeQueue;
}

function ensureGuild(store, guildId) {
  if (!store[guildId]) {
    store[guildId] = {
      invitedBy: {},
      inviterStats: {}
    };
  }
  return store[guildId];
}

function ensureInviterStats(guildData, inviterId) {
  if (!guildData.inviterStats[inviterId]) {
    guildData.inviterStats[inviterId] = {
      joins: 0,
      left: 0
    };
  }
  return guildData.inviterStats[inviterId];
}

async function recordInviteJoin({ guildId, inviterId, inviteeId, inviteCode }) {
  if (!guildId || !inviterId || !inviteeId) {
    return { tracked: false };
  }

  const store = await readStore();
  const guildData = ensureGuild(store, guildId);
  if (guildData.invitedBy[inviteeId]) {
    return { tracked: false, reason: "already-tracked" };
  }

  guildData.invitedBy[inviteeId] = {
    inviterId,
    inviteCode: inviteCode || null,
    joinedAt: Date.now(),
    left: false
  };

  const stats = ensureInviterStats(guildData, inviterId);
  stats.joins += 1;

  await queueWrite(store);
  return { tracked: true };
}

async function markInviteeLeft({ guildId, inviteeId }) {
  if (!guildId || !inviteeId) {
    return { tracked: false };
  }

  const store = await readStore();
  const guildData = ensureGuild(store, guildId);
  const inviteRecord = guildData.invitedBy[inviteeId];

  if (!inviteRecord || inviteRecord.left) {
    return { tracked: false };
  }

  inviteRecord.left = true;
  inviteRecord.leftAt = Date.now();

  if (inviteRecord.inviterId) {
    const stats = ensureInviterStats(guildData, inviteRecord.inviterId);
    stats.left += 1;
  }

  await queueWrite(store);
  return { tracked: true, inviterId: inviteRecord.inviterId };
}

async function getInviteStats({ guildId, userId }) {
  const store = await readStore();
  const guildData = ensureGuild(store, guildId);
  const stats = guildData.inviterStats[userId] || { joins: 0, left: 0 };

  return {
    joins: stats.joins || 0,
    left: stats.left || 0,
    active: Math.max(0, (stats.joins || 0) - (stats.left || 0))
  };
}

async function getInviterForUser({ guildId, userId }) {
  const store = await readStore();
  const guildData = ensureGuild(store, guildId);
  return guildData.invitedBy[userId] || null;
}

async function getInviteLeaderboard({ guildId, limit = 10 }) {
  const store = await readStore();
  const guildData = ensureGuild(store, guildId);

  return Object.entries(guildData.inviterStats)
    .map(([userId, stats]) => {
      const joins = stats.joins || 0;
      const left = stats.left || 0;
      return {
        userId,
        joins,
        left,
        active: Math.max(0, joins - left)
      };
    })
    .sort((a, b) => {
      if (b.joins !== a.joins) {
        return b.joins - a.joins;
      }
      return b.active - a.active;
    })
    .slice(0, limit);
}

module.exports = {
  getInviterForUser,
  getInviteLeaderboard,
  getInviteStats,
  markInviteeLeft,
  recordInviteJoin
};

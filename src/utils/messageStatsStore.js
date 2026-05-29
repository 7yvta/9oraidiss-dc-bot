const fs = require("node:fs/promises");
const path = require("node:path");

const dataDir = path.join(__dirname, "..", "..", "data");
const statsFile = path.join(dataDir, "message-stats.json");

let writeQueue = Promise.resolve();

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getDayKey(date) {
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  return `${year}-${month}-${day}`;
}

function getMonthKey(date) {
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  return `${year}-${month}`;
}

function getIsoWeekKey(dateInput) {
  const date = new Date(Date.UTC(
    dateInput.getUTCFullYear(),
    dateInput.getUTCMonth(),
    dateInput.getUTCDate()
  ));

  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad2(week)}`;
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(statsFile);
  } catch {
    await fs.writeFile(statsFile, JSON.stringify({}, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(statsFile, "utf8");
  return JSON.parse(raw);
}

function queueWrite(data) {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(statsFile, JSON.stringify(data, null, 2), "utf8")
  );
  return writeQueue;
}

function trimObjectByRecentKeys(obj, keepCount) {
  const entries = Object.entries(obj || {}).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length <= keepCount) {
    return obj;
  }
  const keep = entries.slice(entries.length - keepCount);
  const next = {};
  for (const [key, value] of keep) {
    next[key] = value;
  }
  return next;
}

async function recordGuildMessage({ guildId, userId, timestamp = Date.now() }) {
  if (!guildId || !userId) {
    return;
  }

  const store = await readStore();
  if (!store[guildId]) {
    store[guildId] = {};
  }

  const entry = store[guildId][userId] || {
    total: 0,
    daily: {},
    weekly: {},
    monthly: {}
  };

  const date = new Date(timestamp);
  const dayKey = getDayKey(date);
  const weekKey = getIsoWeekKey(date);
  const monthKey = getMonthKey(date);

  entry.total = Number(entry.total || 0) + 1;
  entry.daily = entry.daily || {};
  entry.weekly = entry.weekly || {};
  entry.monthly = entry.monthly || {};

  entry.daily[dayKey] = Number(entry.daily[dayKey] || 0) + 1;
  entry.weekly[weekKey] = Number(entry.weekly[weekKey] || 0) + 1;
  entry.monthly[monthKey] = Number(entry.monthly[monthKey] || 0) + 1;

  entry.daily = trimObjectByRecentKeys(entry.daily, 45);
  entry.weekly = trimObjectByRecentKeys(entry.weekly, 20);
  entry.monthly = trimObjectByRecentKeys(entry.monthly, 24);

  store[guildId][userId] = entry;
  await queueWrite(store);
}

async function getGuildMessageStats({ guildId, userId, now = Date.now() }) {
  const store = await readStore();
  const entry = store[guildId]?.[userId];
  if (!entry) {
    return {
      total: 0,
      daily: 0,
      weekly: 0,
      monthly: 0
    };
  }

  const date = new Date(now);
  const dayKey = getDayKey(date);
  const weekKey = getIsoWeekKey(date);
  const monthKey = getMonthKey(date);

  return {
    total: Number(entry.total || 0),
    daily: Number(entry.daily?.[dayKey] || 0),
    weekly: Number(entry.weekly?.[weekKey] || 0),
    monthly: Number(entry.monthly?.[monthKey] || 0)
  };
}

module.exports = {
  recordGuildMessage,
  getGuildMessageStats
};

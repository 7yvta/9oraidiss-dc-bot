const path = require("node:path");
const { readJsonDocument, writeJsonDocument } = require("./persistentStore");

const FILE = path.join(__dirname, "..", "..", "data", "auto-vouch-state.json");
const NAMESPACE = "auto_vouch_store";
let cache = null;

async function load() {
  if (cache) {
    return cache;
  }
  cache = await readJsonDocument({
    namespace: NAMESPACE,
    docKey: "default",
    filePath: FILE,
    defaultValue: { counts: {}, scamCounts: {}, lastSentAt: {} }
  });
  cache.counts ||= {};
  cache.scamCounts ||= {};
  cache.lastSentAt ||= {};
  return cache;
}

async function save() {
  await writeJsonDocument({
    namespace: NAMESPACE,
    docKey: "default",
    filePath: FILE,
    value: cache || { counts: {}, scamCounts: {}, lastSentAt: {} }
  });
}

async function getVouchCount(guildId, userId) {
  const state = await load();
  return Number(state.counts?.[String(guildId)]?.[String(userId)] || 0);
}

async function setVouchCount(guildId, userId, amount) {
  const state = await load();
  const gid = String(guildId);
  const uid = String(userId);
  state.counts[gid] ||= {};
  state.counts[gid][uid] = Math.max(0, Math.floor(Number(amount || 0)));
  await save();
  return state.counts[gid][uid];
}

async function addVouches(guildId, userId, amount) {
  const current = await getVouchCount(guildId, userId);
  return setVouchCount(guildId, userId, current + Number(amount || 0));
}

async function listVouches(guildId) {
  const state = await load();
  const guildCounts = state.counts?.[String(guildId)] || {};
  return Object.entries(guildCounts)
    .map(([userId, count]) => ({ userId, count: Number(count || 0) }))
    .sort((a, b) => b.count - a.count);
}

module.exports = {
  getVouchCount,
  setVouchCount,
  addVouches,
  listVouches
};

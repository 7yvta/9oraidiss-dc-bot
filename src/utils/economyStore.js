const path = require("node:path");
const { readJsonDocument, writeJsonDocument } = require("./persistentStore");

const FILE = path.join(__dirname, "..", "..", "data", "economy.json");
const NAMESPACE = "economy";
const DEFAULT = { guilds: {} };
let cache = null;
const MAX_BALANCE = Number.MAX_SAFE_INTEGER;

async function load() {
  if (cache) {
    return cache;
  }
  cache = await readJsonDocument({
    namespace: NAMESPACE,
    docKey: "default",
    filePath: FILE,
    defaultValue: DEFAULT
  });
  if (!cache.guilds || typeof cache.guilds !== "object") {
    cache.guilds = {};
  }
  return cache;
}

async function save() {
  await writeJsonDocument({
    namespace: NAMESPACE,
    docKey: "default",
    filePath: FILE,
    value: cache || DEFAULT
  });
}

function ensureUser(store, guildId, userId) {
  const gid = String(guildId);
  const uid = String(userId);
  store.guilds[gid] ||= { users: {} };
  store.guilds[gid].users[uid] ||= {
    wallet: 0,
    bank: 0,
    lastDaily: 0,
    lastWork: 0,
    lastRob: 0,
    afk: false
  };
  return store.guilds[gid].users[uid];
}

function toSafeBalance(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.min(MAX_BALANCE, Math.floor(parsed));
}

async function getAccount(guildId, userId) {
  const store = await load();
  return ensureUser(store, guildId, userId);
}

async function updateAccount(guildId, userId, updater) {
  const store = await load();
  const account = ensureUser(store, guildId, userId);
  await updater(account, store.guilds[String(guildId)]);
  account.wallet = toSafeBalance(account.wallet || 0);
  account.bank = toSafeBalance(account.bank || 0);
  await save();
  return account;
}

async function listAccounts(guildId) {
  const store = await load();
  const guild = store.guilds[String(guildId)] || { users: {} };
  return Object.entries(guild.users || {}).map(([userId, account]) => ({
    userId,
    wallet: toSafeBalance(account.wallet || 0),
    bank: toSafeBalance(account.bank || 0),
    total: toSafeBalance(account.wallet || 0) + toSafeBalance(account.bank || 0)
  }));
}

module.exports = {
  getAccount,
  updateAccount,
  listAccounts
};

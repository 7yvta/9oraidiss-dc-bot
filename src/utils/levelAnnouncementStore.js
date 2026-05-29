const path = require("node:path");
const { readJsonDocument, writeJsonDocument } = require("./persistentStore");

const dataDir = path.join(__dirname, "..", "..", "data");
const announcementFile = path.join(dataDir, "level-announcements.json");

let queue = Promise.resolve();

async function ensureStore() {
  return true;
}

async function readStore() {
  await ensureStore();
  return readJsonDocument({
    namespace: "core_store",
    docKey: "level_announcements",
    filePath: announcementFile,
    defaultValue: {}
  });
}

async function writeStore(store) {
  await writeJsonDocument({
    namespace: "core_store",
    docKey: "level_announcements",
    filePath: announcementFile,
    value: store
  });
}

function queueOperation(operation) {
  const pending = queue.then(() => operation());
  queue = pending.then(
    () => undefined,
    () => undefined
  );
  return pending;
}

async function shouldAnnounceLevelUp({ guildId, userId, level }) {
  return queueOperation(async () => {
    const store = await readStore();
    const guildKey = String(guildId || "");
    const userKey = String(userId || "");
    const nextLevel = Number.isFinite(Number(level)) ? Number(level) : 0;

    if (!guildKey || !userKey || nextLevel <= 0) {
      return { shouldAnnounce: true, previousLevel: 0 };
    }

    if (!store[guildKey] || typeof store[guildKey] !== "object") {
      store[guildKey] = {};
    }

    const previousRaw = Number(store[guildKey][userKey] || 0);
    const previousLevel = Number.isFinite(previousRaw) ? previousRaw : 0;
    if (nextLevel <= previousLevel) {
      return { shouldAnnounce: false, previousLevel };
    }

    store[guildKey][userKey] = nextLevel;
    await writeStore(store);
    return { shouldAnnounce: true, previousLevel };
  });
}

module.exports = {
  shouldAnnounceLevelUp
};

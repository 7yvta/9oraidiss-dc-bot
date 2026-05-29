const path = require("node:path");
const crypto = require("node:crypto");
const { readJsonDocument, writeJsonDocument } = require("./persistentStore");

const dataDir = path.join(__dirname, "..", "..", "data");
const versionsFile = path.join(dataDir, "config-versions.json");
const MAX_VERSIONS_PER_GUILD = 40;
let queue = Promise.resolve();

async function readStore() {
  return readJsonDocument({
    namespace: "core_store",
    docKey: "config_versions",
    filePath: versionsFile,
    defaultValue: { guilds: {} }
  });
}

function writeStore(store) {
  queue = queue.then(() =>
    writeJsonDocument({
      namespace: "core_store",
      docKey: "config_versions",
      filePath: versionsFile,
      value: store
    })
  );
  return queue;
}

function normalizeString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function hashOverrides(overrides) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(overrides || {}))
    .digest("hex")
    .slice(0, 16);
}

function createVersionEntry({
  guildId,
  overrides,
  source = "unknown",
  actorId = null,
  note = null
}) {
  return {
    id: crypto.randomUUID().slice(0, 8),
    guildId: normalizeString(guildId),
    createdAt: new Date().toISOString(),
    source: normalizeString(source, "unknown"),
    actorId: actorId ? normalizeString(actorId) : null,
    note: note ? String(note).slice(0, 300) : null,
    hash: hashOverrides(overrides),
    overrides: overrides || {}
  };
}

async function saveConfigVersion({
  guildId,
  overrides,
  source = "unknown",
  actorId = null,
  note = null
}) {
  const normalizedGuildId = normalizeString(guildId);
  if (!normalizedGuildId) {
    return { ok: false, reason: "missing_guild_id" };
  }

  const store = await readStore();
  if (!store.guilds || typeof store.guilds !== "object") {
    store.guilds = {};
  }
  if (!Array.isArray(store.guilds[normalizedGuildId])) {
    store.guilds[normalizedGuildId] = [];
  }

  const entry = createVersionEntry({
    guildId: normalizedGuildId,
    overrides,
    source,
    actorId,
    note
  });
  store.guilds[normalizedGuildId].unshift(entry);
  store.guilds[normalizedGuildId] = store.guilds[normalizedGuildId].slice(
    0,
    MAX_VERSIONS_PER_GUILD
  );
  await writeStore(store);
  return { ok: true, version: entry };
}

async function listConfigVersions({ guildId, limit = 20 }) {
  const normalizedGuildId = normalizeString(guildId);
  if (!normalizedGuildId) {
    return [];
  }
  const store = await readStore();
  const versions = Array.isArray(store.guilds?.[normalizedGuildId])
    ? store.guilds[normalizedGuildId]
    : [];
  return versions.slice(0, Math.max(1, Number(limit) || 20));
}

async function getConfigVersion({ guildId, versionId }) {
  const normalizedGuildId = normalizeString(guildId);
  const normalizedVersionId = normalizeString(versionId);
  if (!normalizedGuildId || !normalizedVersionId) {
    return null;
  }
  const versions = await listConfigVersions({
    guildId: normalizedGuildId,
    limit: MAX_VERSIONS_PER_GUILD
  });
  return versions.find((version) => String(version.id || "") === normalizedVersionId) || null;
}

module.exports = {
  saveConfigVersion,
  listConfigVersions,
  getConfigVersion
};


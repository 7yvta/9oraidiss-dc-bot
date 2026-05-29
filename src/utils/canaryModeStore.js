const path = require("node:path");
const { readJsonDocument, writeJsonDocument } = require("./persistentStore");

const dataDir = path.join(__dirname, "..", "..", "data");
const canaryFile = path.join(dataDir, "canary-mode.json");
let queue = Promise.resolve();

const defaultCanaryConfig = {
  enabled: false,
  guildId: null,
  updatedAt: null,
  updatedBy: null
};

async function readStore() {
  return readJsonDocument({
    namespace: "core_store",
    docKey: "canary_mode",
    filePath: canaryFile,
    defaultValue: defaultCanaryConfig
  });
}

function writeStore(value) {
  queue = queue.then(() =>
    writeJsonDocument({
      namespace: "core_store",
      docKey: "canary_mode",
      filePath: canaryFile,
      value
    })
  );
  return queue;
}

function normalizeGuildId(value) {
  const text = String(value || "").trim();
  return /^\d+$/.test(text) ? text : null;
}

async function getCanaryConfig() {
  const value = await readStore();
  return {
    enabled: Boolean(value?.enabled),
    guildId: normalizeGuildId(value?.guildId),
    updatedAt: value?.updatedAt || null,
    updatedBy: value?.updatedBy || null
  };
}

async function setCanaryConfig({
  enabled,
  guildId = null,
  updatedBy = null
}) {
  const next = {
    enabled: Boolean(enabled),
    guildId: normalizeGuildId(guildId),
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ? String(updatedBy).trim() : null
  };

  if (!next.enabled) {
    next.guildId = null;
  }

  await writeStore(next);
  return next;
}

module.exports = {
  getCanaryConfig,
  setCanaryConfig
};


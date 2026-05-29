const fs = require("node:fs/promises");
const path = require("node:path");
const {
  initPostgres,
  getPostgresStatus,
  getDocument,
  putDocument
} = require("./postgres");

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isStrictPostgresStorageEnabled() {
  return ["true", "1", "yes", "on"].includes(
    String(process.env.STRICT_POSTGRES_STORAGE || process.env.REQUIRE_POSTGRES || "").toLowerCase()
  );
}

async function ensureFile(filePath, defaultValue) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(
      filePath,
      JSON.stringify(defaultValue ?? {}, null, 2),
      "utf8"
    );
  }
}

async function readFileJson(filePath, defaultValue) {
  await ensureFile(filePath, defaultValue);
  const raw = await fs.readFile(filePath, "utf8").catch(() => "");
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return deepClone(defaultValue ?? {});
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return deepClone(defaultValue ?? {});
  }
}

async function writeFileJson(filePath, data, backupFilePath = null) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(data ?? {}, null, 2);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, serialized, "utf8");
  await fs.rename(tempPath, filePath);
  if (backupFilePath) {
    await fs.mkdir(path.dirname(backupFilePath), { recursive: true }).catch(() => null);
    await fs.writeFile(backupFilePath, serialized, "utf8").catch(() => null);
  }
}

async function readJsonDocument({
  namespace,
  docKey = "default",
  filePath,
  defaultValue = {},
  backupFilePath = null
}) {
  const localData = await readFileJson(filePath, defaultValue);
  const pg = await initPostgres().catch(() => null);

  if (!pg?.enabled) {
    if (isStrictPostgresStorageEnabled()) {
      throw new Error(`Postgres storage is required for ${namespace}:${docKey}`);
    }
    return localData;
  }

  const remoteData = await getDocument(namespace, docKey).catch(() => null);
  if (remoteData == null) {
    await putDocument(namespace, docKey, localData).catch(() => null);
    return localData;
  }

  if (backupFilePath) {
    await writeFileJson(backupFilePath, remoteData).catch(() => null);
  }
  return remoteData;
}

async function writeJsonDocument({
  namespace,
  docKey = "default",
  filePath,
  value,
  backupFilePath = null
}) {
  const pg = await initPostgres().catch(() => null);
  if (pg?.enabled) {
    await putDocument(namespace, docKey, value);
    if (backupFilePath) {
      await writeFileJson(backupFilePath, value).catch(() => null);
    }
    return true;
  }
  if (isStrictPostgresStorageEnabled()) {
    throw new Error(`Postgres storage is required for ${namespace}:${docKey}`);
  }
  await writeFileJson(filePath, value, backupFilePath);
  return true;
}

function getPersistenceBackend() {
  const pg = getPostgresStatus();
  if (pg?.enabled && pg?.connected) {
    return isStrictPostgresStorageEnabled() ? "postgres" : "postgres+file";
  }
  return isStrictPostgresStorageEnabled() ? "postgres-required-unavailable" : "file";
}

module.exports = {
  readJsonDocument,
  writeJsonDocument,
  readFileJson,
  writeFileJson,
  getPersistenceBackend
};

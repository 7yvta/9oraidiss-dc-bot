const fs = require("node:fs/promises");
const path = require("node:path");
const {
  initPostgres,
  getPostgresStatus,
  listDocuments,
  putDocument
} = require("./postgres");
const { runOnce } = require("./idempotency");

const dataDir = path.join(__dirname, "..", "..", "data");
const backupDir = path.join(dataDir, "backups");

const managedFiles = [
  { key: "runtimeConfig", file: path.join(dataDir, "runtime-config.json") },
  { key: "guildSettings", file: path.join(dataDir, "guild-settings.json") },
  { key: "levels", file: path.join(dataDir, "levels.json") },
  { key: "appeals", file: path.join(dataDir, "appeals.json") },
  { key: "tickets", file: path.join(dataDir, "tickets.json") }
];

function toSafeTimestamp(date = new Date()) {
  const iso = date.toISOString().replace(/[:.]/g, "-");
  return iso.replace("T", "_").replace("Z", "");
}

async function readJsonSafe(filePath, fallback = {}) {
  const raw = await fs.readFile(filePath, "utf8").catch(() => "");
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return fallback;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
}

async function writeJsonSafe(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data ?? {}, null, 2), "utf8");
}

async function createBackupSnapshot(reason = "manual") {
  await fs.mkdir(backupDir, { recursive: true });
  await initPostgres().catch(() => null);
  const postgres = getPostgresStatus();

  const files = {};
  for (const entry of managedFiles) {
    files[entry.key] = {
      path: path.relative(dataDir, entry.file).replace(/\\/g, "/"),
      payload: await readJsonSafe(entry.file, {})
    };
  }

  const documents = postgres.enabled
    ? await listDocuments("core_store").catch(() => [])
    : [];

  const snapshot = {
    version: 1,
    createdAt: new Date().toISOString(),
    reason: String(reason || "manual"),
    backend: postgres.enabled && postgres.connected ? "postgres" : "file",
    files,
    postgres: {
      enabled: postgres.enabled,
      connected: postgres.connected,
      documents
    }
  };

  const fileName = `backup-${toSafeTimestamp()}.json`;
  const fullPath = path.join(backupDir, fileName);
  await writeJsonSafe(fullPath, snapshot);
  return { fileName, fullPath, snapshot };
}

let autoBackupTimer = null;

function startAutoBackupScheduler(client) {
  const enabled =
    String(process.env.AUTO_BACKUP_ENABLED || "true").toLowerCase() !== "false";
  if (!enabled || autoBackupTimer) {
    return { started: false, reason: enabled ? "already_started" : "disabled" };
  }

  const hours = Math.max(1, Number(process.env.AUTO_BACKUP_INTERVAL_HOURS || 24) || 24);
  const intervalMs = Math.floor(hours * 60 * 60 * 1000);

  async function runBackup(reason) {
    const dayKey = new Date().toISOString().slice(0, 10);
    await runOnce({
      scope: "auto_backup",
      key: `${reason}:${dayKey}`,
      ttlMs: Math.max(intervalMs - 60_000, 60_000),
      action: async () => {
        const result = await createBackupSnapshot(reason);
        console.log(`[Backup] Created ${result.fileName} (${reason}).`);
        return result;
      }
    }).catch((error) => {
      console.error("Automatic backup failed:", error);
      if (client?.emit) {
        client.emit("warn", `Automatic backup failed: ${error?.message || error}`);
      }
    });
  }

  runBackup("startup").catch(() => null);
  autoBackupTimer = setInterval(() => {
    runBackup("scheduled").catch(() => null);
  }, intervalMs);
  autoBackupTimer.unref?.();
  return { started: true, intervalMs };
}

async function listBackups(limit = 20) {
  await fs.mkdir(backupDir, { recursive: true });
  const files = await fs.readdir(backupDir, { withFileTypes: true }).catch(() => []);
  const backups = [];
  for (const entry of files) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const fullPath = path.join(backupDir, entry.name);
    const stat = await fs.stat(fullPath).catch(() => null);
    backups.push({
      fileName: entry.name,
      fullPath,
      size: Number(stat?.size || 0),
      mtimeMs: Number(stat?.mtimeMs || 0)
    });
  }
  return backups
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, Math.max(1, Number(limit) || 20));
}

function resolveBackupFile(fileName) {
  const base = String(fileName || "").trim();
  if (!base) {
    return null;
  }
  if (base.includes("..") || base.includes("/") || base.includes("\\")) {
    return null;
  }
  return path.join(backupDir, base);
}

async function restoreBackupSnapshot(fileName) {
  const fullPath = resolveBackupFile(fileName);
  if (!fullPath) {
    return { ok: false, reason: "invalid_backup_name" };
  }

  const snapshot = await readJsonSafe(fullPath, null);
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, reason: "invalid_backup_payload" };
  }

  const files = snapshot.files && typeof snapshot.files === "object" ? snapshot.files : {};
  for (const entry of managedFiles) {
    const payload = files[entry.key]?.payload;
    if (payload == null) {
      continue;
    }
    await writeJsonSafe(entry.file, payload);
  }

  await initPostgres().catch(() => null);
  const postgres = getPostgresStatus();
  if (postgres.enabled && Array.isArray(snapshot?.postgres?.documents)) {
    for (const doc of snapshot.postgres.documents) {
      const key = String(doc?.key || "").trim();
      if (!key) {
        continue;
      }
      await putDocument("core_store", key, doc.payload ?? {}).catch(() => null);
    }
  }

  return { ok: true, snapshot };
}

module.exports = {
  createBackupSnapshot,
  listBackups,
  restoreBackupSnapshot,
  startAutoBackupScheduler
};

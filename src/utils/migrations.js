const fs = require("node:fs");
const path = require("node:path");

const migrationsDir = path.join(__dirname, "..", "migrations");

let cachedStatus = {
  total: 0,
  applied: 0,
  pending: 0,
  lastAppliedId: null,
  lastRunAt: null,
  ok: true,
  error: null
};

function getMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS bot_migrations (
      migration_id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrationSet(client) {
  const result = await client.query(
    `SELECT migration_id FROM bot_migrations ORDER BY migration_id ASC`
  );
  return new Set((result.rows || []).map((row) => String(row.migration_id || "")));
}

async function applySingleMigration(client, migrationId, sqlText) {
  await client.query("BEGIN");
  try {
    await client.query(sqlText);
    await client.query(
      `INSERT INTO bot_migrations (migration_id, applied_at)
       VALUES ($1, NOW())
       ON CONFLICT (migration_id) DO NOTHING`,
      [migrationId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runMigrations(client) {
  const files = getMigrationFiles();
  const nextStatus = {
    total: files.length,
    applied: 0,
    pending: 0,
    lastAppliedId: null,
    lastRunAt: new Date().toISOString(),
    ok: true,
    error: null
  };

  if (files.length === 0) {
    cachedStatus = { ...nextStatus };
    return cachedStatus;
  }

  try {
    await ensureMigrationTable(client);
    const appliedSet = await getAppliedMigrationSet(client);
    nextStatus.applied = appliedSet.size;

    for (const fileName of files) {
      if (appliedSet.has(fileName)) {
        continue;
      }
      const fullPath = path.join(migrationsDir, fileName);
      const sqlText = fs.readFileSync(fullPath, "utf8");
      await applySingleMigration(client, fileName, sqlText);
      nextStatus.applied += 1;
      nextStatus.lastAppliedId = fileName;
    }

    nextStatus.pending = Math.max(0, nextStatus.total - nextStatus.applied);
    cachedStatus = { ...nextStatus };
    return cachedStatus;
  } catch (error) {
    cachedStatus = {
      ...nextStatus,
      ok: false,
      error: String(error?.message || error)
    };
    throw error;
  }
}

function getMigrationStatus() {
  return { ...cachedStatus };
}

module.exports = {
  runMigrations,
  getMigrationStatus
};

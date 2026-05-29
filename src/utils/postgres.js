let Pool = null;
try {
  ({ Pool } = require("pg"));
} catch {
  Pool = null;
}
const { runMigrations, getMigrationStatus } = require("./migrations");

let pool = null;
let initPromise = null;
let status = {
  enabled: false,
  connected: false,
  provider: "file",
  lastError: null,
  initializedAt: null,
  migrations: getMigrationStatus()
};

function getConnectionString() {
  return String(
    process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.PG_URL ||
      ""
  ).trim();
}

function hasDatabaseConfig() {
  return Boolean(getConnectionString());
}

function shouldUseSsl() {
  if (String(process.env.PGSSL || "").trim() === "disable") {
    return false;
  }
  if (String(process.env.PGSSL || "").trim() === "require") {
    return true;
  }
  const value = String(process.env.NODE_ENV || "").toLowerCase();
  return value === "production";
}

async function ensureTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS bot_documents (
      namespace TEXT NOT NULL,
      doc_key TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(namespace, doc_key)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS bot_jobs (
      job_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      run_at BIGINT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS bot_idempotency_keys (
      scope TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(scope, dedupe_key)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS bot_instances (
      instance_key TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      heartbeat_at BIGINT NOT NULL,
      started_at BIGINT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function initPostgres() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (!hasDatabaseConfig()) {
      status = {
        enabled: false,
        connected: false,
        provider: "file",
        lastError: null,
        initializedAt: new Date().toISOString(),
        migrations: getMigrationStatus()
      };
      return status;
    }

    if (!Pool) {
      status = {
        enabled: false,
        connected: false,
        provider: "file",
        lastError: "pg module is not installed on this host",
        initializedAt: new Date().toISOString(),
        migrations: getMigrationStatus()
      };
      return status;
    }

    try {
      const connectionString = getConnectionString();
      pool = new Pool({
        connectionString,
        ssl: shouldUseSsl() ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 1500,
        query_timeout: 2500,
        statement_timeout: 2500,
        idleTimeoutMillis: 10000
      });
      const client = await pool.connect();
      try {
        await ensureTables(client);
        await runMigrations(client);
      } finally {
        client.release();
      }

      status = {
        enabled: true,
        connected: true,
        provider: "postgres",
        lastError: null,
        initializedAt: new Date().toISOString(),
        migrations: getMigrationStatus()
      };
      return status;
    } catch (error) {
      status = {
        enabled: false,
        connected: false,
        provider: "file",
        lastError: String(error?.message || error),
        initializedAt: new Date().toISOString(),
        migrations: getMigrationStatus()
      };
      pool = null;
      return status;
    }
  })();

  return initPromise;
}

async function query(text, params = []) {
  await initPostgres();
  if (!pool || !status.connected) {
    return null;
  }
  return pool.query(text, params);
}

function getPostgresStatus() {
  return { ...status };
}

async function getDocument(namespace, docKey) {
  const result = await query(
    `SELECT payload
     FROM bot_documents
     WHERE namespace = $1 AND doc_key = $2
     LIMIT 1`,
    [String(namespace), String(docKey)]
  );
  if (!result?.rows?.[0]) {
    return null;
  }
  return result.rows[0].payload ?? null;
}

async function putDocument(namespace, docKey, payload) {
  const result = await query(
    `INSERT INTO bot_documents (namespace, doc_key, payload, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (namespace, doc_key)
     DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [String(namespace), String(docKey), JSON.stringify(payload ?? {})]
  );
  return Boolean(result);
}

async function listDocuments(namespace) {
  const result = await query(
    `SELECT doc_key, payload, updated_at
     FROM bot_documents
     WHERE namespace = $1
     ORDER BY doc_key ASC`,
    [String(namespace)]
  );
  if (!result?.rows) {
    return [];
  }
  return result.rows.map((row) => ({
    key: row.doc_key,
    payload: row.payload,
    updatedAt: row.updated_at
  }));
}

async function upsertJob(job) {
  const normalized = {
    jobId: String(job?.jobId || "").trim(),
    type: String(job?.type || "").trim(),
    runAt: Number(job?.runAt || 0),
    payload: job?.payload ?? {},
    status: String(job?.status || "queued").trim() || "queued"
  };
  if (!normalized.jobId || !normalized.type || !Number.isFinite(normalized.runAt)) {
    return false;
  }

  const result = await query(
    `INSERT INTO bot_jobs (job_id, type, run_at, payload, status, attempts, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, 0, NOW())
     ON CONFLICT (job_id)
     DO UPDATE SET
       type = EXCLUDED.type,
       run_at = EXCLUDED.run_at,
       payload = EXCLUDED.payload,
       status = EXCLUDED.status,
       updated_at = NOW()`,
    [
      normalized.jobId,
      normalized.type,
      Math.floor(normalized.runAt),
      JSON.stringify(normalized.payload),
      normalized.status
    ]
  );
  return Boolean(result);
}

async function fetchDueQueuedJobs(nowMs, limit = 25) {
  const result = await query(
    `SELECT job_id, type, run_at, payload, status, attempts
     FROM bot_jobs
     WHERE status = 'queued' AND run_at <= $1
     ORDER BY run_at ASC
     LIMIT $2`,
    [Math.floor(Number(nowMs || Date.now())), Math.max(1, Number(limit) || 25)]
  );
  if (!result?.rows) {
    return [];
  }
  return result.rows.map((row) => ({
    jobId: row.job_id,
    type: row.type,
    runAt: Number(row.run_at),
    payload: row.payload ?? {},
    status: row.status,
    attempts: Number(row.attempts || 0)
  }));
}

async function markJobRunning(jobId) {
  const result = await query(
    `UPDATE bot_jobs
     SET status = 'running', attempts = attempts + 1, updated_at = NOW()
     WHERE job_id = $1`,
    [String(jobId)]
  );
  return Boolean(result);
}

async function markJobDone(jobId) {
  const result = await query(`DELETE FROM bot_jobs WHERE job_id = $1`, [String(jobId)]);
  return Boolean(result);
}

async function markJobFailed(jobId, errorMessage) {
  const result = await query(
    `UPDATE bot_jobs
     SET status = 'queued', last_error = $2, run_at = $3, updated_at = NOW()
     WHERE job_id = $1`,
    [
      String(jobId),
      String(errorMessage || "unknown_error").slice(0, 1000),
      Date.now() + 30_000
    ]
  );
  return Boolean(result);
}

async function cancelJob(jobId) {
  const result = await query(`DELETE FROM bot_jobs WHERE job_id = $1`, [String(jobId)]);
  return Boolean(result);
}

async function getJobStats() {
  const result = await query(
    `SELECT status, COUNT(*)::int AS count
     FROM bot_jobs
     GROUP BY status`
  );
  const base = {
    queued: 0,
    running: 0,
    other: 0
  };
  if (!result?.rows) {
    return base;
  }

  for (const row of result.rows) {
    const key = String(row.status || "").toLowerCase();
    const count = Number(row.count || 0);
    if (key === "queued") {
      base.queued = count;
    } else if (key === "running") {
      base.running = count;
    } else {
      base.other += count;
    }
  }
  return base;
}

async function claimIdempotencyKey(scope, dedupeKey, ttlMs = 10000) {
  const normalizedScope = String(scope || "global").trim() || "global";
  const normalizedKey = String(dedupeKey || "").trim();
  const ttl = Math.max(500, Number(ttlMs) || 10000);
  if (!normalizedKey) {
    return true;
  }

  const now = Date.now();
  const nextExpiry = now + ttl;

  const inserted = await query(
    `INSERT INTO bot_idempotency_keys (scope, dedupe_key, expires_at, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT DO NOTHING`,
    [normalizedScope, normalizedKey, nextExpiry]
  );
  if (inserted && Number(inserted.rowCount || 0) > 0) {
    return true;
  }

  const updated = await query(
    `UPDATE bot_idempotency_keys
     SET expires_at = $3, updated_at = NOW()
     WHERE scope = $1
       AND dedupe_key = $2
       AND expires_at <= $4`,
    [normalizedScope, normalizedKey, nextExpiry, now]
  );
  return Boolean(updated && Number(updated.rowCount || 0) > 0);
}

async function pruneExpiredIdempotencyKeys(batchSize = 500) {
  const _batchSize = Math.max(1, Number(batchSize) || 500);
  return query(
    `DELETE FROM bot_idempotency_keys
     WHERE expires_at <= $1
       AND (scope, dedupe_key) IN (
         SELECT scope, dedupe_key
         FROM bot_idempotency_keys
         WHERE expires_at <= $1
         LIMIT $2
       )`,
    [Date.now(), _batchSize]
  );
}

async function claimInstanceLease({
  instanceKey,
  ownerId,
  tokenHash,
  heartbeatAt = Date.now(),
  startedAt = Date.now(),
  staleAfterMs = 45_000,
  metadata = {}
}) {
  const key = String(instanceKey || "").trim();
  const owner = String(ownerId || "").trim();
  const token = String(tokenHash || "").trim();
  const heartbeat = Math.floor(Number(heartbeatAt || Date.now()));
  const started = Math.floor(Number(startedAt || Date.now()));
  const staleCutoff = heartbeat - Math.max(10_000, Number(staleAfterMs) || 45_000);

  if (!key || !owner || !token) {
    return { ok: false, reason: "invalid_instance_claim" };
  }

  const result = await query(
    `INSERT INTO bot_instances (
       instance_key,
       owner_id,
       token_hash,
       heartbeat_at,
       started_at,
       metadata,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
     ON CONFLICT (instance_key)
     DO UPDATE SET
       owner_id = CASE
         WHEN bot_instances.owner_id = EXCLUDED.owner_id
           OR bot_instances.heartbeat_at <= $7
         THEN EXCLUDED.owner_id
         ELSE bot_instances.owner_id
       END,
       token_hash = CASE
         WHEN bot_instances.owner_id = EXCLUDED.owner_id
           OR bot_instances.heartbeat_at <= $7
         THEN EXCLUDED.token_hash
         ELSE bot_instances.token_hash
       END,
       heartbeat_at = CASE
         WHEN bot_instances.owner_id = EXCLUDED.owner_id
           OR bot_instances.heartbeat_at <= $7
         THEN EXCLUDED.heartbeat_at
         ELSE bot_instances.heartbeat_at
       END,
       started_at = CASE
         WHEN bot_instances.owner_id = EXCLUDED.owner_id
           OR bot_instances.heartbeat_at <= $7
         THEN EXCLUDED.started_at
         ELSE bot_instances.started_at
       END,
       metadata = CASE
         WHEN bot_instances.owner_id = EXCLUDED.owner_id
           OR bot_instances.heartbeat_at <= $7
         THEN EXCLUDED.metadata
         ELSE bot_instances.metadata
       END,
       updated_at = NOW()
     RETURNING
       instance_key,
       owner_id,
       token_hash,
       heartbeat_at,
       started_at,
       metadata`,
    [key, owner, token, heartbeat, started, JSON.stringify(metadata || {}), staleCutoff]
  );

  const row = result?.rows?.[0] || null;
  if (!row) {
    return { ok: false, reason: "instance_claim_query_failed" };
  }

  const lease = {
    instanceKey: String(row.instance_key),
    ownerId: String(row.owner_id),
    tokenHash: String(row.token_hash),
    heartbeatAt: Number(row.heartbeat_at || 0),
    startedAt: Number(row.started_at || 0),
    metadata: row.metadata || {}
  };

  return {
    ok: true,
    claimed: lease.ownerId === owner,
    lease
  };
}

async function releaseInstanceLease({ instanceKey, ownerId }) {
  const key = String(instanceKey || "").trim();
  const owner = String(ownerId || "").trim();
  if (!key || !owner) {
    return false;
  }
  const result = await query(
    `DELETE FROM bot_instances
     WHERE instance_key = $1 AND owner_id = $2`,
    [key, owner]
  );
  return Boolean(result && Number(result.rowCount || 0) > 0);
}

async function listInstanceLeases() {
  const result = await query(
    `SELECT
       instance_key,
       owner_id,
       token_hash,
       heartbeat_at,
       started_at,
       metadata,
       updated_at
     FROM bot_instances
     ORDER BY updated_at DESC`
  );
  if (!result?.rows) {
    return [];
  }
  return result.rows.map((row) => ({
    instanceKey: String(row.instance_key),
    ownerId: String(row.owner_id),
    tokenHash: String(row.token_hash),
    heartbeatAt: Number(row.heartbeat_at || 0),
    startedAt: Number(row.started_at || 0),
    metadata: row.metadata || {},
    updatedAt: row.updated_at || null
  }));
}

async function pruneStaleInstanceLeases(maxAgeMs = 120_000) {
  const cutoff = Date.now() - Math.max(30_000, Number(maxAgeMs) || 120_000);
  const result = await query(
    `DELETE FROM bot_instances
     WHERE heartbeat_at <= $1`,
    [cutoff]
  );
  return Number(result?.rowCount || 0);
}

module.exports = {
  hasDatabaseConfig,
  initPostgres,
  getPostgresStatus,
  getDocument,
  putDocument,
  listDocuments,
  upsertJob,
  fetchDueQueuedJobs,
  markJobRunning,
  markJobDone,
  markJobFailed,
  cancelJob,
  getJobStats,
  claimIdempotencyKey,
  pruneExpiredIdempotencyKeys,
  claimInstanceLease,
  releaseInstanceLease,
  listInstanceLeases,
  pruneStaleInstanceLeases
};

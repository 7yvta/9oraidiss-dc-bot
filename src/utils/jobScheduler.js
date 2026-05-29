const path = require("node:path");
const {
  readJsonDocument,
  writeJsonDocument,
  getPersistenceBackend
} = require("./persistentStore");
const {
  getPostgresStatus,
  upsertJob,
  fetchDueQueuedJobs,
  markJobRunning,
  markJobDone,
  markJobFailed,
  cancelJob,
  getJobStats
} = require("./postgres");
const { sendAlert } = require("./alerts");

const dataDir = path.join(__dirname, "..", "..", "data");
const jobsFile = path.join(dataDir, "scheduled-jobs.json");
const handlers = new Map();
const runningJobIds = new Set();

let pollTimer = null;
let schedulerClient = null;
let lastPollAt = null;
let processedCount = 0;
let failedCount = 0;
let fileWriteQueue = Promise.resolve();

async function readFileJobs() {
  const doc = await readJsonDocument({
    namespace: "core_store",
    docKey: "scheduled_jobs",
    filePath: jobsFile,
    defaultValue: { jobs: {} }
  });
  const jobs = doc && typeof doc === "object" ? doc.jobs : null;
  return jobs && typeof jobs === "object" ? jobs : {};
}

function writeFileJobs(jobs) {
  fileWriteQueue = fileWriteQueue.then(() =>
    writeJsonDocument({
      namespace: "core_store",
      docKey: "scheduled_jobs",
      filePath: jobsFile,
      value: { jobs }
    })
  );
  return fileWriteQueue;
}

function normalizeJob(input) {
  const jobId = String(input?.jobId || "").trim();
  const type = String(input?.type || "").trim();
  const runAt = Math.floor(Number(input?.runAt || 0));
  const payload = input?.payload ?? {};
  const status = String(input?.status || "queued").trim() || "queued";
  if (!jobId || !type || !Number.isFinite(runAt) || runAt <= 0) {
    return null;
  }
  return { jobId, type, runAt, payload, status };
}

function registerJobHandler(type, handler) {
  const normalizedType = String(type || "").trim();
  if (!normalizedType || typeof handler !== "function") {
    return false;
  }
  handlers.set(normalizedType, handler);
  return true;
}

async function scheduleJob(jobInput) {
  const normalized = normalizeJob(jobInput);
  if (!normalized) {
    return { ok: false, reason: "invalid_job" };
  }

  const pg = getPostgresStatus();
  if (pg.enabled && pg.connected) {
    await upsertJob(normalized);
    return { ok: true, backend: "postgres", job: normalized };
  }

  const jobs = await readFileJobs();
  jobs[normalized.jobId] = normalized;
  await writeFileJobs(jobs);
  return { ok: true, backend: "file", job: normalized };
}

async function cancelScheduledJob(jobId) {
  const normalizedId = String(jobId || "").trim();
  if (!normalizedId) {
    return false;
  }

  const pg = getPostgresStatus();
  if (pg.enabled && pg.connected) {
    await cancelJob(normalizedId).catch(() => null);
    return true;
  }

  const jobs = await readFileJobs();
  if (!jobs[normalizedId]) {
    return false;
  }
  delete jobs[normalizedId];
  await writeFileJobs(jobs);
  return true;
}

async function readDueJobsFromFile(nowMs, limit) {
  const jobs = await readFileJobs();
  const due = Object.values(jobs)
    .map((entry) => normalizeJob(entry))
    .filter(Boolean)
    .filter((job) => job.status === "queued" && Number(job.runAt) <= nowMs)
    .sort((a, b) => a.runAt - b.runAt)
    .slice(0, Math.max(1, Number(limit) || 25));
  return due;
}

async function markRunningFileJob(jobId) {
  const jobs = await readFileJobs();
  const entry = normalizeJob(jobs[jobId]);
  if (!entry) {
    return;
  }
  entry.status = "running";
  jobs[jobId] = entry;
  await writeFileJobs(jobs);
}

async function markDoneFileJob(jobId) {
  const jobs = await readFileJobs();
  if (!jobs[jobId]) {
    return;
  }
  delete jobs[jobId];
  await writeFileJobs(jobs);
}

async function markFailedFileJob(jobId, errorMessage) {
  const jobs = await readFileJobs();
  const entry = normalizeJob(jobs[jobId]);
  if (!entry) {
    return;
  }
  entry.status = "queued";
  entry.runAt = Date.now() + 30_000;
  entry.lastError = String(errorMessage || "unknown_error").slice(0, 1000);
  jobs[jobId] = entry;
  await writeFileJobs(jobs);
}

async function executeJob(job) {
  const handler = handlers.get(job.type);
  if (!handler) {
    await cancelScheduledJob(job.jobId).catch(() => null);
    return { ok: false, reason: "missing_handler" };
  }

  if (runningJobIds.has(job.jobId)) {
    return { ok: false, reason: "already_running" };
  }

  runningJobIds.add(job.jobId);
  try {
    const pg = getPostgresStatus();
    if (pg.enabled && pg.connected) {
      await markJobRunning(job.jobId).catch(() => null);
    } else {
      await markRunningFileJob(job.jobId).catch(() => null);
    }

    await handler({
      client: schedulerClient,
      payload: job.payload,
      job
    });

    if (pg.enabled && pg.connected) {
      await markJobDone(job.jobId).catch(() => null);
    } else {
      await markDoneFileJob(job.jobId).catch(() => null);
    }
    processedCount += 1;
    return { ok: true };
  } catch (error) {
    failedCount += 1;
    const pg = getPostgresStatus();
    if (pg.enabled && pg.connected) {
      await markJobFailed(job.jobId, error?.message || String(error)).catch(() => null);
    } else {
      await markFailedFileJob(job.jobId, error?.message || String(error)).catch(() => null);
    }
    console.error(`Scheduled job failed [${job.type}:${job.jobId}]`, error);
    if (schedulerClient) {
      await sendAlert(schedulerClient, {
        level: "error",
        title: "Scheduled Job Failed",
        message: `Job execution failed for \`${job.type}\`.`,
        fields: [
          { name: "Job ID", value: job.jobId },
          { name: "Type", value: job.type },
          { name: "Run At", value: `<t:${Math.floor(Number(job.runAt || Date.now()) / 1000)}:F>` }
        ],
        error,
        dedupeKey: `job_failed:${job.jobId}`,
        ttlMs: 60_000
      }).catch(() => null);
    }
    return { ok: false, reason: "job_error" };
  } finally {
    runningJobIds.delete(job.jobId);
  }
}

async function pollJobs() {
  const now = Date.now();
  lastPollAt = now;
  const pg = getPostgresStatus();
  const dueJobs = pg.enabled && pg.connected
    ? await fetchDueQueuedJobs(now, 40).catch(() => [])
    : await readDueJobsFromFile(now, 40).catch(() => []);

  for (const job of dueJobs) {
    await executeJob(job);
  }
}

function startJobScheduler(client) {
  schedulerClient = client;
  if (pollTimer) {
    return;
  }
  pollTimer = setInterval(() => {
    pollJobs().catch((error) => {
      console.error("Scheduled job polling failed:", error);
      if (schedulerClient) {
        sendAlert(schedulerClient, {
          level: "error",
          title: "Job Scheduler Poll Failed",
          message: "Polling scheduled jobs failed.",
          error,
          dedupeKey: "job_scheduler_poll_failed",
          ttlMs: 60_000
        }).catch(() => null);
      }
    });
  }, 4000);
}

function stopJobScheduler() {
  if (!pollTimer) {
    return;
  }
  clearInterval(pollTimer);
  pollTimer = null;
}

async function getSchedulerStats() {
  const pg = getPostgresStatus();
  const base = {
    backend: getPersistenceBackend(),
    runningNow: runningJobIds.size,
    processed: processedCount,
    failed: failedCount,
    lastPollAt
  };

  if (pg.enabled && pg.connected) {
    return {
      ...base,
      queue: await getJobStats().catch(() => ({ queued: 0, running: 0, other: 0 }))
    };
  }

  const jobs = await readFileJobs().catch(() => ({}));
  const values = Object.values(jobs);
  const queue = {
    queued: values.filter((job) => String(job?.status || "queued") === "queued").length,
    running: values.filter((job) => String(job?.status || "") === "running").length,
    other: values.filter(
      (job) => !["queued", "running"].includes(String(job?.status || "queued"))
    ).length
  };
  return {
    ...base,
    queue
  };
}

module.exports = {
  registerJobHandler,
  scheduleJob,
  cancelScheduledJob,
  startJobScheduler,
  stopJobScheduler,
  getSchedulerStats
};

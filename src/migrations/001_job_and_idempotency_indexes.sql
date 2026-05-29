CREATE INDEX IF NOT EXISTS idx_bot_jobs_status_run_at
  ON bot_jobs (status, run_at);

CREATE INDEX IF NOT EXISTS idx_bot_jobs_type_run_at
  ON bot_jobs (type, run_at);

CREATE INDEX IF NOT EXISTS idx_bot_idempotency_expires_at
  ON bot_idempotency_keys (expires_at);

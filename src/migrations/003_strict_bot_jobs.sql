DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bot_jobs_run_at_positive_chk'
  ) THEN
    ALTER TABLE bot_jobs
      ADD CONSTRAINT bot_jobs_run_at_positive_chk
      CHECK (run_at > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bot_jobs_attempts_nonnegative_chk'
  ) THEN
    ALTER TABLE bot_jobs
      ADD CONSTRAINT bot_jobs_attempts_nonnegative_chk
      CHECK (attempts >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bot_jobs_payload_object_chk'
  ) THEN
    ALTER TABLE bot_jobs
      ADD CONSTRAINT bot_jobs_payload_object_chk
      CHECK (jsonb_typeof(payload) = 'object');
  END IF;
END $$;

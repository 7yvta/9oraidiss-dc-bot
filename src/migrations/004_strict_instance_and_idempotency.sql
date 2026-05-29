DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bot_instances_heartbeat_positive_chk'
  ) THEN
    ALTER TABLE bot_instances
      ADD CONSTRAINT bot_instances_heartbeat_positive_chk
      CHECK (heartbeat_at > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bot_instances_started_positive_chk'
  ) THEN
    ALTER TABLE bot_instances
      ADD CONSTRAINT bot_instances_started_positive_chk
      CHECK (started_at > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bot_instances_metadata_object_chk'
  ) THEN
    ALTER TABLE bot_instances
      ADD CONSTRAINT bot_instances_metadata_object_chk
      CHECK (jsonb_typeof(metadata) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bot_idempotency_expires_positive_chk'
  ) THEN
    ALTER TABLE bot_idempotency_keys
      ADD CONSTRAINT bot_idempotency_expires_positive_chk
      CHECK (expires_at > 0);
  END IF;
END $$;

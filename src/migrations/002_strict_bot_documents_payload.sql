DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bot_documents_payload_object_chk'
  ) THEN
    ALTER TABLE bot_documents
      ADD CONSTRAINT bot_documents_payload_object_chk
      CHECK (jsonb_typeof(payload) = 'object');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "question_attachments" (
  "id" TEXT NOT NULL,
  "question_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "name" TEXT,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "purpose" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "question_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "question_attachments_question_id_idx" ON "question_attachments"("question_id");
CREATE INDEX IF NOT EXISTS "question_attachments_kind_idx" ON "question_attachments"("kind");
DO $$ BEGIN
  ALTER TABLE "question_attachments" ADD CONSTRAINT "question_attachments_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "questions"
  ADD COLUMN IF NOT EXISTS "document_url" TEXT,
  ADD COLUMN IF NOT EXISTS "document_name" TEXT,
  ADD COLUMN IF NOT EXISTS "document_mime_type" TEXT;

CREATE TABLE IF NOT EXISTS "student_technical_memories" (
  "id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "source_question_id" TEXT,
  "category" TEXT NOT NULL DEFAULT 'DOCUMENT',
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "source_document_name" TEXT,
  "source_document_url" TEXT,
  "status" TEXT NOT NULL DEFAULT 'APPROVED',
  "valid_until" TIMESTAMP(3),
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_technical_memories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_technical_memories_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "student_technical_memories_student_id_idx" ON "student_technical_memories"("student_id");
CREATE INDEX IF NOT EXISTS "student_technical_memories_status_idx" ON "student_technical_memories"("status");
CREATE INDEX IF NOT EXISTS "student_technical_memories_source_question_id_idx" ON "student_technical_memories"("source_question_id");

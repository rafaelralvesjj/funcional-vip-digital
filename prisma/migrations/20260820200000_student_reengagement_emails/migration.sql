CREATE TABLE IF NOT EXISTS "student_reengagement_emails" (
  "id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_reengagement_emails_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "student_reengagement_emails_student_id_category_idx" ON "student_reengagement_emails"("student_id", "category");

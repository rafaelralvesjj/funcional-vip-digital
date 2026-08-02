ALTER TABLE "question_attachments"
ADD COLUMN IF NOT EXISTS "video_review_summary" TEXT,
ADD COLUMN IF NOT EXISTS "video_reviewed_by_id" TEXT,
ADD COLUMN IF NOT EXISTS "video_reviewed_at" TIMESTAMP(3);

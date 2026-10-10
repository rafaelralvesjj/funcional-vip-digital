-- Modo de treino estruturado (NORMAL | COMBINADO) — 100% aditiva, nenhum
-- DROP, nenhuma alteração destrutiva. Backfill explícito: todo aluno
-- existente recebe 'NORMAL' (nunca inferido de texto), igual ao default de
-- quem se cadastrar depois desta migration.

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "workout_method_mode" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "workout_method_mode_changed_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "student_workout_method_changes" (
  "id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "previous_mode" TEXT NOT NULL,
  "new_mode" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'STUDENT_SELF_SERVICE',
  "actor_user_id" TEXT,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_workout_method_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "student_workout_method_changes_student_id_idx" ON "student_workout_method_changes"("student_id");
CREATE INDEX IF NOT EXISTS "student_workout_method_changes_student_id_changed_at_idx" ON "student_workout_method_changes"("student_id", "changed_at");

DO $$ BEGIN
  ALTER TABLE "student_workout_method_changes" ADD CONSTRAINT "student_workout_method_changes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "student_workout_method_changes" ADD CONSTRAINT "student_workout_method_changes_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill explícito (não depende só do DEFAULT da coluna): qualquer aluno
-- que já exista no banco antes desta migration fica NORMAL, nunca inferido.
UPDATE "students" SET "workout_method_mode" = 'NORMAL' WHERE "workout_method_mode" IS NULL;

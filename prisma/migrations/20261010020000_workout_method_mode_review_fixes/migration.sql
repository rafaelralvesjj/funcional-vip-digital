-- Fase 5, correções da revisão externa do PR #13. Migration 100% aditiva:
-- ADD COLUMN IF NOT EXISTS / CHECK constraint guardada por DO $$. Nenhum
-- DROP, nenhuma alteração destrutiva em coluna/tabela existente.

-- Item 2: instante REAL da conclusão do treino (nunca a data planejada).
-- Preenchido só pelo servidor em POST /api/workout/mark-complete, na
-- primeira transição para CONCLUIDO/CONCLUIDO_PARCIALMENTE; nunca
-- sobrescrito em reenvio/idempotência. Histórico legado sem evidência
-- confiável fica null por design (ver scripts/backfill-workout-completed-at.ts
-- — recupera pelo evento FIRST_WORKOUT_COMPLETED quando existir, nunca
-- inventa a partir de `date`).
ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);

-- Item 3: NORMAL/COMBINADO nunca pode virar texto arbitrário no banco,
-- mesmo que algum código futuro esqueça de passar por
-- normalizeWorkoutMethodMode/resolveWorkoutMethodModeChange antes de
-- gravar. Colunas continuam TEXT no Prisma (evita conversão de tipo); a
-- validação fica garantida no Postgres.
DO $$ BEGIN
  ALTER TABLE "students" ADD CONSTRAINT "students_workout_method_mode_check"
    CHECK ("workout_method_mode" IN ('NORMAL', 'COMBINADO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "student_workout_method_changes" ADD CONSTRAINT "student_workout_method_changes_previous_mode_check"
    CHECK ("previous_mode" IN ('NORMAL', 'COMBINADO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "student_workout_method_changes" ADD CONSTRAINT "student_workout_method_changes_new_mode_check"
    CHECK ("new_mode" IN ('NORMAL', 'COMBINADO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

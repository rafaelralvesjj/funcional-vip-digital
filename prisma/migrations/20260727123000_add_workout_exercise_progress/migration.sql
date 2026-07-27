CREATE TABLE "workout_exercise_progress" (
  "id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "workout_plan_id" TEXT NOT NULL,
  "exercise_id" TEXT NOT NULL,
  "workout_date" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "effort" TEXT,
  "skip_reason" TEXT,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workout_exercise_progress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workout_exercise_progress_student_id_exercise_id_workout_date_key" ON "workout_exercise_progress"("student_id", "exercise_id", "workout_date");
CREATE INDEX "workout_exercise_progress_student_id_workout_plan_id_workout_date_idx" ON "workout_exercise_progress"("student_id", "workout_plan_id", "workout_date");
ALTER TABLE "workout_exercise_progress" ADD CONSTRAINT "workout_exercise_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workout_exercise_progress" ADD CONSTRAINT "workout_exercise_progress_workout_plan_id_fkey" FOREIGN KEY ("workout_plan_id") REFERENCES "workout_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workout_exercise_progress" ADD CONSTRAINT "workout_exercise_progress_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

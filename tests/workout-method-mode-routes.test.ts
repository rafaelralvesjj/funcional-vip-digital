import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Fase 5 (modo de treino estruturado NORMAL/COMBINADO): o comportamento real
// de banco não é testável sem banco neste ambiente; aqui fixamos, por
// leitura do código-fonte, invariantes que a revisão exige e que um teste
// de função pura não cobre sozinho.
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, 'utf8');
}

test('GET /api/workout-plan nunca normaliza/restaura formato em runtime (é read-only quanto a formato)', () => {
  const source = readSource('app/api/workout-plan/route.ts');

  assert.doesNotMatch(source, /ensureOpenWorkoutPlansMatchStudentFormat/);
  assert.doesNotMatch(source, /from ["']@\/lib\/workout-format-consistency["']/);
  assert.doesNotMatch(source, /canNormalizeOpenWorkoutFormat/);
});

test('lib/workout-generation-strategy.ts não infere mais o modo por texto (regex de método removida)', () => {
  const source = readSource('lib/workout-generation-strategy.ts');

  assert.match(source, /normalizeWorkoutMethodMode\(/);
  assert.match(source, /from ["']\.\/workout-method-mode["']/);
  assert.doesNotMatch(source, /currentMethodContext/);
  assert.doesNotMatch(source, /explicitCombinedRequest/);
  assert.doesNotMatch(source, /normalWorkoutRequested/);
});

test('POST /api/aluno/workout-method-mode usa resolveWorkoutMethodModeChange e nunca toca WorkoutPlan/Workout/Exercise', () => {
  const source = readSource('app/api/aluno/workout-method-mode/route.ts');

  assert.match(source, /resolveWorkoutMethodModeChange\(/);
  assert.match(source, /prisma\.studentWorkoutMethodChange\.create/);
  assert.match(source, /prisma\.student\.update/);
  assert.doesNotMatch(source, /prisma\.workoutPlan\./);
  assert.doesNotMatch(source, /prisma\.workout\./);
  assert.doesNotMatch(source, /prisma\.exercise\./);
});

test('POST /api/aluno/workout-method-mode recalcula elegibilidade no servidor (nunca confia em isEligible vindo do cliente)', () => {
  const source = readSource('app/api/aluno/workout-method-mode/route.ts');

  assert.match(source, /isEligibleForCombinedWorkoutInvite\(/);
  assert.doesNotMatch(source, /body\?\.isEligible/);
  assert.doesNotMatch(source, /body\.isEligible/);
});

test('resumo-aluno sourcea workoutMethodMode do summaryData.student (resposta por requisição), nunca do selectedStudent (estado de UI do dropdown)', () => {
  const source = readSource('app/dashboard/resumo-aluno/page.tsx');

  assert.match(source, /workoutMethodMode:\s*normalizeWorkoutMethodMode\(summaryData\.student\?\.workoutMethodMode\)/);
  assert.doesNotMatch(source, /workoutMethodMode:\s*selectedStudent/);
});

test('migração administrativa (Denize/Rafael) usa resolveWorkoutMethodModeChange e grava source MIGRATION_SCRIPT', () => {
  const source = readSource('scripts/set-initial-workout-method-mode.ts');

  assert.match(source, /aecf26ec-fbf5-4e36-acc2-701bb6bae4e9/);
  assert.match(source, /a27b6cc6-0fb3-472a-96ff-032544622075/);
  assert.match(source, /resolveWorkoutMethodModeChange\(/);
  assert.match(source, /source:\s*["']MIGRATION_SCRIPT["']/);
});

// REVISÃO (PR #13, item 1): nunca usar Student.userId (professor
// responsável) para localizar o aluno-alvo da rota self-service, e exigir
// role STUDENT/ALUNO explicitamente (403 para qualquer outro papel).
test('POST /api/aluno/workout-method-mode exige role STUDENT e nunca usa Student.userId para localizar o aluno', () => {
  const source = readSource('app/api/aluno/workout-method-mode/route.ts');

  assert.match(source, /isStudentSelfServiceRole\(/);
  assert.match(source, /from ["']@\/lib\/workout-method-mode-access["']/);
  assert.match(source, /status:\s*403/);
  assert.match(source, /resolveStudentSelfService\(/);
  assert.doesNotMatch(source, /\{\s*userId\s*\}/);
  assert.doesNotMatch(source, /student\.userId/);
});

// REVISÃO (rodada anterior do PR #13): a resolução não pode ser um único OR
// com userAuthId + e-mail — tem que ser em duas etapas, e o fallback por
// e-mail só pode considerar aluno ainda sem login vinculado (Student.email
// não é unique, então um OR misturado arriscaria casar o aluno errado).
test('a resolução por e-mail (etapa 2) só considera aluno com userAuthId null, nunca um OR único com userAuthId', () => {
  const source = readSource('app/api/aluno/workout-method-mode/route.ts');

  assert.match(source, /findLegacyCandidatesByEmail/);
  assert.match(source, /userAuthId:\s*null/);
  assert.doesNotMatch(source, /OR:\s*orWhere/);
});

// REVISÃO (PR #13, item 2): a janela de 30 dias usa o instante REAL de
// conclusão (Workout.completedAt), nunca a data planejada (Workout.date).
test('POST /api/aluno/workout-method-mode e lib/student-dashboard-summary.ts usam Workout.completedAt, nunca Workout.date, para a elegibilidade do convite', () => {
  const routeSource = readSource('app/api/aluno/workout-method-mode/route.ts');
  const summarySource = readSource('lib/student-dashboard-summary.ts');

  for (const source of [routeSource, summarySource]) {
    assert.match(source, /completedAt:\s*\{\s*not:\s*null\s*\}/);
    assert.match(source, /orderBy:\s*\{\s*completedAt:\s*["']asc["']/);
    assert.doesNotMatch(source, /orderBy:\s*\{\s*date:\s*["']asc["']/);
  }
});

test('POST /api/workout/mark-complete usa resolveWorkoutCompletedAt (nunca grava completedAt incondicionalmente)', () => {
  const source = readSource('app/api/workout/mark-complete/route.ts');

  assert.match(source, /from ["']@\/lib\/workout-completion["']/);
  assert.match(source, /resolveWorkoutCompletedAt\(/);
  assert.match(source, /completedAt:\s*completedAtToPersist/);
});

// REVISÃO (PR #13, item 3): NORMAL/COMBINADO nunca pode virar texto
// arbitrário no banco — garantido por CHECK constraint no Postgres, não só
// pelo código de aplicação.
test('migration de modo de treino adiciona CHECK constraints para NORMAL/COMBINADO em students e student_workout_method_changes', () => {
  const migrationSource = readSource(
    'prisma/migrations/20261010020000_workout_method_mode_review_fixes/migration.sql'
  );

  assert.match(migrationSource, /students_workout_method_mode_check/);
  assert.match(migrationSource, /CHECK\s*\(\s*"workout_method_mode"\s+IN\s*\(\s*'NORMAL',\s*'COMBINADO'\s*\)\s*\)/);

  assert.match(migrationSource, /student_workout_method_changes_previous_mode_check/);
  assert.match(migrationSource, /CHECK\s*\(\s*"previous_mode"\s+IN\s*\(\s*'NORMAL',\s*'COMBINADO'\s*\)\s*\)/);

  assert.match(migrationSource, /student_workout_method_changes_new_mode_check/);
  assert.match(migrationSource, /CHECK\s*\(\s*"new_mode"\s+IN\s*\(\s*'NORMAL',\s*'COMBINADO'\s*\)\s*\)/);

  // Aditiva: nenhum DROP, e idempotente via DO $$ ... EXCEPTION WHEN duplicate_object.
  assert.doesNotMatch(migrationSource, /DROP /);
  assert.match(migrationSource, /EXCEPTION WHEN duplicate_object THEN NULL/);
});

test('migration de modo de treino adiciona workouts.completed_at de forma aditiva', () => {
  const migrationSource = readSource(
    'prisma/migrations/20261010020000_workout_method_mode_review_fixes/migration.sql'
  );

  assert.match(migrationSource, /ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "completed_at"/);
});

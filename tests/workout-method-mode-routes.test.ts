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

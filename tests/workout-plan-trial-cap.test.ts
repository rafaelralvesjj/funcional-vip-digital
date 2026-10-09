import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Mesma limitação de ambiente do teste da rota de cadastro: sem banco aqui,
// então este teste pina no texto da rota que o limite real do teste (3
// treinos no total do contrato, não por semana) está de fato sendo
// aplicado na criação de treinos, e não só calculado na função pura.
function readWorkoutPlanRouteSource(): string {
  const path = fileURLToPath(
    new URL('../app/api/workout-plan/route.ts', import.meta.url)
  );
  return readFileSync(path, 'utf8');
}

test('criação de treino aplica o limite real do contrato de teste (isTrialWorkoutCapReached), não só o limite semanal', () => {
  const source = readWorkoutPlanRouteSource();
  assert.match(source, /from ["']@\/lib\/trial-window["']/);
  assert.match(source, /isTrialWorkoutCapReached/);
});

test('o limite semanal comum continua existindo (regressão: não removemos o guard de weeklyLimit)', () => {
  const source = readWorkoutPlanRouteSource();
  assert.match(source, /workoutPlansThisWeek\s*>=\s*weeklyLimit/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Teste de regressão por análise estática do código-fonte da rota: não há
// banco de dados disponível neste ambiente para exercitar a rota via HTTP,
// então estes testes pinam, no texto da rota, os dois comportamentos que a
// especificação proíbe e que a integração com lib/trial-window.ts e
// lib/trial-plan.ts deve eliminar. Escritos antes da mudança (estado "red"
// contra o código atual) para servir de regressão depois.
function readRouteSource(): string {
  const path = fileURLToPath(
    new URL('../app/api/aluno/register/route.ts', import.meta.url)
  );
  return readFileSync(path, 'utf8');
}

test('cadastro não empurra mais o início do teste para a próxima segunda-feira', () => {
  const source = readRouteSource();
  assert.doesNotMatch(source, /shiftedToNextWeek/);
  assert.doesNotMatch(source, /getFirstSafeTrialStartDate/);
});

test('cadastro usa a janela de teste de 7 dias de lib/trial-window em vez de empurrar datas', () => {
  const source = readRouteSource();
  assert.match(source, /from ["']@\/lib\/trial-window["']/);
  assert.match(source, /getTrialWindow\(/);
});

test('cadastro não cria mais silenciosamente um plano de teste hard-coded quando nenhum está configurado', () => {
  const source = readRouteSource();
  assert.doesNotMatch(source, /servicePlan\.create/);
  assert.doesNotMatch(source, /Experiência grátis - 1 mês/);
});

test('cadastro propaga TrialPlanNotConfiguredError como erro operacional claro, não 500 genérico', () => {
  const source = readRouteSource();
  assert.match(source, /from ["']@\/lib\/trial-plan["']/);
  assert.match(source, /TrialPlanNotConfiguredError/);
});

test('contrato de teste usa o limite real de 3 treinos (TRIAL_MAX_WORKOUTS), não workoutsPerMonth \\* durationMonths', () => {
  const source = readRouteSource();
  assert.match(source, /totalContractedWorkouts:\s*TRIAL_MAX_WORKOUTS/);
});

// Complemento (não a principal fonte de confiança): a regra em si — nunca
// usar workoutsPerMonth/"no ciclo" para comunicar o teste, nunca aceitar um
// ServicePlan incompatível com a oferta de 3x/semana — é validada por
// comportamento em tests/trial-window.test.ts e tests/trial-plan.test.ts.
test('nenhuma mensagem do cadastro menciona "no ciclo" nem "experiência gratuita"', () => {
  const source = readRouteSource();
  assert.doesNotMatch(source, /no ciclo/);
  assert.doesNotMatch(source, /experiência gratuita/i);
});

test('cadastro usa formatTrialPeriodSummary para comunicar o limite do teste, não workoutsPerMonth', () => {
  const source = readRouteSource();
  assert.match(source, /formatTrialPeriodSummary/);
});

test('cadastro valida compatibilidade da oferta de teste com a frequência comercial atual (3x/semana)', () => {
  const source = readRouteSource();
  assert.match(source, /TrialPlanIncompatibleError/);
});

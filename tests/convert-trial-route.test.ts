import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Mesma limitação de ambiente dos demais testes de rota: sem banco aqui,
// então pinamos por leitura do código-fonte os dois pontos corrigidos após
// a revisão: (1) a rota não pode mais rejeitar um plano só porque
// allowTrial=true — no modelo de oferta única, o mesmo ServicePlan serve
// teste e contratação; (2) a rota passa a aceitar billingOptionId para
// distinguir a cobrança pela ServicePlanBillingOption, não pela flag.
function readRouteSource(): string {
  const path = fileURLToPath(
    new URL('../app/api/student-contracts/convert-trial/route.ts', import.meta.url)
  );
  return readFileSync(path, 'utf8');
}

function readFinanceiroPageSource(): string {
  const path = fileURLToPath(
    new URL('../app/dashboard/financeiro/page.tsx', import.meta.url)
  );
  return readFileSync(path, 'utf8');
}

test('convert-trial não rejeita mais planos com allowTrial=true', () => {
  const source = readRouteSource();
  assert.doesNotMatch(source, /if\s*\(\s*paidPlan\.allowTrial\s*\)/);
});

test('convert-trial distingue a cobrança pela ServicePlanBillingOption (billingOptionId), não pela flag allowTrial', () => {
  const source = readRouteSource();
  assert.match(source, /billingOptionId/);
  assert.match(source, /servicePlanBillingOption\.findUnique/);
});

test('convert-trial continua exigindo que o contrato de origem seja TRIAL ativo (a distinção real de tipo)', () => {
  const source = readRouteSource();
  assert.match(source, /trial\.type\s*!==\s*"TRIAL"/);
  assert.match(source, /type:\s*"PAID"/);
});

test('financeiro: o seletor de plano para conversão não exclui mais planos com allowTrial=true', () => {
  const source = readFinanceiroPageSource();
  assert.doesNotMatch(source, /filter\(\(plan\)\s*=>\s*!plan\.allowTrial/);
});

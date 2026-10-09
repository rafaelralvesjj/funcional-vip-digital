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

test('financeiro: usa a regra explícita de elegibilidade (lib/service-plan-eligibility), não um filtro ad-hoc', () => {
  const source = readFinanceiroPageSource();
  assert.match(source, /from ["']@\/lib\/service-plan-eligibility["']/);
  assert.match(source, /filterServicePlansEligibleForPaidContracting\(/);
});

// Preservação dos 7 dias de teste quando o pagamento é antecipado (ver
// lib/trial-window.ts, resolvePaidContractStart) — comportamento real é
// testado em tests/trial-window.test.ts; aqui só confirmamos que a rota
// de fato usa a função central em vez de aceitar startDate/finalizar o
// TRIAL incondicionalmente quando o pagamento vem confirmado.
test('convert-trial usa resolvePaidContractStart para decidir o início do contrato pago, não aceita startDate do corpo quando o pagamento está confirmado', () => {
  const source = readRouteSource();
  assert.match(source, /from ["']@\/lib\/trial-window["']/);
  assert.match(source, /resolvePaidContractStart\(/);
});

test('convert-trial não finaliza o TRIAL automaticamente quando o pagamento é confirmado durante o teste (paidDuringTrial)', () => {
  const source = readRouteSource();
  assert.match(source, /shouldActivateNow\s*=\s*isPaymentConfirmed\s*&&\s*!paidDuringTrial/);
});

test('convert-trial usa um commercialStatus distinto para contrato pago agendado (não confunde com CONTRATO_ATIVO)', () => {
  const source = readRouteSource();
  assert.match(source, /CONTRATO_PAGO_AGENDADO/);
});

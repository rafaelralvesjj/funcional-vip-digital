import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveContractPaymentTransition } from '../lib/contract-payment-transition.ts';

// Mesmo exemplo da especificação usado em tests/trial-window.test.ts: teste
// 10/10 00:00 -03:00 até 16/10 23:59:59.999 -03:00.
const trialEndDate = new Date('2026-10-16T23:59:59.999-03:00');
const requestedStartDate = new Date('2026-11-01T12:00:00-03:00');

test('pagamento ainda não confirmado (EM_ABERTO): contrato fica AWAITING_PAYMENT, sem ativar nada', () => {
  const result = resolveContractPaymentTransition({
    paymentStatus: 'EM_ABERTO',
    trialEndDate,
    requestedStartDate,
  });

  assert.equal(result.isPaymentConfirmed, false);
  assert.equal(result.paidDuringTrial, false);
  assert.equal(result.shouldActivateNow, false);
  assert.equal(result.status, 'AWAITING_PAYMENT');
  assert.equal(result.commercialStatus, 'AGUARDANDO_PAGAMENTO');
  assert.equal(result.startDate.getTime(), requestedStartDate.getTime());
  assert.equal(result.acceptedAt, null);
  assert.equal(result.activatedAt, null);
});

test('pagamento PARCIAL: tratado como não confirmado, mesma transição que EM_ABERTO', () => {
  const result = resolveContractPaymentTransition({
    paymentStatus: 'PARCIAL',
    trialEndDate,
    requestedStartDate,
  });

  assert.equal(result.isPaymentConfirmed, false);
  assert.equal(result.status, 'AWAITING_PAYMENT');
});

test('pagamento confirmado sem teste de origem (contrato pago direto): ativa imediatamente na confirmação', () => {
  const paymentConfirmedAt = new Date('2026-10-12T10:00:00-03:00');
  const result = resolveContractPaymentTransition({
    paymentStatus: 'PAGO',
    trialEndDate: null,
    requestedStartDate,
    paymentConfirmedAt,
  });

  assert.equal(result.isPaymentConfirmed, true);
  assert.equal(result.paidDuringTrial, false);
  assert.equal(result.shouldActivateNow, true);
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.commercialStatus, 'CONTRATO_ATIVO');
  assert.equal(result.startDate.getTime(), paymentConfirmedAt.getTime());
  assert.equal(result.acceptedAt?.getTime(), paymentConfirmedAt.getTime());
  assert.equal(result.activatedAt?.getTime(), paymentConfirmedAt.getTime());
});

test('pagamento confirmado durante o teste: contrato agendado (CONTRATO_PAGO_AGENDADO), sem ativar agora, preservando os 7 dias', () => {
  const paymentConfirmedAt = new Date('2026-10-14T09:00:00-03:00');
  const result = resolveContractPaymentTransition({
    paymentStatus: 'PAGO',
    trialEndDate,
    requestedStartDate,
    paymentConfirmedAt,
  });

  assert.equal(result.isPaymentConfirmed, true);
  assert.equal(result.paidDuringTrial, true);
  assert.equal(result.shouldActivateNow, false);
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.commercialStatus, 'CONTRATO_PAGO_AGENDADO');
  assert.equal(result.startDate.toISOString(), '2026-10-17T03:00:00.000Z');
  assert.equal(result.acceptedAt?.getTime(), paymentConfirmedAt.getTime());
  assert.equal(result.activatedAt, null);
});

test('pagamento confirmado depois do fim do teste: ativa imediatamente, não agenda', () => {
  const paymentConfirmedAt = new Date('2026-10-20T09:00:00-03:00');
  const result = resolveContractPaymentTransition({
    paymentStatus: 'PAGO',
    trialEndDate,
    requestedStartDate,
    paymentConfirmedAt,
  });

  assert.equal(result.paidDuringTrial, false);
  assert.equal(result.shouldActivateNow, true);
  assert.equal(result.commercialStatus, 'CONTRATO_ATIVO');
  assert.equal(result.startDate.getTime(), paymentConfirmedAt.getTime());
  assert.equal(result.activatedAt?.getTime(), paymentConfirmedAt.getTime());
});

test('paymentConfirmedAt default é "agora" quando omitido', () => {
  const before = Date.now();
  const result = resolveContractPaymentTransition({
    paymentStatus: 'PAGO',
    trialEndDate: null,
    requestedStartDate,
  });
  const after = Date.now();

  assert.ok(result.startDate.getTime() >= before && result.startDate.getTime() <= after);
});

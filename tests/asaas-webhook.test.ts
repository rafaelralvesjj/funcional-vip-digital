import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyAsaasWebhookToken,
  normalizeAsaasWebhookEvent,
  AsaasWebhookConfigError,
} from '../lib/asaas-webhook.ts';

test('verifyAsaasWebhookToken lança AsaasWebhookConfigError sem ASAAS_WEBHOOK_TOKEN configurado', () => {
  const original = process.env.ASAAS_WEBHOOK_TOKEN;
  delete process.env.ASAAS_WEBHOOK_TOKEN;

  try {
    assert.throws(() => verifyAsaasWebhookToken('qualquer-coisa'), AsaasWebhookConfigError);
  } finally {
    if (original !== undefined) process.env.ASAAS_WEBHOOK_TOKEN = original;
  }
});

test('verifyAsaasWebhookToken aceita só o token exatamente igual ao configurado', () => {
  const original = process.env.ASAAS_WEBHOOK_TOKEN;
  process.env.ASAAS_WEBHOOK_TOKEN = 'token-correto';

  try {
    assert.equal(verifyAsaasWebhookToken('token-correto'), true);
    assert.equal(verifyAsaasWebhookToken('token-errado'), false);
    assert.equal(verifyAsaasWebhookToken(null), false);
    assert.equal(verifyAsaasWebhookToken(undefined), false);
    assert.equal(verifyAsaasWebhookToken(''), false);
  } finally {
    if (original !== undefined) process.env.ASAAS_WEBHOOK_TOKEN = original;
    else delete process.env.ASAAS_WEBHOOK_TOKEN;
  }
});

test('normalizeAsaasWebhookEvent reconhece PAYMENT_CONFIRMED e PAYMENT_RECEIVED como confirmação de pagamento', () => {
  const confirmed = normalizeAsaasWebhookEvent({
    event: 'PAYMENT_CONFIRMED',
    payment: { id: 'pay_1', status: 'CONFIRMED', externalReference: 'chk_abc' },
  });
  assert.equal(confirmed.isPaymentConfirmation, true);
  assert.equal(confirmed.isOverdue, false);
  assert.equal(confirmed.providerPaymentId, 'pay_1');
  assert.equal(confirmed.externalReference, 'chk_abc');
  assert.equal(confirmed.eventId, 'PAYMENT_CONFIRMED:pay_1');

  const received = normalizeAsaasWebhookEvent({
    event: 'PAYMENT_RECEIVED',
    payment: { id: 'pay_2', status: 'RECEIVED' },
  });
  assert.equal(received.isPaymentConfirmation, true);
});

test('normalizeAsaasWebhookEvent não trata outros eventos como confirmação de pagamento', () => {
  const created = normalizeAsaasWebhookEvent({
    event: 'PAYMENT_CREATED',
    payment: { id: 'pay_3', status: 'PENDING' },
  });
  assert.equal(created.isPaymentConfirmation, false);
  assert.equal(created.isOverdue, false);

  const deleted = normalizeAsaasWebhookEvent({
    event: 'PAYMENT_DELETED',
    payment: { id: 'pay_4', status: 'DELETED' },
  });
  assert.equal(deleted.isPaymentConfirmation, false);
});

test('normalizeAsaasWebhookEvent reconhece PAYMENT_OVERDUE separadamente (nunca ativa, só sinaliza atraso)', () => {
  const overdue = normalizeAsaasWebhookEvent({
    event: 'PAYMENT_OVERDUE',
    payment: { id: 'pay_5', status: 'OVERDUE' },
  });
  assert.equal(overdue.isOverdue, true);
  assert.equal(overdue.isPaymentConfirmation, false);
});

test('normalizeAsaasWebhookEvent gera eventId diferente para cada combinação (eventType, paymentId)', () => {
  const a = normalizeAsaasWebhookEvent({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', status: 'CONFIRMED' } });
  const b = normalizeAsaasWebhookEvent({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', status: 'RECEIVED' } });
  assert.notEqual(a.eventId, b.eventId);
});

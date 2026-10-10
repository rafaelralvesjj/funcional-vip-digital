import test from 'node:test';
import assert from 'node:assert/strict';
import { getAsaasClientConfig } from '../lib/asaas-client.ts';
import { resolveCheckoutCharge } from '../lib/checkout-charge.ts';

/**
 * Fake "backend" Asaas com estado persistente entre chamadas (ao contrário
 * do fake simples de tests/asaas-client.test.ts) — para simular uma
 * assinatura/cobrança que já existe de uma tentativa anterior e precisa ser
 * encontrada por busca em externalReference, exatamente como a Asaas real
 * faria.
 */
function createFakeAsaasBackend() {
  const subscriptions = new Map<string, any>();
  const paymentsBySubscription = new Map<string, any[]>();
  const payments = new Map<string, any>();
  const calls: { method: string; path: string; body: any }[] = [];
  let nextSubscriptionPaymentsShouldFail = false;

  function respond(status: number, body: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    } as Response;
  }

  const fetchImpl = async (url: string, init: any) => {
    const path = url.replace('https://api-sandbox.asaas.com/v3', '');
    calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : null });

    if (init.method === 'POST' && path === '/subscriptions') {
      const body = JSON.parse(init.body);
      const id = `sub_${subscriptions.size + 1}`;
      const subscription = { id, status: 'ACTIVE', externalReference: body.externalReference };
      subscriptions.set(id, subscription);
      paymentsBySubscription.set(id, []);
      return respond(200, subscription);
    }

    if (init.method === 'GET' && path.startsWith('/subscriptions?externalReference=')) {
      const externalReference = decodeURIComponent(path.split('=')[1]);
      const found = [...subscriptions.values()].find((s) => s.externalReference === externalReference);
      return respond(200, { data: found ? [found] : [] });
    }

    if (init.method === 'GET' && /\/subscriptions\/[^/]+\/payments$/.test(path)) {
      if (nextSubscriptionPaymentsShouldFail) {
        nextSubscriptionPaymentsShouldFail = false;
        return respond(500, { errors: [{ description: 'falha simulada' }] });
      }

      const subscriptionId = path.split('/')[2];
      let subscriptionPayments = paymentsBySubscription.get(subscriptionId) || [];

      if (subscriptionPayments.length === 0) {
        // Primeira vez consultando essa assinatura: a Asaas "gera" a primeira cobrança.
        const payment = {
          id: `pay_${payments.size + 1}`,
          status: 'PENDING',
          invoiceUrl: `https://sandbox.asaas.com/i/${subscriptionId}`,
          dueDate: '2026-11-10',
          subscription: subscriptionId,
        };
        payments.set(payment.id, payment);
        subscriptionPayments = [payment];
        paymentsBySubscription.set(subscriptionId, subscriptionPayments);
      }

      return respond(200, { data: subscriptionPayments });
    }

    if (init.method === 'POST' && path === '/payments') {
      const body = JSON.parse(init.body);
      const id = `pay_${payments.size + 1}`;
      const payment = {
        id,
        status: 'PENDING',
        invoiceUrl: `https://sandbox.asaas.com/i/${id}`,
        dueDate: '2026-11-10',
        externalReference: body.externalReference,
      };
      payments.set(id, payment);
      return respond(200, payment);
    }

    if (init.method === 'GET' && path.startsWith('/payments?externalReference=')) {
      const externalReference = decodeURIComponent(path.split('=')[1]);
      const found = [...payments.values()].find((p) => p.externalReference === externalReference);
      return respond(200, { data: found ? [found] : [] });
    }

    if (init.method === 'GET' && /^\/payments\/[^/?]+$/.test(path)) {
      const id = path.split('/')[2];
      const found = payments.get(id);
      return found ? respond(200, found) : respond(404, { errors: [{ description: 'not found' }] });
    }

    throw new Error(`fakeAsaasBackend: rota não simulada: ${init.method} ${path}`);
  };

  return {
    fetchImpl,
    calls,
    failNextSubscriptionPaymentsCall: () => {
      nextSubscriptionPaymentsShouldFail = true;
    },
    countCalls: (method: string, path: string) =>
      calls.filter((call) => call.method === method && call.path === path).length,
  };
}

function emptyPending(externalReference: string) {
  return { providerPaymentId: null, providerSubscriptionId: null, externalReference };
}

test('MONTHLY, primeira tentativa: cria a assinatura e devolve a primeira cobrança', async () => {
  const backend = createFakeAsaasBackend();
  const config = getAsaasClientConfig({ apiKey: 'key', fetchImpl: backend.fetchImpl as any });

  const result = await resolveCheckoutCharge({
    config,
    customerId: 'cus_1',
    billingCycle: 'MONTHLY',
    amountValue: 9.9,
    description: 'Plano mensal',
    pending: emptyPending('chk_abc'),
  });

  assert.ok(result.providerSubscriptionId);
  assert.ok(result.providerPaymentId);
  assert.ok(result.paymentLinkUrl);
  assert.equal(backend.countCalls('POST', '/subscriptions'), 1);
});

test('MONTHLY, retomada com providerSubscriptionId já conhecido: nunca cria uma segunda assinatura', async () => {
  const backend = createFakeAsaasBackend();
  const config = getAsaasClientConfig({ apiKey: 'key', fetchImpl: backend.fetchImpl as any });

  const first = await resolveCheckoutCharge({
    config,
    customerId: 'cus_1',
    billingCycle: 'MONTHLY',
    amountValue: 9.9,
    description: 'Plano mensal',
    pending: emptyPending('chk_abc'),
  });

  const second = await resolveCheckoutCharge({
    config,
    customerId: 'cus_1',
    billingCycle: 'MONTHLY',
    amountValue: 9.9,
    description: 'Plano mensal',
    pending: {
      providerPaymentId: first.providerPaymentId,
      providerSubscriptionId: first.providerSubscriptionId,
      externalReference: 'chk_abc',
    },
  });

  assert.equal(second.providerSubscriptionId, first.providerSubscriptionId);
  assert.equal(backend.countCalls('POST', '/subscriptions'), 1, 'não deveria criar uma segunda assinatura');
});

test('REVISÃO (ponto 1): Asaas cria a assinatura, a etapa seguinte falha, o registro local permanece e a nova tentativa reconcilia em vez de criar uma segunda assinatura', async () => {
  const backend = createFakeAsaasBackend();
  const config = getAsaasClientConfig({ apiKey: 'key', fetchImpl: backend.fetchImpl as any });

  // A assinatura é criada com sucesso, mas a consulta da primeira cobrança
  // (a "etapa seguinte") falha — simula o cenário exato da revisão.
  backend.failNextSubscriptionPaymentsCall();

  const pending = emptyPending('chk_abc');

  await assert.rejects(() =>
    resolveCheckoutCharge({
      config,
      customerId: 'cus_1',
      billingCycle: 'MONTHLY',
      amountValue: 9.9,
      description: 'Plano mensal',
      pending,
    })
  );

  // O registro local (pending) nunca foi atualizado com o id da assinatura
  // criada — é exatamente por isso que a nova tentativa precisa reconciliar
  // por externalReference em vez de usar um id já conhecido.
  assert.equal(pending.providerSubscriptionId, null);

  // Nova tentativa, mesmo externalReference, SEM providerSubscriptionId
  // conhecido — deve encontrar a assinatura já criada pela Asaas via busca
  // por externalReference, não criar uma segunda.
  const retry = await resolveCheckoutCharge({
    config,
    customerId: 'cus_1',
    billingCycle: 'MONTHLY',
    amountValue: 9.9,
    description: 'Plano mensal',
    pending,
  });

  assert.ok(retry.providerSubscriptionId);
  assert.ok(retry.paymentLinkUrl);
  assert.equal(backend.countCalls('POST', '/subscriptions'), 1, 'a reentrega não pode ter criado uma segunda assinatura');
});

test('ANNUAL, primeira tentativa: cria a cobrança única', async () => {
  const backend = createFakeAsaasBackend();
  const config = getAsaasClientConfig({ apiKey: 'key', fetchImpl: backend.fetchImpl as any });

  const result = await resolveCheckoutCharge({
    config,
    customerId: 'cus_1',
    billingCycle: 'ANNUAL',
    amountValue: 99.9,
    description: 'Plano anual',
    pending: emptyPending('chk_xyz'),
  });

  assert.ok(result.providerPaymentId);
  assert.equal(result.providerSubscriptionId, null);
  assert.ok(result.paymentLinkUrl);
  assert.equal(backend.countCalls('POST', '/payments'), 1);
});

test('ANNUAL, retomada com providerPaymentId já conhecido: busca a cobrança existente, nunca cria uma segunda', async () => {
  const backend = createFakeAsaasBackend();
  const config = getAsaasClientConfig({ apiKey: 'key', fetchImpl: backend.fetchImpl as any });

  const first = await resolveCheckoutCharge({
    config,
    customerId: 'cus_1',
    billingCycle: 'ANNUAL',
    amountValue: 99.9,
    description: 'Plano anual',
    pending: emptyPending('chk_xyz'),
  });

  const second = await resolveCheckoutCharge({
    config,
    customerId: 'cus_1',
    billingCycle: 'ANNUAL',
    amountValue: 99.9,
    description: 'Plano anual',
    pending: { providerPaymentId: first.providerPaymentId, providerSubscriptionId: null, externalReference: 'chk_xyz' },
  });

  assert.equal(second.providerPaymentId, first.providerPaymentId);
  assert.equal(backend.countCalls('POST', '/payments'), 1, 'não deveria criar uma segunda cobrança');
});

// REVISÃO (ponto 2): a data da cobrança tem que ser a data civil de
// America/Sao_Paulo, nunca new Date().toISOString().slice(0, 10) (UTC) — à
// noite no Brasil, UTC já é o dia seguinte.
test('REVISÃO (ponto 2): 2026-10-10T01:00:00Z (22h de 09/10 em São Paulo) gera vencimento 2026-10-09, não 2026-10-10', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  t.mock.timers.setTime(new Date('2026-10-10T01:00:00Z').getTime());

  try {
    const backend = createFakeAsaasBackend();
    const config = getAsaasClientConfig({ apiKey: 'key', fetchImpl: backend.fetchImpl as any });

    await resolveCheckoutCharge({
      config,
      customerId: 'cus_1',
      billingCycle: 'ANNUAL',
      amountValue: 99.9,
      description: 'Plano anual',
      pending: emptyPending('chk_tz'),
    });

    const createCall = backend.calls.find((call) => call.method === 'POST' && call.path === '/payments');
    assert.ok(createCall, 'esperava uma chamada POST /payments');
    assert.equal(createCall!.body.dueDate, '2026-10-09');
    assert.notEqual(createCall!.body.dueDate, '2026-10-10');
  } finally {
    t.mock.timers.reset();
  }
});

test('ANNUAL: reconcilia por externalReference quando nada foi capturado localmente (mesmo cenário do ponto 1, para cobrança única)', async () => {
  const backend = createFakeAsaasBackend();
  const config = getAsaasClientConfig({ apiKey: 'key', fetchImpl: backend.fetchImpl as any });

  const pending = emptyPending('chk_xyz');

  const first = await resolveCheckoutCharge({
    config,
    customerId: 'cus_1',
    billingCycle: 'ANNUAL',
    amountValue: 99.9,
    description: 'Plano anual',
    pending,
  });

  // Simula que a persistência local do providerPaymentId nunca aconteceu
  // (pending continua "vazio"), mas a cobrança já existe na Asaas.
  const retry = await resolveCheckoutCharge({
    config,
    customerId: 'cus_1',
    billingCycle: 'ANNUAL',
    amountValue: 99.9,
    description: 'Plano anual',
    pending,
  });

  assert.equal(retry.providerPaymentId, first.providerPaymentId);
  assert.equal(backend.countCalls('POST', '/payments'), 1, 'não deveria criar uma segunda cobrança');
});

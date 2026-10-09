import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAsaasClientConfig,
  AsaasConfigError,
  AsaasApiError,
  createAsaasCustomer,
  findAsaasCustomerByExternalReference,
  createAsaasPayment,
  createAsaasSubscription,
  listAsaasSubscriptionPayments,
} from '../lib/asaas-client.ts';

function fakeFetch(handler: (url: string, init: any) => { status: number; body: unknown }) {
  return async (url: string, init: any) => {
    const { status, body } = handler(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    } as Response;
  };
}

test('getAsaasClientConfig lança AsaasConfigError sem ASAAS_API_KEY', () => {
  assert.throws(
    () => getAsaasClientConfig({ apiKey: undefined as any, baseUrl: 'https://x' }),
    AsaasConfigError
  );
});

test('getAsaasClientConfig usa sandbox por padrão (ASAAS_ENV != production)', () => {
  const config = getAsaasClientConfig({ apiKey: 'key-123' });
  assert.match(config.baseUrl, /sandbox/);
});

test('createAsaasCustomer nunca envia credencial em texto puro no corpo, só no header access_token', async () => {
  let capturedUrl = '';
  let capturedInit: any = null;

  const config = getAsaasClientConfig({
    apiKey: 'minha-chave-secreta',
    baseUrl: 'https://api-sandbox.asaas.com/v3',
    fetchImpl: fakeFetch((url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return { status: 200, body: { id: 'cus_123', externalReference: 'chk_abc' } };
    }) as any,
  });

  const customer = await createAsaasCustomer(config, {
    name: 'Fulano',
    email: 'fulano@example.com',
    cpfCnpj: '12345678900',
    externalReference: 'chk_abc',
  });

  assert.equal(customer.id, 'cus_123');
  assert.equal(capturedUrl, 'https://api-sandbox.asaas.com/v3/customers');
  assert.equal(capturedInit.method, 'POST');
  assert.equal(capturedInit.headers.access_token, 'minha-chave-secreta');
  const body = JSON.parse(capturedInit.body);
  assert.equal(body.externalReference, 'chk_abc');
  assert.doesNotMatch(capturedInit.body, /minha-chave-secreta/);
});

test('findAsaasCustomerByExternalReference devolve null quando não encontra nenhum', async () => {
  const config = getAsaasClientConfig({
    apiKey: 'key',
    baseUrl: 'https://api-sandbox.asaas.com/v3',
    fetchImpl: fakeFetch(() => ({ status: 200, body: { data: [] } })) as any,
  });

  const customer = await findAsaasCustomerByExternalReference(config, 'chk_inexistente');
  assert.equal(customer, null);
});

test('createAsaasPayment propaga erro da Asaas como AsaasApiError com status e corpo', async () => {
  const config = getAsaasClientConfig({
    apiKey: 'key',
    baseUrl: 'https://api-sandbox.asaas.com/v3',
    fetchImpl: fakeFetch(() => ({
      status: 400,
      body: { errors: [{ description: 'customer inválido' }] },
    })) as any,
  });

  await assert.rejects(
    () =>
      createAsaasPayment(config, {
        customerId: 'cus_123',
        billingType: 'UNDEFINED',
        value: 99.9,
        dueDate: '2026-10-20',
        externalReference: 'chk_abc',
        description: 'Plano anual',
      }),
    (error: unknown) => {
      assert.ok(error instanceof AsaasApiError);
      assert.equal((error as AsaasApiError).status, 400);
      return true;
    }
  );
});

test('createAsaasSubscription envia cycle MONTHLY fixo', async () => {
  let capturedBody: any = null;

  const config = getAsaasClientConfig({
    apiKey: 'key',
    baseUrl: 'https://api-sandbox.asaas.com/v3',
    fetchImpl: fakeFetch((_url, init) => {
      capturedBody = JSON.parse(init.body);
      return { status: 200, body: { id: 'sub_123', status: 'ACTIVE' } };
    }) as any,
  });

  const subscription = await createAsaasSubscription(config, {
    customerId: 'cus_123',
    billingType: 'UNDEFINED',
    value: 9.9,
    nextDueDate: '2026-10-20',
    externalReference: 'chk_abc',
    description: 'Plano mensal',
  });

  assert.equal(subscription.id, 'sub_123');
  assert.equal(capturedBody.cycle, 'MONTHLY');
});

test('listAsaasSubscriptionPayments devolve lista vazia quando a API não retorna data', async () => {
  const config = getAsaasClientConfig({
    apiKey: 'key',
    baseUrl: 'https://api-sandbox.asaas.com/v3',
    fetchImpl: fakeFetch(() => ({ status: 200, body: {} })) as any,
  });

  const payments = await listAsaasSubscriptionPayments(config, 'sub_123');
  assert.deepEqual(payments, []);
});

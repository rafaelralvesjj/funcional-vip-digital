/**
 * Cliente mínimo para a API REST da Asaas (https://docs.asaas.com/reference).
 * Sem SDK oficial instalado — usa fetch nativo. Nenhuma credencial real é
 * lida/escrita aqui: ASAAS_API_KEY e ASAAS_API_BASE_URL vêm de variáveis de
 * ambiente (nunca NEXT_PUBLIC_*, nunca hard-coded), documentadas em
 * .env.example com placeholders vazios. Sem essas variáveis configuradas,
 * qualquer chamada real falha cedo com AsaasConfigError — não há fallback
 * silencioso nem segredo inventado.
 *
 * `fetchImpl` é injetável de propósito: testes substituem por um fake e
 * nunca fazem uma chamada de rede real.
 */

export class AsaasConfigError extends Error {}
export class AsaasApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export type AsaasBillingType = "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";

export type AsaasCustomer = {
  id: string;
  externalReference?: string | null;
};

export type AsaasPayment = {
  id: string;
  status: string;
  invoiceUrl?: string | null;
  dueDate?: string | null;
  value?: number | null;
  externalReference?: string | null;
  subscription?: string | null;
};

export type AsaasSubscription = {
  id: string;
  status: string;
  nextDueDate?: string | null;
  value?: number | null;
  externalReference?: string | null;
};

export type AsaasClientConfig = {
  apiKey: string;
  baseUrl: string;
  fetchImpl: typeof fetch;
};

function readEnvConfig(): { apiKey: string | null; baseUrl: string | null } {
  return {
    apiKey: process.env.ASAAS_API_KEY || null,
    // Sandbox por padrão quando ASAAS_ENV não é "production" — nunca aponta
    // para produção da Asaas sem essa escolha explícita.
    baseUrl:
      process.env.ASAAS_API_BASE_URL ||
      (process.env.ASAAS_ENV === "production"
        ? "https://api.asaas.com/v3"
        : "https://api-sandbox.asaas.com/v3"),
  };
}

export function getAsaasClientConfig(overrides?: Partial<AsaasClientConfig>): AsaasClientConfig {
  const env = readEnvConfig();
  const apiKey = overrides?.apiKey ?? env.apiKey;
  const baseUrl = overrides?.baseUrl ?? env.baseUrl;

  if (!apiKey) {
    throw new AsaasConfigError(
      "ASAAS_API_KEY não configurada. Configure a variável de ambiente antes de criar cobranças pela Asaas."
    );
  }

  if (!baseUrl) {
    throw new AsaasConfigError("ASAAS_API_BASE_URL não configurada.");
  }

  return {
    apiKey,
    baseUrl,
    fetchImpl: overrides?.fetchImpl ?? fetch,
  };
}

async function asaasRequest<T>(
  config: AsaasClientConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> }
): Promise<T> {
  const response = await config.fetchImpl(`${config.baseUrl}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      access_token: config.apiKey,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const rawBody = await response.text();
  const parsedBody = rawBody ? JSON.parse(rawBody) : null;

  if (!response.ok) {
    throw new AsaasApiError(
      `Asaas respondeu ${response.status} para ${init.method} ${path}.`,
      response.status,
      parsedBody
    );
  }

  return parsedBody as T;
}

/**
 * Busca um cliente Asaas existente pelo externalReference (nosso
 * Student.id) antes de criar um novo — evita duplicar cadastro de cliente
 * na Asaas a cada tentativa de checkout.
 */
export async function findAsaasCustomerByExternalReference(
  config: AsaasClientConfig,
  externalReference: string
): Promise<AsaasCustomer | null> {
  const result = await asaasRequest<{ data: AsaasCustomer[] }>(
    config,
    `/customers?externalReference=${encodeURIComponent(externalReference)}`,
    { method: "GET" }
  );

  return result.data?.[0] || null;
}

export async function createAsaasCustomer(
  config: AsaasClientConfig,
  params: {
    name: string;
    email: string;
    cpfCnpj: string;
    phone?: string | null;
    externalReference: string;
  }
): Promise<AsaasCustomer> {
  return asaasRequest<AsaasCustomer>(config, "/customers", {
    method: "POST",
    body: {
      name: params.name,
      email: params.email,
      cpfCnpj: params.cpfCnpj,
      mobilePhone: params.phone || undefined,
      externalReference: params.externalReference,
    },
  });
}

/** Cobrança única — usada para o ciclo ANNUAL (12 meses pagos de uma vez). */
export async function createAsaasPayment(
  config: AsaasClientConfig,
  params: {
    customerId: string;
    billingType: AsaasBillingType;
    value: number;
    dueDate: string;
    externalReference: string;
    description: string;
  }
): Promise<AsaasPayment> {
  return asaasRequest<AsaasPayment>(config, "/payments", {
    method: "POST",
    body: {
      customer: params.customerId,
      billingType: params.billingType,
      value: params.value,
      dueDate: params.dueDate,
      externalReference: params.externalReference,
      description: params.description,
    },
  });
}

/** Assinatura recorrente — usada para o ciclo MONTHLY. */
export async function createAsaasSubscription(
  config: AsaasClientConfig,
  params: {
    customerId: string;
    billingType: AsaasBillingType;
    value: number;
    nextDueDate: string;
    externalReference: string;
    description: string;
  }
): Promise<AsaasSubscription> {
  return asaasRequest<AsaasSubscription>(config, "/subscriptions", {
    method: "POST",
    body: {
      customer: params.customerId,
      billingType: params.billingType,
      value: params.value,
      nextDueDate: params.nextDueDate,
      cycle: "MONTHLY",
      externalReference: params.externalReference,
      description: params.description,
    },
  });
}

/** Primeira cobrança gerada por uma assinatura recém-criada (traz invoiceUrl). */
export async function listAsaasSubscriptionPayments(
  config: AsaasClientConfig,
  subscriptionId: string
): Promise<AsaasPayment[]> {
  const result = await asaasRequest<{ data: AsaasPayment[] }>(
    config,
    `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`,
    { method: "GET" }
  );

  return result.data || [];
}

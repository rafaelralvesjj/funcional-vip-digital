import { randomUUID } from "crypto";

/**
 * externalReference enviado à Asaas: precisa identificar nossa cobrança sem
 * nunca carregar dado pessoal (nome, e-mail, CPF/CNPJ, telefone) — exigência
 * explícita da revisão. Formato opaco: prefixo fixo + UUID aleatório, sem
 * nenhuma relação determinística com o aluno (não dá pra "advinhar" nem
 * derivar o dado pessoal a partir dele).
 */
const CHECKOUT_REFERENCE_PREFIX = "chk_";

export function buildCheckoutExternalReference(): string {
  return `${CHECKOUT_REFERENCE_PREFIX}${randomUUID()}`;
}

const PII_PATTERNS: RegExp[] = [
  /@/, // e-mail
  /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/, // CPF
  /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/, // CNPJ
  /\s/, // nome próprio sempre tem espaço; referência opaca nunca deveria ter
];

/**
 * Checagem defensiva (usada em teste e, opcionalmente, antes de enviar à
 * Asaas): garante que nada que pareça e-mail/CPF/CNPJ/nome foi colocado
 * como externalReference por engano.
 */
export function isOpaqueCheckoutReference(value: string): boolean {
  if (!value.startsWith(CHECKOUT_REFERENCE_PREFIX)) return false;
  return !PII_PATTERNS.some((pattern) => pattern.test(value));
}

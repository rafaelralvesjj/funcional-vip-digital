/**
 * Aceite obrigatório dos termos antes do checkout. Só a constante de versão
 * e a validação do checkbox vivem aqui — nenhum texto jurídico é inventado;
 * o texto real dos termos é conteúdo de produto/jurídico, fora do escopo
 * desta implementação.
 */
export const CHECKOUT_TERMS_VERSION = "CONTRATACAO_PLANO_V1";

export class TermsNotAcceptedError extends Error {
  constructor() {
    super('É necessário marcar "Li e concordo com os termos e condições" para continuar.');
  }
}

export function assertTermsAccepted(acceptedTerms: unknown): void {
  if (acceptedTerms !== true) {
    throw new TermsNotAcceptedError();
  }
}

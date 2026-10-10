/**
 * Resolvedor central de "situação comercial" para o Financeiro — única fonte
 * de verdade para os 7 cards/linha da tabela, para as telas de cards,
 * tabela e detalhe do aluno nunca divergirem (cada uma reimplementando seu
 * próprio filtro de data, como a versão anterior do Financeiro fazia).
 *
 * Reaproveita, de propósito, a mesma lógica de "qual é o contrato atual do
 * aluno" já usada pelo dashboard do aluno (pickCurrentContract, em
 * lib/student-dashboard-summary.ts) e a mesma prioridade de cobrança
 * relevante (pickMoneyRelevantPayment, em lib/contract-payment-priority.ts)
 * — em vez de reimplementar esse filtro uma terceira vez aqui.
 */
import { pickCurrentContract } from "./student-dashboard-summary";
import { pickMoneyRelevantPayment } from "./contract-payment-priority";
import { trialWindowFromContractDates, getTrialDaysRemaining, TRIAL_CTA_DAYS_BEFORE_END } from "./trial-window";
import { formatCentsToBRL } from "./service-plan-billing";

export type CommercialStatusCategory =
  | "EM_TESTE"
  | "TESTE_TERMINA_EM_BREVE"
  | "AGUARDANDO_PAGAMENTO"
  | "CONTRATO_ATIVO"
  | "PAGAMENTO_ATRASADO"
  | "SUSPENSO"
  | "ENCERRADO";

export const COMMERCIAL_STATUS_CATEGORIES: CommercialStatusCategory[] = [
  "EM_TESTE",
  "TESTE_TERMINA_EM_BREVE",
  "AGUARDANDO_PAGAMENTO",
  "CONTRATO_ATIVO",
  "PAGAMENTO_ATRASADO",
  "SUSPENSO",
  "ENCERRADO",
];

export const COMMERCIAL_STATUS_CATEGORY_LABELS: Record<CommercialStatusCategory, string> = {
  EM_TESTE: "Em teste",
  TESTE_TERMINA_EM_BREVE: "Teste termina em até 2 dias",
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  CONTRATO_ATIVO: "Contratos ativos",
  PAGAMENTO_ATRASADO: "Pagamento atrasado",
  SUSPENSO: "Suspensos",
  ENCERRADO: "Encerrados",
};

const TERMINAL_STATUSES = new Set(["FINALIZED", "CANCELLED"]);

/**
 * Categoria de UM contrato (já escolhido como "o contrato atual do aluno"
 * por resolveStudentCommercialRow/pickCurrentContract). Ordem de decisão,
 * da mais para a menos definitiva:
 * 1. Status terminal (FINALIZED/CANCELLED) → ENCERRADO, sempre — mesmo que
 *    exista algum ContractPayment ATRASADO órfão no histórico.
 * 2. SUSPENDED → SUSPENSO, mesmo com cobrança ATRASADO (é a ação explícita
 *    da gestão, mais específica do que o estado derivado da cobrança).
 * 3. Cobrança relevante ATRASADO → PAGAMENTO_ATRASADO, para TRIAL ou PAID
 *    ACTIVE/AWAITING_PAYMENT (ex.: assinatura Asaas com cartão recusado
 *    continua com StudentContract.status ACTIVE — ver lib/asaas-webhook-processor.ts,
 *    que nunca muda o status do contrato em PAYMENT_OVERDUE).
 * 4. TRIAL ACTIVE → janela de teste (EM_TESTE / TESTE_TERMINA_EM_BREVE pelo
 *    mesmo corte de T-2 dias do CTA "Contratar plano", lib/trial-window.ts).
 * 5. PAID AWAITING_PAYMENT → AGUARDANDO_PAGAMENTO.
 * 6. PAID ACTIVE → CONTRATO_ATIVO.
 * 7. Qualquer outro status (DRAFT/AWAITING_ACCEPTANCE — raro, legado) →
 *    AGUARDANDO_PAGAMENTO como fallback defensivo (mais perto do real:
 *    "ainda não finalizado").
 */
export function resolveContractCommercialCategory(
  contract: any,
  now: Date = new Date()
): CommercialStatusCategory {
  if (TERMINAL_STATUSES.has(contract.status)) return "ENCERRADO";
  if (contract.status === "SUSPENDED") return "SUSPENSO";

  const relevantPayment = pickMoneyRelevantPayment(contract.payments || []);
  if (relevantPayment?.status === "ATRASADO") return "PAGAMENTO_ATRASADO";

  if (contract.type === "TRIAL") {
    if (contract.status !== "ACTIVE") return "AGUARDANDO_PAGAMENTO";

    const window = trialWindowFromContractDates({
      startDate: new Date(contract.startDate),
      endDate: new Date(contract.endDate),
    });
    const daysRemaining = getTrialDaysRemaining(window, now);
    return daysRemaining <= TRIAL_CTA_DAYS_BEFORE_END ? "TESTE_TERMINA_EM_BREVE" : "EM_TESTE";
  }

  if (contract.status === "AWAITING_PAYMENT") return "AGUARDANDO_PAGAMENTO";
  if (contract.status === "ACTIVE") return "CONTRATO_ATIVO";

  return "AGUARDANDO_PAGAMENTO";
}

/**
 * "Cobrança" para exibição: para contratos nascidos do checkout self-service
 * (billingCycle preenchido — ver PR da Fase 3), usa o ciclo real escolhido
 * pelo aluno. Para contratos legados/manuais (billingCycle nulo), descreve
 * pelo paymentMode gravado pela gestão. Nunca inventa um valor não gravado.
 */
export function formatBillingLabel(contract: any): string {
  const price = `R$ ${formatCentsToBRL(contract.priceCents || 0)}`;

  if (contract.type === "TRIAL") return "Cortesia (teste)";

  if (contract.billingCycle === "MONTHLY") return `Mensal — ${price}`;
  if (contract.billingCycle === "ANNUAL") return `Anual — ${price}`;

  if (contract.paymentMode === "RECORRENTE") return `Recorrente — ${price}`;
  if (contract.paymentMode === "GRATUITO") return `Cortesia — ${price}`;

  return `Pagamento único — ${price}`;
}

function resolveNextRelevantDate(
  category: CommercialStatusCategory,
  contract: any,
  relevantPayment: any | null
): Date | null {
  switch (category) {
    case "SUSPENSO":
      return contract.suspendedAt ? new Date(contract.suspendedAt) : new Date(contract.endDate);
    case "ENCERRADO":
      return contract.finalizedAt
        ? new Date(contract.finalizedAt)
        : contract.cancelledAt
          ? new Date(contract.cancelledAt)
          : new Date(contract.endDate);
    case "AGUARDANDO_PAGAMENTO":
    case "PAGAMENTO_ATRASADO":
    case "CONTRATO_ATIVO":
      return relevantPayment?.dueDate ? new Date(relevantPayment.dueDate) : new Date(contract.endDate);
    case "EM_TESTE":
    case "TESTE_TERMINA_EM_BREVE":
    default:
      return new Date(contract.endDate);
  }
}

export type CommercialStatusRow = {
  studentId: string;
  studentName: string;
  category: CommercialStatusCategory;
  categoryLabel: string;
  contractId: string;
  contractType: string;
  contractStatus: string;
  planName: string;
  billingLabel: string;
  nextDate: Date | null;
  paymentId: string | null;
  paymentStatus: string | null;
  paymentLinkUrl: string | null;
};

/**
 * Uma linha por aluno (não por contrato) — a tabela única do Financeiro
 * mostra "o que importa agora" para aquele aluno, escolhido pelo mesmo
 * critério já usado no dashboard do aluno (pickCurrentContract). Aluno sem
 * nenhum contrato não aparece na tabela (null) — igual à versão anterior do
 * Financeiro, que também não listava "sem contrato" na tabela principal.
 */
export function resolveStudentCommercialRow(
  student: { id: string; name: string; contracts: any[] },
  now: Date = new Date()
): CommercialStatusRow | null {
  const contract = pickCurrentContract(student.contracts || []);
  if (!contract) return null;

  const category = resolveContractCommercialCategory(contract, now);
  const relevantPayment = pickMoneyRelevantPayment(contract.payments || []);

  return {
    studentId: student.id,
    studentName: student.name,
    category,
    categoryLabel: COMMERCIAL_STATUS_CATEGORY_LABELS[category],
    contractId: contract.id,
    contractType: contract.type,
    contractStatus: contract.status,
    planName: contract.plan?.name || "Plano avulso",
    billingLabel: formatBillingLabel(contract),
    nextDate: resolveNextRelevantDate(category, contract, relevantPayment),
    paymentId: relevantPayment?.id || null,
    paymentStatus: relevantPayment?.status || null,
    paymentLinkUrl: relevantPayment?.paymentLinkUrl || null,
  };
}

export function aggregateCommercialStatusCounts(
  rows: Array<{ category: CommercialStatusCategory }>
): Record<CommercialStatusCategory, number> {
  const counts = Object.fromEntries(
    COMMERCIAL_STATUS_CATEGORIES.map((category) => [category, 0])
  ) as Record<CommercialStatusCategory, number>;

  for (const row of rows) {
    counts[row.category] = (counts[row.category] || 0) + 1;
  }

  return counts;
}

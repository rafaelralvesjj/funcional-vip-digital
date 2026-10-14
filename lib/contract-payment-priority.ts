/**
 * Qual ContractPayment de uma lista é "o que importa agora" para exibição —
 * usado tanto pelo resumo do aluno (lib/student-dashboard-summary.ts) quanto
 * pelo resolvedor central de status comercial do Financeiro
 * (lib/commercial-status-resolver.ts). Extraído para um módulo neutro para
 * as duas telas nunca divergirem nessa escolha.
 *
 * Prioridade: ATRASADO (mais urgente) > EM_ABERTO > PARCIAL > PAGO; dentro da
 * mesma prioridade, o vencimento mais próximo primeiro.
 */
export function pickMoneyRelevantPayment(payments: any[] | null | undefined): any | null {
  if (!payments?.length) return null;

  const priority = ["ATRASADO", "EM_ABERTO", "PARCIAL", "PAGO"];

  return [...payments].sort((a, b) => {
    const aPriority = priority.indexOf(a.status);
    const bPriority = priority.indexOf(b.status);

    if (aPriority !== bPriority) {
      return (aPriority === -1 ? 99 : aPriority) - (bPriority === -1 ? 99 : bPriority);
    }

    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  })[0];
}

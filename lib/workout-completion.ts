/**
 * Decisão pura de quando gravar Workout.completedAt — o instante REAL de
 * conclusão, nunca a data planejada (Workout.date). Usada por POST
 * /api/workout/mark-complete, que grava o resultado no servidor
 * (new Date(), nunca um valor vindo do corpo da requisição).
 */

const COMPLETED_WORKOUT_STATUSES = new Set(["CONCLUIDO", "CONCLUIDO_PARCIALMENTE"]);

function isCompletedStatus(status: string | null | undefined): boolean {
  return status ? COMPLETED_WORKOUT_STATUSES.has(status) : false;
}

/**
 * - Status final não é CONCLUIDO/CONCLUIDO_PARCIALMENTE: completedAt nunca é
 *   gerado por essa transição (mantém o que já havia, tipicamente null).
 * - Já estava concluído antes (qualquer um dos dois status): reenvio ou
 *   idempotência — completedAt existente NUNCA é sobrescrito.
 * - Primeira vez entrando em concluído: completedAt = `now` (o instante
 *   real, fornecido pelo chamador a partir do servidor).
 */
export function resolveWorkoutCompletedAt(params: {
  previousStatus: string | null | undefined;
  nextStatus: string;
  previousCompletedAt: Date | null | undefined;
  now: Date;
}): Date | null {
  if (!isCompletedStatus(params.nextStatus)) {
    return params.previousCompletedAt ?? null;
  }

  if (isCompletedStatus(params.previousStatus)) {
    return params.previousCompletedAt ?? null;
  }

  return params.now;
}

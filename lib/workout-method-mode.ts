/**
 * Modo de treino estruturado do aluno (NORMAL / COMBINADO) — fonte única de
 * verdade sobre a forma de montar os próximos treinos. NUNCA inferido de
 * texto: nome do treino, resumo, prompt da IA, objetivo, perguntas/
 * respostas, mensagens antigas, preferências históricas ou a palavra
 * "combinado" não podem decidir o modo. A única entrada aceita é o valor
 * estruturado gravado em Student.workoutMethodMode, alterado só por
 * confirmação explícita (ver resolveWorkoutMethodModeChange) ou por
 * migração/ação administrativa pontual e auditável
 * (StudentWorkoutMethodChange).
 */
import { getSaoPauloCivilDateInput } from "./planning-window";

export type WorkoutMethodMode = "NORMAL" | "COMBINADO";

export const WORKOUT_METHOD_MODES: readonly WorkoutMethodMode[] = ["NORMAL", "COMBINADO"];

export const DEFAULT_WORKOUT_METHOD_MODE: WorkoutMethodMode = "NORMAL";

/** Dias desde o primeiro treino REALMENTE concluído para liberar o convite ao COMBINADO. */
export const COMBINED_INVITE_ELIGIBILITY_DAYS = 30;

/**
 * Normaliza qualquer valor (incluindo null/undefined/coluna ainda não
 * migrada em algum registro antigo) para um WorkoutMethodMode válido.
 * Comparação EXATA com a string "COMBINADO" — nunca um regex, nunca
 * case-insensitive, nunca combinado com nenhum outro texto. Qualquer coisa
 * que não seja esse valor exato (incluindo ausência de valor) é NORMAL.
 */
export function normalizeWorkoutMethodMode(value: unknown): WorkoutMethodMode {
  return value === "COMBINADO" ? "COMBINADO" : DEFAULT_WORKOUT_METHOD_MODE;
}

function civilDaysBetween(fromDate: Date, toDate: Date): number {
  const fromCivil = getSaoPauloCivilDateInput(fromDate);
  const toCivil = getSaoPauloCivilDateInput(toDate);
  const fromMs = new Date(`${fromCivil}T00:00:00Z`).getTime();
  const toMs = new Date(`${toCivil}T00:00:00Z`).getTime();
  return Math.round((toMs - fromMs) / 86400000);
}

/**
 * Elegibilidade para RECEBER o convite "Experimente um treino combinado" —
 * nunca para ser colocado em COMBINADO automaticamente. Só aceita a data do
 * primeiro treino realmente concluído (Workout.status em CONCLUIDO/
 * CONCLUIDO_PARCIALMENTE); cadastro, contrato, WorkoutPlan criado ou semana
 * liberada nunca contam como início dessa janela — e nem poderiam, já que a
 * função não recebe nenhuma dessas datas como entrada.
 */
export function isEligibleForCombinedWorkoutInvite(params: {
  firstCompletedWorkoutDate: Date | null;
  now?: Date;
}): boolean {
  if (!params.firstCompletedWorkoutDate) return false;

  const days = civilDaysBetween(params.firstCompletedWorkoutDate, params.now ?? new Date());
  return days >= COMBINED_INVITE_ELIGIBILITY_DAYS;
}

export class InvalidWorkoutMethodModeError extends Error {
  constructor(value: unknown) {
    super(`Modo de treino inválido: "${String(value)}". Só NORMAL ou COMBINADO são aceitos.`);
    this.name = "InvalidWorkoutMethodModeError";
  }
}

export class CombinedWorkoutInviteNotEligibleError extends Error {
  constructor() {
    super(
      `O aluno ainda não completou ${COMBINED_INVITE_ELIGIBILITY_DAYS} dias desde o primeiro treino concluído — não é elegível para o convite ao treino combinado.`
    );
    this.name = "CombinedWorkoutInviteNotEligibleError";
  }
}

export type WorkoutMethodModeChange = {
  previousMode: WorkoutMethodMode;
  newMode: WorkoutMethodMode;
};

/**
 * Única porta de decisão para uma mudança de modo. Regras:
 * - Só altera por pedido EXPLÍCITO (requestedMode) — nunca infere.
 * - NORMAL -> COMBINADO exige isEligibleForCombined=true (calculado fora
 *   daqui, a partir do primeiro treino concluído de verdade).
 * - COMBINADO -> NORMAL ("Voltar para treino normal") nunca exige
 *   elegibilidade — voltar é sempre permitido.
 * - Pedir o modo que já está ativo é no-op: devolve null (nada a persistir,
 *   nenhuma linha de histórico à toa).
 * - Modo fora de NORMAL/COMBINADO nunca é aceito silenciosamente.
 */
export function resolveWorkoutMethodModeChange(params: {
  currentMode: WorkoutMethodMode;
  requestedMode: WorkoutMethodMode;
  isEligibleForCombined: boolean;
}): WorkoutMethodModeChange | null {
  if (!WORKOUT_METHOD_MODES.includes(params.requestedMode)) {
    throw new InvalidWorkoutMethodModeError(params.requestedMode);
  }

  if (params.requestedMode === params.currentMode) {
    return null;
  }

  if (params.requestedMode === "COMBINADO" && !params.isEligibleForCombined) {
    throw new CombinedWorkoutInviteNotEligibleError();
  }

  return { previousMode: params.currentMode, newMode: params.requestedMode };
}

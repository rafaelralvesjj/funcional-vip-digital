export type StudentReengagementCategory =
  | "NUNCA_COMECOU"
  | "COMECOU_E_ABANDONOU"
  | "ENGAJADO_MAS_CAIU";

export const REENGAGEMENT_ELIGIBLE_COMMERCIAL_STATUSES = [
  "CONTRATO_ATIVO",
  "EXPERIENCIA_ATIVA",
];

// Dias desde o início do contrato para considerar que o aluno teve tempo
// suficiente de dar o primeiro treino antes de classificá-lo como "nunca começou".
export const NEVER_STARTED_MIN_DAYS_SINCE_START = 10;

// Sem treino concluído há pelo menos esse tanto de dias para considerar
// que o aluno "sumiu" (usado tanto para abandono quanto para queda de engajamento).
export const QUIET_MIN_DAYS_SINCE_LAST_COMPLETED = 14;

// Janela, antes do último treino concluído, usada para medir se o aluno
// realmente tinha uma frequência boa antes de sumir.
export const ENGAGED_LOOKBACK_WINDOW_DAYS = 30;
export const ENGAGED_MIN_COMPLETION_RATE = 0.6;

export const REENGAGEMENT_COOLDOWN_DAYS: Record<StudentReengagementCategory, number> = {
  NUNCA_COMECOU: 21,
  COMECOU_E_ABANDONOU: 21,
  ENGAJADO_MAS_CAIU: 14,
};

// Se o aluno recebeu uma cobrança operacional de treino perdido recentemente
// (cron workout-engagement), a régua de reengajamento espera para não
// duplicar contato na mesma semana.
export const RECENT_OPERATIONAL_CONTACT_GUARD_DAYS = 3;

export type ClassifyStudentReengagementInput = {
  totalCompletedWorkouts: number;
  daysSinceContractStart: number;
  daysSinceLastCompletedWorkout: number | null;
  priorEngagementRate: number | null;
};

export function classifyStudentReengagement(
  input: ClassifyStudentReengagementInput
): StudentReengagementCategory | null {
  const {
    totalCompletedWorkouts,
    daysSinceContractStart,
    daysSinceLastCompletedWorkout,
    priorEngagementRate,
  } = input;

  if (totalCompletedWorkouts === 0) {
    if (daysSinceContractStart >= NEVER_STARTED_MIN_DAYS_SINCE_START) {
      return "NUNCA_COMECOU";
    }
    return null;
  }

  const isQuiet =
    daysSinceLastCompletedWorkout === null ||
    daysSinceLastCompletedWorkout >= QUIET_MIN_DAYS_SINCE_LAST_COMPLETED;

  if (!isQuiet) return null;

  if (totalCompletedWorkouts <= 2) {
    return "COMECOU_E_ABANDONOU";
  }

  if (
    priorEngagementRate !== null &&
    priorEngagementRate >= ENGAGED_MIN_COMPLETION_RATE
  ) {
    return "ENGAJADO_MAS_CAIU";
  }

  return null;
}

export function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}

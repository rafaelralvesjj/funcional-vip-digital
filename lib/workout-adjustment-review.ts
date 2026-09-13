export type ConversationPackageMode =
  | "ADJUST_EXISTING"
  | "DEEP_REVIEW_ONLY"
  | "BLOCKED_NO_ELIGIBLE";

export type ReviewDepth = "STANDARD" | "DEEP";

export type ReviewGuidance = {
  guidanceKey: string;
  title: string;
  summary: string;
};

export function resolveConversationPackageMode(
  reviewDepth: ReviewDepth,
  eligibleWorkoutCount: number
): ConversationPackageMode {
  if (eligibleWorkoutCount > 0) return "ADJUST_EXISTING";
  if (reviewDepth === "DEEP") return "DEEP_REVIEW_ONLY";
  return "BLOCKED_NO_ELIGIBLE";
}

export function buildDeepReviewOnlyResponseModel(guidance: ReviewGuidance[]) {
  return {
    reviewMode: "REVIEW_ONLY",
    rationale: "",
    studentMessage: "",
    guidanceCoverage: guidance.map((item) => ({
      guidanceKey: item.guidanceKey,
      application: "",
      workoutIds: [] as string[],
    })),
    workouts: [] as unknown[],
    programmingRecommendation: {
      objective: "",
      weeklyFrequency: 0,
      sessionStructure: "",
      progressionGuidance: "",
      safetyNote: "",
      suggestedSessions: [] as Array<{
        sessionLabel: string;
        objective: string;
        focusAreas: string;
        intensity: string;
        estimatedDurationMinutes: number;
        rationale: string;
        exercises: Array<{
          exerciseId: string;
          exerciseName?: string;
          series: number;
          reps: string;
          weight: string;
          restTime: string;
          notes: string;
          order: number;
        }>;
      }>,
    },
  };
}

export function buildDeepReviewOnlyPromptLines(): string[] {
  return [
    "MODO OBRIGATÓRIO: REVISÃO PROFUNDA PARA NOVA PROGRAMAÇÃO.",
    "Neste momento não há treino futuro elegível existente para editar ou aplicar automaticamente.",
    "Use o histórico recente, a memória técnica, as conversas abertas, as orientações médicas ativas e a biblioteca de exercícios para propor uma nova programação coerente com o contexto atual do aluno.",
    "Não invente lesões, restrições, equipamentos, diagnósticos, cargas ou fatos ausentes do pacote.",
    "Responda somente com JSON válido no formato de MODELO_RESPOSTA.json.",
    "Mantenha workouts como lista vazia, porque não existe workoutId elegível para alteração neste pacote.",
    "Preencha programmingRecommendation com objetivo, frequência semanal sugerida, estrutura das sessões, progressão, segurança e suggestedSessions.",
    "Cada suggestedSession deve usar somente exerciseId presente em CONTEXTO/BIBLIOTECA_EXERCICIOS.json.",
    "A recomendação é de planejamento para revisão humana do professor; ela não deve afirmar que já alterou ou publicou treinos.",
    "studentMessage deve explicar de forma humana que o plano será revisado/preparado com base no relato do aluno, sem prometer resultado estético específico.",
  ];
}

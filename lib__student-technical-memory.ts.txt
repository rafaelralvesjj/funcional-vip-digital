import { prisma } from "@/lib/prisma";

export type TechnicalContext = {
  exerciseSignals: {
    easy: Array<{ exerciseName: string; count: number }>;
    difficult: Array<{ exerciseName: string; count: number }>;
    skipped: Array<{ exerciseName: string; count: number; reasons: string[] }>;
  };
  adherence: {
    completed: number;
    partial: number;
    pendingOrMissed: number;
    summary: string;
  };
  activePreferences: Array<{ category: string; summary: string }>;
  approvedMemories: Array<{
    category: string;
    title: string;
    summary: string;
    sourceDocumentName: string | null;
    updatedAt: Date;
    validUntil: Date | null;
  }>;
  openCareEvents: Array<{ severity: string; title: string; description: string | null }>;
};

function normalize(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

export async function getStudentTechnicalContext(studentId: string): Promise<TechnicalContext> {
  const since = new Date();
  since.setDate(since.getDate() - 84);

  const [progress, workouts, preferences, memories, careEvents] = await Promise.all([
    prisma.workoutExerciseProgress.findMany({
      where: { studentId, workoutDate: { gte: since } },
      include: { exercise: { select: { name: true } } },
      orderBy: { workoutDate: "desc" },
      take: 300,
    }),
    prisma.workout.findMany({
      where: { studentId, date: { gte: since } },
      select: { status: true },
      orderBy: { date: "desc" },
      take: 100,
    }),
    prisma.studentTrainingPreference.findMany({
      where: { studentId, status: "ACTIVE" },
      select: { category: true, summary: true },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.studentTechnicalMemory.findMany({
      where: {
        studentId,
        status: "APPROVED",
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
      },
      select: {
        category: true,
        title: true,
        summary: true,
        sourceDocumentName: true,
        validUntil: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.studentCareEvent.findMany({
      where: { studentId, status: "ABERTO" },
      select: { severity: true, title: true, description: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const easy = new Map<string, number>();
  const difficult = new Map<string, number>();
  const skipped = new Map<string, { count: number; reasons: Set<string> }>();

  for (const item of progress) {
    const name = item.exercise.name || "Exercício não identificado";
    const effort = normalize(item.effort);
    const status = normalize(item.status);

    if (effort === "FACIL" || effort === "FÁCIL") {
      easy.set(name, (easy.get(name) || 0) + 1);
    }
    if (effort === "DIFICIL" || effort === "DIFÍCIL") {
      difficult.set(name, (difficult.get(name) || 0) + 1);
    }
    if (["NAO_REALIZADO", "NÃO_REALIZADO", "PULADO", "SKIPPED"].includes(status) || item.skipReason) {
      const current = skipped.get(name) || { count: 0, reasons: new Set<string>() };
      current.count += 1;
      if (item.skipReason?.trim()) current.reasons.add(item.skipReason.trim());
      skipped.set(name, current);
    }
  }

  const completed = workouts.filter((item) => normalize(item.status) === "CONCLUIDO" || normalize(item.status) === "CONCLUÍDO").length;
  const partial = workouts.filter((item) => normalize(item.status) === "PARCIAL").length;
  const pendingOrMissed = workouts.length - completed - partial;
  const adherenceRate = workouts.length ? Math.round((completed / workouts.length) * 100) : 0;
  const adherenceSummary = workouts.length
    ? `${completed} concluído(s), ${partial} parcial(is) e ${pendingOrMissed} pendente(s)/não concluído(s) nos últimos 84 dias (${adherenceRate}% de conclusão).`
    : "Sem treinos registrados nos últimos 84 dias.";

  const sortCounts = (map: Map<string, number>) =>
    Array.from(map.entries())
      .map(([exerciseName, count]) => ({ exerciseName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

  return {
    exerciseSignals: {
      easy: sortCounts(easy),
      difficult: sortCounts(difficult),
      skipped: Array.from(skipped.entries())
        .map(([exerciseName, value]) => ({ exerciseName, count: value.count, reasons: Array.from(value.reasons) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
    },
    adherence: { completed, partial, pendingOrMissed, summary: adherenceSummary },
    activePreferences: preferences,
    approvedMemories: memories,
    openCareEvents: careEvents,
  };
}


function parseMemorySummary(value: string): {
  summary: string;
  permanence?: string;
  confidence?: string;
  sourceEvidence?: string[];
  structuredData?: Record<string, unknown>;
} {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      const environmentSummary = Array.isArray(parsed.availableEquipment)
        ? `Ambiente ${String(parsed.type || "UNKNOWN")}; nível ${String(parsed.equipmentLevel || "UNKNOWN")}; equipamentos: ${parsed.availableEquipment.map((item: unknown) => String(item)).join(", ") || "não informados"}.`
        : "";

      return {
        summary: String(parsed.summary || parsed.summaryForTraining || environmentSummary || value).trim(),
        permanence: parsed.permanence ? String(parsed.permanence) : undefined,
        confidence: parsed.confidence ? String(parsed.confidence) : undefined,
        sourceEvidence: Array.isArray(parsed.sourceEvidence)
          ? parsed.sourceEvidence.map((item: unknown) => String(item)).slice(0, 10)
          : undefined,
        structuredData: parsed,
      };
    }
  } catch {
    // Memórias antigas podem conter texto simples.
  }
  return { summary: value };
}

function groupApprovedMemories(memories: TechnicalContext["approvedMemories"]) {
  const groups: Record<string, any[]> = {
    permanentHealth: [],
    temporaryHealth: [],
    medicalGuidance: [],
    positivePreferences: [],
    negativePreferences: [],
    performanceSignals: [],
    preferredExercises: [],
    avoidedExercises: [],
    availableEquipment: [],
    trainingEnvironment: [],
    documentAnalyses: [],
    other: [],
  };

  const categoryMap: Record<string, keyof typeof groups> = {
    HEALTH_PERMANENT: "permanentHealth",
    HEALTH_TEMPORARY: "temporaryHealth",
    MEDICAL_GUIDANCE: "medicalGuidance",
    PREFERENCE_POSITIVE: "positivePreferences",
    PREFERENCE_NEGATIVE: "negativePreferences",
    PERFORMANCE_SIGNAL: "performanceSignals",
    EXERCISE_PREFERRED: "preferredExercises",
    EXERCISE_AVOID: "avoidedExercises",
    EQUIPMENT_AVAILABLE: "availableEquipment",
    TRAINING_ENVIRONMENT: "trainingEnvironment",
    DOCUMENT_ANALYSIS: "documentAnalyses",
    DOCUMENT: "documentAnalyses",
  };

  for (const item of memories) {
    const parsed = parseMemorySummary(item.summary);
    const group = categoryMap[String(item.category || "").toUpperCase()] || "other";
    groups[group].push({
      title: item.title,
      summary: parsed.summary,
      permanence: parsed.permanence || (item.validUntil ? "TEMPORARY" : "UNTIL_UPDATED"),
      confidence: parsed.confidence || "NOT_INFORMED",
      sourceEvidence: parsed.sourceEvidence || [],
      structuredData: parsed.structuredData || null,
      sourceDocumentName: item.sourceDocumentName,
      validUntil: item.validUntil?.toISOString().slice(0, 10) || null,
      updatedAt: item.updatedAt.toISOString(),
    });
  }

  return groups;
}

export function formatStudentTechnicalContext(context: TechnicalContext): string {
  return JSON.stringify(
    {
      adherence: context.adherence,
      exerciseHistory: context.exerciseSignals,
      activePreferences: context.activePreferences,
      intelligentMemory: groupApprovedMemories(context.approvedMemories),
      approvedTechnicalMemoryTimeline: context.approvedMemories.map((item) => ({
        category: item.category,
        title: item.title,
        ...parseMemorySummary(item.summary),
        sourceDocumentName: item.sourceDocumentName,
        validUntil: item.validUntil?.toISOString().slice(0, 10) || null,
        updatedAt: item.updatedAt.toISOString(),
      })),
      openCareEvents: context.openCareEvents,
      interpretationRules: [
        "Fácil repetidamente: considerar progressão moderada somente se não houver dor, evento de cuidado ou baixa adesão.",
        "Difícil: manter, regredir ou simplificar; não aumentar automaticamente.",
        "Não realizado por dor/desconforto: não repetir automaticamente e exigir revisão humana.",
        "Não entendeu: preferir alternativa mais simples e orientação técnica clara.",
        "Sem equipamento: usar somente equipamento confirmado ou peso corporal.",
        "Equipamentos registrados em availableEquipment podem orientar a montagem, mas o professor deve validar disponibilidade, integridade e forma segura de uso.",
        "O perfil consolidado em trainingEnvironment deve ser priorizado para definir local, nível de recursos e possibilidades de treino, sempre respeitando a data e a confiança registradas.",
        "A ausência de equipamento não significa obrigação de compra; prefira alternativas compatíveis com os recursos confirmados.",
        "Falta de tempo: reduzir duração/volume preservando o objetivo principal.",
        "Informações de documentos só podem ser usadas quando estiverem APPROVED na memória técnica.",
        "Memórias permanentes continuam válidas até nova evidência aprovada que as substitua.",
        "Memórias temporárias vencidas não devem orientar progressão ou restrição atual.",
        "Preferências e sinais de desempenho não equivalem a diagnóstico ou restrição médica.",
        "Quando houver conflito, priorizar a memória mais recente e sinalizar revisão humana.",
      ],
    },
    null,
    2
  );
}

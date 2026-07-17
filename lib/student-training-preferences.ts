import { prisma } from "@/lib/prisma";

export type TrainingPreferenceCategory =
  | "CARDIO_CORRIDA"
  | "AMBIENTE_TREINO"
  | "EXERCICIO_EVITAR"
  | "EXERCICIO_PRIORIZAR"
  | "ROTINA_TREINO"
  | "PREFERENCIA_GERAL";

export type TrainingPreferenceClassification = {
  hasSignal: boolean;
  category: TrainingPreferenceCategory;
  summary: string;
};

export type CareSignalClassification = {
  hasSignal: boolean;
  isCritical: boolean;
  requiresTrainingPause: boolean;
  eventType: "RELATO_DOR_DUVIDA" | "PAUSA_POR_CUIDADO";
  severity: "ALERTA" | "CUIDADO";
  status: "ABERTO" | "REQUER_REVISAO";
};

export type RegisterTrainingPreferenceInput = {
  sourceMessageId: string;
  sourceConversationId: string;
  studentId: string;
  professorId?: string | null;
  content: string;
  source?: "CHAT" | "WORKOUT_COMPLETION";
  referenceDate?: Date;
};

export function normalizeTrainingPreferenceText(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export function classifyCareSignal(content: string): CareSignalClassification {
  const text = normalizeTrainingPreferenceText(content);
  const paddedText = ` ${text} `;

  const emptyResult: CareSignalClassification = {
    hasSignal: false,
    isCritical: false,
    requiresTrainingPause: false,
    eventType: "RELATO_DOR_DUVIDA",
    severity: "ALERTA",
    status: "ABERTO",
  };

  if (!text) return emptyResult;

  const trainingPauseKeywords = [
    "nao consigo treinar",
    "nao consigo fazer treino",
    "nao consigo fazer o treino",
    "nao consigo me exercitar",
    "nao vou conseguir treinar",
    "nao posso treinar",
    "sem condicao de treinar",
    "sem condicoes de treinar",
    "sem condicao para treinar",
    "sem condicoes para treinar",
    "impossibilitado de treinar",
    "impossibilitada de treinar",
    "preciso parar de treinar",
    "vou ter que parar de treinar",
    "medico mandou parar",
    "medica mandou parar",
    "fisioterapeuta mandou parar",
    "estou de repouso",
    "repouso medico",
    "atestado",
    "fratura",
    "fraturei",
    "quebrei",
    "gesso",
    "imobilizado",
    "imobilizada",
    "bota ortopedica",
    "muleta",
    "cirurgia",
    "operei",
    "operacao",
    "hospital",
    "emergencia",
    "acidente",
    "cai e machuquei",
    "cai e nao consigo",
    "nao consigo apoiar",
    "nao consigo andar",
    "nao consigo levantar",
    "nao consigo mexer",
    "nao consigo mover",
  ];

  const requiresTrainingPause = includesAny(text, trainingPauseKeywords);

  /*
   * Partes do corpo, sozinhas, não são sinal de cuidado.
   * Ex.: "prefiro treinar ombro na terça" não cria evento.
   * É necessário haver dor, desconforto, lesão, alteração física ou limitação.
   */
  const bodyAreas = [
    "lombar",
    "coluna",
    "ciatico",
    "cervical",
    "ombro",
    "joelho",
    "tornozelo",
    "punho",
    "quadril",
    "panturrilha",
    "cotovelo",
    "braco",
    "perna",
    "coxa",
    "calcanhar",
  ];

  const physicalCareTerms = [
    "dor",
    "doendo",
    "dolorido",
    "dolorida",
    "desconforto",
    "machuquei",
    "machucou",
    "machucado",
    "machucada",
    "lesao",
    "lesionei",
    "torci",
    "torceu",
    "torsao",
    "torcao",
    "tontura",
    "tonto",
    "falta de ar",
    "formigamento",
    "fisgada",
    "travou",
    "travado",
    "travada",
    "inchado",
    "inchada",
    "inchou",
    "inflamado",
    "inflamada",
    "desmaio",
    "desmaiei",
    "sangramento",
    "queimacao",
    "ardencia",
    "limitacao de movimento",
    "nao consigo apoiar",
    "nao consigo mexer",
    "nao consigo mover",
  ];

  const mentionsBodyArea = includesAny(text, bodyAreas) || /(^|\s)pe(\s|$)/.test(paddedText);
  const hasPhysicalCareTerm = includesAny(text, physicalCareTerms);
  const hasBodyAreaWithCareContext = mentionsBodyArea && hasPhysicalCareTerm;
  const hasGeneralCareSignal = requiresTrainingPause || hasPhysicalCareTerm || hasBodyAreaWithCareContext;

  if (!hasGeneralCareSignal) return emptyResult;

  const criticalCareKeywords = [
    "dor forte",
    "dor intensa",
    "dor aguda",
    "dor insuportavel",
    "muita dor",
    "muito dolorido",
    "muito dolorida",
    "nao consigo",
    "torci",
    "torceu",
    "torsao",
    "torcao",
    "inchado",
    "inchada",
    "inchou",
    "inchei",
    "fisgada",
    "travou",
    "travei",
    "queda",
    "cai",
    "caiu",
    "machuquei",
    "lesionei",
    "lesao",
    "tontura",
    "tonto",
    "falta de ar",
    "formigamento",
    "desmaio",
    "desmaiei",
  ];

  const isCritical = requiresTrainingPause || includesAny(text, criticalCareKeywords);

  return {
    hasSignal: true,
    isCritical,
    requiresTrainingPause,
    eventType: requiresTrainingPause ? "PAUSA_POR_CUIDADO" : "RELATO_DOR_DUVIDA",
    severity: isCritical ? "CUIDADO" : "ALERTA",
    status: isCritical ? "REQUER_REVISAO" : "ABERTO",
  };
}

export function classifyTrainingPreference(content: string): TrainingPreferenceClassification {
  const original = String(content || "").trim();
  const text = normalizeTrainingPreferenceText(original);

  if (!text) {
    return {
      hasSignal: false,
      category: "PREFERENCIA_GERAL",
      summary: "",
    };
  }

  const preferenceCues = [
    "eu prefiro",
    "prefiro",
    "eu costumo",
    "costumo",
    "nao quero",
    "nao gostaria",
    "nao gosto",
    "gosto mais",
    "quero focar",
    "foco na",
    "foco em",
    "somente",
    "apenas",
    "so no",
    "so na",
    "evito",
    "para mim e melhor",
    "funciona melhor para mim",
  ];

  const trainingTopics = [
    "treino",
    "academia",
    "musculacao",
    "cardio",
    "corrida",
    "correr",
    "exercicio",
    "carga",
    "serie",
    "repeticao",
    "alongamento",
    "mobilidade",
    "funcional",
    "bicicleta",
    "esteira",
    "bike",
    "ombro",
    "joelho",
    "perna",
    "braco",
    "costas",
    "peito",
  ];

  const hasPreferenceCue = includesAny(text, preferenceCues);
  const hasTrainingTopic = includesAny(text, trainingTopics);

  if (!hasPreferenceCue || !hasTrainingTopic) {
    return {
      hasSignal: false,
      category: "PREFERENCIA_GERAL",
      summary: "",
    };
  }

  const mentionsCardio = includesAny(text, ["cardio", "esteira", "bicicleta", "bike", "aerobico"]);
  const mentionsRunning = includesAny(text, ["corrida", "correr", "rua"]);
  const mentionsGymStrength = includesAny(text, ["academia", "musculacao", "forca"]);

  if (mentionsCardio && mentionsRunning && mentionsGymStrength) {
    return {
      hasSignal: true,
      category: "CARDIO_CORRIDA",
      summary:
        "Nos dias de academia, priorizar musculação. Manter o cardio nos dias de corrida de rua, salvo nova orientação do aluno ou decisão técnica do professor.",
    };
  }

  if (includesAny(text, ["em casa", "na academia", "ao ar livre", "parque"])) {
    return {
      hasSignal: true,
      category: "AMBIENTE_TREINO",
      summary: `Preferência de ambiente registrada pelo aluno: ${original}`,
    };
  }

  if (includesAny(text, ["nao quero", "nao gosto", "evito"])) {
    return {
      hasSignal: true,
      category: "EXERCICIO_EVITAR",
      summary: `Evitar ou substituir conforme revisão do professor: ${original}`,
    };
  }

  if (includesAny(text, ["prefiro", "quero focar", "gosto mais", "foco na", "foco em"])) {
    return {
      hasSignal: true,
      category: "EXERCICIO_PRIORIZAR",
      summary: `Prioridade de treino informada pelo aluno: ${original}`,
    };
  }

  if (includesAny(text, ["dias", "horario", "rotina", "quando vou"])) {
    return {
      hasSignal: true,
      category: "ROTINA_TREINO",
      summary: `Preferência de rotina registrada pelo aluno: ${original}`,
    };
  }

  return {
    hasSignal: true,
    category: "PREFERENCIA_GERAL",
    summary: `Preferência de treino registrada pelo aluno: ${original}`,
  };
}

function getWeekRange(referenceDate: Date): { startOfWeek: Date; endOfWeek: Date } {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);

  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() + diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  return { startOfWeek, endOfWeek };
}

export async function registerTrainingPreferenceFromStudentMessage({
  sourceMessageId,
  sourceConversationId,
  studentId,
  professorId,
  content,
  source = "CHAT",
  referenceDate = new Date(),
}: RegisterTrainingPreferenceInput) {
  const careClassification = classifyCareSignal(content);

  if (careClassification.hasSignal) return null;

  const preference = classifyTrainingPreference(content);

  if (!preference.hasSignal) return null;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!student) return null;

  const { startOfWeek, endOfWeek } = getWeekRange(referenceDate);

  /*
   * Só um treino realmente aberto pode ser adaptado.
   * PRE_PLANEJADO, PRECISA_REVISAO, CONCLUIDO, INTERROMPIDO_CUIDADO e
   * NAO_CONCLUIDO_COM_RELATO não são considerados treino pendente.
   */
  const pendingWorkout = await prisma.workout.findFirst({
    where: {
      studentId,
      status: {
        in: ["PENDENTE"],
      },
      date: {
        gte: startOfWeek,
        lt: endOfWeek,
      },
    },
    orderBy: {
      date: "asc",
    },
    select: {
      id: true,
      workoutPlanId: true,
    },
  });

  const effectiveProfessorId = professorId || student.userId || null;
  const currentWeekAction = pendingWorkout ? "PENDING" : "NOT_APPLICABLE";

  return prisma.$transaction(async (tx) => {
    await tx.studentTrainingPreference.updateMany({
      where: {
        studentId,
        category: preference.category,
        status: "ACTIVE",
        sourceQuestionId: {
          not: sourceMessageId,
        },
      },
      data: {
        status: "SUPERSEDED",
        currentWeekAction: "HANDLED",
        handledAt: new Date(),
      },
    });

    return tx.studentTrainingPreference.upsert({
      where: {
        sourceQuestionId: sourceMessageId,
      },
      update: {
        professorId: effectiveProfessorId,
        sourceConversationId,
        source,
        category: preference.category,
        summary: preference.summary,
        originalMessage: content,
        status: "ACTIVE",
        currentWeekAction,
        relatedWorkoutId: pendingWorkout?.id || null,
        relatedWorkoutPlanId: pendingWorkout?.workoutPlanId || null,
        handledAt: null,
        handledById: null,
      },
      create: {
        studentId,
        professorId: effectiveProfessorId,
        sourceConversationId,
        sourceQuestionId: sourceMessageId,
        source,
        category: preference.category,
        summary: preference.summary,
        originalMessage: content,
        status: "ACTIVE",
        currentWeekAction,
        relatedWorkoutId: pendingWorkout?.id || null,
        relatedWorkoutPlanId: pendingWorkout?.workoutPlanId || null,
      },
    });
  });
}

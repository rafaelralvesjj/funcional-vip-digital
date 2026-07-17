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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Verifica palavras ou frases completas.
 * Evita que "costumo" seja confundido com "acostumado".
 */
function includesPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeTrainingPreferenceText(phrase);
  if (!normalizedPhrase) return false;

  const pattern = normalizedPhrase
    .split(" ")
    .filter(Boolean)
    .map(escapeRegExp)
    .join("\\s+");

  return new RegExp(`(^|[^a-z0-9])${pattern}($|[^a-z0-9])`, "i").test(text);
}

function includesAnyPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => includesPhrase(text, phrase));
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

  const noPreference: TrainingPreferenceClassification = {
    hasSignal: false,
    category: "PREFERENCIA_GERAL",
    summary: "",
  };

  if (!text) return noPreference;

  /*
   * Relatos de experiência ou nível não são, por si só, pedidos de mudança.
   * Ex.: "estou acostumado com um nível mais avançado de treino".
   * Eles permanecem na conversa, mas não abrem evento de preferência.
   */
  const experienceOrLevelCues = [
    "estou acostumado",
    "estou acostumada",
    "sou acostumado",
    "sou acostumada",
    "tenho experiencia",
    "ja tenho experiencia",
    "tenho bastante experiencia",
    "ja treino ha",
    "treino ha anos",
    "meu nivel e",
    "meu nivel de treino",
    "nivel iniciante",
    "nivel intermediario",
    "nivel avancado",
    "sou iniciante",
    "sou intermediario",
    "sou intermediaria",
    "sou avancado",
    "sou avancada",
  ];

  /*
   * Para virar preferência, o texto precisa demonstrar escolha, restrição,
   * prioridade ou pedido de ajuste. Apenas descrever capacidade não basta.
   */
  const actionablePreferenceCues = [
    "eu prefiro",
    "prefiro",
    "eu quero",
    "quero",
    "gostaria",
    "nao quero",
    "nao gostaria",
    "nao gosto",
    "gosto mais",
    "quero focar",
    "quero priorizar",
    "priorizar",
    "focar na",
    "focar no",
    "focar em",
    "foco na",
    "foco no",
    "foco em",
    "somente",
    "apenas",
    "so no",
    "so na",
    "evito",
    "prefiro evitar",
    "quero evitar",
    "pode incluir",
    "pode tirar",
    "pode retirar",
    "quero incluir",
    "quero retirar",
    "quero trocar",
    "quero substituir",
    "quero aumentar",
    "quero diminuir",
    "preciso ajustar",
    "para mim e melhor",
    "funciona melhor para mim",
  ];

  const habitCues = ["eu costumo", "costumo"];
  const habitWithChoiceCues = [
    "somente",
    "apenas",
    "so no",
    "so na",
    "nao quero",
    "nao gosto",
    "evito",
    "focar na",
    "focar no",
    "focar em",
    "foco na",
    "foco no",
    "foco em",
    "priorizo",
    "quando vou",
    "nos dias",
  ];

  const trainingTopics = [
    "treino",
    "treinos",
    "academia",
    "musculacao",
    "cardio",
    "corrida",
    "correr",
    "exercicio",
    "exercicios",
    "carga",
    "cargas",
    "serie",
    "series",
    "repeticao",
    "repeticoes",
    "intensidade",
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

  const hasTrainingTopic = includesAnyPhrase(text, trainingTopics);
  if (!hasTrainingTopic) return noPreference;

  const hasExperienceOrLevelStatement = includesAnyPhrase(text, experienceOrLevelCues);
  const hasActionablePreference = includesAnyPhrase(text, actionablePreferenceCues);
  const hasHabitCue = includesAnyPhrase(text, habitCues);
  const habitExpressesChoice =
    hasHabitCue && includesAnyPhrase(text, habitWithChoiceCues);

  /*
   * Uma declaração de nível/experiência só vira preferência quando também
   * contém um pedido claro, por exemplo:
   * "sou avançado e prefiro treinos mais intensos".
   */
  if (hasExperienceOrLevelStatement && !hasActionablePreference) {
    return noPreference;
  }

  if (!hasActionablePreference && !habitExpressesChoice) {
    return noPreference;
  }

  const mentionsCardio = includesAnyPhrase(text, [
    "cardio",
    "esteira",
    "bicicleta",
    "bike",
    "aerobico",
  ]);
  const mentionsRunning = includesAnyPhrase(text, ["corrida", "correr", "rua"]);
  const mentionsGymStrength = includesAnyPhrase(text, [
    "academia",
    "musculacao",
    "forca",
  ]);

  if (mentionsCardio && mentionsRunning && mentionsGymStrength) {
    return {
      hasSignal: true,
      category: "CARDIO_CORRIDA",
      summary:
        "Nos dias de academia, priorizar musculação. Manter o cardio nos dias de corrida de rua, salvo nova orientação do aluno ou decisão técnica do professor.",
    };
  }

  if (includesAnyPhrase(text, ["em casa", "na academia", "ao ar livre", "parque"])) {
    return {
      hasSignal: true,
      category: "AMBIENTE_TREINO",
      summary: `Preferência de ambiente registrada pelo aluno: ${original}`,
    };
  }

  if (
    includesAnyPhrase(text, [
      "nao quero",
      "nao gosto",
      "evito",
      "prefiro evitar",
      "quero evitar",
      "quero retirar",
      "pode tirar",
      "pode retirar",
    ])
  ) {
    return {
      hasSignal: true,
      category: "EXERCICIO_EVITAR",
      summary: `Evitar ou substituir conforme revisão do professor: ${original}`,
    };
  }

  if (
    includesAnyPhrase(text, [
      "prefiro",
      "quero focar",
      "quero priorizar",
      "priorizar",
      "focar na",
      "focar no",
      "focar em",
      "foco na",
      "foco no",
      "foco em",
      "gosto mais",
    ])
  ) {
    return {
      hasSignal: true,
      category: "EXERCICIO_PRIORIZAR",
      summary: `Prioridade de treino informada pelo aluno: ${original}`,
    };
  }

  if (includesAnyPhrase(text, ["dias", "horario", "rotina", "quando vou"])) {
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

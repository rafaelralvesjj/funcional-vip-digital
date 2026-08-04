import { prisma } from "@/lib/prisma";

export type TrainingPreferenceCategory =
  | "CARDIO_CORRIDA"
  | "AMBIENTE_TREINO"
  | "EQUIPAMENTOS"
  | "OBJETIVO_TREINO"
  | "INTENSIDADE_VOLUME"
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

function matchesAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasTrainingReference(text: string): boolean {
  return includesAnyPhrase(text, [
    "treino",
    "treinos",
    "treinar",
    "exercicio",
    "exercicios",
    "atividade fisica",
    "academia",
    "musculacao",
    "corrida",
    "correr",
  ]);
}

export function classifyCareSignal(content: string): CareSignalClassification {
  const text = normalizeTrainingPreferenceText(content);

  const emptyResult: CareSignalClassification = {
    hasSignal: false,
    isCritical: false,
    requiresTrainingPause: false,
    eventType: "RELATO_DOR_DUVIDA",
    severity: "ALERTA",
    status: "ABERTO",
  };

  if (!text) return emptyResult;

  const bodyAreaPatterns = [
    /\bcabeca\b/,
    /\bpescoco\b/,
    /\bcervical\b/,
    /\bombro?s?\b/,
    /\bbraco?s?\b/,
    /\bcotovelo?s?\b/,
    /\bpunho?s?\b/,
    /\bmao?s?\b/,
    /\bdedo?s?\b/,
    /\bpeito\b/,
    /\btorax\b/,
    /\bcostas?\b/,
    /\bcoluna\b/,
    /\blombar\b/,
    /\bciatico\b/,
    /\bquadril\b/,
    /\bvirilha\b/,
    /\bgluteo?s?\b/,
    /\bcoxa?s?\b/,
    /\bjoelho?s?\b/,
    /\bpanturrilha?s?\b/,
    /\bcanela?s?\b/,
    /\btornozelo?s?\b/,
    /\bcalcanhar(?:es)?\b/,
    /\bpes?\b/,
    /\bperna?s?\b/,
  ];

  const symptomPatterns = [
    /\bdor(?:es)?\b/,
    /\bdoendo\b/,
    /\bdolori(?:do|da|dos|das)\b/,
    /\bdesconforto\b/,
    /\bincomodo\b/,
    /\bfisgada\b/,
    /\bformigamento\b/,
    /\bqueimacao\b/,
    /\bardencia\b/,
    /\bincha(?:do|da|dos|das|co|cou|ei)\b/,
    /\binflama(?:do|da|cao)\b/,
    /\btrava(?:do|da|dos|das|ou|ei)\b/,
    /\blimita(?:cao|do|da)\b/,
    /\bsem movimento\b/,
    /\bperdi movimento\b/,
    /\bnao consigo apoiar\b/,
    /\bnao consigo andar\b/,
    /\bnao consigo mexer\b/,
    /\bnao consigo mover\b/,
    /\btontura\b/,
    /\btonto\b/,
    /\bfalta de ar\b/,
    /\bdesmaio\b/,
    /\bdesmaiei\b/,
    /\bsangramento\b/,
  ];

  const injuryPatterns = [
    /\bmachu(?:quei|cou|cado|cada|car)\b/,
    /\bles(?:ao|ionei|ionado|ionada)\b/,
    /\bfratur(?:a|ei|ado|ada)\b/,
    /\bquebrei\b/,
    /\btorc(?:i|eu|endo|ao|ido|ida)\b/,
    /\bentorse\b/,
    /\bdistensao\b/,
  ];

  const accidentPatterns = [
    /\bacidente\b/,
    /\bqueda\b/,
    /\bcai\b/,
    /\bcaiu\b/,
    /\bescorreguei\b/,
    /\btropecei\b/,
    /\bbati\b/,
  ];

  const medicalPausePatterns = [
    /\bmedic[oa] mandou parar\b/,
    /\bfisioterapeuta mandou parar\b/,
    /\borientacao medic[ao]\b/,
    /\brepouso medic[oa]\b/,
    /\bestou de repouso\b/,
    /\batestado\b/,
    /\bgesso\b/,
    /\bimobiliza(?:do|da)\b/,
    /\bbota ortopedica\b/,
    /\bmuleta\b/,
    /\bcirurgia\b/,
    /\boperei\b/,
    /\bhospital\b/,
    /\bemergencia\b/,
  ];

  const explicitTrainingStopPatterns = [
    /\bnao consigo treinar\b/,
    /\bnao consigo fazer (?:o )?treino\b/,
    /\bnao consigo me exercitar\b/,
    /\bnao vou conseguir treinar\b/,
    /\bnao posso treinar\b/,
    /\bsem condic(?:ao|oes) (?:de|para) treinar\b/,
    /\bimpossibilitad[oa] de treinar\b/,
    /\bpreciso parar de treinar\b/,
    /\bter que parar de treinar\b/,
  ];

  const trainingUncertaintyPatterns = [
    /\bnao sei se (?:eu )?(?:vou conseguir|consigo|posso|devo) treinar\b/,
    /\bnao se se (?:eu )?(?:vou conseguir|consigo|posso|devo) treinar\b/,
    /\bsera que (?:eu )?(?:vou conseguir|consigo|posso|devo) treinar\b/,
    /\bacho que nao (?:vou conseguir|consigo|posso) treinar\b/,
    /\btalvez (?:eu )?nao (?:consiga|possa) treinar\b/,
    /\btenho duvida se (?:vou conseguir|consigo|posso|devo) treinar\b/,
    /\b(?:posso|consigo|devo) treinar (?:hoje|amanha|depois)?\??\b/,
    /\bda para treinar (?:hoje|amanha|depois)?\??\b/,
  ];

  const severePatterns = [
    /\bdor (?:muito )?(?:forte|intensa|aguda|insuportavel)\b/,
    /\bmuita dor\b/,
    /\bnao consigo apoiar\b/,
    /\bnao consigo andar\b/,
    /\bnao consigo levantar\b/,
    /\bdesmaio\b/,
    /\bdesmaiei\b/,
    /\bfalta de ar\b/,
    /\bsangramento\b/,
    /\bfratur(?:a|ei|ado|ada)\b/,
    /\bquebrei\b/,
  ];

  const mentionsBodyArea = matchesAnyPattern(text, bodyAreaPatterns);
  const hasSymptom = matchesAnyPattern(text, symptomPatterns);
  const hasInjuryWord = matchesAnyPattern(text, injuryPatterns);
  const hasAccidentWord = matchesAnyPattern(text, accidentPatterns);
  const hasMedicalPause = matchesAnyPattern(text, medicalPausePatterns);
  const explicitTrainingStop = matchesAnyPattern(text, explicitTrainingStopPatterns);
  const hasTrainingUncertainty =
    hasTrainingReference(text) && matchesAnyPattern(text, trainingUncertaintyPatterns);

  const injuryInPhysicalContext =
    hasInjuryWord && (mentionsBodyArea || hasSymptom || hasAccidentWord);
  const accidentInPhysicalContext =
    hasAccidentWord && (mentionsBodyArea || hasSymptom || hasInjuryWord);
  const physicalSignal =
    hasSymptom ||
    injuryInPhysicalContext ||
    accidentInPhysicalContext ||
    hasMedicalPause ||
    explicitTrainingStop;

  if (!physicalSignal) return emptyResult;

  const isAcuteInjury = injuryInPhysicalContext || accidentInPhysicalContext;
  const requiresTrainingPause =
    explicitTrainingStop ||
    hasMedicalPause ||
    matchesAnyPattern(text, severePatterns) ||
    (isAcuteInjury && hasTrainingUncertainty);

  const isCritical =
    requiresTrainingPause ||
    isAcuteInjury ||
    matchesAnyPattern(text, severePatterns);

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

  const explicitChangePatterns = [
    /\bquero\b/,
    /\bgostaria\b/,
    /\bprefiro\b/,
    /\bnao quero\b/,
    /\bnao gosto\b/,
    /\bevito\b/,
    /\bpreciso ajustar\b/,
    /\bpreciso mudar\b/,
    /\bpode adaptar\b/,
    /\badapte\b/,
    /\badaptar\b/,
    /\bpode trocar\b/,
    /\bquero trocar\b/,
    /\bquero substituir\b/,
    /\bpode substituir\b/,
    /\bquero incluir\b/,
    /\bpode incluir\b/,
    /\bquero retirar\b/,
    /\bpode retirar\b/,
    /\bpode tirar\b/,
    /\bquero aumentar\b/,
    /\bquero diminuir\b/,
    /\bquero focar\b/,
    /\bquero priorizar\b/,
    /\bpara mim e melhor\b/,
    /\bfunciona melhor para mim\b/,
  ];

  const environmentPatterns = [
    /\bem casa\b/,
    /\bna academia\b/,
    /\bao ar livre\b/,
    /\bno parque\b/,
    /\bno hotel\b/,
    /\bno condominio\b/,
    /\bviajando\b/,
    /\bviagem\b/,
  ];

  const environmentChangePatterns = [
    /\b(?:agora|este mes|esse mes|essa semana|temporariamente) (?:eu )?(?:vou )?(?:treinar|fazer os treinos?) (?:em casa|na academia|ao ar livre|no parque|no hotel|no condominio)\b/,
    /\b(?:vou|passarei a) (?:treinar|fazer os treinos?) (?:em casa|na academia|ao ar livre|no parque|no hotel|no condominio)\b/,
    /\bmudei (?:para|de) (?:academia|casa|local)\b/,
    /\bnao vou mais (?:para a academia|treinar na academia|treinar em casa)\b/,
    /\bso vou (?:treinar|fazer treino) (?:em casa|na academia|ao ar livre)\b/,
  ];

  const equipmentTerms = [
    "halter",
    "halteres",
    "anilha",
    "anilhas",
    "colchonete",
    "elastico",
    "faixa elastica",
    "mini band",
    "miniband",
    "trx",
    "banco",
    "degrau",
    "esteira",
    "bicicleta",
    "bike",
    "caneleira",
    "bola",
    "medicine ball",
    "kettlebell",
    "barra",
    "polia",
    "leg press",
    "maquina",
    "maquinas",
    "aparelho",
    "aparelhos",
    "equipamento",
    "equipamentos",
  ];

  const equipmentChangePatterns = [
    /\b(?:tenho|possuo|comprei|ganhei|adquiri|arrumei|consegui)\b/,
    /\b(?:nao tenho|nao possuo|estou sem|fiquei sem|nao funciona|quebrou|quebraram)\b/,
    /\b(?:a academia|o local|o hotel) (?:tem|nao tem|possui|nao possui)\b/,
    /\bso tenho\b/,
  ];

  const routinePatterns = [
    /\b(?:agora|este mes|esse mes|essa semana) (?:so )?(?:posso|consigo|vou conseguir) treinar\b/,
    /\bnao consigo mais treinar\b/,
    /\bmudei (?:meus )?(?:dias|horario|rotina)\b/,
    /\b(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b/,
    /\bde manha\b/,
    /\ba tarde\b/,
    /\ba noite\b/,
    /\b\d+\s*(?:x|vezes) por semana\b/,
  ];

  const goalPatterns = [
    /\bmeu objetivo mudou\b/,
    /\bnovo objetivo\b/,
    /\bquero emagrecer\b/,
    /\bquero ganhar massa\b/,
    /\bquero ganhar forca\b/,
    /\bquero melhorar (?:a )?corrida\b/,
    /\bquero correr\b/,
    /\bme inscrevi (?:em|para) (?:uma )?(?:prova|corrida|meia maratona|maratona)\b/,
    /\btenho (?:uma )?(?:prova|corrida|meia maratona|maratona)\b/,
    /\bpreparar para (?:uma )?(?:prova|corrida|meia maratona|maratona)\b/,
  ];

  const intensityPatterns = [
    /\bmuito leve\b/,
    /\bmuito facil\b/,
    /\bmuito dificil\b/,
    /\bmais intenso\b/,
    /\bmais intensidade\b/,
    /\bmenos intenso\b/,
    /\bmenos intensidade\b/,
    /\baumentar (?:a )?(?:carga|volume|series|repeticoes)\b/,
    /\bdiminuir (?:a )?(?:carga|volume|series|repeticoes)\b/,
    /\breduzir (?:a )?(?:carga|volume|series|repeticoes)\b/,
  ];

  const exerciseAvoidPatterns = [
    /\bnao quero\b/,
    /\bnao gosto\b/,
    /\bevito\b/,
    /\bprefiro evitar\b/,
    /\bquero evitar\b/,
    /\bquero retirar\b/,
    /\bpode tirar\b/,
    /\bpode retirar\b/,
    /\bquero substituir\b/,
    /\bpode substituir\b/,
  ];

  const exercisePriorityPatterns = [
    /\bprefiro\b/,
    /\bquero focar\b/,
    /\bquero priorizar\b/,
    /\bpriorizar\b/,
    /\bfocar (?:na|no|em)\b/,
    /\bgosto mais\b/,
    /\bpode incluir\b/,
    /\bquero incluir\b/,
  ];

  const experienceOnlyPatterns = [
    /\bestou acostumad[oa]\b/,
    /\bsou acostumad[oa]\b/,
    /\btenho experiencia\b/,
    /\bja tenho experiencia\b/,
    /\bmeu nivel e\b/,
    /\bnivel (?:iniciante|intermediario|avancado)\b/,
    /\bsou (?:iniciante|intermediari[oa]|avancad[oa])\b/,
  ];

  const hasExplicitChange = matchesAnyPattern(text, explicitChangePatterns);
  const mentionsEnvironment = matchesAnyPattern(text, environmentPatterns);
  const hasEnvironmentChange = matchesAnyPattern(text, environmentChangePatterns);
  const mentionsEquipment = includesAnyPhrase(text, equipmentTerms);
  const hasEquipmentChange =
    mentionsEquipment && matchesAnyPattern(text, equipmentChangePatterns);
  const hasRoutineChange = matchesAnyPattern(text, routinePatterns);
  const hasGoalChange = matchesAnyPattern(text, goalPatterns);
  const hasIntensityChange = matchesAnyPattern(text, intensityPatterns);
  const experienceOnly = matchesAnyPattern(text, experienceOnlyPatterns);

  const mentionsTrainingTopic =
    hasTrainingReference(text) ||
    mentionsEnvironment ||
    mentionsEquipment ||
    hasGoalChange ||
    hasIntensityChange;

  if (!mentionsTrainingTopic) return noPreference;

  if (
    experienceOnly &&
    !hasExplicitChange &&
    !hasEnvironmentChange &&
    !hasEquipmentChange &&
    !hasRoutineChange &&
    !hasGoalChange &&
    !hasIntensityChange
  ) {
    return noPreference;
  }

  if (hasEquipmentChange) {
    return {
      hasSignal: true,
      category: "EQUIPAMENTOS",
      summary: `Mudança de equipamento ou recurso informada pelo aluno: ${original}`,
    };
  }

  if (hasEnvironmentChange || (mentionsEnvironment && hasExplicitChange)) {
    return {
      hasSignal: true,
      category: "AMBIENTE_TREINO",
      summary: `Mudança ou preferência de ambiente de treino: ${original}`,
    };
  }

  if (hasGoalChange) {
    return {
      hasSignal: true,
      category: "OBJETIVO_TREINO",
      summary: `Novo objetivo ou meta de treino informada pelo aluno: ${original}`,
    };
  }

  if (hasIntensityChange) {
    return {
      hasSignal: true,
      category: "INTENSIDADE_VOLUME",
      summary: `Pedido de ajuste de intensidade, carga ou volume: ${original}`,
    };
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

  if (
    hasExplicitChange &&
    mentionsCardio &&
    mentionsRunning &&
    mentionsGymStrength
  ) {
    return {
      hasSignal: true,
      category: "CARDIO_CORRIDA",
      summary:
        "Nos dias de academia, priorizar musculação. Manter o cardio nos dias de corrida de rua, salvo nova orientação do aluno ou decisão técnica do professor.",
    };
  }

  if (
    hasRoutineChange &&
    (hasExplicitChange ||
      includesAnyPhrase(text, [
        "agora",
        "este mes",
        "esse mes",
        "essa semana",
        "nao consigo mais",
      ]))
  ) {
    return {
      hasSignal: true,
      category: "ROTINA_TREINO",
      summary: `Mudança de rotina, dias ou horário informada pelo aluno: ${original}`,
    };
  }

  if (hasExplicitChange && matchesAnyPattern(text, exerciseAvoidPatterns)) {
    return {
      hasSignal: true,
      category: "EXERCICIO_EVITAR",
      summary: `Evitar ou substituir conforme revisão do professor: ${original}`,
    };
  }

  if (hasExplicitChange && matchesAnyPattern(text, exercisePriorityPatterns)) {
    return {
      hasSignal: true,
      category: "EXERCICIO_PRIORIZAR",
      summary: `Prioridade de treino informada pelo aluno: ${original}`,
    };
  }

  if (hasExplicitChange) {
    return {
      hasSignal: true,
      category: "PREFERENCIA_GERAL",
      summary: `Pedido de mudança no treino registrado pelo aluno: ${original}`,
    };
  }

  return noPreference;
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

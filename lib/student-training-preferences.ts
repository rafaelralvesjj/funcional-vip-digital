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

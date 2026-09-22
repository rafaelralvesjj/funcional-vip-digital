export type MobilityPhase = "PRE" | "POST";

export type MobilityLibraryExercise = {
  id: string;
  name: string;
  description?: string | null;
  muscleGroup?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  sequenceImageUrl?: string | null;
  sequenceImageLabel?: string | null;
  sequenceImageNotes?: string | null;
  instructions?: string | null;
  safetyNotes?: string | null;
  commonMistakes?: string | null;
  contraindications?: string | null;
  objectiveTags?: string | null;
  locationTags?: string | null;
  equipmentTags?: string | null;
  restrictionTags?: string | null;
  levelTags?: string | null;
  intensity?: string | null;
  [key: string]: unknown;
};

export type MobilityWorkoutContext = {
  name?: string | null;
  objective?: string | null;
  focusAreas?: string | null;
  safetyNote?: string | null;
  exercises?: Array<{
    name?: string | null;
    description?: string | null;
  }>;
};

export type MobilityRoutineItem = MobilityLibraryExercise & {
  durationLabel: string;
  shortCue: string;
};

export type WorkoutMobilityRoutine = {
  phase: MobilityPhase;
  title: string;
  subtitle: string;
  importance: string;
  durationMinutes: number;
  items: MobilityRoutineItem[];
};

type BodyFocus = "LOWER" | "UPPER" | "MIXED";

const ROUTINE_META: Record<string, { durationLabel: string; shortCue: string }> = {
  "Marcha estacionária": {
    durationLabel: "60s",
    shortCue: "Ritmo confortável para elevar a temperatura do corpo.",
  },
  "Step touch lateral": {
    durationLabel: "45s",
    shortCue: "Passos laterais curtos, leves e controlados.",
  },
  "Mobilidade de tornozelo na parede": {
    durationLabel: "8–10 por lado",
    shortCue: "Leve o joelho em direção à parede sem tirar o calcanhar do chão.",
  },
  "Mobilidade de quadril 90/90": {
    durationLabel: "45s",
    shortCue: "Mova o quadril dentro de uma amplitude confortável, sem forçar.",
  },
  "Deslizamento de braços na parede": {
    durationLabel: "8–10 repetições",
    shortCue: "Deslize os braços com controle, sem compensar com a lombar.",
  },
  "Mobilidade torácica em quatro apoios": {
    durationLabel: "6–8 por lado",
    shortCue: "Faça a rotação do tronco com amplitude confortável e respiração solta.",
  },
  "Mobilidade gato-vaca": {
    durationLabel: "8–10 repetições",
    shortCue: "Associe movimento suave da coluna com respiração tranquila.",
  },
  "Alongamento de flexor de quadril": {
    durationLabel: "30–40s por lado",
    shortCue: "Alongue a frente do quadril sem arquear a lombar nem forçar o joelho.",
  },
  "Alongamento de panturrilha na parede": {
    durationLabel: "30–40s por lado",
    shortCue: "Mantenha o calcanhar apoiado e busque apenas uma tensão confortável.",
  },
  "Alongamento dinâmico de posterior": {
    durationLabel: "8–10 por lado",
    shortCue: "Mobilize a parte de trás da coxa de forma leve, sem insistir na amplitude.",
  },
  "Alongamento peitoral na porta": {
    durationLabel: "30s por lado",
    shortCue: "Abra o peito com leveza; pare antes de qualquer dor ou formigamento.",
  },
};

const PRE_BY_FOCUS: Record<BodyFocus, string[]> = {
  LOWER: [
    "Marcha estacionária",
    "Step touch lateral",
    "Mobilidade de tornozelo na parede",
    "Mobilidade de quadril 90/90",
    "Alongamento dinâmico de posterior",
  ],
  UPPER: [
    "Marcha estacionária",
    "Step touch lateral",
    "Deslizamento de braços na parede",
    "Mobilidade torácica em quatro apoios",
    "Mobilidade gato-vaca",
  ],
  MIXED: [
    "Marcha estacionária",
    "Step touch lateral",
    "Mobilidade de tornozelo na parede",
    "Deslizamento de braços na parede",
    "Mobilidade torácica em quatro apoios",
  ],
};

const POST_BY_FOCUS: Record<BodyFocus, string[]> = {
  LOWER: [
    "Alongamento de flexor de quadril",
    "Alongamento de panturrilha na parede",
    "Alongamento dinâmico de posterior",
    "Mobilidade de quadril 90/90",
  ],
  UPPER: [
    "Alongamento peitoral na porta",
    "Deslizamento de braços na parede",
    "Mobilidade torácica em quatro apoios",
    "Mobilidade gato-vaca",
  ],
  MIXED: [
    "Alongamento de flexor de quadril",
    "Alongamento dinâmico de posterior",
    "Alongamento peitoral na porta",
    "Mobilidade torácica em quatro apoios",
  ],
};

const PRE_FALLBACK = [
  "Marcha estacionária",
  "Step touch lateral",
  "Mobilidade de tornozelo na parede",
  "Mobilidade de quadril 90/90",
  "Deslizamento de braços na parede",
  "Mobilidade torácica em quatro apoios",
  "Mobilidade gato-vaca",
  "Alongamento dinâmico de posterior",
];

const POST_FALLBACK = [
  "Alongamento de flexor de quadril",
  "Alongamento de panturrilha na parede",
  "Alongamento dinâmico de posterior",
  "Alongamento peitoral na porta",
  "Mobilidade de quadril 90/90",
  "Mobilidade torácica em quatro apoios",
  "Mobilidade gato-vaca",
  "Deslizamento de braços na parede",
];

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getWorkoutSearchText(workout: MobilityWorkoutContext): string {
  return normalizeText([
    workout.name,
    workout.objective,
    workout.focusAreas,
    ...(workout.exercises || []).flatMap((exercise) => [exercise.name, exercise.description]),
  ].filter(Boolean).join(" "));
}

function detectBodyFocus(workout: MobilityWorkoutContext): BodyFocus {
  const text = getWorkoutSearchText(workout);
  const lowerTerms = [
    "perna", "glute", "quadriceps", "posterior", "panturr", "joelho", "quadril",
    "adutor", "abdutor", "agach", "afundo", "leg press", "corrida", "stiff", "flexora", "extensora",
  ];
  const upperTerms = [
    "peito", "ombro", "costa", "braco", "biceps", "triceps", "dorsal", "remada",
    "supino", "desenvolvimento", "peitoral", "chest press", "puxada",
  ];

  const lowerScore = lowerTerms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
  const upperScore = upperTerms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);

  if (lowerScore > 0 && upperScore === 0) return "LOWER";
  if (upperScore > 0 && lowerScore === 0) return "UPPER";
  return "MIXED";
}

function buildLibraryMap(library: MobilityLibraryExercise[]): Map<string, MobilityLibraryExercise> {
  const map = new Map<string, MobilityLibraryExercise>();

  for (const exercise of library || []) {
    const name = normalizeText(exercise?.name);
    if (exercise?.id && name) map.set(name, exercise);
  }

  return map;
}

function pickAvailableExercises({
  preferredNames,
  fallbackNames,
  library,
  limit,
}: {
  preferredNames: string[];
  fallbackNames: string[];
  library: MobilityLibraryExercise[];
  limit: number;
}): MobilityRoutineItem[] {
  const map = buildLibraryMap(library);
  const selected: MobilityRoutineItem[] = [];
  const seen = new Set<string>();

  for (const name of [...preferredNames, ...fallbackNames]) {
    if (selected.length >= limit) break;

    const exercise = map.get(normalizeText(name));
    if (!exercise || seen.has(exercise.id)) continue;

    const meta = ROUTINE_META[name] || {
      durationLabel: "45s",
      shortCue: exercise.description || "Faça o movimento com controle e sem dor.",
    };

    selected.push({
      ...exercise,
      durationLabel: meta.durationLabel,
      shortCue: meta.shortCue,
    });
    seen.add(exercise.id);
  }

  return selected;
}

export function buildWorkoutMobilityRoutine({
  phase,
  workout,
  library,
}: {
  phase: MobilityPhase;
  workout: MobilityWorkoutContext;
  library: MobilityLibraryExercise[];
}): WorkoutMobilityRoutine {
  const focus = detectBodyFocus(workout || {});
  const isPre = phase === "PRE";
  const preferredNames = (isPre ? PRE_BY_FOCUS : POST_BY_FOCUS)[focus];
  const fallbackNames = isPre ? PRE_FALLBACK : POST_FALLBACK;
  const items = pickAvailableExercises({
    preferredNames,
    fallbackNames,
    library,
    limit: isPre ? 5 : 4,
  });

  if (isPre) {
    return {
      phase,
      title: "Preparação rápida — 5 min",
      subtitle: "Prepare o corpo antes de começar",
      importance:
        "Uma preparação curta ajuda você a entrar no treino com mais mobilidade, controle e consciência dos movimentos. Faça tudo de forma confortável e sem dor.",
      durationMinutes: 5,
      items,
    };
  }

  return {
    phase,
    title: "Mobilidade e alongamento — 5 min",
    subtitle: "Finalize o treino com mais cuidado",
    importance:
      "Esses minutos ajudam a desacelerar e recuperar a mobilidade depois do esforço. Não force amplitude e pare se algum movimento causar dor ou desconforto.",
    durationMinutes: 5,
    items,
  };
}

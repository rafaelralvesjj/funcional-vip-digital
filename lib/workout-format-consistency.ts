import { isCombinedWorkoutPlan } from "./workout-combined-sequence";

export type WorkoutFormatMode = "NORMAL" | "COMBINED";

export type WorkoutFormatPreferenceLike = {
  summary?: string | null;
  originalMessage?: string | null;
  updatedAt?: Date | string | null;
  status?: string | null;
};

export type WorkoutExerciseFormatLike = {
  id?: string;
  name?: string | null;
  notes?: string | null;
  restTime?: string | null;
  order?: number | null;
  [key: string]: unknown;
};

export type WorkoutPlanFormatLike = {
  id?: string;
  name?: string | null;
  description?: string | null;
  objective?: string | null;
  studentSummary?: string | null;
  notes?: string | null;
  exercises?: WorkoutExerciseFormatLike[];
  [key: string]: unknown;
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const NORMAL_METHOD_PATTERN = /(nao quero(?: mais)?(?: o| um)? treino combinad|nao quero(?: mais)? combinad|sem treino combinad|sem combinad|voltar (?:ao|pro|para o) treino normal|quero (?:voltar ao |voltar pro |um )?treino normal|prefiro (?:o )?treino normal|formato normal|metodo normal|treino tradicional|formato tradicional)/i;

const COMBINED_METHOD_PATTERN = /(quero|prefiro|gostaria|preciso|pedido|solicito|formato|metodo|treino).{0,80}(treino )?(combinad|dinamic|sequencia metabol|metabolic|superset|super set|bi-set|biset|intercalad)|(combinad|sequencia metabol|superset|super set|bi-set|biset).{0,80}(quero|prefiro|gostaria|preciso|pedido|solicito)|um exercicio.{0,80}outro.{0,80}descans|uma serie de cada exercicio direto|a1.{0,30}a2.{0,80}descans/i;

export function detectWorkoutFormatPreference(value: unknown): WorkoutFormatMode | null {
  const text = normalize(value);
  if (!text) return null;

  // Uma mensagem como "não quero mais combinado, quero normal" contém as duas
  // palavras. O pedido de retorno ao normal sempre prevalece.
  if (NORMAL_METHOD_PATTERN.test(text)) return "NORMAL";
  if (COMBINED_METHOD_PATTERN.test(text)) return "COMBINED";

  return null;
}

/**
 * O método do treino precisa persistir até que o aluno o mude explicitamente.
 * Por isso, não olhamos apenas preferências ACTIVE: uma preferência de método
 * pode ter sido superseded por outra do mesmo grupo (ex.: aparelhos) sem que o
 * aluno tenha desistido do formato combinado/normal.
 *
 * Regra: usar a mensagem mais recente, em todo o histórico recente de
 * preferências, que fale explicitamente do método.
 */
export function resolveWorkoutFormatMode(
  preferences: WorkoutFormatPreferenceLike[] | null | undefined
): WorkoutFormatMode {
  const ordered = [...(preferences || [])].sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });

  for (const preference of ordered) {
    const mode = detectWorkoutFormatPreference(
      `${String(preference.originalMessage || "")} ${String(preference.summary || "")}`
    );
    if (mode) return mode;
  }

  return "NORMAL";
}

function stripCombinedExercisePrefix(value: unknown): string | null {
  let text = String(value ?? "").trim();
  if (!text) return null;

  text = text
    .replace(/^COMBINADO\s+[A-Z]\s*(?:[-—–:]|\|)\s*(?:\d+\s+VOLTAS?\s*\|\s*)?/i, "")
    .replace(/^[A-Z]\s*[1-3]\s*(?:[-—–:]|\|)\s*/i, "")
    .replace(/^COMBINADO\s+[A-Z]\s*(?:[-—–:]|\|)\s*[A-Z]\s*[1-3]\s*/i, "")
    .replace(/\bfa(?:ca|ça|zer)\s+(?:a\s+)?s[eé]rie\s+e\s+(?:v[aá]|siga)\s+direto\s+(?:para|at[eé])\s+[A-Z][1-3][^.?!]*[.?!]?/gi, "")
    .replace(/\b(?:fazer|fa(?:ca|ça))\s+ap[oó]s\s+[A-Z][1-3][^.?!]*[.?!]?/gi, "")
    .replace(/\b(?:depois|em seguida)\s+(?:v[aá]|siga)\s+(?:para\s+)?[A-Z][1-3][^.?!]*[.?!]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[-—–|:;,.\s]+|[-—–|:;,.\s]+$/g, "")
    .trim();

  return text || null;
}

export function normalizeCombinedRestTime(value: unknown, fallback = "60s"): string {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;

  const explicitAfter = raw.match(/(\d+\s*(?:-\s*\d+)?\s*s)\s*(?:ap[oó]s|→|->)/i);
  if (explicitAfter && /combinad|dupla|volte|repita/i.test(raw)) {
    return explicitAfter[1].replace(/\s+/g, "");
  }

  const leadingDuration = raw.match(/^\s*(\d+\s*(?:-\s*\d+)?\s*s)\b/i);
  if (leadingDuration && /ap[oó]s\s+(?:o\s+)?(?:combinad|dupla)/i.test(raw)) {
    return leadingDuration[1].replace(/\s+/g, "");
  }

  if (
    /sem\s+descanso|direto\s+(?:para|at[eé])|→\s*[A-Z][1-3]|->\s*[A-Z][1-3]|\bat[eé]\s+[A-Z][1-3]\b/i.test(raw)
  ) {
    return fallback;
  }

  if (/descanse\s+\d+\s*s.*volte\s+ao\s+[A-Z]1/i.test(raw)) {
    const duration = raw.match(/descanse\s+(\d+\s*s)/i)?.[1];
    return duration ? duration.replace(/\s+/g, "") : fallback;
  }

  if (/^\d+\s*(?:-\s*\d+)?\s*s$/i.test(raw)) {
    return raw.replace(/\s+/g, "");
  }

  if (/combinad|dupla|[A-Z][1-3]/i.test(raw)) return fallback;

  return raw;
}

function normalizePlanDescription(value: unknown): string | null {
  let text = String(value ?? "").trim();
  if (!text) return null;

  text = text
    .replace(/sess[aã]o\s+em\s+combinados?/gi, "Sessão de treino")
    .replace(/treino\s+em\s+combinados?/gi, "treino em formato normal")
    .replace(/\bformato\s+combinado\b/gi, "formato normal")
    .replace(/\bm[eé]todo\s+combinado\b/gi, "formato normal")
    .replace(/\s{2,}/g, " ")
    .trim();

  return text || null;
}

function normalizePlanNotes(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const normalInstruction =
    "Formato normal: faça cada exercício individualmente, cumpra as séries e respeite o descanso indicado antes de seguir para o próximo.";

  if (!raw) return normalInstruction;

  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(
      (sentence) =>
        !/\bcombinad[oa]s?\b|\bA1\b|\bA2\b|\bA3\b|\bB1\b|\bB2\b|\bB3\b|\bC1\b|\bC2\b|\bC3\b|sem\s+descanso\s+entre/i.test(
          sentence
        )
    );

  const cleaned = sentences.join(" ").replace(/\s{2,}/g, " ").trim();
  if (!cleaned) return normalInstruction;
  if (/formato\s+normal|cada\s+exerc[ií]cio\s+individualmente/i.test(cleaned)) return cleaned;

  return `${cleaned} ${normalInstruction}`;
}

export function normalizeWorkoutPlanToNormalFormat<T extends WorkoutPlanFormatLike>(plan: T): T {
  const exercises = Array.isArray(plan.exercises) ? plan.exercises : [];

  return {
    ...plan,
    description: normalizePlanDescription(plan.description),
    studentSummary: normalizePlanDescription(plan.studentSummary),
    notes: normalizePlanNotes(plan.notes),
    exercises: exercises.map((exercise) => ({
      ...exercise,
      notes: stripCombinedExercisePrefix(exercise.notes),
      restTime: normalizeCombinedRestTime(exercise.restTime),
    })),
  } as T;
}

export function shouldNormalizeWorkoutPlanToNormalFormat(
  plan: WorkoutPlanFormatLike | null | undefined,
  mode: WorkoutFormatMode
): boolean {
  return mode === "NORMAL" && isCombinedWorkoutPlan((plan || null) as any);
}

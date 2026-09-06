export type ExerciseNameItem = {
  id: string;
  name: string;
};

const GENERIC_NAME_TOKENS = new Set([
  "assistido",
  "assistida",
  "unilateral",
  "bilateral",
  "alternado",
  "alternada",
  "estatico",
  "estatica",
  "sentado",
  "sentada",
  "deitado",
  "deitada",
  "maquina",
  "barra",
  "halter",
  "halteres",
  "polia",
  "livre",
  "apoio",
  "corporal",
]);

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function significantNameTokens(name: string): string[] {
  return Array.from(
    new Set(
      normalize(name)
        .split(/\s+/)
        .filter((token) => token.length >= 5 && !GENERIC_NAME_TOKENS.has(token))
    )
  );
}

function explicitMatchScore(name: string, explicitContext: string): number {
  const normalizedContext = ` ${normalize(explicitContext)} `;
  if (normalizedContext.trim().length === 0) return 0;

  const normalizedName = normalize(name);
  if (normalizedName && normalizedContext.includes(` ${normalizedName} `)) return 1000;

  const tokens = significantNameTokens(name);
  let score = 0;
  for (const token of tokens) {
    if (normalizedContext.includes(` ${token} `)) {
      score += Math.max(token.length, 5);
    }
  }
  return score;
}


export function buildExplicitExerciseRequestContext({
  openQuestions,
  activePreferences,
  approvedMemories,
}: {
  openQuestions?: unknown[] | null;
  activePreferences?: unknown[] | null;
  approvedMemories?: unknown[] | null;
}): string {
  return [
    JSON.stringify(openQuestions || []),
    JSON.stringify(activePreferences || []),
    JSON.stringify(approvedMemories || []),
  ]
    .filter(Boolean)
    .join(" ");
}

export function prioritizeExplicitExerciseMentions<T extends ExerciseNameItem>({
  rankedExercises,
  eligibleExercises,
  explicitContext,
  limit = 32,
}: {
  rankedExercises: T[];
  eligibleExercises: T[];
  explicitContext: string;
  limit?: number;
}): T[] {
  const priority = eligibleExercises
    .map((exercise, index) => ({
      exercise,
      index,
      score: explicitMatchScore(exercise.name, explicitContext),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.exercise);

  const selected: T[] = [];
  const seen = new Set<string>();

  for (const exercise of [...priority, ...rankedExercises]) {
    if (seen.has(exercise.id)) continue;
    seen.add(exercise.id);
    selected.push(exercise);
    if (selected.length >= limit) break;
  }

  return selected;
}

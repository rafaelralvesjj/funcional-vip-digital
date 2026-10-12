export const PROMPT_EXERCISE_LIBRARY_LIMIT = 96;

export type ExerciseNameItem = {
  id: string;
  name: string;
};

export type ExercisePromptContextItem = ExerciseNameItem & {
  equipmentTags?: string | null;
  muscleGroup?: string | null;
  objectiveTags?: string | null;
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

export function shouldExcludeExerciseFromPrompt(
  exercise: ExercisePromptContextItem,
  context: string
): boolean {
  const normalizedContext = normalize(context);
  const normalizedExercise = normalize(`${exercise.name} ${exercise.equipmentTags || ""}`);
  const trxUnavailable = /(?:nao tem|sem|evitar|retirar|tirar) trx/.test(normalizedContext);

  return trxUnavailable && /\btrx\b|fita de suspensao/.test(normalizedExercise);
}

export function getExerciseContextScoreAdjustment(
  exercise: ExercisePromptContextItem,
  context: string
): number {
  const normalizedContext = normalize(context);
  const normalizedExercise = normalize([
    exercise.name,
    exercise.muscleGroup,
    exercise.equipmentTags,
    exercise.objectiveTags,
  ].filter(Boolean).join(" "));

  let score = 0;

  const wantsGymMachines =
    normalizedContext.includes("academia") &&
    /(maquina|maquinas|equipamento|equipamentos|polia|leg press|cadeira|smith)/.test(normalizedContext);
  const isMachineBased =
    /(maquina|maquinas|leg press|cadeira (extensora|flexora|abdutora|adutora)|polia|puxada|remada baixa|chest press|smith|barra guiada)/.test(normalizedExercise);

  if (wantsGymMachines && isMachineBased) score += 60;

  const asksPosterior =
    /(posterior de coxa|posteriores de coxa|posterior|hamstring|flexora)/.test(normalizedContext);
  if (asksPosterior) {
    if (/(cadeira flexora|mesa flexora|flexora|leg curl|posterior de coxa)/.test(normalizedExercise)) {
      score += 120;
    } else if (/(stiff|deadlift|good morning|flexao de joelhos)/.test(normalizedExercise)) {
      score += 55;
    }
  }

  const asksModernStandingGlute =
    /gluteo/.test(normalizedContext) &&
    /(em pe|equipamento moderno|equipamentos modernos|maquina moderna|adutora em pe|abdutora em pe)/.test(normalizedContext);
  if (asksModernStandingGlute) {
    if (/abducao de quadril em pe/.test(normalizedExercise)) score += 120;
    if (/(extensao de quadril na polia|gluteo.*polia|kickback|coice)/.test(normalizedExercise)) score += 105;
    if (/gluteo/.test(normalizedExercise) && isMachineBased) score += 40;
  }

  const tiredOfSeatedHipMachines =
    /(ja fiz muito|repetindo|evitar|nao quero|sem)/.test(normalizedContext) &&
    /(cadeira adutora|cadeira abdutora)/.test(normalizedContext);
  if (tiredOfSeatedHipMachines && /(cadeira adutora|cadeira abdutora)/.test(normalizedExercise)) {
    score -= 1200;
  }

  const tiredOfElastic =
    /(?:repetindo|evitar|nao quero|sem)[^.!?]{0,80}elastico|elastico[^.!?]{0,80}(?:repetindo|evitar|nao quero|sem)/.test(normalizedContext);
  if (tiredOfElastic && /(elastico|mini band)/.test(normalizedExercise)) score -= 90;

  const repeatedLegExtension =
    /repetindo[^.!?]{0,80}cadeira extensora|cadeira extensora[^.!?]{0,80}repetindo/.test(normalizedContext);
  if (repeatedLegExtension && /cadeira extensora/.test(normalizedExercise)) score -= 1200;

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
  const contextAwareEligible = eligibleExercises.filter(
    (exercise) => !shouldExcludeExerciseFromPrompt(exercise as ExercisePromptContextItem, explicitContext)
  );

  const priority = contextAwareEligible
    .map((exercise, index) => ({
      exercise,
      index,
      score:
        explicitMatchScore(exercise.name, explicitContext) +
        getExerciseContextScoreAdjustment(exercise as ExercisePromptContextItem, explicitContext),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.exercise);

  const contextRanked = rankedExercises
    .filter((exercise) => !shouldExcludeExerciseFromPrompt(exercise as ExercisePromptContextItem, explicitContext))
    .map((exercise, index) => ({
      exercise,
      index,
      score: getExerciseContextScoreAdjustment(exercise as ExercisePromptContextItem, explicitContext),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.exercise);

  const selected: T[] = [];
  const seen = new Set<string>();
  const effectiveLimit = limit >= 56 ? Math.max(limit, PROMPT_EXERCISE_LIBRARY_LIMIT) : limit;

  for (const exercise of [...priority, ...contextRanked]) {
    if (seen.has(exercise.id)) continue;
    seen.add(exercise.id);
    selected.push(exercise);
    if (selected.length >= effectiveLimit) break;
  }

  return selected;
}

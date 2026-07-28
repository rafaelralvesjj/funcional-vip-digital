export type MuscleKey =
  | "chest"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "upperBack"
  | "lats"
  | "lowerBack"
  | "abs"
  | "obliques"
  | "glutes"
  | "quadriceps"
  | "hamstrings"
  | "adductors"
  | "calves"
  | "hipFlexors";

export interface MuscleScore {
  key: MuscleKey;
  label: string;
  score: number;
  normalizedScore: number;
  role: "primary" | "secondary";
}

export interface MuscleMapExercise {
  name?: string | null;
  muscleGroup?: string | null;
  libraryExercise?: { muscleGroup?: string | null } | null;
  series?: number | null;
  reps?: string | number | null;
}

const LABELS: Record<MuscleKey, string> = {
  chest: "Peitoral",
  shoulders: "Ombros",
  biceps: "Bíceps",
  triceps: "Tríceps",
  forearms: "Antebraços",
  upperBack: "Costas superiores",
  lats: "Dorsais",
  lowerBack: "Lombar",
  abs: "Abdômen",
  obliques: "Oblíquos",
  glutes: "Glúteos",
  quadriceps: "Quadríceps",
  hamstrings: "Posteriores de coxa",
  adductors: "Adutores",
  calves: "Panturrilhas",
  hipFlexors: "Flexores do quadril",
};

const GROUP_MAP: Record<string, { primary: MuscleKey[]; secondary: MuscleKey[] }> = {
  "peito": { primary: ["chest"], secondary: ["triceps", "shoulders"] },
  "ombros": { primary: ["shoulders"], secondary: ["triceps", "upperBack"] },
  "braços": { primary: ["biceps", "triceps"], secondary: ["forearms"] },
  "costas": { primary: ["lats", "upperBack"], secondary: ["biceps", "forearms"] },
  "core / abdômen": { primary: ["abs", "obliques"], secondary: ["lowerBack", "glutes"] },
  "glúteos": { primary: ["glutes"], secondary: ["hamstrings", "quadriceps", "abs"] },
  "pernas": { primary: ["quadriceps", "hamstrings"], secondary: ["glutes", "calves", "adductors"] },
  "mobilidade": { primary: ["hipFlexors", "hamstrings"], secondary: ["calves", "shoulders", "lowerBack"] },
  "recuperação": { primary: ["abs", "lowerBack"], secondary: ["glutes", "hipFlexors"] },
  "cardio / condicionamento": { primary: ["quadriceps", "calves"], secondary: ["hamstrings", "glutes", "abs"] },
  "corpo inteiro": { primary: ["quadriceps", "glutes", "abs"], secondary: ["chest", "shoulders", "upperBack", "hamstrings", "calves"] },
};

const NAME_RULES: Array<{ terms: string[]; primary: MuscleKey[]; secondary: MuscleKey[] }> = [
  { terms: ["agachamento", "leg press", "cadeira extensora", "wall sit"], primary: ["quadriceps", "glutes"], secondary: ["hamstrings", "abs", "adductors"] },
  { terms: ["afundo", "avanço", "step-up", "subida no degrau"], primary: ["quadriceps", "glutes"], secondary: ["hamstrings", "calves", "abs"] },
  { terms: ["stiff", "deadlift", "good morning", "terra"], primary: ["hamstrings", "glutes"], secondary: ["lowerBack", "abs", "forearms"] },
  { terms: ["ponte", "hip thrust", "elevação pélvica", "extensão de quadril"], primary: ["glutes"], secondary: ["hamstrings", "abs"] },
  { terms: ["abdução", "clam shell", "caminhada lateral", "mini band"], primary: ["glutes"], secondary: ["obliques", "quadriceps"] },
  { terms: ["adutora", "adutor"], primary: ["adductors"], secondary: ["quadriceps", "glutes"] },
  { terms: ["panturrilha", "corda de pular", "drill de tornozelo"], primary: ["calves"], secondary: ["quadriceps", "hamstrings"] },
  { terms: ["supino", "flexão de braços", "chest press", "crucifixo", "pressão de peito"], primary: ["chest"], secondary: ["triceps", "shoulders"] },
  { terms: ["remada", "puxada", "barra fixa"], primary: ["lats", "upperBack"], secondary: ["biceps", "forearms"] },
  { terms: ["desenvolvimento", "elevação lateral"], primary: ["shoulders"], secondary: ["triceps", "upperBack"] },
  { terms: ["rosca"], primary: ["biceps"], secondary: ["forearms"] },
  { terms: ["tríceps"], primary: ["triceps"], secondary: ["shoulders", "chest"] },
  { terms: ["prancha", "dead bug", "bird dog", "pallof", "abdominal"], primary: ["abs", "obliques"], secondary: ["lowerBack", "shoulders", "glutes"] },
  { terms: ["corrida", "marcha", "caminhada", "polichinelo", "skipping", "bicicleta", "esteira", "burpee"], primary: ["quadriceps", "calves"], secondary: ["hamstrings", "glutes", "abs"] },
  { terms: ["mobilidade", "alongamento", "gato-vaca", "postura da criança", "respiração"], primary: ["hipFlexors", "hamstrings"], secondary: ["lowerBack", "calves", "shoulders"] },
];

function normalize(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function estimateExerciseWeight(exercise: MuscleMapExercise): number {
  const series = Math.max(1, Number(exercise.series || 1));
  const repsText = String(exercise.reps || "");
  const numbers = repsText.match(/\d+/g)?.map(Number) || [];
  const averageReps = numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 10;
  const timeBased = /seg|min|tempo|respira/i.test(repsText);
  const volumeFactor = timeBased ? 1.1 : Math.min(1.7, Math.max(0.8, averageReps / 10));
  return series * volumeFactor;
}

export function getExerciseMuscles(exercise: MuscleMapExercise): { primary: MuscleKey[]; secondary: MuscleKey[] } {
  const name = normalize(exercise.name);
  const groupRaw = exercise.muscleGroup || exercise.libraryExercise?.muscleGroup || "";
  const group = normalize(groupRaw);

  const matchedRule = NAME_RULES.find((rule) => rule.terms.some((term) => name.includes(normalize(term))));
  if (matchedRule) return { primary: matchedRule.primary, secondary: matchedRule.secondary };

  const groupEntry = Object.entries(GROUP_MAP).find(([key]) => normalize(key) === group)?.[1];
  return groupEntry || { primary: ["abs"], secondary: [] };
}

export function buildWorkoutMuscleSummary(exercises: MuscleMapExercise[]) {
  const scores = new Map<MuscleKey, { primary: number; secondary: number }>();

  for (const exercise of exercises || []) {
    const weight = estimateExerciseWeight(exercise);
    const muscles = getExerciseMuscles(exercise);
    for (const key of muscles.primary) {
      const current = scores.get(key) || { primary: 0, secondary: 0 };
      current.primary += weight;
      scores.set(key, current);
    }
    for (const key of muscles.secondary) {
      const current = scores.get(key) || { primary: 0, secondary: 0 };
      current.secondary += weight * 0.45;
      scores.set(key, current);
    }
  }

  const raw = Array.from(scores.entries()).map(([key, value]) => ({
    key,
    label: LABELS[key],
    score: value.primary + value.secondary,
    role: value.primary >= value.secondary ? "primary" as const : "secondary" as const,
  }));
  const max = Math.max(1, ...raw.map((item) => item.score));
  const muscles: MuscleScore[] = raw
    .map((item) => ({ ...item, normalizedScore: item.score / max }))
    .sort((a, b) => b.score - a.score);

  const primary = muscles.filter((item) => item.normalizedScore >= 0.62).slice(0, 5);
  const secondary = muscles.filter((item) => item.normalizedScore < 0.62).slice(0, 6);

  return {
    muscles,
    primary,
    secondary,
    headline: primary.length ? primary.map((item) => item.label).join(", ") : "Corpo inteiro",
    supportText: secondary.length ? secondary.map((item) => item.label).join(", ") : "",
  };
}

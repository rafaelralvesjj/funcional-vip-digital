export type ExerciseLike = { id: string; name: string };

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function collectQuestionText(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectQuestionText(item));
  if (typeof value !== "object") return [];

  const item = value as Record<string, unknown>;
  const directFields = [
    item.content,
    item.lastMessage,
    item.conversationText,
    item.summary,
    item.title,
  ].filter((entry): entry is string => typeof entry === "string");

  return [
    ...directFields,
    ...collectQuestionText(item.messages),
    ...collectQuestionText(item.replies),
    ...collectQuestionText(item.children),
  ];
}

export function getRecentlyUsedExerciseNames<T extends ExerciseLike>(
  summaryText: string,
  library: T[]
): string[] {
  const source = String(summaryText || "");
  const startMarker = "Últimos planos de treino com exercícios:";
  const start = source.indexOf(startMarker);
  if (start < 0) return [];

  const afterStart = source.slice(start + startMarker.length);
  const nextSectionMatch = afterStart.match(/\n\d+\)\s/);
  const recentSection = nextSectionMatch
    ? afterStart.slice(0, nextSectionMatch.index)
    : afterStart;
  const normalizedSection = normalize(recentSection);

  return library
    .map((exercise, index) => {
      const normalizedName = normalize(exercise.name);
      const position = normalizedName ? normalizedSection.indexOf(normalizedName) : -1;
      return { exercise, index, position };
    })
    .filter((item) => item.position >= 0)
    .sort((a, b) => a.position - b.position || a.index - b.index)
    .map((item) => item.exercise.name);
}

export function rotateRecentlyUsedExercises<T extends ExerciseLike>(
  exercises: T[],
  recentExerciseNames: string[]
): T[] {
  if (!recentExerciseNames.length) return [...exercises];

  const recent = new Set(recentExerciseNames.map((name) => normalize(name)));
  const fresh: T[] = [];
  const used: T[] = [];

  for (const exercise of exercises) {
    if (recent.has(normalize(exercise.name))) used.push(exercise);
    else fresh.push(exercise);
  }

  return [...fresh, ...used];
}

export function buildWorkoutGenerationStrategy(input: {
  summaryText?: string;
  openQuestions?: unknown[];
  recentExerciseNames?: string[];
  librarySize: number;
}) {
  const questionText = collectQuestionText(input.openQuestions || []).join(" ");
  const combined = normalize(`${input.summaryText || ""} ${questionText}`);
  const dynamicPairedSetsRequested = /(dinamic|combinad|sequencia metabol|metabolic|superset|super set|bi-set|biset|intercalad|um exercicio.*outro.*descans)/i.test(combined);
  const recentExerciseNames = Array.from(new Set(input.recentExerciseNames || [])).filter(Boolean);

  const promptLines = [
    `REGRA DE VARIEDADE SISTEMÁTICA: a biblioteca ativa possui ${Math.max(Number(input.librarySize || 0), 0)} exercício(s). Evite repetir exercícios usados recentemente quando houver alternativa segura que trabalhe o mesmo padrão ou objetivo muscular.`,
    "VARIAÇÃO NÃO É ALEATÓRIA: preserve objetivo, grupo muscular/padrão de movimento, ambiente, equipamentos, nível, preferências e restrições. Troque o exercício, não o propósito do exercício.",
    "EXERCÍCIOS ÂNCORA: pode manter 1 ou 2 movimentos quando forem pedidos explicitamente pelo aluno, necessários por orientação médica/técnica, ou importantes para acompanhar evolução. Os acessórios devem variar primeiro.",
    "NA MESMA SEMANA: evite repetir o mesmo exerciseId em treinos diferentes quando existir equivalente seguro e coerente. Se repetir por necessidade clínica/técnica, explique o motivo em notes/reviewAlerts.",
  ];

  if (recentExerciseNames.length > 0) {
    promptLines.push(
      `EXERCÍCIOS USADOS RECENTEMENTE — DEPRIORIZE, SALVO ÂNCORA/NECESSIDADE: ${recentExerciseNames.join(", ")}.`
    );
  }

  if (dynamicPairedSetsRequested) {
    promptLines.push(
      "MÉTODO DINÂMICO SOLICITADO: estruturar o treino em pares A1/A2, B1/B2, C1/C2. Executar A1 e A2 em sequência, com transição curta, e descansar somente após completar a dupla.",
      "DESCANSO DOS PARES: usar em geral 0-20s apenas para transição entre A1 e A2 e 60-90s após A2 antes de repetir a dupla, ajustando por segurança, técnica e intensidade.",
      "PREFERÊNCIA DE COMBINAÇÃO: quando seguro, combinar grupos não concorrentes ou inferior + superior para aumentar densidade sem transformar o treino em cardio aleatório. Não usar saltos/impacto se houver restrição.",
      "MARCAÇÃO NO JSON: em notes de cada exercício, começar com 'A1 -', 'A2 -', 'B1 -', 'B2 -' etc., para a tela deixar clara a sequência ao professor/aluno.",
      "O caráter metabólico deve vir da densidade e da organização dos pares, não de carga excessiva nem de eliminar o descanso necessário."
    );
  }

  return {
    dynamicPairedSetsRequested,
    recentExerciseNames,
    promptLines,
  };
}

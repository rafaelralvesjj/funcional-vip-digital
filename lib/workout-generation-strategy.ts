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
  activePreferences?: unknown[];
  recentExerciseNames?: string[];
  librarySize: number;
}) {
  const questionText = collectQuestionText(input.openQuestions || []).join(" ");
  const preferenceText = collectQuestionText(input.activePreferences || []).join(" ");
  const currentMethodContext = normalize(`${preferenceText} ${questionText}`);
  const broaderContext = normalize(`${input.summaryText || ""} ${questionText} ${preferenceText}`);

  // O formato combinado é uma preferência específica do aluno, não um padrão global.
  // Uma menção histórica/genérica a "combinado" no resumo não pode contaminar outros alunos.
  const normalWorkoutRequested = /(nao quero(?: mais)?(?: o| um)? treino combinad|sem treino combinad|sem combinad|voltar (?:ao|pro|para o) treino normal|quero (?:voltar ao |voltar pro |um )?treino normal|prefiro (?:o )?treino normal|formato normal|metodo normal)/i.test(currentMethodContext);
  const explicitCombinedRequest = /(quero|prefiro|gostaria|preciso|pedido|solicito|formato|metodo|treino).{0,80}(treino )?(combinad|dinamic|sequencia metabol|metabolic|superset|super set|bi-set|biset|intercalad)|(combinad|sequencia metabol|superset|super set|bi-set|biset).{0,80}(quero|prefiro|gostaria|preciso|pedido|solicito)|um exercicio.{0,80}outro.{0,80}descans|uma serie de cada exercicio direto|a1.{0,30}a2.{0,80}descans/i.test(currentMethodContext);
  const combinedSequenceRequested = !normalWorkoutRequested && explicitCombinedRequest;
  const dynamicPairedSetsRequested = combinedSequenceRequested;
  const strengthOnlyBecauseRuns = /(ja corre|corrida|corredor|corredora).*(somente musculacao|so musculacao|apenas musculacao|musculacao na academia|cardio.*dias de corrida)|(somente musculacao|so musculacao|apenas musculacao|musculacao na academia).*(ja corre|corrida|corredor|corredora)/i.test(broaderContext);
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

  if (combinedSequenceRequested) {
    promptLines.push(
      "MÉTODO COMBINADO SOLICITADO: montar COMBINADOS/SEQUÊNCIAS com 2 ou 3 exercícios (A1/A2 ou A1/A2/A3, depois B1/B2 etc.). Fazer 1 série de cada exercício direto, sem descanso entre os exercícios do mesmo combinado; descansar somente depois do último exercício e então repetir a sequência.",
      "DESCANSO DOS COMBINADOS: em geral usar 45-60s após o último exercício do combinado; pode usar 30-60s quando a técnica e a segurança permitirem. Não inserir descanso entre A1 e A2/A3 além da transição necessária para trocar posição/equipamento.",
      "COERÊNCIA DO COMBINADO: os exercícios devem formar uma sequência lógica para o objetivo do treino, mas não precisam obrigatoriamente trabalhar o mesmo músculo. Pode combinar movimentos da mesma região, músculos complementares ou exercícios de regiões diferentes quando isso fizer sentido para densidade e logística.",
      "NEM TODO EXERCÍCIO PRECISA ESTAR EM COMBINADO: protocolos específicos, isometrias, exercícios terapêuticos/técnicos ou movimentos que exigem maior controle podem ficar isolados com seu próprio descanso.",
      "MARCAÇÃO NO JSON: em notes de cada exercício do combinado, começar com 'A1 —', 'A2 —', 'A3 —', 'B1 —', 'B2 —' etc. No restTime dos exercícios intermediários escrever 'sem descanso até A2/A3'; no último escrever, por exemplo, '45s após o combinado A'.",
      "VARIAÇÃO DA SEMANA: não repetir a mesma combinação de exercícios em todos os treinos. Mantenha o objetivo muscular/padrão, mas varie os exercícios quando houver alternativa segura na biblioteca."
    );
  }
  else {
    promptLines.push(
      "FORMATO PADRÃO NORMAL: este aluno NÃO solicitou treino combinado. Monte o treino no formato tradicional, com cada exercício apresentado e executado individualmente, cumprindo suas séries/repetições e o próprio descanso antes de seguir para o próximo.",
      "NO FORMATO NORMAL: não usar marcações A1/A2/A3, não criar blocos COMBINADOS e não escrever 'sem descanso até' outro exercício. Use ordem numérica normal e descanso próprio em cada exercício."
    );
  }

  if (strengthOnlyBecauseRuns) {
    promptLines.push(
      "MUSCULAÇÃO SEM CARDIO: o contexto informa que o aluno já corre em dias separados e quer a academia somente para musculação. Não adicionar cardio, HIIT, climber, corrida, bike, escada ou elíptico como parte deste treino de academia, salvo se houver pedido explícito posterior."
    );
  }

  return {
    dynamicPairedSetsRequested,
    combinedSequenceRequested,
    strengthOnlyBecauseRuns,
    recentExerciseNames,
    promptLines,
  };
}

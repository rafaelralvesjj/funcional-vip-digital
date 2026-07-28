import { prisma } from "@/lib/prisma";
import { getStudentTechnicalContext, formatStudentTechnicalContext } from "@/lib/student-technical-memory";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { calculateAgeYears, formatBirthDateInput, formatBirthDatePtBr } from "@/lib/student-age";
import { MANUAL_AI_EXECUTION_HEADER_LINES } from "@/lib/manual-ai-execution-header";
import { isStudentAssignedToProfessor, resolveStudentProfessor } from "@/lib/student-professor";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
}

function formatDate(value?: Date | string | null): string {
  if (!value) return "não informado";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value?: Date | string | null): string {
  if (!value) return "não informado";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMetric(value?: number | null, suffix = ""): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "não informado";
  }

  return `${Number(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}${suffix}`;
}

function diffMetric(before?: number | null, after?: number | null, suffix = ""): string {
  if (before === null || before === undefined || after === null || after === undefined) {
    return "sem comparação";
  }

  const diff = Number(after) - Number(before);
  const signal = diff > 0 ? "+" : "";

  return `${formatMetric(before, suffix)} → ${formatMetric(after, suffix)} (${signal}${formatMetric(diff, suffix)})`;
}

function getWeeklyWorkoutLimit(contractedTrainingDaysPerMonth?: number | null): number | null {
  const contracted = Number(contractedTrainingDaysPerMonth || 0);

  if (!Number.isFinite(contracted) || contracted <= 0) {
    return null;
  }

  if (contracted <= 4) return 1;
  if (contracted <= 8) return 2;
  if (contracted <= 12) return 3;
  if (contracted <= 16) return 4;

  return 5;
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

function getNextWeekRange(referenceDate: Date): { startOfWeek: Date; endOfWeek: Date } {
  const current = getWeekRange(referenceDate);
  const startOfWeek = new Date(current.startOfWeek);
  startOfWeek.setDate(startOfWeek.getDate() + 7);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  return { startOfWeek, endOfWeek };
}
function getStatusLabel(status?: string | null): string {
  const value = String(status || "").toUpperCase();

  if (value === "CONCLUIDO") return "concluído";
  if (value === "PENDENTE") return "pendente";

  return value || "não informado";
}

function normalizeText(value?: string | null): string {
  const text = String(value || "").trim();

  return text || "não informado";
}

function cleanText(value?: unknown): string {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "")
    .trim();
}

function normalizeForCompare(value?: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isNoneReported(value?: unknown): boolean {
  const normalized = normalizeForCompare(value);

  return [
    "nao",
    "nao tenho",
    "nao possui",
    "nao possuo",
    "nenhum",
    "nenhuma",
    "nennhum",
    "nennhuma",
    "sem",
    "sem restricao",
    "sem restricoes",
    "sem dor",
    "sem dores",
    "sem equipamento",
    "sem equipamentos",
  ].includes(normalized);
}

function displayText(value?: unknown, fallback = "não informado"): string {
  const text = cleanText(value);

  return text || fallback;
}

function displayEquipment(value?: unknown): string {
  const text = cleanText(value);

  if (!text) return "não informado";
  if (isNoneReported(text)) return "nenhum equipamento disponível";

  return text;
}

function displayPain(value?: unknown): string {
  const text = cleanText(value);

  if (!text) return "não informado";
  if (isNoneReported(text)) return "nenhuma dor/desconforto relatado";

  return text;
}

function displayRestriction(value?: unknown): string {
  const text = cleanText(value);

  if (!text) return "não informado";
  if (isNoneReported(text)) return "nenhuma restrição médica/física relatada";

  return text;
}

function displayMinutes(value?: unknown): string {
  const text = cleanText(value).replace(/\s*minuto\(s\)$/i, "").trim();

  return text ? `${text} minuto(s)` : "não informado";
}

function displayKg(value?: unknown): string {
  const text = cleanText(value).replace(/\s*kg$/i, "").trim();

  return text ? `${text} kg` : "não informado";
}

function displayCm(value?: unknown): string {
  const text = cleanText(value).replace(/\s*cm$/i, "").trim();

  return text ? `${text} cm` : "não informado";
}

function extractNotesLines(notes?: string | null): string[] {
  return String(notes || "")
    .split("\n")
    .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean);
}

function extractFromNotes(notes: string | null | undefined, labels: string[]): string {
  const lines = extractNotesLines(notes);

  for (const label of labels) {
    const prefix = `${label.toLowerCase()}:`;
    const line = lines.find((item) => item.toLowerCase().startsWith(prefix));

    if (line) {
      return cleanText(line.slice(label.length + 1));
    }
  }

  return "";
}
function buildCadastroNotes(notes?: string | null): string {
  const lines = extractNotesLines(notes);

  const relevant = lines.filter((line) => {
    const lower = line.toLowerCase();

    if (lower.startsWith("objetivo principal:")) return false;
    if (lower.startsWith("nível atual informado:")) return false;
    if (lower.startsWith("nivel atual informado:")) return false;
    if (lower.startsWith("ambiente de treino:")) return false;
    if (lower.startsWith("equipamentos/materiais disponíveis:")) return false;
    if (lower.startsWith("equipamentos/materiais disponiveis:")) return false;
    if (lower.startsWith("tempo disponível por treino:")) return false;
    if (lower.startsWith("tempo disponivel por treino:")) return false;
    if (lower.startsWith("dias/horários preferidos:")) return false;
    if (lower.startsWith("dias/horarios preferidos:")) return false;
    if (lower.startsWith("dor/desconforto atual informado:")) return false;
    if (lower.startsWith("restrição médica/física declarada:")) return false;
    if (lower.startsWith("restricao medica/fisica declarada:")) return false;
    if (lower.startsWith("histórico de treino:")) return false;
    if (lower.startsWith("historico de treino:")) return false;
    if (lower.startsWith("peso informado:")) return false;
    if (lower.startsWith("altura informada:")) return false;
    if (lower.startsWith("observações livres do aluno:")) return false;
    if (lower.startsWith("observacoes livres do aluno:")) return false;
    if (lower === "ficha inicial / mini-anamnese:") return false;

    return true;
  });

  return relevant.length ? relevant.join(" ") : "não informado";
}

function getOnboardingProfile(notes?: string | null) {
  const objective = extractFromNotes(notes, ["Objetivo principal", "Objetivo"]);
  const activityLevel = extractFromNotes(notes, [
    "Nível atual informado",
    "Nivel atual informado",
    "Nível atual",
    "Nivel atual",
  ]);
  const trainingEnvironment = extractFromNotes(notes, ["Ambiente de treino", "Local de treino"]);
  const availableEquipment = extractFromNotes(notes, [
    "Equipamentos/materiais disponíveis",
    "Equipamentos/materiais disponiveis",
    "Equipamentos disponíveis",
    "Equipamentos disponiveis",
    "Materiais disponíveis",
    "Materiais disponiveis",
  ]);
  const timeAvailableMinutes = extractFromNotes(notes, [
    "Tempo disponível por treino",
    "Tempo disponivel por treino",
  ]);
  const preferredDays = extractFromNotes(notes, [
    "Dias/horários preferidos",
    "Dias/horarios preferidos",
    "Dias preferidos",
  ]);
  const currentPain = extractFromNotes(notes, [
    "Dor/desconforto atual informado",
    "Dor/desconforto atual",
    "Dor atual",
  ]);
  const medicalRestriction = extractFromNotes(notes, [
    "Restrição médica/física declarada",
    "Restricao medica/fisica declarada",
    "Restrição médica/física",
    "Restricao medica/fisica",
    "Restrição médica",
    "Restricao medica",
  ]);
  const trainingHistory = extractFromNotes(notes, ["Histórico de treino", "Historico de treino"]);
  const weightKg = extractFromNotes(notes, ["Peso informado"]);
  const heightCm = extractFromNotes(notes, ["Altura informada"]);
  const initialNotes = extractFromNotes(notes, [
    "Observações livres do aluno",
    "Observacoes livres do aluno",
    "Observações do aluno",
    "Observacoes do aluno",
  ]);

  return {
    objective: displayText(objective),
    activityLevel: displayText(activityLevel),
    trainingEnvironment: displayText(trainingEnvironment),
    availableEquipment: displayEquipment(availableEquipment),
    timeAvailableMinutes: displayMinutes(timeAvailableMinutes),
    preferredDays: displayText(preferredDays),
    currentPain: displayPain(currentPain),
    medicalRestriction: displayRestriction(medicalRestriction),
    trainingHistory: displayText(trainingHistory),
    weightKg: displayKg(weightKg),
    heightCm: displayCm(heightCm),
    initialNotes: displayText(initialNotes),
    hasObjective: Boolean(cleanText(objective)),
  };
}

function hasRelevantCareInfo(value: string): boolean {
  const text = cleanText(value);

  if (!text || text === "não informado") return false;

  return !text.toLowerCase().startsWith("nenhum") && !text.toLowerCase().startsWith("nenhuma");
}

function containsAnyCareKeyword(value?: unknown, keywords: string[] = []): boolean {
  const normalized = normalizeForCompare(value);

  if (!normalized) return false;

  return keywords.some((keyword) => normalized.includes(normalizeForCompare(keyword)));
}

function hasPainOrInjurySignal(value?: unknown): boolean {
  return containsAnyCareKeyword(value, [
    "dor",
    "doendo",
    "dolorido",
    "dolorida",
    "desconforto",
    "torci",
    "torceu",
    "torcao",
    "torsao",
    "lesao",
    "lesão",
    "machuquei",
    "machucou",
    "lombar",
    "coluna",
    "joelho",
    "tornozelo",
    "pe",
    "pé",
    "panturrilha",
    "ombro",
    "punho",
  ]);
}

function hasDifficultExerciseSignal(value?: unknown): boolean {
  return containsAnyCareKeyword(value, [
    "dificil",
    "difícil",
    "pesado",
    "pesada",
    "nao consegui",
    "não consegui",
    "muito forte",
    "muito puxado",
    "cansativo demais",
    "travei",
  ]);
}

function hasLowMotivationSignal(value?: unknown): boolean {
  return containsAnyCareKeyword(value, [
    "sem tempo",
    "falta de tempo",
    "desmotivado",
    "desmotivada",
    "preguica",
    "preguiça",
    "nao fiz",
    "não fiz",
    "nao consegui fazer",
    "não consegui fazer",
  ]);
}

function getQuestionConversationText(question: any): string {
  const messages = [question, ...((question?.children || []) as any[])];

  return messages
    .map((message) => message?.content || "")
    .join(" ")
    .trim();
}

function getOnboardingOperationalLines(profile: ReturnType<typeof getOnboardingProfile>): string[] {
  const lines: string[] = [];

  if (profile.objective !== "não informado") {
    lines.push(`Objetivo principal do onboarding: ${profile.objective}.`);
  }

  if (profile.activityLevel !== "não informado") {
    lines.push(`Nível atual informado no onboarding: ${profile.activityLevel}.`);
  }

  if (profile.trainingEnvironment !== "não informado" || profile.availableEquipment !== "não informado") {
    lines.push(
      `Ambiente/equipamentos do onboarding: ${profile.trainingEnvironment}; equipamentos: ${profile.availableEquipment}.`
    );
    lines.push(
      "Regra operacional: a sugestão deve usar somente ambientes e equipamentos confirmados na ficha. Quando a estrutura estiver descrita como não confirmada, o professor deve validar antes de prescrever aparelhos específicos."
    );
  }

  if (profile.timeAvailableMinutes !== "não informado") {
    lines.push(`Tempo disponível por treino informado: ${profile.timeAvailableMinutes}.`);
  }

  if (profile.preferredDays !== "não informado") {
    lines.push(`Dias/horários preferidos informados: ${profile.preferredDays}.`);
  }

  if (hasRelevantCareInfo(profile.currentPain)) {
    lines.push(`Atenção ao relato de dor/desconforto do onboarding: ${profile.currentPain}.`);
  } else if (profile.currentPain !== "não informado") {
    lines.push(`Dor/desconforto no onboarding: ${profile.currentPain}.`);
  }

  if (hasRelevantCareInfo(profile.medicalRestriction)) {
    lines.push(`Atenção à restrição médica/física do onboarding: ${profile.medicalRestriction}.`);
  } else if (profile.medicalRestriction !== "não informado") {
    lines.push(`Restrição médica/física no onboarding: ${profile.medicalRestriction}.`);
  }

  const objectiveLower = profile.objective.toLowerCase();

  if (objectiveLower.includes("corrida")) {
    lines.push(
      "Como o objetivo envolve corrida, priorizar base, fortalecimento de pernas, glúteos, core, estabilidade, mobilidade de tornozelo/quadril e progressão gradual de impacto."
    );
  }

  if (objectiveLower.includes("emagrecimento")) {
    lines.push(
      "Como o objetivo envolve emagrecimento, comunicar contribuição para gasto energético e consistência, sem prometer perda de peso."
    );
  }

  if (
    objectiveLower.includes("lesão") ||
    objectiveLower.includes("lesao") ||
    objectiveLower.includes("prescrição") ||
    objectiveLower.includes("prescricao") ||
    objectiveLower.includes("reabilitação") ||
    objectiveLower.includes("reabilitacao")
  ) {
    lines.push(
      "Como há objetivo ligado a retomada, lesão, reabilitação ou prescrição médica, manter intensidade conservadora e validar restrições antes de evoluir carga ou impacto."
    );
  }

  return lines;
}

function calculateAdherence(completed: number, planned: number): string {
  if (!planned) return "sem treinos planejados";

  const percent = Math.round((completed / planned) * 100);

  return `${percent}% (${completed}/${planned})`;
}

function getTrendText(first: any | null, latest: any | null): string[] {
  if (!first || !latest || first.id === latest.id) {
    return ["Ainda não há duas avaliações para comparação completa."];
  }

  return [
    `Peso: ${diffMetric(first.peso, latest.peso, " kg")}`,
    `Abdômen: ${diffMetric(first.abdomen, latest.abdomen, " cm")}`,
    `Quadril: ${diffMetric(first.quadril, latest.quadril, " cm")}`,
    `Braço: ${diffMetric(first.braco, latest.braco, " cm")}`,
    `Coxa: ${diffMetric(first.coxa, latest.coxa, " cm")}`,
    `Glúteo: ${diffMetric(first.gluteo, latest.gluteo, " cm")}`,
  ];
}

function getEvolutionDecisionStatus({
  hasInjuryCare,
  hasTrainingPauseCare,
  hasDifficultExercise,
  hasLowMotivation,
  hasOpenPainQuestion,
  hasOpenDifficultQuestion,
  hasOpenLowMotivationQuestion,
  openQuestionsCount,
  openCareEventsCount,
  currentWeekPlansCount,
  currentWeekWorkoutsCount,
  currentWeekCompleted,
  overdueWorkoutsCount,
}: {
  hasInjuryCare: boolean;
  hasTrainingPauseCare: boolean;
  hasDifficultExercise: boolean;
  hasLowMotivation: boolean;
  hasOpenPainQuestion: boolean;
  hasOpenDifficultQuestion: boolean;
  hasOpenLowMotivationQuestion: boolean;
  openQuestionsCount: number;
  openCareEventsCount: number;
  currentWeekPlansCount: number;
  currentWeekWorkoutsCount: number;
  currentWeekCompleted: number;
  overdueWorkoutsCount: number;
}): { status: string; reason: string; requiresReviewBeforeRelease: boolean; reviewAlerts: string[] } {
  const reviewAlerts: string[] = [];

  if (hasTrainingPauseCare) {
    reviewAlerts.push("Aluno em pausa por cuidado: sem condição de treinar ou com impedimento relatado. Não gerar/liberar treino normal enquanto o evento estiver aberto.");
    return {
      status: "REVISAO_HUMANA_OBRIGATORIA",
      reason: "Existe evento de pausa por cuidado em aberto. O aluno não deve receber treino normal até sinalizar aptidão de retomada e o professor revisar.",
      requiresReviewBeforeRelease: true,
      reviewAlerts,
    };
  }
  if (hasInjuryCare || hasOpenPainQuestion || openQuestionsCount > 0 || openCareEventsCount > 0) {
    if (hasInjuryCare) reviewAlerts.push("Existe relato/evento de dor ou desconforto em aberto.");
    if (hasOpenPainQuestion) reviewAlerts.push("Existe dúvida aberta do aluno com relato de dor/desconforto. Revisão humana obrigatória antes de evoluir treino.");
    if (openQuestionsCount > 0) reviewAlerts.push(`Existe(m) ${openQuestionsCount} dúvida(s) aberta(s) do aluno. O professor deve responder/revisar antes da liberação.`);
    if (openCareEventsCount > 0) reviewAlerts.push(`Existem ${openCareEventsCount} evento(s) de cuidado em aberto.`);

    return {
      status: "REVISAO_HUMANA_OBRIGATORIA",
      reason: "Há dúvida aberta ou sinal sensível de cuidado. Não tratar a próxima prescrição como evolução automática.",
      requiresReviewBeforeRelease: true,
      reviewAlerts,
    };
  }

  if (currentWeekPlansCount > 0 && currentWeekWorkoutsCount === 0) {
    return {
      status: "PRE_PLANEJAMENTO_CONSERVADOR",
      reason: "A semana atual tem treino planejado, mas ainda não há execução registrada. A próxima semana deve ser tratada como pré-planejamento conservador.",
      requiresReviewBeforeRelease: true,
      reviewAlerts: [
        "Antes de liberar, confirmar se houve execução, dor, dúvida, baixa adesão ou necessidade de ajuste.",
        "Não evoluir carga, impacto ou complexidade sem evidência de resposta do aluno.",
      ],
    };
  }

  if (currentWeekWorkoutsCount === 0 && currentWeekPlansCount === 0) {
    return {
      status: "PRE_PLANEJAMENTO_CONSERVADOR",
      reason: "Ainda não existem dados recentes de treino planejado/executado na semana atual.",
      requiresReviewBeforeRelease: true,
      reviewAlerts: [
        "Usar ficha inicial e histórico disponível como base; não tratar como progressão evolutiva.",
        "Revisar novamente antes de liberar a próxima semana.",
      ],
    };
  }

  if (overdueWorkoutsCount >= 3 || currentWeekCompleted < currentWeekWorkoutsCount) {
    if (overdueWorkoutsCount >= 3) reviewAlerts.push("Há vários treinos vencidos/não concluídos no histórico.");
    if (currentWeekCompleted < currentWeekWorkoutsCount) reviewAlerts.push("Nem todos os treinos da semana atual foram concluídos.");
    return {
      status: "RETOMADA_REPETICAO_ADAPTADA",
      reason: "A adesão não sustenta progressão automática. Priorizar retomada, simplicidade e consistência.",
      requiresReviewBeforeRelease: true,
      reviewAlerts,
    };
  }

  if (hasDifficultExercise || hasLowMotivation || hasOpenDifficultQuestion || hasOpenLowMotivationQuestion) {
    if (hasDifficultExercise || hasOpenDifficultQuestion) reviewAlerts.push("Aluno relatou exercício/treino difícil.");
    if (hasLowMotivation || hasOpenLowMotivationQuestion) reviewAlerts.push("Há sinal de falta de tempo ou desmotivação.");

    return {
      status: "MANUTENCAO_RECOMENDADA",
      reason: "Há sinal comportamental/técnico que recomenda manter base e ajustar aderência antes de evoluir.",
      requiresReviewBeforeRelease: true,
      reviewAlerts,
    };
  }

  if (currentWeekWorkoutsCount > 0 && currentWeekCompleted === currentWeekWorkoutsCount) {
    return {
      status: "EVOLUCAO_PERMITIDA",
      reason: "Há registro de execução/conclusão suficiente e nenhum evento crítico aberto.",
      requiresReviewBeforeRelease: false,
      reviewAlerts: ["Ainda assim, o professor deve revisar técnica, dor, dúvidas e aderência antes de liberar."],
    };
  }

  return {
    status: "MANUTENCAO_RECOMENDADA",
    reason: "Dados ainda não sustentam progressão agressiva. Manter base, variar com cuidado e revisar antes de liberar.",
    requiresReviewBeforeRelease: true,
    reviewAlerts: ["Confirmar dados atualizados antes da liberação final."],
  };
}

function buildAiPrompt(summaryText: string): string {
  return [
    ...MANUAL_AI_EXECUTION_HEADER_LINES,
    "Você é um professor de educação física apoiando a montagem de um treino personalizado.",
    "",
    "Use APENAS o resumo do aluno abaixo para criar uma sugestão de treino. Não invente restrições, lesões, equipamentos ou metas que não estejam no resumo.",
    "",
    "Importante:",
    "- Não gere SQL.",
    "- Gere uma sugestão estruturada para o professor revisar.",
    "- O professor é responsável por validar, ajustar e cadastrar no sistema.",
    "- Se houver baixa adesão, priorize retomada, segurança e consistência antes de progressão agressiva.",
    "- A idade do aluno é um dado obrigatório e deve ser considerada na escolha de intensidade, volume, recuperação, complexidade e progressão.",
    "- Não use a idade isoladamente para presumir doença, incapacidade ou restrição não informada.",
    "- Se o aluno for menor de 18 anos, sinalize revisão humana obrigatória e mantenha progressão conservadora.",
    "- Se faltarem dados, indique quais informações precisam ser confirmadas.",
    "- Se a semana atual ainda não tem execução registrada, trate a próxima semana como pré-planejamento conservador, não como evolução.",
    "- Só recomende progressão de carga, impacto, volume ou complexidade quando houver dados de execução/adesão suficientes.",
    "- Se houver dor, dúvida aberta, baixa adesão ou evento de cuidado, sinalize revisão humana obrigatória antes da liberação.",
    "- Respeite estritamente os locais e equipamentos informados pelo aluno. Não prescreva aparelho, acessório ou estrutura que não esteja confirmado no resumo.",
    "- Quando constar 'nenhum equipamento', use apenas peso corporal e recursos seguros do ambiente descrito.",
    "- Quando a academia estiver com estrutura não confirmada, evite aparelhos específicos e peça validação do professor antes da liberação.",
    "- Quando houver mais de um local de treino, indique em cada treino ou exercício onde ele poderá ser executado.",
    "- Na justificativa técnica, explique como a escolha dos exercícios respeita o ambiente e os equipamentos disponíveis.",
    "",
    "Formato esperado:",
    "1. Leitura rápida do aluno",
    "2. Pontos de atenção",
    "3. Decisão evolutiva: evolução, manutenção, retomada/repetição adaptada, pré-planejamento conservador ou revisão humana obrigatória",
    "4. Estratégia da próxima semana",
    "5. Treinos sugeridos em formato estruturado:",
    "   - Nome do treino",
    "   - Data sugerida",
    "   - Objetivo do treino",
    "   - Exercícios",
    "   - Séries",
    "   - Repetições",
    "   - Carga sugerida ou orientação de carga",
    "   - Descanso",
    "   - Observações para o professor revisar",
    "6. Justificativa técnica da sugestão",
    "",
    "RESUMO DO ALUNO:",
    summaryText,
  ].join("\n");
}
async function canAccessStudent({
  userId,
  role,
  student,
}: {
  userId: string;
  role: string;
  student: {
    id: string;
    userId: string | null;
  };
}) {
  if (role === "GESTOR" || role === "ADMIN") return true;
  if (role === "TEACHER") {
    return isStudentAssignedToProfessor(student.id, userId);
  }

  return false;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);
    const studentId = params.id;

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (!studentId) {
      return NextResponse.json({ error: "ID do aluno obrigatório" }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: {
        id: studentId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        notes: true,
        active: true,
        userId: true,
        userAuthId: true,
        onboardingCompleto: true,
        contractedTrainingDaysPerMonth: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        userAuth: {
          select: {
            id: true,
            name: true,
            email: true,
            birthDate: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    const hasAccess = await canAccessStudent({
      userId,
      role,
      student,
    });
    if (!hasAccess) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const professor = await resolveStudentProfessor(student.id);
    const birthDate = student.userAuth?.birthDate || null;
    const birthDateInput = formatBirthDateInput(birthDate);
    const ageYears = calculateAgeYears(birthDate);
    const isMinor = ageYears !== null && ageYears < 18;

    if (!birthDate || !birthDateInput || ageYears === null) {
      return NextResponse.json(
        {
          error: "Data de nascimento não informada. Complete o cadastro do aluno antes de gerar o resumo IA.",
          code: "BIRTH_DATE_REQUIRED",
          studentId: student.id,
        },
        { status: 409 }
      );
    }
    const onboardingProfile = getOnboardingProfile(student.notes);
    const cadastroNotes = buildCadastroNotes(student.notes);

    const now = new Date();
    const currentWeek = getWeekRange(now);
    const nextWeek = getNextWeekRange(now);
    const weeklyLimit = getWeeklyWorkoutLimit(student.contractedTrainingDaysPerMonth);

    const [
      avaliacoes,
      workoutPlans,
      workouts,
      questions,
      notices,
      feedbacks,
      didYouKnowDeliveries,
      engagementNotifications,
      careEvents,
      trainingPreferences,
      exerciseProgress,
    ] = await Promise.all([
      prisma.avaliacao.findMany({
        where: {
          alunoId: studentId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
      }),

      prisma.workoutPlan.findMany({
        where: {
          studentId,
        },
        include: {
          exercises: {
            orderBy: {
              order: "asc",
            },
          },
          workouts: {
            select: {
              id: true,
              date: true,
              status: true,
              notes: true,
            },
            orderBy: {
              date: "desc",
            },
          },
        },
        orderBy: [
          {
            date: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        take: 30,
      }),

      prisma.workout.findMany({
        where: {
          studentId,
        },
        include: {
          workoutPlan: {
            select: {
              id: true,
              name: true,
              date: true,
            },
          },
        },
        orderBy: {
          date: "desc",
        },
        take: 120,
      }),

      prisma.question.findMany({
        where: {
          studentId,
          parentId: null,
        },
        include: {
          children: {
            orderBy: {
              createdAt: "asc",
            },
          },
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          answeredBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      }),

      prisma.notice.findMany({
        where: {
          OR: [
            {
              studentId,
            },
            {
              targetRole: {
                in: ["ALUNO", "STUDENT"],
              },
            },
          ],
        },
        select: {
          id: true,
          title: true,
          content: true,
          type: true,
          targetRole: true,
          expiresAt: true,
          createdAt: true,
          author: {
            select: {
              name: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 30,
      }),

      prisma.evolutionFeedback.findMany({
        where: {
          studentId,
        },
        orderBy: {
          milestone: "desc",
        },
        take: 10,
      }),

      prisma.didYouKnowDelivery.findMany({
        where: {
          studentId,
        },
        orderBy: {
          sentAt: "desc",
        },
        take: 10,
      }),

      prisma.workoutEngagementNotification.findMany({
        where: {
          studentId,
        },
        orderBy: {
          sentAt: "desc",
        },
        take: 20,
      }),

      prisma.studentCareEvent.findMany({
        where: {
          studentId,
        },
        include: {
          relatedWorkoutPlan: {
            select: {
              id: true,
              name: true,
              date: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      }),

      prisma.studentTrainingPreference.findMany({
        where: {
          studentId,
          status: "ACTIVE",
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 20,
      }),

      prisma.workoutExerciseProgress.findMany({
        where: { studentId },
        include: {
          exercise: { select: { id: true, name: true } },
          workoutPlan: { select: { id: true, name: true, date: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
    ]);

    const contentIds = Array.from(
      new Set(didYouKnowDeliveries.map((delivery) => delivery.contentId))
    );

    const didYouKnowContents = contentIds.length
      ? await prisma.didYouKnowContent.findMany({
          where: {
            id: {
              in: contentIds,
            },
          },
          select: {
            id: true,
            title: true,
            category: true,
          },
        })
      : [];

    const didYouKnowContentMap = new Map(
      didYouKnowContents.map((content) => [content.id, content])
    );

    const completedWorkouts = workouts.filter((workout) => workout.status === "CONCLUIDO");
    const overdueWorkouts = workouts.filter(
      (workout) => workout.status !== "CONCLUIDO" && workout.date < now
    );
    const pendingFutureWorkouts = workouts.filter(
      (workout) => workout.status !== "CONCLUIDO" && workout.date >= now
    );

    const currentWeekWorkouts = workouts.filter(
      (workout) => workout.date >= currentWeek.startOfWeek && workout.date < currentWeek.endOfWeek
    );
    const currentWeekPlans = workoutPlans.filter(
      (plan) => plan.date && plan.date >= currentWeek.startOfWeek && plan.date < currentWeek.endOfWeek
    );
    const nextWeekPlans = workoutPlans.filter(
      (plan) => plan.date && plan.date >= nextWeek.startOfWeek && plan.date < nextWeek.endOfWeek
    );

    const currentWeekCompleted = currentWeekWorkouts.filter((workout) => workout.status === "CONCLUIDO").length;

    const firstAvaliacao = avaliacoes.length > 0 ? avaliacoes[avaliacoes.length - 1] : null;
    const latestAvaliacao = avaliacoes[0] || null;

    const recentWorkoutLines = workoutPlans.slice(0, 8).map((plan) => {
      const exercises = plan.exercises
        .map((exercise) => {
          return `${exercise.order || 0}. ${exercise.name} — ${exercise.series || "-"} séries x ${exercise.reps || "-"} reps, carga: ${exercise.weight || "não informada"}, descanso: ${exercise.restTime || "não informado"}`;
        })
        .join("\n      ");
      const statusLine = plan.workouts.length
        ? plan.workouts.map((workout) => `${formatDate(workout.date)}: ${getStatusLabel(workout.status)}`).join("; ")
        : "sem execução registrada";

      return [
        `- ${plan.name} (${formatDate(plan.date || plan.createdAt)})`,
        `  Descrição: ${normalizeText(plan.description)}`,
        `  Objetivo para o aluno: ${normalizeText(plan.objective)}`,
        `  Foco do treino: ${normalizeText(plan.focusAreas)}`,
        `  Intensidade: ${normalizeText(plan.intensity)}`,
        `  Duração estimada: ${plan.estimatedDurationMinutes || "não informada"} min`,
        `  Gasto energético estimado: ${
          plan.estimatedCaloriesMin || plan.estimatedCaloriesMax
            ? `${plan.estimatedCaloriesMin || "?"} a ${plan.estimatedCaloriesMax || "?"} kcal`
            : "não informado"
        }`,
        `  Resumo para o aluno: ${normalizeText(plan.studentSummary)}`,
        `  Segurança: ${normalizeText(plan.safetyNote)}`,
        `  Observações: ${normalizeText(plan.notes)}`,
        `  Status/execução: ${statusLine}`,
        `  Exercícios:\n      ${exercises || "nenhum exercício cadastrado"}`,
      ].join("\n");
    });

    const questionLines = questions.slice(0, 8).map((question) => {
      const messages = [question, ...(question.children || [])];
      const lastMessage = messages[messages.length - 1];

      return [
        `- Criada em ${formatDateTime(question.createdAt)} para ${question.teacher?.name || question.teacherId ? "professor" : "gestão"}`,
        `  Status: ${question.resolvedAt ? "resolvida" : "em aberto"}`,
        `  Mensagens na conversa: ${messages.length}`,
        `  Última mensagem: ${normalizeText(lastMessage?.content).slice(0, 300)}`,
      ].join("\n");
    });

    const trainingPreferenceLines = trainingPreferences.map((preference) => {
      return [
        `- Categoria: ${preference.category}`,
        `  Preferência ativa: ${preference.summary}`,
        `  Mensagem original do aluno: ${preference.originalMessage}`,
        `  Registrada em: ${formatDateTime(preference.updatedAt)}`,
      ].join("\n");
    });

    const noticeLines = notices.slice(0, 8).map((notice) => {
      return `- ${formatDate(notice.createdAt)} | ${notice.title || notice.type} | tipo ${notice.type} | expira: ${notice.expiresAt ? formatDate(notice.expiresAt) : "não expira"}`;
    });

    const feedbackLines = feedbacks.map((feedback) => {
      return `- Marco ${feedback.milestone} treinos | status: ${feedback.status} | criado: ${formatDate(feedback.createdAt)} | enviado: ${formatDate(feedback.sentAt)}`;
    });

    const educationLines = didYouKnowDeliveries.map((delivery) => {
      const content = didYouKnowContentMap.get(delivery.contentId);

      return `- ${formatDate(delivery.sentAt)} | ${content?.title || "conteúdo não localizado"} | categoria: ${content?.category || "não informada"}`;
    });

    const engagementLines = engagementNotifications.slice(0, 10).map((item) => {
      return `- ${formatDate(item.sentAt)} | ${item.eventType} | canal: ${item.channel}`;
    });
    const careLines = careEvents.slice(0, 12).map((event) => {
      return [
        `- ${formatDate(event.createdAt)} | ${event.title} | tipo: ${event.eventType} | severidade: ${event.severity} | status: ${event.status}`,
        `  Relato: ${normalizeText(event.description).slice(0, 350)}`,
        `  Leitura para treino: ${normalizeText(event.professorMessage).slice(0, 500)}`,
        event.relatedWorkoutPlan
          ? `  Treino relacionado: ${event.relatedWorkoutPlan.name} (${formatDate(event.relatedWorkoutPlan.date)})`
          : "  Treino relacionado: não informado",
      ].join("\n");
    });

    const effortLabel: Record<string, string> = {
      FACIL: "fácil",
      NA_MEDIDA: "na medida",
      DIFICIL: "difícil",
    };
    const completedExerciseProgress = exerciseProgress.filter((item) => item.status === "CONCLUIDO");
    const skippedExerciseProgress = exerciseProgress.filter((item) => item.status === "PULADO");
    const difficultExerciseProgress = completedExerciseProgress.filter((item) => item.effort === "DIFICIL");
    const easyExerciseProgress = completedExerciseProgress.filter((item) => item.effort === "FACIL");
    const ratedExerciseProgress = completedExerciseProgress.filter((item) => Boolean(item.effort));

    const exerciseHistoryMap = new Map<string, {
      name: string;
      completed: number;
      easy: number;
      adequate: number;
      difficult: number;
      skipped: number;
      skipReasons: string[];
      lastDate: Date;
    }>();

    for (const item of exerciseProgress) {
      const current = exerciseHistoryMap.get(item.exerciseId) || {
        name: item.exercise.name,
        completed: 0,
        easy: 0,
        adequate: 0,
        difficult: 0,
        skipped: 0,
        skipReasons: [],
        lastDate: item.workoutDate,
      };
      if (item.status === "CONCLUIDO") {
        current.completed += 1;
        if (item.effort === "FACIL") current.easy += 1;
        if (item.effort === "NA_MEDIDA") current.adequate += 1;
        if (item.effort === "DIFICIL") current.difficult += 1;
      }
      if (item.status === "PULADO") {
        current.skipped += 1;
        if (item.skipReason && !current.skipReasons.includes(item.skipReason)) current.skipReasons.push(item.skipReason);
      }
      if (item.workoutDate > current.lastDate) current.lastDate = item.workoutDate;
      exerciseHistoryMap.set(item.exerciseId, current);
    }

    const exerciseProgressLines = Array.from(exerciseHistoryMap.values())
      .sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime())
      .slice(0, 30)
      .map((item) => {
        const effortParts = [
          item.easy ? `${item.easy} fácil` : "",
          item.adequate ? `${item.adequate} na medida` : "",
          item.difficult ? `${item.difficult} difícil` : "",
        ].filter(Boolean).join(", ");
        return `- ${item.name}: ${item.completed} execução(ões)${effortParts ? ` (${effortParts})` : ""}; ${item.skipped} não realizada(s)${item.skipReasons.length ? `; motivos: ${item.skipReasons.join(" | ")}` : ""}; último registro: ${formatDate(item.lastDate)}`;
      });

    const recentExerciseProgressLines = exerciseProgress.slice(0, 60).map((item) => {
      const outcome = item.status === "CONCLUIDO"
        ? `feito${item.effort ? ` — esforço ${effortLabel[item.effort] || item.effort}` : " — sem avaliação de esforço"}`
        : item.status === "PULADO"
          ? `não realizado — motivo: ${item.skipReason || "não informado"}`
          : "pendente";
      return `- ${formatDate(item.workoutDate)} | ${item.workoutPlan.name} | ${item.exercise.name} | ${outcome}`;
    });

    const openCareEvents = careEvents.filter((event) => event.status !== "RESOLVIDO");
    const openQuestions = questions.filter((question) => !question.resolvedAt);
    const openQuestionTexts = openQuestions.map(getQuestionConversationText);
    const hasTrainingPauseCare = openCareEvents.some((event) => event.eventType === "PAUSA_POR_CUIDADO");
    const hasInjuryCare = openCareEvents.some((event) => {
      const eventType = String(event.eventType || "").toUpperCase();
      const severity = String(event.severity || "").toUpperCase();
      return eventType === "DOR_DESCONFORTO" || eventType === "RELATO_DOR_DUVIDA" || severity === "CUIDADO";
    });
    const hasDifficultExercise = openCareEvents.some((event) => event.eventType === "EXERCICIO_DIFICIL") || difficultExerciseProgress.length > 0;
    const hasSkippedForPain = skippedExerciseProgress.some((item) => /dor|desconforto/i.test(String(item.skipReason || "")));
    const hasSkippedForEquipment = skippedExerciseProgress.some((item) => /equipamento/i.test(String(item.skipReason || "")));
    const hasSkippedForUnderstanding = skippedExerciseProgress.some((item) => /não entendi|nao entendi/i.test(String(item.skipReason || "")));
    const hasLowMotivation = openCareEvents.some((event) => event.eventType === "DESMOTIVACAO" || event.eventType === "FALTA_TEMPO");
    const hasOpenPainQuestion = openQuestionTexts.some(hasPainOrInjurySignal);
    const hasOpenDifficultQuestion = openQuestionTexts.some(hasDifficultExerciseSignal);
    const hasOpenLowMotivationQuestion = openQuestionTexts.some(hasLowMotivationSignal);
    const baseEvolutionDecision = getEvolutionDecisionStatus({
      hasInjuryCare,
      hasTrainingPauseCare,
      hasDifficultExercise,
      hasLowMotivation,
      hasOpenPainQuestion,
      hasOpenDifficultQuestion,
      hasOpenLowMotivationQuestion,
      openQuestionsCount: openQuestions.length,
      openCareEventsCount: openCareEvents.length,
      currentWeekPlansCount: currentWeekPlans.length,
      currentWeekWorkoutsCount: currentWeekWorkouts.length,
      currentWeekCompleted,
      overdueWorkoutsCount: overdueWorkouts.length,
    });
    const evolutionDecision = isMinor
      ? {
          ...baseEvolutionDecision,
          requiresReviewBeforeRelease: true,
          reviewAlerts: Array.from(
            new Set([
              ...baseEvolutionDecision.reviewAlerts,
              "Aluno menor de 18 anos: revisar a proposta com atenção à idade, maturidade, histórico, supervisão e contexto informado antes de liberar.",
            ])
          ),
        }
      : baseEvolutionDecision;
    const onboardingOperationalLines = getOnboardingOperationalLines(onboardingProfile);

    const baseSummaryText = [
      "RESUMO COMPLETO DO ALUNO — FUNCIONAL VIP DIGITAL",
      "",
      "1) Identificação",
      `Aluno: ${student.name}`,
      `E-mail: ${student.email || student.userAuth?.email || "não informado"}`,
      `Telefone: ${student.phone || "não informado"}`,
      `Data de nascimento: ${formatBirthDatePtBr(birthDate)}`,
      `Idade atual: ${ageYears} ano(s)`,
      `Faixa etária: ${isMinor ? "menor de 18 anos — revisão humana obrigatória" : "18 anos ou mais"}`,
      `Status: ${student.active ? "ativo" : "inativo"}`,
      `Cadastro em: ${formatDate(student.createdAt)}`,
      `Onboarding/bioimpedância inicial completa: ${student.onboardingCompleto ? "sim" : "não"}`,
      `Professor responsável: ${professor?.name || "não vinculado"} (${professor?.email || "sem e-mail"})`,
      `Treinos contratados/mês: ${student.contractedTrainingDaysPerMonth || "não informado"}`,
      `Meta semanal estimada: ${weeklyLimit ? `${weeklyLimit} treino(s)/semana` : "não configurada"}`,
      `Observações cadastrais: ${cadastroNotes}`,
      "",
      "Ficha inicial / mini-anamnese:",
      `Objetivo principal: ${onboardingProfile.objective}`,
      `Nível atual informado: ${onboardingProfile.activityLevel}`,
      `Ambiente de treino: ${onboardingProfile.trainingEnvironment}`,
      `Equipamentos/materiais disponíveis: ${onboardingProfile.availableEquipment}`,
      `Tempo disponível por treino: ${onboardingProfile.timeAvailableMinutes}`,
      `Dias/horários preferidos: ${onboardingProfile.preferredDays}`,
      `Dor/desconforto atual informado: ${onboardingProfile.currentPain}`,
      `Restrição médica/física declarada: ${onboardingProfile.medicalRestriction}`,
      `Histórico de treino: ${onboardingProfile.trainingHistory}`,
      `Peso informado: ${onboardingProfile.weightKg}`,
      `Altura informada: ${onboardingProfile.heightCm}`,
      `Observações livres do aluno: ${onboardingProfile.initialNotes}`,
      "",
      "2) Objetivo e avaliação/bioimpedância",
      `Objetivo principal cadastrado no onboarding: ${onboardingProfile.objective}`,
      `Total de avaliações registradas: ${avaliacoes.length}`,
      `Primeira avaliação: ${firstAvaliacao ? formatDate(firstAvaliacao.createdAt) : "não informada"}`,
      `Última avaliação: ${latestAvaliacao ? formatDate(latestAvaliacao.createdAt) : "não informada"}`,
      latestAvaliacao
        ? [
            `Objetivo atual: ${normalizeText(latestAvaliacao.objetivo)}`,
            `Meta específica: ${normalizeText(latestAvaliacao.metaEspecifica)}`,
            `Peso atual: ${formatMetric(latestAvaliacao.peso, " kg")}`,
            `Altura: ${formatMetric(latestAvaliacao.altura, " m")}`,
            `Abdômen: ${formatMetric(latestAvaliacao.abdomen, " cm")}`,
            `Quadril: ${formatMetric(latestAvaliacao.quadril, " cm")}`,
            `Braço: ${formatMetric(latestAvaliacao.braco, " cm")}`,
            `Coxa: ${formatMetric(latestAvaliacao.coxa, " cm")}`,
            `Glúteo: ${formatMetric(latestAvaliacao.gluteo, " cm")}`,
            `Preferências: ${normalizeText(latestAvaliacao.preferencia)}`,
            `Equipamentos disponíveis: ${normalizeText(latestAvaliacao.equipamentos)}`,
            `Frequência informada: ${latestAvaliacao.frequencia || "não informada"}`,
            `Nível de atividade: ${normalizeText(latestAvaliacao.nivelAtividade)}`,
            `Lesões/restrições informadas: ${normalizeText(latestAvaliacao.lesoes)}`,
          ].join("\n")
        : "Nenhuma avaliação encontrada.",
      "",
      "Comparação primeira x última avaliação:",
      ...getTrendText(firstAvaliacao, latestAvaliacao),
      "",
      "3) Histórico de treino e adesão",
      `Treinos planejados/registrados: ${workouts.length}`,
      `Treinos concluídos: ${completedWorkouts.length}`,
      `Treinos vencidos não concluídos: ${overdueWorkouts.length}`,
      `Treinos pendentes futuros: ${pendingFutureWorkouts.length}`,
      `Adesão geral: ${calculateAdherence(completedWorkouts.length, workouts.length)}`,
      `Semana atual: ${formatDate(currentWeek.startOfWeek)} a ${formatDate(new Date(currentWeek.endOfWeek.getTime() - 1))}`,
      `Planos criados para a semana atual: ${currentWeekPlans.length}${weeklyLimit ? `/${weeklyLimit}` : ""}`,
      `Execuções registradas na semana atual: ${currentWeekWorkouts.length}; concluídas: ${currentWeekCompleted}; adesão semanal: ${calculateAdherence(currentWeekCompleted, currentWeekWorkouts.length)}`,
      `Próxima semana: ${formatDate(nextWeek.startOfWeek)} a ${formatDate(new Date(nextWeek.endOfWeek.getTime() - 1))}`,
      `Treinos já planejados para próxima semana: ${nextWeekPlans.length}${weeklyLimit ? `/${weeklyLimit}` : ""}`,
      "",
      "Contexto evolutivo para próxima prescrição:",
      `Status de decisão: ${evolutionDecision.status}`,
      `Motivo: ${evolutionDecision.reason}`,
      `Exige revisão antes de liberar: ${evolutionDecision.requiresReviewBeforeRelease ? "sim" : "não"}`,
      `Alertas de revisão: ${evolutionDecision.reviewAlerts.length ? evolutionDecision.reviewAlerts.join(" | ") : "sem alertas críticos"}`,
      "Regra de evolução: não aumentar carga, impacto, volume ou complexidade sem evidência suficiente de execução/adesão e sem checar dor, dúvidas e eventos de cuidado.",
      "Se não houver execução recente, a próxima semana deve ser tratada como pré-planejamento conservador ou repetição adaptada, nunca como evolução automática.",
      "",
      "Últimos planos de treino com exercícios:",
      recentWorkoutLines.length ? recentWorkoutLines.join("\n\n") : "Nenhum plano de treino encontrado.",
      "",
      "4) Execução por exercício e percepção de esforço",
      `Registros de exercícios: ${exerciseProgress.length}; feitos: ${completedExerciseProgress.length}; avaliados: ${ratedExerciseProgress.length}; difíceis: ${difficultExerciseProgress.length}; fáceis: ${easyExerciseProgress.length}; não realizados: ${skippedExerciseProgress.length}.`,
      "Resumo acumulado por exercício:",
      exerciseProgressLines.length ? exerciseProgressLines.join("\n") : "Nenhum progresso por exercício registrado.",
      "Registros recentes:",
      recentExerciseProgressLines.length ? recentExerciseProgressLines.join("\n") : "Nenhum registro recente por exercício.",
      "Regra obrigatória para a próxima prescrição: exercícios avaliados repetidamente como difíceis não devem receber aumento automático de carga, volume, impacto ou complexidade; exercícios repetidamente fáceis podem ser considerados para progressão conservadora somente se não houver dor, cuidado aberto ou baixa adesão; exercícios pulados exigem análise do motivo e alternativa adequada.",
      "",
      "5) Preferências ativas de treino registradas pelo aluno",
      trainingPreferenceLines.length
        ? trainingPreferenceLines.join("\n")
        : "Nenhuma preferência estruturada registrada no chat.",
      "Regra: tratar essas preferências como contexto obrigatório para os próximos treinos, salvo conflito com segurança, contrato, ambiente, equipamentos ou decisão técnica do professor.",
      "",
      "6) Dúvidas e interações com professor/gestão",
      questionLines.length ? questionLines.join("\n") : "Nenhuma dúvida encontrada.",
      "",
      "7) Avisos relevantes recentes",
      noticeLines.length ? noticeLines.join("\n") : "Nenhum aviso recente encontrado.",
      "",
      "8) Feedbacks de evolução",
      feedbackLines.length ? feedbackLines.join("\n") : "Nenhum feedback de evolução encontrado.",
      "",
      "9) Dicas do Professor recebidas",
      educationLines.length ? educationLines.join("\n") : "Nenhuma Dica do Professor encontrada.",
      "",
      "10) Régua de engajamento/alertas automáticos recentes",
      engagementLines.length ? engagementLines.join("\n") : "Nenhum alerta automático recente encontrado.",
      "",
      "11) Sinais recentes de cuidado do aluno",
      careLines.length ? careLines.join("\n") : "Nenhum sinal de cuidado registrado.",
      "",
      "12) Leitura operacional para montagem de treino",
      `Considerar a idade atual de ${ageYears} ano(s) na definição de intensidade, volume, descanso, recuperação, complexidade e progressão, sempre em conjunto com histórico, objetivo, adesão, dores e restrições informadas.`,
      isMinor
        ? "Aluno menor de 18 anos: manter revisão humana obrigatória, progressão conservadora e atenção à supervisão/contexto informado."
        : "Aluno com 18 anos ou mais: ainda assim, idade não substitui avaliação individual nem autoriza presumir restrições não registradas.",
      onboardingOperationalLines.length
        ? onboardingOperationalLines.join("\n")
        : "Ficha inicial ainda não trouxe dados suficientes. Confirmar objetivo, nível, ambiente, equipamentos e restrições antes de montar treino.",
      trainingPreferences.length > 0
        ? `Existem ${trainingPreferences.length} preferência(s) ativa(s) registrada(s) no chat. A sugestão deve respeitá-las e explicar qualquer exceção técnica.`
        : "Não há preferência estruturada adicional registrada no chat.",
      hasTrainingPauseCare
        ? "Aluno em PAUSA POR CUIDADO. Não montar/liberar treino normal enquanto o evento estiver aberto. Aguardar aptidão de retomada e revisão do professor."
        : "Sem pausa por cuidado registrada.",
      openCareEvents.length > 0
        ? `Existem ${openCareEvents.length} evento(s) de cuidado em aberto. Revisar antes de montar ou progredir treino.`
        : "Não há eventos de cuidado em aberto.",
      openQuestions.length > 0
        ? `Existem ${openQuestions.length} dúvida(s) aberta(s) do aluno. O professor deve revisar/responder antes de liberar a próxima semana.`
        : "Não há dúvidas abertas do aluno.",
      hasInjuryCare || hasOpenPainQuestion
        ? "Atenção: há relato aberto de dor/desconforto em evento de cuidado ou dúvida/chat. Não gerar progressão agressiva. Priorizar segurança, regressão, revisão humana e, se necessário, orientação para avaliação profissional."
        : "Sem relato aberto de dor/desconforto.",
      hasDifficultExercise || hasOpenDifficultQuestion
        ? "Atenção: aluno relatou exercício/treino difícil. Sugerir variações mais simples, menor volume, menor carga ou instruções mais claras."
        : "Sem relato aberto de exercício difícil.",
      hasLowMotivation || hasOpenLowMotivationQuestion
        ? "Atenção: há sinal de falta de tempo/desmotivação. Priorizar treino curto, objetivo e aderente."
        : "Sem sinal aberto de falta de tempo/desmotivação.",
      difficultExerciseProgress.length > 0
        ? `Existem ${difficultExerciseProgress.length} registro(s) recente(s) de exercício difícil. Revisar os movimentos, reduzir dificuldade quando necessário e não evoluir automaticamente.`
        : "Sem exercício recente marcado como difícil.",
      easyExerciseProgress.length > 0
        ? `Existem ${easyExerciseProgress.length} registro(s) de exercício fácil. Progressão só pode ser conservadora e condicionada a boa execução, ausência de dor e adesão suficiente.`
        : "Sem exercício recente marcado como fácil.",
      hasSkippedForPain
        ? "Há exercício não realizado por dor/desconforto. Priorizar segurança e revisão humana antes de repetir o movimento."
        : "Nenhum exercício recente foi pulado por dor/desconforto.",
      hasSkippedForEquipment
        ? "Há exercício não realizado por equipamento indisponível. Criar alternativa compatível com o ambiente e os recursos reais do aluno."
        : "Sem bloqueio recente por falta de equipamento.",
      hasSkippedForUnderstanding
        ? "Há exercício não realizado por falta de entendimento. Melhorar instruções, imagem/vídeo e orientar pelo chat antes de repetir."
        : "Sem bloqueio recente por dúvida de execução.",
      weeklyLimit
        ? `A sugestão de treino deve respeitar aproximadamente ${weeklyLimit} treino(s) por semana, conforme os dias contratados.`
        : "A meta semanal ainda não está configurada; confirmar quantidade de treinos antes de montar.",
      overdueWorkouts.length >= 3
        ? "Atenção: aluno com vários treinos não concluídos. Priorizar retomada, simplicidade e aderência antes de avançar progressão."
        : overdueWorkouts.length > 0
          ? "Atenção: aluno tem treinos não concluídos. Avaliar se é melhor adaptar ou repetir parte da programação."
          : "Sem sinal forte de baixa adesão pelo histórico de treinos vencidos.",
      latestAvaliacao?.lesoes
        ? `Considerar restrições/lesões informadas: ${latestAvaliacao.lesoes}.`
        : "Nenhuma lesão/restrição registrada na última avaliação; confirmar com o aluno se houver dúvida.",
      "Ao sugerir resumo para o aluno, explicar objetivo, foco, intensidade e duração estimada em linguagem simples.",
      "Gasto energético deve aparecer como faixa aproximada e conservadora, nunca como promessa de perda de calorias ou resultado corporal.",
    ].join("\n");

    const technicalContext = await getStudentTechnicalContext(student.id);
    const summaryText = [
      baseSummaryText,
      "",
      "12) Histórico inteligente e memória técnica aprovada",
      formatStudentTechnicalContext(technicalContext),
    ].join("\n");

    const aiPrompt = buildAiPrompt(summaryText);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      student: {
        id: student.id,
        name: student.name,
        birthDate: birthDateInput,
        ageYears,
        isMinor,
        professorName: professor?.name || null,
        weeklyLimit,
      },
      metrics: {
        avaliacoes: avaliacoes.length,
        workoutPlans: workoutPlans.length,
        workouts: workouts.length,
        completedWorkouts: completedWorkouts.length,
        overdueWorkouts: overdueWorkouts.length,
        pendingFutureWorkouts: pendingFutureWorkouts.length,
        currentWeekPlans: currentWeekPlans.length,
        currentWeekWorkouts: currentWeekWorkouts.length,
        currentWeekCompleted,
        nextWeekPlans: nextWeekPlans.length,
        feedbacks: feedbacks.length,
        questions: questions.length,
        openQuestions: openQuestions.length,
        careEvents: careEvents.length,
        openCareEvents: openCareEvents.length,
        exerciseProgress: exerciseProgress.length,
        completedExerciseProgress: completedExerciseProgress.length,
        skippedExerciseProgress: skippedExerciseProgress.length,
        difficultExerciseProgress: difficultExerciseProgress.length,
        easyExerciseProgress: easyExerciseProgress.length,
      },
      evolutionContext: evolutionDecision,
      summaryText,
      aiPrompt,
    });
  } catch (error: any) {
    console.error("GET /api/students/[id]/ai-summary error:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error?.message },
      { status: 500 }
    );
  }
}

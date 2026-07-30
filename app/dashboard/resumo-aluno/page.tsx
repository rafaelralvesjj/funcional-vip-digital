"use client";
import { MANUAL_AI_EXECUTION_HEADER_LINES } from "@/lib/manual-ai-execution-header";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type StudentOption = {
  id: string;
  name: string;
  email?: string | null;
  professorName?: string | null;
  contractedTrainingDaysPerMonth?: number | null;
  birthDate?: string | null;
  ageYears?: number | null;
  isMinor?: boolean;
  hasBirthDate?: boolean;
};

type SummaryResponse = {
  ok: boolean;
  generatedAt: string;
  student: {
    id: string;
    name: string;
    birthDate?: string | null;
    ageYears?: number | null;
    isMinor?: boolean;
    professorName?: string | null;
    weeklyLimit?: number | null;
  };
  metrics: Record<string, number>;
  evolutionContext?: {
    status?: string;
    reason?: string;
    requiresReviewBeforeRelease?: boolean;
    reviewAlerts?: string[];
  } | null;
  summaryText: string;
  aiPrompt: string;
};

type LibraryExercise = {
  id: string;
  name: string;
  description: string;
  muscleGroup: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  active?: boolean;
  objectiveTags?: string | null;
  locationTags?: string | null;
  equipmentTags?: string | null;
  restrictionTags?: string | null;
  levelTags?: string | null;
  intensity?: string | null;
  instructions?: string | null;
  safetyNotes?: string | null;
  commonMistakes?: string | null;
  substitutions?: string | null;
  contraindications?: string | null;
};

function parseDateInput(value?: string | null): Date | null {
  if (!value) return null;

  const date = new Date(`${value}T12:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
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

function getNextMonday(referenceDate = new Date()): Date {
  const date = new Date(referenceDate);
  date.setHours(12, 0, 0, 0);

  const day = date.getDay();
  const daysUntilNextMonday = day === 0 ? 1 : 8 - day;

  date.setDate(date.getDate() + daysUntilNextMonday);
  return date;
}

function getSafePlanningWeekStartIso(dateValue?: string | null): {
  weekStartIso: string;
  redirectedToNextWeek: boolean;
  reason?: string;
} {
  const parsedDate = parseDateInput(dateValue);
  const requestedWeekStart = parsedDate
    ? getWeekRange(parsedDate).startOfWeek
    : getNextMonday();

  const currentWeek = getWeekRange(new Date());
  const todayDay = new Date().getDay();
  const selectedCurrentWeek = requestedWeekStart.getTime() === currentWeek.startOfWeek.getTime();
  const unsafeCurrentWeekWindow = selectedCurrentWeek && [5, 6, 0].includes(todayDay);

  if (unsafeCurrentWeekWindow) {
    return {
      weekStartIso: formatIsoDate(currentWeek.endOfWeek),
      redirectedToNextWeek: true,
      reason: "Esta semana já não possui janela segura de execução. O planejamento foi direcionado para a próxima semana.",
    };
  }

  return {
    weekStartIso: formatIsoDate(requestedWeekStart),
    redirectedToNextWeek: false,
  };
}


function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseExpectedWorkoutDatesParam(value?: string | null): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));
}

function getWeekdayNameFromDateInput(value: string): string {
  const parsedDate = parseDateInput(value);

  if (!parsedDate) return "data informada";

  return parsedDate.toLocaleDateString("pt-BR", {
    weekday: "long",
  });
}

function getTrainingScheduleFromExpectedDates(expectedWorkoutDates: string[]) {
  return expectedWorkoutDates.map((date, index) => ({
    offset: index,
    weekday: getWeekdayNameFromDateInput(date),
    date,
  }));
}

function resolveWeekStartIso(dateValue?: string | null): string {
  const parsedDate = parseDateInput(dateValue);

  if (parsedDate) {
    return formatIsoDate(getWeekRange(parsedDate).startOfWeek);
  }

  return formatIsoDate(getNextMonday());
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getTrainingWeekdayOffsets(contractedTrainingDaysPerMonth?: number | null): number[] {
  const contracted = Number(contractedTrainingDaysPerMonth || 0);

  if (!Number.isFinite(contracted) || contracted <= 0) return [];

  if (contracted <= 4) return [0];
  if (contracted <= 8) return [0, 2];
  if (contracted <= 12) return [0, 2, 4];
  if (contracted <= 16) return [0, 1, 3, 4];

  return [0, 1, 2, 3, 4];
}

function getWeekdayName(offset: number): string {
  const names: Record<number, string> = {
    0: "segunda-feira",
    1: "terça-feira",
    2: "quarta-feira",
    3: "quinta-feira",
    4: "sexta-feira",
  };

  return names[offset] || "dia útil";
}

function getTrainingSchedule(contractedTrainingDaysPerMonth?: number | null, weekStartIso?: string | null) {
  const weekStartDate = parseDateInput(weekStartIso) || getNextMonday();
  const offsets = getTrainingWeekdayOffsets(contractedTrainingDaysPerMonth);

  return offsets.map((offset) => ({
    offset,
    weekday: getWeekdayName(offset),
    date: formatIsoDate(addDays(weekStartDate, offset)),
  }));
}

function getTrainingScheduleDescription(contractedTrainingDaysPerMonth?: number | null): string {
  const contracted = Number(contractedTrainingDaysPerMonth || 0);

  if (!Number.isFinite(contracted) || contracted <= 0) {
    return "Quantidade contratada não configurada. Confirmar antes de montar treino.";
  }

  if (contracted <= 4) {
    return `Contrato de ${contracted} dia(s)/mês: gerar 1 treino por semana, preferencialmente na segunda-feira.`;
  }

  if (contracted <= 8) {
    return `Contrato de ${contracted} dias/mês: gerar 2 treinos por semana, intercalados em segunda-feira e quarta-feira.`;
  }

  if (contracted <= 12) {
    return `Contrato de ${contracted} dias/mês: gerar 3 treinos por semana, em segunda-feira, quarta-feira e sexta-feira.`;
  }

  if (contracted <= 16) {
    return `Contrato de ${contracted} dias/mês: gerar 4 treinos por semana, em segunda-feira, terça-feira, quinta-feira e sexta-feira. Quarta-feira fica sem treino.`;
  }

  return `Contrato de ${contracted} dias/mês: gerar 5 treinos por semana, de segunda-feira a sexta-feira, sem folga em dia útil.`;
}

function getAiValidationContext({
  studentId,
  contractedTrainingDaysPerMonth,
  weekStartIso,
  fallbackWorkoutCount,
  expectedWorkoutDatesOverride,
}: {
  studentId: string;
  contractedTrainingDaysPerMonth?: number | null;
  weekStartIso?: string | null;
  fallbackWorkoutCount?: number | null;
  expectedWorkoutDatesOverride?: string[];
}) {
  const weekStart = resolveWeekStartIso(weekStartIso);
  const weekStartDate = parseDateInput(weekStart) || getNextMonday();
  const weekEnd = formatIsoDate(addDays(weekStartDate, 6));
  const schedule = getTrainingSchedule(contractedTrainingDaysPerMonth, weekStart);
  const expectedWorkoutDates = expectedWorkoutDatesOverride && expectedWorkoutDatesOverride.length > 0
    ? expectedWorkoutDatesOverride
    : schedule.map((item) => item.date);
  const expectedWorkoutCount = expectedWorkoutDates.length || Number(fallbackWorkoutCount || 1);
  const validationKey = [
    "FVD",
    studentId,
    weekStart,
    String(expectedWorkoutCount),
    expectedWorkoutDates.join("_"),
  ].join("|");

  return {
    studentId,
    weekStart,
    weekEnd,
    expectedWorkoutDates,
    expectedWorkoutCount,
    validationKey,
  };
}

function normalizeCareText(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function hasOpenCarePause(summaryData?: SummaryResponse | null): boolean {
  if (!summaryData) return false;

  /*
   * Regra correta:
   * bloquear somente quando a API informar que existe evento de cuidado
   * realmente aberto para o aluno.
   *
   * Não usamos mais busca de palavras dentro do resumo, motivo ou alertas,
   * porque esses textos podem citar "pausa por cuidado" apenas como orientação
   * geral e gerar falso bloqueio mesmo quando a Central de Cuidado está zerada.
   */
  const openCareEvents = Number(summaryData.metrics?.openCareEvents || 0);

  if (Number.isFinite(openCareEvents) && openCareEvents > 0) {
    return true;
  }

  /*
   * Compatibilidade para respostas futuras da API que tragam um status
   * estruturado e explícito de bloqueio, mesmo sem o contador.
   */
  const evolution = summaryData.evolutionContext || null;
  const status = normalizeCareText(evolution?.status);
  const explicitBlockingStatuses = [
    "PAUSA_POR_CUIDADO",
    "CARE_PAUSE",
    "BLOQUEADO_POR_CUIDADO",
    "BLOQUEIO_POR_CUIDADO",
  ];

  return (
    evolution?.requiresReviewBeforeRelease === true &&
    explicitBlockingStatuses.includes(status)
  );
}

function getCarePauseBlockedText(summaryData: SummaryResponse): string {
  const alerts = summaryData.evolutionContext?.reviewAlerts || [];

  return [
    "BLOQUEIO DE SEGURANÇA — PAUSA POR CUIDADO",
    "",
    `Aluno: ${summaryData.student.name}`,
    "Status da IA: REVISAO_HUMANA_OBRIGATORIA",
    "",
    "Este aluno possui pausa por cuidado aberta ou sinal de que está sem condição de treinar.",
    "Não gere JSON de treino normal enquanto este evento estiver aberto.",
    "",
    "O que fazer agora:",
    "1. Revisar a Central de Cuidado do Aluno.",
    "2. Responder/orientar o aluno se ainda houver dúvida aberta.",
    "3. Aguardar o aluno sinalizar que está apto para retomar.",
    "4. O professor deve revisar a retomada antes de montar/liberar novo treino.",
    "",
    "Regras do sistema:",
    "- Não montar treino evolutivo.",
    "- Não liberar treino normal.",
    "- Não usar este caso como baixa adesão comum.",
    "- Se houver dor persistente, limitação, queda, torção importante ou orientação médica pendente, orientar avaliação com profissional habilitado.",
    "",
    alerts.length > 0 ? "Alertas registrados:" : "Alertas registrados: nenhum alerta adicional informado.",
    ...alerts.map((alert) => `- ${alert}`),
  ].join("\n");
}


function applyContractScheduleToWorkouts(
  workouts: any[],
  contractedTrainingDaysPerMonth?: number | null,
  weekStartIso?: string | null,
  expectedWorkoutDatesOverride?: string[]
): {
  workouts: any[];
  scheduleDescription: string;
  scheduleWarning?: string;
} {
  const schedule = expectedWorkoutDatesOverride && expectedWorkoutDatesOverride.length > 0
    ? getTrainingScheduleFromExpectedDates(expectedWorkoutDatesOverride)
    : getTrainingSchedule(contractedTrainingDaysPerMonth, weekStartIso);
  const scheduleDescription = getTrainingScheduleDescription(contractedTrainingDaysPerMonth);

  if (schedule.length === 0) {
    return {
      workouts,
      scheduleDescription,
      scheduleWarning: "Não foi possível aplicar calendário automático porque a quantidade contratada não está configurada.",
    };
  }

  const originalCount = workouts.length;
  const limitedWorkouts = workouts.slice(0, schedule.length);

  const scheduledWorkouts = limitedWorkouts.map((workout, index) => {
    const scheduledDay = schedule[index];

    return {
      ...workout,
      date: scheduledDay?.date || workout.date || "",
      notes: [
        workout.notes,
        scheduledDay
          ? `Calendário automático aplicado: ${scheduledDay.weekday}, ${scheduledDay.date}.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

  let scheduleWarning: string | undefined;

  if (originalCount > schedule.length) {
    scheduleWarning = `A IA gerou ${originalCount} treinos, mas o contrato permite ${schedule.length} treino(s) na semana. O sistema importou apenas os ${schedule.length} primeiros.`;
  }

  if (originalCount < schedule.length) {
    scheduleWarning = `A IA gerou ${originalCount} treino(s), mas o contrato sugere ${schedule.length} treino(s) na semana. Gere novamente ou complemente manualmente.`;
  }

  return {
    workouts: scheduledWorkouts,
    scheduleDescription,
    scheduleWarning,
  };
}

export default function ResumoAlunoPage() {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [viewMode, setViewMode] = useState<"prompt" | "summary" | "jsonPrompt">("jsonPrompt");
  const [aiJsonText, setAiJsonText] = useState("");
  const [targetWeekStart, setTargetWeekStart] = useState("");
  const [targetExpectedWorkoutDates, setTargetExpectedWorkoutDates] = useState<string[]>([]);
  const [safeWindowNotice, setSafeWindowNotice] = useState<string | null>(null);
  const [exerciseLibrary, setExerciseLibrary] = useState<LibraryExercise[]>([]);
  const [loadingExerciseLibrary, setLoadingExerciseLibrary] = useState(true);

  async function loadStudents(preselectId?: string | null) {
    setLoadingStudents(true);

    try {
      const res = await fetch("/api/students/ai-summary", {
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.students) ? data.students : [];
        setStudents(list);

        const idFromUrl = preselectId || "";
        const exists = list.some((student: StudentOption) => student.id === idFromUrl);

        if (exists) {
          setSelectedStudentId(idFromUrl);
        } else if (list.length > 0) {
          setSelectedStudentId(list[0].id);
        }
      } else {
        setMessage({ type: "error", text: "Erro ao carregar alunos." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar alunos." });
    }

    setLoadingStudents(false);
  }

  async function loadExerciseLibrary() {
    setLoadingExerciseLibrary(true);

    try {
      const res = await fetch("/api/exercise-library?active=1", {
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.exercises) ? data.exercises : [];
        setExerciseLibrary(list);
      } else {
        setExerciseLibrary([]);
      }
    } catch {
      setExerciseLibrary([]);
    }

    setLoadingExerciseLibrary(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const weekDateFromUrl = params.get("date") || params.get("weekStart");
    const expectedDatesFromUrl = parseExpectedWorkoutDatesParam(
      params.get("expectedWorkoutDates") || params.get("expectedDates")
    );

    const safeWeek = getSafePlanningWeekStartIso(weekDateFromUrl);

    setTargetWeekStart(safeWeek.weekStartIso);
    setTargetExpectedWorkoutDates(safeWeek.redirectedToNextWeek ? [] : expectedDatesFromUrl);
    setSafeWindowNotice(safeWeek.reason || null);

    if (safeWeek.reason) {
      setMessage({ type: "error", text: safeWeek.reason });
    }

    loadStudents(params.get("studentId"));
    loadExerciseLibrary();
  }, []);

  const selectedStudent = useMemo(() => {
    return students.find((student) => student.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);
  const selectedStudentMissingBirthDate =
    Boolean(selectedStudent) &&
    (selectedStudent?.ageYears === null || selectedStudent?.ageYears === undefined);

  function compactText(value?: unknown): string {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function joinTextParts(parts: Array<string | null | undefined>): string {
    return parts
      .map((part) => compactText(part))
      .filter(Boolean)
      .join(" ");
  }

  function buildExercisePurpose(exercise: LibraryExercise): string {
    const objectiveText = compactText(exercise.objectiveTags)
      ? `objetivo=${compactText(exercise.objectiveTags)}`
      : "";

    return joinTextParts([
      exercise.description ? `praQueServe=${exercise.description}` : null,
      objectiveText,
    ]);
  }

  function buildExerciseSafetyGuidance(exercise: LibraryExercise): string {
    return joinTextParts([
      exercise.safetyNotes ? `cuidadosExecucao=${exercise.safetyNotes}` : null,
      exercise.restrictionTags ? `tagsCuidado=${exercise.restrictionTags}` : null,
      exercise.commonMistakes ? `errosComuns=${exercise.commonMistakes}` : null,
      exercise.contraindications ? `contraindicacoes=${exercise.contraindications}` : null,
    ]);
  }

  function getExerciseLibraryPromptLines(): string[] {
    if (exerciseLibrary.length === 0) {
      return [
        "BIBLIOTECA DE EXERCÍCIOS PERMITIDOS:",
        "- Nenhum exercício cadastrado/ativo encontrado. Não gere treino enquanto a biblioteca estiver vazia.",
      ];
    }

    const lines = exerciseLibrary.map((exercise, index) => {
      const tags = [
        exercise.muscleGroup ? `grupo=${exercise.muscleGroup}` : null,
        exercise.levelTags ? `nível=${exercise.levelTags}` : null,
        exercise.locationTags ? `local=${exercise.locationTags}` : null,
        exercise.equipmentTags ? `equipamento=${exercise.equipmentTags}` : null,
        exercise.objectiveTags ? `objetivo=${exercise.objectiveTags}` : null,
        exercise.restrictionTags ? `cuidados=${exercise.restrictionTags}` : null,
        exercise.intensity ? `intensidade=${exercise.intensity}` : null,
      ]
        .filter(Boolean)
        .join("; ");

      const purpose = buildExercisePurpose(exercise);
      const execution = compactText(exercise.instructions)
        ? `comoExecutar=${compactText(exercise.instructions)}`
        : "";
      const safety = buildExerciseSafetyGuidance(exercise);

      return `${index + 1}. exerciseId=${exercise.id} | nome=${exercise.name} | ${tags || "sem tags"} | ${purpose || `praQueServe=${exercise.description}`} | ${execution || "comoExecutar=não informado"} | ${safety || "cuidadosExecucao=não informado"}`;
    });

    return [
      "BIBLIOTECA DE EXERCÍCIOS PERMITIDOS:",
      "Use SOMENTE os exercícios abaixo. Cada exercício do JSON deve trazer exerciseId exatamente igual ao cadastrado.",
      "Não invente exercícios. Não use exercício sem exerciseId.",
      "Use os campos praQueServe, comoExecutar e cuidadosExecucao da biblioteca para preencher finalidade, orientação e segurança do exercício.",
      "Se a biblioteca não trouxer algum desses campos, deixe simples e sinalize revisão do professor; não invente contraindicações.",
      ...lines,
    ];
  }

  function findLibraryExerciseByPayload(exercise: any): LibraryExercise | null {
    const exerciseId = String(
      exercise?.exerciseId ||
        exercise?.libraryExerciseId ||
        exercise?.exerciseLibraryId ||
        ""
    ).trim();

    if (!exerciseId) return null;

    return exerciseLibrary.find((item) => item.id === exerciseId) || null;
  }

  function getJsonPrompt(summaryData: SummaryResponse): string {
    if (hasOpenCarePause(summaryData)) {
      return getCarePauseBlockedText(summaryData);
    }

    const contractedDays = selectedStudent?.contractedTrainingDaysPerMonth || null;
    const validationContext = getAiValidationContext({
      studentId: summaryData.student.id,
      contractedTrainingDaysPerMonth: contractedDays,
      weekStartIso: targetWeekStart,
      fallbackWorkoutCount: summaryData.student.weeklyLimit,
      expectedWorkoutDatesOverride: targetExpectedWorkoutDates,
    });
    const schedule = validationContext.expectedWorkoutDates.length > 0
      ? getTrainingScheduleFromExpectedDates(validationContext.expectedWorkoutDates)
      : getTrainingSchedule(contractedDays, validationContext.weekStart);
    const scheduleDescription = getTrainingScheduleDescription(contractedDays);
    const expectedWorkoutCount = validationContext.expectedWorkoutCount;
    const scheduleLines = schedule.length
      ? schedule.map((item, index) => `- Treino ${index + 1}: ${item.weekday}, ${item.date}`)
      : ["- Sem calendário automático porque a quantidade contratada não está configurada."];
    const expectedDatesJson = validationContext.expectedWorkoutDates
      .map((item) => `"${item}"`)
      .join(", ");

    return [
      ...MANUAL_AI_EXECUTION_HEADER_LINES,
      "Você é um professor de educação física apoiando a montagem de treino.",
      "",
      "Com base no resumo do aluno abaixo, gere uma sugestão de treinos em JSON válido.",
      "",
      "ENTREGA OBRIGATÓRIA:",
      "- Gere um arquivo .txt para download contendo somente o JSON válido.",
      "- Nome sugerido do arquivo: treino_" + summaryData.student.name.replaceAll(" ", "_").toLowerCase() + ".txt",
      "- Não renderize o JSON longo diretamente na tela se conseguir entregar o arquivo .txt.",
      "- O conteúdo do arquivo .txt deve começar com { e terminar com }.",
      "- O arquivo .txt não pode ter markdown, comentários, explicações ou texto antes/depois do JSON.",
      "- Se você não conseguir gerar arquivo .txt, responda somente com o JSON puro, sem markdown.",
      "",
      "REGRAS IMPORTANTES:",
      "- Não gere SQL.",
      "- Não use markdown.",
      "- Não coloque comentários no JSON.",
      "- O professor vai revisar tudo antes de salvar.",
      "- Se a adesão estiver baixa, priorize retomada, simplicidade, segurança e consistência.",
      "- Se faltarem dados, use observações para o professor confirmar antes de aplicar.",
      "- Gere um resumo humanizado para o aluno entender o objetivo da sessão.",
      "- O gasto calórico deve ser sempre uma faixa estimada, nunca uma promessa exata.",
      "- A estimativa de calorias deve ser conservadora e compatível com duração, intensidade e objetivo do aluno.",
      "- Se o aluno tiver baixa adesão, dor/desconforto ou retomada, evite estimativas agressivas e priorize segurança.",
      "- Para objetivo de emagrecimento, fale em contribuição para gasto energético e consistência, não em promessa de perda de peso.",
      "- Para hipertrofia/força, priorize estímulo muscular, técnica e progressão, não calorias.",
      "",
      "REGRA DE EVOLUÇÃO E PRÉ-PLANEJAMENTO:",
      "- Antes de prescrever, classifique a decisão evolutiva em um destes status: EVOLUCAO_PERMITIDA, MANUTENCAO_RECOMENDADA, RETOMADA_REPETICAO_ADAPTADA, PRE_PLANEJAMENTO_CONSERVADOR ou REVISAO_HUMANA_OBRIGATORIA.",
      "- Se a semana atual ainda não tem execução registrada, trate a próxima semana como PRE_PLANEJAMENTO_CONSERVADOR.",
      "- Se o aluno não concluiu treinos, teve baixa adesão ou tem treinos vencidos, priorize RETOMADA_REPETICAO_ADAPTADA.",
      "- Se houver dor/desconforto, restrição, dúvida aberta ou evento de cuidado, sinalize REVISAO_HUMANA_OBRIGATORIA e não gere progressão agressiva.",
      "- Só use EVOLUCAO_PERMITIDA quando houver dados suficientes de execução/adesão e ausência de alertas críticos.",
      "- Não evolua carga, impacto, volume, complexidade ou intensidade sem evidência de resposta do aluno.",
      "- Mesmo em pré-planejamento, crie treino seguro, conservador e revisável pelo professor antes da liberação ao aluno.",
      "",
      "REGRA DE JANELA SEGURA DE INÍCIO:",
      "- O aluno não começa atrasado; ele começa na primeira janela segura de acompanhamento.",
      "- Se a entrada ou tentativa de planejamento cair em sexta-feira, sábado ou domingo, não gere treino para a semana atual. Direcione para a próxima semana.",
      "- Treino atrasado não acumula. A próxima prescrição deve respeitar a semana real de execução do aluno.",
      "- Sábado e domingo não devem ser usados para iniciar uma semana de treino normal.",
      "",
      "REGRA DE SEGURANÇA DO SISTEMA:",
      "- O JSON deve devolver o bloco aiValidation exatamente como informado no formato obrigatório.",
      "- Não altere studentId, weekStart, weekEnd, expectedWorkoutDates, expectedWorkoutCount nem validationKey.",
      "- Se esses campos forem alterados, o Funcional UP Digital vai bloquear a importação para evitar treino no aluno ou semana errada.",
      "",
      "REGRA DA BIBLIOTECA OFICIAL:",
      "- Use somente exercícios cadastrados na biblioteca abaixo.",
      "- Cada exercício precisa ter exerciseId.",
      "- Não invente exercícios fora da biblioteca.",
      "- O sistema vai bloquear qualquer exercício sem exerciseId válido.",
      "",
      ...getExerciseLibraryPromptLines(),
      "",
      "REGRA DE CALENDÁRIO DO CONTRATO:",
      scheduleDescription,
      `Semana alvo obrigatória: ${validationContext.weekStart} a ${validationContext.weekEnd}.`,
      `Quantidade exata esperada no JSON: ${expectedWorkoutCount} treino(s).`,
      "Datas obrigatórias para esta semana:",
      ...scheduleLines,
      "",
      "FORMATO OBRIGATÓRIO DO JSON:",
      "{",
      '  "studentId": "' + summaryData.student.id + '",',
      '  "studentName": "' + summaryData.student.name.replaceAll('"', "'") + '",',
      '  "aiValidation": {',
      '    "studentId": "' + validationContext.studentId + '",',
      '    "weekStart": "' + validationContext.weekStart + '",',
      '    "weekEnd": "' + validationContext.weekEnd + '",',
      '    "expectedWorkoutCount": ' + validationContext.expectedWorkoutCount + ',',
      '    "expectedWorkoutDates": [' + expectedDatesJson + '],',
      '    "validationKey": "' + validationContext.validationKey + '"',
      '  },',
      '  "evolutionDecision": {',
      '    "status": "PRE_PLANEJAMENTO_CONSERVADOR",',
      '    "reason": "Explique a decisão com base no resumo: evolução, manutenção, retomada, pré-planejamento ou revisão humana obrigatória.",',
      '    "requiresReviewBeforeRelease": true,',
      '    "reviewAlerts": ["Professor deve revisar dados atualizados antes de liberar a próxima semana"]',
      '  },',
      '  "workouts": [',
      "    {",
      '      "name": "Treino A - nome do treino",',
      '      "date": "' + (schedule[0]?.date || "AAAA-MM-DD") + '",',
      '      "description": "descrição técnica curta do treino",',
      '      "objective": "objetivo principal da sessão, em linguagem simples para o aluno",',
      '      "focusAreas": "grupos musculares ou capacidades trabalhadas, ex: pernas, glúteos, core e condicionamento",',
      '      "intensity": "leve, moderada ou alta",',
      '      "estimatedDurationMinutes": 40,',
      '      "estimatedCaloriesMin": 180,',
      '      "estimatedCaloriesMax": 300,',
      '      "studentSummary": "resumo humanizado para o aluno entender o porquê do treino",',
      '      "safetyNote": "observação de segurança, deixando claro que gasto calórico é estimativa e que dor não deve ser ignorada",',
      '      "notes": "observações para o professor revisar",',
      '      "exercises": [',
      "        {",
      '          "exerciseId": "id-exato-da-biblioteca",',
      '          "name": "Nome do exercício cadastrado na biblioteca",',
      '          "description": "descrição curta do exercício conforme biblioteca",',
      '          "purpose": "pra que serve este exercício, usando a biblioteca oficial",',
      '          "instructions": "como executar, usando a biblioteca oficial",',
      '          "safetyGuidance": "cuidados para executar com segurança, usando a biblioteca oficial",',
      '          "series": 3,',
      '          "reps": "10-12",',
      '          "weight": "carga leve/moderada ou a definir",',
      '          "restTime": "60s",',
      '          "notes": "observações de segurança/progressão",',
      '          "order": 0',
      "        }",
      "      ]",
      "    }",
      "  ]",
      "}",
      "",
      "RESUMO DO ALUNO:",
      summaryData.summaryText,
    ].join("\\n");
  }

  function extractJsonFromText(rawText: string): any {
    const raw = rawText.trim();

    if (!raw) {
      throw new Error("Cole o JSON gerado pela IA.");
    }

    const codeBlockMatch = raw.match(/```(?:json)?\\s*([\\s\\S]*?)```/i);
    const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : raw;

    return JSON.parse(candidate);
  }

  function normalizeAiWorkoutPayload(payload: any): any {
    const workouts = Array.isArray(payload?.workouts)
      ? payload.workouts
      : Array.isArray(payload?.treinos)
        ? payload.treinos
        : [];

    const payloadStudentId = String(payload?.studentId || "");

    if (!payloadStudentId) {
      throw new Error("O JSON precisa ter studentId.");
    }

    if (payloadStudentId !== selectedStudentId) {
      throw new Error("Este JSON não pertence ao aluno selecionado. Gere o resumo novamente pela tela correta.");
    }

    if (workouts.length === 0) {
      throw new Error("O JSON precisa ter pelo menos um treino em workouts.");
    }

    if (exerciseLibrary.length === 0) {
      throw new Error("A biblioteca de exercícios está vazia. Cadastre exercícios antes de importar treino da IA.");
    }

    const contractedDays = selectedStudent?.contractedTrainingDaysPerMonth || null;
    const expectedContext = getAiValidationContext({
      studentId: selectedStudentId,
      contractedTrainingDaysPerMonth: contractedDays,
      weekStartIso: targetWeekStart,
      expectedWorkoutDatesOverride: targetExpectedWorkoutDates,
    });
    const aiValidation = payload?.aiValidation || payload?.security || null;

    if (!aiValidation) {
      throw new Error("O JSON não possui aiValidation. Copie novamente o Prompt JSON atualizado e gere outro arquivo pela IA.");
    }

    if (String(aiValidation.studentId || "") !== expectedContext.studentId) {
      throw new Error("A chave de segurança não pertence ao aluno selecionado.");
    }

    if (String(aiValidation.weekStart || "") !== expectedContext.weekStart) {
      throw new Error("Este JSON é de outra semana. Gere novamente o resumo pela pendência correta.");
    }

    if (String(aiValidation.weekEnd || "") !== expectedContext.weekEnd) {
      throw new Error("A data final da semana não confere com a semana selecionada.");
    }

    if (Number(aiValidation.expectedWorkoutCount || 0) !== expectedContext.expectedWorkoutCount) {
      throw new Error("A quantidade de treinos do JSON não confere com o contrato/semana selecionados.");
    }

    const validationDates = Array.isArray(aiValidation.expectedWorkoutDates)
      ? aiValidation.expectedWorkoutDates.map((item: unknown) => String(item))
      : [];

    if (expectedContext.expectedWorkoutDates.length > 0) {
      const expectedDatesText = expectedContext.expectedWorkoutDates.join(", ");
      const validationDatesText = validationDates.join(", ");

      if (validationDatesText !== expectedDatesText) {
        throw new Error("As datas esperadas do aiValidation não conferem com a semana selecionada.");
      }

      if (workouts.length !== expectedContext.expectedWorkoutDates.length) {
        throw new Error(`O contrato espera ${expectedContext.expectedWorkoutDates.length} treino(s) nesta semana, mas o JSON trouxe ${workouts.length}.`);
      }
    }

    if (String(aiValidation.validationKey || "") !== expectedContext.validationKey) {
      throw new Error("A chave de validação não confere. Gere novamente o resumo pela tela correta.");
    }

    const rawEvolutionDecision = payload?.evolutionDecision || payload?.evolucao || payload?.evolution || null;
    const evolutionDecision = {
      status: String(rawEvolutionDecision?.status || "PRE_PLANEJAMENTO_CONSERVADOR"),
      reason: String(rawEvolutionDecision?.reason || rawEvolutionDecision?.motivo || "Treino importado para revisão do professor."),
      requiresReviewBeforeRelease:
        rawEvolutionDecision?.requiresReviewBeforeRelease === false || rawEvolutionDecision?.requerRevisaoAntesDeLiberar === false
          ? false
          : true,
      reviewAlerts: Array.isArray(rawEvolutionDecision?.reviewAlerts)
        ? rawEvolutionDecision.reviewAlerts.map((item: unknown) => String(item))
        : Array.isArray(rawEvolutionDecision?.alertasRevisao)
          ? rawEvolutionDecision.alertasRevisao.map((item: unknown) => String(item))
          : ["Professor deve revisar dados atualizados antes de liberar a próxima semana."],
    };

    const normalizedWorkouts = workouts.map((workout: any, workoutIndex: number) => {
      const workoutDate = String(workout?.date || workout?.data || "");
      const expectedDate = expectedContext.expectedWorkoutDates[workoutIndex];

      if (expectedDate && workoutDate !== expectedDate) {
        throw new Error(`A data do treino ${workoutIndex + 1} deveria ser ${expectedDate}, mas veio ${workoutDate || "sem data"}.`);
      }

      return {
        name: String(workout?.name || workout?.nome || `Treino ${workoutIndex + 1}`),
        date: workoutDate,
        description: String(workout?.description || workout?.descricao || ""),
        objective: String(workout?.objective || workout?.objetivo || ""),
        focusAreas: String(workout?.focusAreas || workout?.focus_areas || workout?.focos || workout?.foco || ""),
        intensity: String(workout?.intensity || workout?.intensidade || ""),
        estimatedDurationMinutes:
          Number(workout?.estimatedDurationMinutes || workout?.estimated_duration_minutes || workout?.duracaoEstimadaMinutos || 0) || null,
        estimatedCaloriesMin:
          Number(workout?.estimatedCaloriesMin || workout?.estimated_calories_min || workout?.caloriasMin || 0) || null,
        estimatedCaloriesMax:
          Number(workout?.estimatedCaloriesMax || workout?.estimated_calories_max || workout?.caloriasMax || 0) || null,
        studentSummary: String(workout?.studentSummary || workout?.student_summary || workout?.resumoAluno || workout?.resumo || ""),
        safetyNote: String(workout?.safetyNote || workout?.safety_note || workout?.observacaoSeguranca || ""),
        notes: String(workout?.notes || workout?.observacoes || ""),
        exercises: (Array.isArray(workout?.exercises) ? workout.exercises : workout?.exercicios || []).map((exercise: any, index: number) => {
          const libraryExercise = findLibraryExerciseByPayload(exercise);

          if (!libraryExercise) {
            throw new Error(`O exercício ${index + 1} do treino ${workoutIndex + 1} não possui exerciseId válido da biblioteca oficial.`);
          }

          return {
            libraryExerciseId: libraryExercise.id,
            exerciseId: libraryExercise.id,
            name: libraryExercise.name,
            description: String(exercise?.description || exercise?.descricao || libraryExercise.description || ""),
            purpose: String(exercise?.purpose || exercise?.praQueServe || libraryExercise.description || ""),
            instructions: String(exercise?.instructions || exercise?.comoExecutar || libraryExercise.instructions || libraryExercise.description || ""),
            safetyGuidance: String(exercise?.safetyGuidance || exercise?.cuidadosExecucao || buildExerciseSafetyGuidance(libraryExercise) || ""),
            commonMistakes: String(exercise?.commonMistakes || exercise?.errosComuns || libraryExercise.commonMistakes || ""),
            contraindications: String(exercise?.contraindications || exercise?.contraindicacoes || libraryExercise.contraindications || ""),
            series: Number(exercise?.series || exercise?.serie || exercise?.sets || 3),
            reps: String(exercise?.reps || exercise?.repeticoes || exercise?.repetições || "10"),
            weight: String(exercise?.weight || exercise?.carga || ""),
            restTime: String(exercise?.restTime || exercise?.descanso || "60s"),
            notes: String(exercise?.notes || exercise?.observacoes || ""),
            order: Number.isFinite(Number(exercise?.order)) ? Number(exercise.order) : index,
            imageUrl: libraryExercise.imageUrl || null,
            videoUrl: libraryExercise.videoUrl || null,
          };
        }),
      };
    });

    const scheduled = applyContractScheduleToWorkouts(
      normalizedWorkouts,
      contractedDays,
      expectedContext.weekStart,
      expectedContext.expectedWorkoutDates
    );

    return {
      source: "ai-summary",
      createdAt: new Date().toISOString(),
      studentId: payloadStudentId,
      studentName: payload?.studentName || selectedStudent?.name || "",
      aiValidation: expectedContext,
      evolutionDecision,
      currentIndex: 0,
      scheduleDescription: scheduled.scheduleDescription,
      scheduleWarning: scheduled.scheduleWarning,
      workouts: scheduled.workouts,
    };
  }

  function openJsonInWorkoutBuilder() {
    if (hasOpenCarePause(summary)) {
      setMessage({
        type: "error",
        text: "Aluno em pausa por cuidado. Não é permitido importar JSON de treino normal enquanto o evento estiver aberto.",
      });
      return;
    }

    try {
      const parsed = extractJsonFromText(aiJsonText);
      const normalized = normalizeAiWorkoutPayload(parsed);

      localStorage.setItem("aiWorkoutDraftBatch", JSON.stringify(normalized));
      setMessage({ type: "success", text: "JSON validado. Abrindo tela de montar treino com os dados preenchidos." });

      const firstWorkoutDate = normalized.aiValidation.expectedWorkoutDates?.[0] || normalized.aiValidation.weekStart;
      window.location.href = `/dashboard/montar-treino?studentId=${encodeURIComponent(normalized.studentId)}&date=${encodeURIComponent(firstWorkoutDate)}&source=ai-json`;
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error?.message || "JSON inválido. Copie novamente a resposta da IA.",
      });
    }
  }

  async function generateSummary() {
    if (!selectedStudentId) {
      setMessage({ type: "error", text: "Selecione um aluno." });
      return;
    }

    if (selectedStudentMissingBirthDate) {
      setMessage({
        type: "error",
        text: "Data de nascimento não informada. A gestão precisa completar o cadastro antes de gerar o resumo IA.",
      });
      return;
    }

    if (!loadingExerciseLibrary && exerciseLibrary.length === 0) {
      setMessage({
        type: "error",
        text: "A biblioteca de exercícios está vazia. Cadastre exercícios antes de gerar treino por IA.",
      });
      return;
    }

    setLoadingSummary(true);
    setMessage(null);
    setSummary(null);

    try {
      const res = await fetch(`/api/students/${selectedStudentId}/ai-summary`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.ok) {
        setSummary(data);
        setViewMode("jsonPrompt");

        if (hasOpenCarePause(data)) {
          setMessage({
            type: "error",
            text: "Resumo gerado, mas o aluno está em pausa por cuidado. Não gere JSON de treino normal enquanto o evento estiver aberto.",
          });
        } else {
          setMessage({ type: "success", text: "Resumo gerado com sucesso." });
        }
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao gerar resumo." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao gerar resumo." });
    }

    setLoadingSummary(false);
  }

  async function copyText(text: string, successText: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ type: "success", text: successText });
    } catch {
      setMessage({ type: "error", text: "Não foi possível copiar. Selecione o texto manualmente." });
    }
  }

  function downloadText() {
    if (!summary) return;

    const content = textToShow;
    const filename = `resumo-aluno-${summary.student.name.replaceAll(" ", "-").toLowerCase()}.txt`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }

  const hasCarePauseBlock = hasOpenCarePause(summary);
  const textToShow = summary
    ? viewMode === "jsonPrompt"
      ? getJsonPrompt(summary)
      : viewMode === "prompt"
        ? hasCarePauseBlock
          ? getCarePauseBlockedText(summary)
          : summary.aiPrompt
        : summary.summaryText
    : "";
  const displayWeekStart = targetWeekStart || resolveWeekStartIso(null);
  const displayWeekEnd = formatIsoDate(addDays(parseDateInput(displayWeekStart) || getNextMonday(), 6));
  const displaySchedule = targetExpectedWorkoutDates.length > 0
    ? getTrainingScheduleFromExpectedDates(targetExpectedWorkoutDates)
    : getTrainingSchedule(
        selectedStudent?.contractedTrainingDaysPerMonth || null,
        displayWeekStart
      );
  const backToWorkoutBuilderDate = displaySchedule[0]?.date || targetExpectedWorkoutDates[0] || displayWeekStart;
  const backToWorkoutBuilderHref = selectedStudentId
    ? `/dashboard/montar-treino?studentId=${encodeURIComponent(selectedStudentId)}&date=${encodeURIComponent(backToWorkoutBuilderDate)}`
    : "/dashboard/montar-treino";

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-xs text-[#22D3EE] uppercase tracking-[0.3em] mb-2">
            Apoio inteligente
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-[#f5f5f5]">
            Resumo do aluno para IA
          </h1>
          <p className="text-sm text-[#a1a1a1] mt-2 max-w-3xl">
            Gere um resumo completo do aluno com avaliações, treinos, adesão, dúvidas, avisos e feedbacks.
            Use o texto para pedir uma sugestão de treino para a IA. A IA apoia, mas o professor revisa e valida antes de cadastrar.
          </p>
        </div>

        <Link
          href={backToWorkoutBuilderHref}
          className="inline-flex items-center justify-center rounded-xl bg-[#1a1a1a] border border-[#22D3EE]/30 text-[#22D3EE] px-4 py-3 text-sm font-semibold hover:border-[#22D3EE] transition"
        >
          ← Fechar IA e voltar para montagem manual
        </Link>
      </div>

      {message && (
        <div
          className={
            "rounded-xl px-4 py-3 text-sm " +
            (message.type === "success"
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20")
          }
        >
          {message.text}
        </div>
      )}

      <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 md:items-end">
          <div>
            <label className="block text-xs text-[#a1a1a1] mb-2">
              Selecione o aluno
            </label>

            <select
              value={selectedStudentId}
              onChange={(event) => {
                setSelectedStudentId(event.target.value);
                setSummary(null);
              }}
              disabled={loadingStudents}
              className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#22D3EE] disabled:opacity-60"
            >
              {students.length === 0 ? (
                <option value="">Nenhum aluno encontrado</option>
              ) : (
                students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} · {student.ageYears === null || student.ageYears === undefined ? "Nascimento pendente" : `${student.ageYears} ano(s)`} · Professor: {student.professorName || "Não vinculado"}
                  </option>
                ))
              )}
            </select>

            {selectedStudent && (
              <div className="text-xs text-[#6b6b6b] mt-2 space-y-1">
                <p>
                  {selectedStudent.email || "Sem e-mail"} · {selectedStudent.contractedTrainingDaysPerMonth || "-"} treino(s)/mês
                </p>
                <p className={selectedStudentMissingBirthDate ? "text-red-400" : "text-[#22D3EE]"}>
                  {selectedStudentMissingBirthDate
                    ? "Data de nascimento não informada — geração bloqueada"
                    : `Idade: ${selectedStudent.ageYears} ano(s)${selectedStudent.isMinor ? " · menor de idade" : ""}`}
                </p>
                <p className="text-[#22D3EE]">
                  Semana alvo da IA: {displayWeekStart} a {displayWeekEnd}
                </p>
                {displaySchedule.length > 0 && (
                  <p>
                    Datas esperadas: {displaySchedule.map((item) => `${item.weekday} (${item.date})`).join(" · ")}
                  </p>
                )}
                {safeWindowNotice && (
                  <p className="text-amber-400">
                    {safeWindowNotice}
                  </p>
                )}
              </div>
            )}
          </div>

          <button
            onClick={generateSummary}
            disabled={loadingStudents || loadingSummary || loadingExerciseLibrary || !selectedStudentId || exerciseLibrary.length === 0 || selectedStudentMissingBirthDate}
            className="bg-[#22D3EE] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#06B6D4] transition disabled:opacity-50"
          >
            {loadingSummary
              ? "Gerando..."
              : loadingExerciseLibrary
                ? "Carregando biblioteca..."
                : exerciseLibrary.length === 0
                  ? "Biblioteca vazia"
                  : selectedStudentMissingBirthDate
                    ? "Data de nascimento pendente"
                    : "Gerar resumo"}
          </button>
        </div>

        <div className="rounded-xl bg-[#22D3EE]/10 border border-[#22D3EE]/20 p-4">
          <p className="text-sm text-[#22D3EE] font-semibold mb-1">
            Fluxo recomendado
          </p>
          <p className="text-xs text-[#a1a1a1] leading-relaxed">
            1. Entre pela pendência do dashboard. 2. Gere o resumo. 3. Copie o Prompt JSON para IA.
            4. A IA devolve o JSON com a chave de segurança do aluno e da semana. 5. Cole o JSON aqui.
            6. O sistema valida aluno, semana, datas e quantidade antes de abrir a montagem para revisão.
          </p>
        </div>
      </div>

      {summary && (
        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#f5f5f5]">
                {summary.student.name}
              </h2>
              <p className="mt-1 text-xs font-semibold text-[#22D3EE]">
                Idade considerada pela IA: {summary.student.ageYears ?? "-"} ano(s)
                {summary.student.isMinor ? " · menor de idade" : ""}
              </p>
              <p className="text-xs text-[#a1a1a1]">
                Professor: {summary.student.professorName || "Não vinculado"} · Meta semanal: {summary.student.weeklyLimit || "-"}
              </p>
              <p className="text-xs text-[#6b6b6b] mt-1">
                Gerado em {new Date(summary.generatedAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setViewMode("jsonPrompt")}
                className={
                  "px-3 py-2 rounded-lg text-xs transition " +
                  (viewMode === "jsonPrompt"
                    ? "bg-[#22D3EE] text-[#0a0a0a] font-semibold"
                    : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
                }
              >
                Prompt JSON
              </button>

              <button
                onClick={() => setViewMode("prompt")}
                className={
                  "px-3 py-2 rounded-lg text-xs transition " +
                  (viewMode === "prompt"
                    ? "bg-[#22D3EE] text-[#0a0a0a] font-semibold"
                    : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
                }
              >
                Prompt texto
              </button>

              <button
                onClick={() => setViewMode("summary")}
                className={
                  "px-3 py-2 rounded-lg text-xs transition " +
                  (viewMode === "summary"
                    ? "bg-[#22D3EE] text-[#0a0a0a] font-semibold"
                    : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
                }
              >
                Só resumo
              </button>

              <button
                onClick={() => copyText(textToShow, "Texto copiado.")}
                className="px-3 py-2 rounded-lg text-xs bg-[#1a1a1a] text-[#a1a1a1] hover:text-white transition"
              >
                Copiar
              </button>

              <button
                onClick={downloadText}
                className="px-3 py-2 rounded-lg text-xs bg-[#1a1a1a] text-[#a1a1a1] hover:text-white transition"
              >
                Baixar .txt
              </button>
            </div>
          </div>

          {hasCarePauseBlock && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
              <p className="text-sm text-red-400 font-semibold mb-1">
                Bloqueio de segurança: pausa por cuidado aberta
              </p>
              <p className="text-xs text-[#f5b7b7] leading-relaxed">
                Este aluno sinalizou que está sem condição de treinar ou possui pausa por cuidado em aberto.
                Não gere nem importe JSON de treino normal enquanto o evento estiver aberto. O professor deve revisar a Central de Cuidado,
                orientar o aluno e aguardar sinalização de aptidão para retomada antes de liberar novo treino.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Treinos</p>
              <p className="text-xl text-[#22D3EE] font-bold">{summary.metrics.workouts || 0}</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Concluídos</p>
              <p className="text-xl text-green-400 font-bold">{summary.metrics.completedWorkouts || 0}</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Vencidos</p>
              <p className="text-xl text-red-400 font-bold">{summary.metrics.overdueWorkouts || 0}</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Avaliações</p>
              <p className="text-xl text-[#f5f5f5] font-bold">{summary.metrics.avaliacoes || 0}</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Feedbacks</p>
              <p className="text-xl text-blue-400 font-bold">{summary.metrics.feedbacks || 0}</p>
            </div>
          </div>

          <textarea
            value={textToShow}
            readOnly
            className="w-full min-h-[560px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-xs md:text-sm text-[#e5e5e5] font-mono leading-relaxed outline-none"
          />

          <div className="bg-[#0a0a0a] border border-[#ffffff10] rounded-xl p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-[#22D3EE]">
                Importar JSON do arquivo .txt gerado pela IA
              </h3>
              <p className="text-xs text-[#a1a1a1] mt-1">
                Depois de copiar o Prompt JSON e pedir a sugestão para a IA, cole aqui o JSON retornado.
                O sistema vai validar aluno, semana, datas, quantidade de treinos e chave de segurança antes de abrir a montagem para revisão.
              </p>
            </div>

            {hasCarePauseBlock && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-[#f5b7b7] leading-relaxed">
                Importação bloqueada para este aluno enquanto houver pausa por cuidado aberta.
                Resolva/revise o evento de cuidado antes de montar ou liberar nova semana.
              </div>
            )}

            <textarea
              value={aiJsonText}
              onChange={(event) => setAiJsonText(event.target.value)}
              disabled={hasCarePauseBlock}
              placeholder={
                hasCarePauseBlock
                  ? "Importação bloqueada: aluno em pausa por cuidado."
                  : 'Cole aqui o JSON gerado pela IA, começando com {"studentId": "...", "workouts": [...]}'
              }
              className="w-full min-h-[220px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-xs md:text-sm text-[#e5e5e5] font-mono leading-relaxed outline-none focus:border-[#22D3EE] disabled:opacity-50"
            />

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-xs text-[#6b6b6b]">
                Segurança: o JSON não grava nada sozinho. Se for de outro aluno, outra semana, outra data ou aluno em pausa por cuidado, será bloqueado.
              </p>

              <button
                type="button"
                onClick={openJsonInWorkoutBuilder}
                disabled={hasCarePauseBlock || !aiJsonText.trim()}
                className="bg-[#22D3EE] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#06B6D4] transition disabled:opacity-50"
              >
                Abrir em Montar Treino
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

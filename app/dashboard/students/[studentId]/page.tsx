"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type TabKey = "avisos" | "treinos" | "duvidas" | "resumo";

type AnyItem = Record<string, any>;

type Student = AnyItem & {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  ageYears?: number | null;
  isMinor?: boolean;
  hasBirthDate?: boolean;
  active?: boolean;
  commercialStatus?: string | null;
  image?: string | null;
  contractedTrainingDaysPerMonth?: number | null;
  professorName?: string | null;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
  createdAt?: string | null;
};

const GOAL_LABELS: Record<string, string> = {
  EMAGRECIMENTO: "Emagrecimento",
  HIPERTROFIA: "Ganho de massa muscular / hipertrofia",
  CONDICIONAMENTO_GERAL: "Condicionamento físico geral",
  SAUDE_QUALIDADE_VIDA: "Saúde e qualidade de vida",
  MOBILIDADE_FLEXIBILIDADE: "Melhora da mobilidade e flexibilidade",
  FORTALECIMENTO_MUSCULAR: "Fortalecimento muscular",
  DEFINICAO_CORPORAL: "Definição corporal",
  PREPARACAO_CORRIDA: "Preparação para corrida",
  COMECAR_CORRER: "Começar a correr",
  MELHORAR_CORRIDA: "Melhorar desempenho na corrida",
  FORTALECIMENTO_CORRIDA: "Fortalecimento para corrida",
  PREVENCAO_LESOES_CORRIDA: "Prevenção de lesões na corrida",
  "RETORNO_POS_LESÃO": "Retorno aos treinos após lesão",
  RETORNO_POS_LESAO: "Retorno aos treinos após lesão",
  PRESCRICAO_MEDICA: "Treinamento por prescrição médica",
  RETOMADA_COM_CUIDADO: "Reabilitação / retomada com cuidado",
  PERFORMANCE_ESPORTIVA: "Melhora de performance esportiva",
  ALTA_PERFORMANCE: "Atleta de alta performance",
  LUTA_ARTE_MARCIAL: "Preparação física para luta ou arte marcial",
  ESPORTE_ESPECIFICO: "Preparação física para esporte específico",
  REDUCAO_DORES_FUNCIONAL: "Redução de dores e melhora funcional",
  OUTRO: "Outro",
};

function formatDate(value?: string | null): string {
  if (!value) return "-";

  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getInitials(name?: string | null): string {
  const parts = String(name || "Aluno")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const first = parts[0]?.[0] || "A";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";

  return `${first}${second}`.toUpperCase();
}

function normalizeStatus(status?: string | null): string {
  const value = String(status || "").toUpperCase();

  const labels: Record<string, string> = {
    EXPERIENCIA_ATIVA: "Experiência ativa",
    CONTRATO_ATIVO: "Contrato ativo",
    AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
    SUSPENSO_POR_PAGAMENTO: "Suspenso por pagamento",
    SEM_CONTRATO_ATIVO: "Sem contrato ativo",
    ACTIVE: "Ativo",
    PENDING: "Pendente",
    DONE: "Concluído",
    COMPLETED: "Concluído",
    RESOLVED: "Resolvido",
    OPEN: "Aberto",
    ABERTO: "Aberto",
    RESPONDIDO: "Respondido",
  };

  return labels[value] || value || "Não informado";
}

function cleanText(value?: unknown): string {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "")
    .trim();
}

function isNoneReported(value?: unknown): boolean {
  const lower = cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return [
    "nao",
    "nao tenho",
    "nao possui",
    "nao possuo",
    "nenhum",
    "nenhuma",
    "nennhuma",
    "nennhum",
    "sem",
    "sem restricao",
    "sem restricoes",
    "sem dor",
    "sem dores",
    "sem equipamento",
    "sem equipamentos",
  ].includes(lower);
}

function displayText(value?: unknown, fallback = "Não informado"): string {
  const text = cleanText(value);
  return text || fallback;
}

function displayEquipment(value?: unknown): string {
  const text = cleanText(value);
  if (!text) return "Não informado";
  if (isNoneReported(text)) return "Nenhum equipamento disponível";
  return text;
}

function displayPain(value?: unknown): string {
  const text = cleanText(value);
  if (!text) return "Não informado";
  if (isNoneReported(text)) return "Nenhuma dor/desconforto relatado";
  return text;
}

function displayRestriction(value?: unknown): string {
  const text = cleanText(value);
  if (!text) return "Não informado";
  if (isNoneReported(text)) return "Nenhuma restrição médica/física relatada";
  return text;
}

function displayMinutes(value?: unknown): string {
  const text = cleanText(value).replace(/\s*minuto\(s\)$/i, "").trim();
  return text ? `${text} minuto(s)` : "Não informado";
}

function displayKg(value?: unknown): string {
  const text = cleanText(value).replace(/\s*kg$/i, "").trim();
  return text ? `${text} kg` : "Não informado";
}

function displayCm(value?: unknown): string {
  const text = cleanText(value).replace(/\s*cm$/i, "").trim();
  return text ? `${text} cm` : "Não informado";
}

function hasRelevantCareInfo(value: string): boolean {
  const text = cleanText(value);
  if (!text || text === "Não informado") return false;
  return !text.toLowerCase().startsWith("nenhum") && !text.toLowerCase().startsWith("nenhuma");
}

function normalizeGoal(value?: unknown, otherDescription?: unknown): string {
  const raw = String(value ?? "").trim();
  const other = String(otherDescription ?? "").trim();

  if (!raw && !other) return "Não informado";

  if (raw === "OUTRO") {
    return other ? `Outro: ${other}` : "Outro";
  }

  return GOAL_LABELS[raw] || raw || other || "Não informado";
}

function getListFromResponse(json: any, keys: string[]): AnyItem[] {
  if (Array.isArray(json)) return json;

  for (const key of keys) {
    if (Array.isArray(json?.[key])) return json[key];
  }

  return [];
}

function getStudentFromResponse(json: any): AnyItem | null {
  if (!json) return null;

  if (json?.student && typeof json.student === "object") return json.student;
  if (json?.data && !Array.isArray(json.data) && typeof json.data === "object") return json.data;
  if (json?.item && typeof json.item === "object") return json.item;
  if (json?.id && typeof json === "object") return json;

  return null;
}

function getByPath(source: AnyItem | null | undefined, path: string): unknown {
  if (!source) return undefined;

  return path.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in (current as AnyItem)) {
      return (current as AnyItem)[part];
    }

    return undefined;
  }, source);
}

function firstValue(source: AnyItem | null | undefined, paths: string[]): unknown {
  for (const path of paths) {
    const value = getByPath(source, path);

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return undefined;
}

function firstText(source: AnyItem | null | undefined, paths: string[]): string {
  return displayText(firstValue(source, paths));
}

function firstRawText(source: AnyItem | null | undefined, paths: string[]): string {
  const value = firstValue(source, paths);
  return cleanText(value);
}

function extractFromNotes(notes?: unknown, labels: string[] = []): string {
  const lines = String(notes || "")
    .split("\n")
    .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean);

  for (const label of labels) {
    const prefix = `${label.toLowerCase()}:`;
    const line = lines.find((item) => item.toLowerCase().startsWith(prefix));

    if (line) {
      return cleanText(line.slice(label.length + 1));
    }
  }

  return "";
}

function firstRawTextWithNotes(
  source: AnyItem | null | undefined,
  paths: string[],
  notesLabels: string[] = []
): string {
  return firstRawText(source, paths) || extractFromNotes(source?.notes, notesLabels);
}

function getItemTitle(item: AnyItem, fallback: string): string {
  return String(item.title || item.name || item.subject || item.planName || item.content || fallback || "Registro");
}

function getItemDescription(item: AnyItem): string {
  return String(item.description || item.content || item.message || item.answer || item.notes || item.studentSummary || "");
}

function getItemCompactDescription(item: AnyItem): string {
  const description = getItemDescription(item)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  if (!description) return "";
  if (description.length <= 220) return description;

  return `${description.slice(0, 220).trim()}...`;
}

function getItemDate(item: AnyItem): string | null {
  return item.date || item.scheduledDate || item.workoutDate || item.createdAt || item.updatedAt || null;
}

function isWorkoutCompleted(item: AnyItem): boolean {
  const status = String(item.status || "").toUpperCase();

  return Boolean(
    item.completedAt ||
      item.doneAt ||
      item.finishedAt ||
      ["DONE", "COMPLETED", "CONCLUIDO", "CONCLUÍDO", "FINALIZADO"].includes(status)
  );
}

function isWorkoutExpired(item: AnyItem): boolean {
  if (isWorkoutCompleted(item)) return false;

  const rawDate = getItemDate(item);
  if (!rawDate) return false;

  const workoutDate = new Date(rawDate);
  if (Number.isNaN(workoutDate.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  workoutDate.setHours(0, 0, 0, 0);

  return workoutDate < today;
}

function getStudentProfile(student: Student | null) {
  const primaryGoal = firstRawTextWithNotes(
    student,
    [
      "objective",
      "goal",
      "mainGoal",
      "primaryGoal",
      "initialProfile.objective",
      "initialProfile.goal",
      "initialProfile.primaryGoal",
      "profile.objective",
      "profile.goal",
      "profile.primaryGoal",
      "onboarding.objective",
      "onboarding.goal",
      "onboarding.primaryGoal",
      "anamnesis.objective",
      "anamnesis.goal",
    ],
    ["Objetivo principal", "Objetivo"]
  );

  const primaryGoalOtherDescription = firstRawText(student, [
    "primaryGoalOtherDescription",
    "initialProfile.primaryGoalOtherDescription",
    "profile.primaryGoalOtherDescription",
    "onboarding.primaryGoalOtherDescription",
  ]);

  const activityLevel = firstRawTextWithNotes(
    student,
    [
      "activityLevel",
      "level",
      "currentLevel",
      "initialProfile.activityLevel",
      "profile.activityLevel",
      "onboarding.activityLevel",
      "anamnesis.activityLevel",
    ],
    ["Nível atual informado", "Nivel atual informado", "Nível atual", "Nivel atual"]
  );

  const trainingEnvironment = firstRawTextWithNotes(
    student,
    [
      "trainingEnvironment",
      "environment",
      "trainingPlace",
      "initialProfile.trainingEnvironment",
      "profile.trainingEnvironment",
      "onboarding.trainingEnvironment",
      "anamnesis.trainingEnvironment",
    ],
    ["Ambiente de treino", "Local de treino"]
  );

  const availableEquipment = firstRawTextWithNotes(
    student,
    [
      "availableEquipment",
      "equipment",
      "materials",
      "initialProfile.availableEquipment",
      "profile.availableEquipment",
      "onboarding.availableEquipment",
      "anamnesis.availableEquipment",
    ],
    [
      "Equipamentos/materiais disponíveis",
      "Equipamentos/materiais disponiveis",
      "Equipamentos disponíveis",
      "Equipamentos disponiveis",
      "Materiais disponíveis",
      "Materiais disponiveis",
    ]
  );

  const timeAvailableMinutes = firstRawTextWithNotes(
    student,
    [
      "timeAvailableMinutes",
      "timePerWorkout",
      "availableTime",
      "initialProfile.timeAvailableMinutes",
      "profile.timeAvailableMinutes",
      "onboarding.timeAvailableMinutes",
      "anamnesis.timeAvailableMinutes",
    ],
    ["Tempo disponível por treino", "Tempo disponivel por treino"]
  );

  const preferredDays = firstRawTextWithNotes(
    student,
    [
      "preferredDays",
      "preferredSchedule",
      "initialProfile.preferredDays",
      "profile.preferredDays",
      "onboarding.preferredDays",
      "anamnesis.preferredDays",
    ],
    ["Dias/horários preferidos", "Dias/horarios preferidos", "Dias preferidos"]
  );

  const currentPain = firstRawTextWithNotes(
    student,
    [
      "currentPain",
      "pain",
      "painNotes",
      "initialProfile.currentPain",
      "profile.currentPain",
      "onboarding.currentPain",
      "anamnesis.currentPain",
    ],
    ["Dor/desconforto atual informado", "Dor/desconforto atual", "Dor atual"]
  );

  const medicalRestriction = firstRawTextWithNotes(
    student,
    [
      "medicalRestriction",
      "restriction",
      "physicalRestriction",
      "initialProfile.medicalRestriction",
      "profile.medicalRestriction",
      "onboarding.medicalRestriction",
      "anamnesis.medicalRestriction",
    ],
    [
      "Restrição médica/física declarada",
      "Restricao medica/fisica declarada",
      "Restrição médica/física",
      "Restricao medica/fisica",
      "Restrição médica",
      "Restricao medica",
    ]
  );

  const trainingHistory = firstRawTextWithNotes(
    student,
    [
      "trainingHistory",
      "history",
      "initialProfile.trainingHistory",
      "profile.trainingHistory",
      "onboarding.trainingHistory",
      "anamnesis.trainingHistory",
    ],
    ["Histórico de treino", "Historico de treino"]
  );

  const weightKg = firstRawTextWithNotes(
    student,
    [
      "weightKg",
      "weight",
      "initialProfile.weightKg",
      "profile.weightKg",
      "onboarding.weightKg",
      "anamnesis.weightKg",
    ],
    ["Peso informado"]
  );

  const heightCm = firstRawTextWithNotes(
    student,
    [
      "heightCm",
      "height",
      "initialProfile.heightCm",
      "profile.heightCm",
      "onboarding.heightCm",
      "anamnesis.heightCm",
    ],
    ["Altura informada"]
  );

  const initialNotes = firstRawTextWithNotes(
    student,
    [
      "initialNotes",
      "initialProfile.notes",
      "profile.notes",
      "onboarding.notes",
      "anamnesis.notes",
    ],
    [
      "Observações livres do aluno",
      "Observacoes livres do aluno",
      "Observações do aluno",
      "Observacoes do aluno",
    ]
  );

  return {
    objective: normalizeGoal(primaryGoal, primaryGoalOtherDescription),
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
    notes: displayText(initialNotes),
  };
}
function buildTeacherReading(profile: ReturnType<typeof getStudentProfile>, student: Student | null): string {
  const parts: string[] = [];
  const status = normalizeStatus(student?.commercialStatus);
  const contractedDays = student?.contractedTrainingDaysPerMonth || 0;

  parts.push(`Aluno com status ${status.toLowerCase()}.`);

  if (student?.ageYears !== null && student?.ageYears !== undefined) {
    parts.push(
      `Idade atual: ${student.ageYears} ano(s)${student.isMinor ? ", aluno menor de idade" : ""}.`
    );
  } else {
    parts.push("Data de nascimento não informada; não montar ou liberar treino até a gestão completar esse dado.");
  }

  if (profile.objective !== "Não informado") {
    parts.push(`Objetivo principal informado: ${profile.objective}.`);
  }

  if (profile.activityLevel !== "Não informado") {
    parts.push(`Nível atual: ${profile.activityLevel}.`);
  }

  if (profile.trainingEnvironment !== "Não informado" || profile.availableEquipment !== "Não informado") {
    parts.push(
      `Montagem inicial deve considerar ambiente ${profile.trainingEnvironment.toLowerCase()} e equipamentos: ${profile.availableEquipment}.`
    );
  }

  if (hasRelevantCareInfo(profile.currentPain)) {
    parts.push(`Atenção ao relato de dor/desconforto: ${profile.currentPain}.`);
  }

  if (hasRelevantCareInfo(profile.medicalRestriction)) {
    parts.push(`Atenção à restrição médica/física: ${profile.medicalRestriction}.`);
  }

  if (contractedDays > 0) {
    parts.push(`Contrato indica ${contractedDays} treino(s) por mês; organizar a semana respeitando a frequência contratada.`);
  }

  const objectiveLower = profile.objective.toLowerCase();

  if (objectiveLower.includes("corrida")) {
    parts.push("Para objetivo ligado à corrida, priorizar base, fortalecimento de pernas, glúteos, core, estabilidade e progressão gradual de impacto.");
  }

  if (objectiveLower.includes("emagrecimento")) {
    parts.push("Para emagrecimento, comunicar contribuição para gasto energético e consistência, sem prometer perda de peso.");
  }

  if (objectiveLower.includes("lesão") || objectiveLower.includes("lesao") || objectiveLower.includes("prescrição") || objectiveLower.includes("prescricao")) {
    parts.push("Para retomada, lesão ou prescrição médica, manter intensidade conservadora e validar qualquer restrição antes de evoluir carga ou impacto.");
  }

  if (parts.length === 1) {
    parts.push("Ficha inicial ainda não foi retornada completa pela API; confirmar objetivo, restrições, ambiente e equipamentos antes de personalizar novos treinos.");
  }

  return parts.join(" ");
}
export default function StudentDetailPage() {
  const params = useParams();
  const studentId = String(params?.studentId || "");

  const [activeTab, setActiveTab] = useState<TabKey>("resumo");
  const [student, setStudent] = useState<Student | null>(null);
  const [notices, setNotices] = useState<AnyItem[]>([]);
  const [workouts, setWorkouts] = useState<AnyItem[]>([]);
  const [questions, setQuestions] = useState<AnyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedQuestionForView, setSelectedQuestionForView] = useState<AnyItem | null>(null);

  useEffect(() => {
    if (!studentId) return;
    loadData();
  }, [studentId]);

  async function safeFetch(url: string) {
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (!res.ok) return null;

    return json;
  }

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const [studentsJson, studentDetailJson, noticesJson, workoutsJson, questionsJson] = await Promise.all([
        safeFetch("/api/students"),
        safeFetch(`/api/students/${encodeURIComponent(studentId)}`),
        safeFetch(`/api/notices?studentId=${encodeURIComponent(studentId)}`),
        safeFetch(`/api/workout-plan?studentId=${encodeURIComponent(studentId)}`),
        safeFetch(`/api/questions?studentId=${encodeURIComponent(studentId)}`),
      ]);

      const students = getListFromResponse(studentsJson, ["students", "data"]);
      const selectedFromList = (students.find((item) => item.id === studentId) || null) as Student | null;
      const selectedFromDetail = getStudentFromResponse(studentDetailJson) as Student | null;
      const selectedStudent = selectedFromList || selectedFromDetail
        ? ({ ...(selectedFromList || {}), ...(selectedFromDetail || {}) } as Student)
        : null;

      setStudent(selectedStudent);
      setNotices(getListFromResponse(noticesJson, ["notices", "data", "items"]));
      setWorkouts(getListFromResponse(workoutsJson, ["workouts", "workoutPlans", "plans", "data", "items"]));
      setQuestions(getListFromResponse(questionsJson, ["questions", "data", "items"]));

      if (!selectedStudent) {
        setMessage("Aluno não encontrado na lista retornada pela API de alunos.");
      }
    } catch {
      setMessage("Erro ao carregar o detalhe do aluno.");
    }

    setLoading(false);
  }

  const professorName = student?.professorName || student?.user?.name || "Professor não informado";
  const studentImageUrl = student?.image || student?.userAuth?.image || null;
  const profile = useMemo(() => getStudentProfile(student), [student]);

  const workoutStats = useMemo(() => {
    const completed = workouts.filter(isWorkoutCompleted).length;
    const expired = workouts.filter(isWorkoutExpired).length;
    const pending = Math.max(workouts.length - completed - expired, 0);

    return {
      total: workouts.length,
      completed,
      expired,
      pending,
    };
  }, [workouts]);

  const tabCounts = useMemo(
    () => ({
      avisos: notices.length,
      treinos: workouts.length,
      duvidas: questions.length,
    }),
    [notices.length, workouts.length, questions.length]
  );

  const teacherReading = useMemo(
    () => buildTeacherReading(profile, student),
    [profile, student]
  );

  function renderEmpty(text: string) {
    return (
      <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-5 text-sm text-[#a1a1a1]">
        {text}
      </div>
    );
  }


  function getQuestionRole(item: AnyItem): "STUDENT" | "TEACHER" | "GESTOR" {
    const role = String(item?.senderRole || item?.answeredBy?.role || "").toUpperCase();

    if (role === "TEACHER" || role === "PROFESSOR") return "TEACHER";
    if (role === "GESTOR" || role === "ADMIN") return "GESTOR";

    return "STUDENT";
  }

  function getQuestionAuthorLabel(item: AnyItem): string {
    const role = getQuestionRole(item);

    if (role === "STUDENT") {
      return item?.student?.name || student?.name || "Aluno";
    }

    if (role === "GESTOR") {
      return item?.answeredBy?.name || item?.teacher?.name || "Gestão";
    }

    return item?.teacher?.name || item?.answeredBy?.name || professorName || "Professor";
  }

  function getQuestionRoleBadge(item: AnyItem): string {
    const role = getQuestionRole(item);

    if (role === "STUDENT") return "Aluno";
    if (role === "GESTOR") return "Gestão";

    return "Professor";
  }

  function getQuestionBubbleClass(item: AnyItem): string {
    const role = getQuestionRole(item);

    if (role === "STUDENT") {
      return "border-green-500/15 bg-green-500/5";
    }

    if (role === "GESTOR") {
      return "border-blue-500/15 bg-blue-500/5";
    }

    return "border-[#22D3EE]/20 bg-[#22D3EE]/5";
  }

  function getQuestionBadgeClass(item: AnyItem): string {
    const role = getQuestionRole(item);

    if (role === "STUDENT") return "bg-green-500/10 text-green-300";
    if (role === "GESTOR") return "bg-blue-500/10 text-blue-300";

    return "bg-[#22D3EE]/15 text-[#22D3EE]";
  }

  function getQuestionConversationMessages(question: AnyItem | null): AnyItem[] {
    if (!question) return [];

    const children = Array.isArray(question.children) ? question.children : [];

    return [question, ...children].sort((a, b) => {
      const dateA = new Date(a?.createdAt || 0).getTime();
      const dateB = new Date(b?.createdAt || 0).getTime();

      return dateA - dateB;
    });
  }

  function shouldShowLegacyAnswer(item: AnyItem): boolean {
    return Boolean(item?.answer) && getQuestionRole(item) === "STUDENT";
  }


  function renderQuestionAttachment(item: AnyItem) {
    if (!item?.imageUrl && !item?.videoUrl) return null;

    return (
      <div className="mt-3 space-y-2">
        {item.imageUrl && (
          <a href={item.imageUrl} target="_blank" rel="noreferrer" className="block">
            <img
              src={item.imageUrl}
              alt="Imagem enviada na dúvida"
              className="max-h-64 max-w-full rounded-xl border border-[#ffffff10] bg-[#0a0a0a] object-contain"
            />
            <span className="mt-1 block text-xs font-semibold text-blue-300">Abrir imagem enviada</span>
          </a>
        )}

        {item.videoUrl && (
          <div className="space-y-1">
            <video src={item.videoUrl} controls className="max-h-64 w-full rounded-xl border border-[#ffffff10] bg-black" />
            <a href={item.videoUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-300 hover:underline">
              Abrir vídeo enviado
            </a>
          </div>
        )}
      </div>
    );
  }

  function renderQuestionConversationModal() {
    if (!selectedQuestionForView) return null;

    const messages = getQuestionConversationMessages(selectedQuestionForView);
    const title = getItemTitle(selectedQuestionForView, "Dúvida");
    const status = selectedQuestionForView.resolvedAt ? "Resolvida" : "Em aberto";

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={() => setSelectedQuestionForView(null)}
      >
        <div
          className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-[#ffffff15] bg-[#111] shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[#ffffff10] p-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-[#22D3EE] font-semibold">
                Conversa da dúvida
              </p>
              <h2 className="mt-1 text-base font-bold text-[#f5f5f5]">
                {title}
              </h2>
              <p className="mt-1 text-xs text-[#6b6b6b]">
                {status} · {messages.length} mensagem(ns)
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedQuestionForView(null)}
              className="rounded-full bg-[#1a1a1a] border border-[#ffffff10] px-3 py-1.5 text-xs font-semibold text-[#a1a1a1] hover:text-white"
            >
              Fechar
            </button>
          </div>

          <div className="max-h-[65vh] overflow-y-auto p-4 space-y-3">
            {messages.map((item, index) => (
              <div key={item.id || index} className="space-y-3">
                <div className={`rounded-2xl border p-4 ${getQuestionBubbleClass(item)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#f5f5f5]">
                        {getQuestionAuthorLabel(item)}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${getQuestionBadgeClass(item)}`}>
                        {getQuestionRoleBadge(item)}
                      </span>
                    </div>

                    <span className="text-[11px] text-[#6b6b6b]">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#e5e5e5]">
                    {item.content || item.message || "Mensagem sem conteúdo."}
                  </p>

                  {renderQuestionAttachment(item)}
                </div>

                {shouldShowLegacyAnswer(item) && (
                  <div className="ml-0 md:ml-8 rounded-2xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#f5f5f5]">
                          {item?.answeredBy?.name || professorName || "Professor"}
                        </span>
                        <span className="rounded-full bg-[#22D3EE]/15 px-2 py-1 text-[10px] font-semibold text-[#22D3EE]">
                          Resposta
                        </span>
                      </div>

                      <span className="text-[11px] text-[#6b6b6b]">
                        {formatDate(item.answeredAt)}
                      </span>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#e5e5e5]">
                      {item.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderGenericList(items: AnyItem[], emptyText: string, kind: "notice" | "workout" | "question") {
    if (items.length === 0) return renderEmpty(emptyText);

    return (
      <div className="space-y-3">
        {items.map((item, index) => {
          const title = getItemTitle(item, kind === "workout" ? "Treino" : kind === "question" ? "Mensagem" : "Aviso");
          const description = getItemDescription(item);
          const date = getItemDate(item);
          const status = item.status || item.type || item.senderRole || item.targetRole || "";

          return (
            <div
              key={item.id || index}
              role={kind === "question" ? "button" : undefined}
              tabIndex={kind === "question" ? 0 : undefined}
              onClick={kind === "question" ? () => setSelectedQuestionForView(item) : undefined}
              onKeyDown={kind === "question" ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedQuestionForView(item);
                }
              } : undefined}
              className={
                "rounded-2xl border border-[#ffffff10] bg-[#0f0f0f] p-4 space-y-3 " +
                (kind === "question" ? "cursor-pointer hover:border-[#22D3EE]/40 hover:bg-[#141414] transition" : "")
              }
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-[#f5f5f5]">{title}</h3>
                    {status && (
                      <span className="rounded-full bg-[#22D3EE]/15 text-[#22D3EE] px-2 py-1 text-[11px] font-semibold">
                        {normalizeStatus(status)}
                      </span>
                    )}
                  </div>

                  {description && (
                    <p className="text-sm text-[#d4d4d4] mt-2 whitespace-pre-wrap line-clamp-4">
                      {description}
                    </p>
                  )}

                  <p className="text-xs text-[#6b6b6b] mt-2">
                    Data: {formatDate(date)}
                  </p>

                  {kind === "question" && (
                    <p className="text-xs text-[#22D3EE] mt-2 font-semibold">
                      Clique para ver a conversa completa
                    </p>
                  )}
                </div>

                {kind === "workout" && (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/dashboard/montar-treino?studentId=${studentId}&workoutId=${item.id || ""}`}
                      className="rounded-xl bg-[#1a1a1a] border border-[#22D3EE]/30 text-[#22D3EE] px-3 py-2 text-xs font-semibold"
                    >
                      Abrir/editar
                    </Link>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function SummaryField({ label, value }: { label: string; value: string }) {
    return (
      <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4">
        <p className="text-xs uppercase text-[#6b6b6b]">{label}</p>
        <p className="text-[#f5f5f5] text-sm font-semibold mt-1 whitespace-pre-wrap">{value}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-4 md:p-6 text-[#f5f5f5]">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[#22D3EE]/30 bg-[#111] flex items-center justify-center">
              {studentImageUrl ? (
                <img
                  src={studentImageUrl}
                  alt={student?.name || "Aluno"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-[#22D3EE]">
                  {getInitials(student?.name)}
                </span>
              )}
            </div>

            <div>
              <Link href="/dashboard/students" className="text-xs text-[#22D3EE] underline">
                ← Voltar para alunos
              </Link>

              <p className="text-xs uppercase tracking-[0.3em] text-[#22D3EE] mt-4 mb-2">
                Ficha do aluno
              </p>

              <h1 className="text-2xl font-bold text-[#22D3EE]">
                {student?.name || "Aluno"}
              </h1>

              <p className="text-sm text-[#a1a1a1] mt-2">
                {student?.email || "Sem e-mail"}
                {student?.phone ? ` · ${student.phone}` : ""}
              </p>

              <p className="text-xs text-[#6b6b6b] mt-1">
                Entrou na Funcional em {formatDate(student?.createdAt)} · Professor atual: {professorName}
              </p>
              <p className={"text-xs mt-1 font-semibold " + (student?.ageYears === null || student?.ageYears === undefined ? "text-red-400" : "text-[#22D3EE]")}>
                {student?.ageYears === null || student?.ageYears === undefined
                  ? "Data de nascimento não informada"
                  : `Nascimento: ${formatDate(student.birthDate)} · Idade: ${student.ageYears} ano(s)${student.isMinor ? " · menor de idade" : ""}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadData}
            className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] text-[#f5f5f5] px-4 py-3 text-sm font-semibold hover:border-[#22D3EE]/40 transition"
          >
            Atualizar
          </button>
        </div>

        {message && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
            {message}
          </div>
        )}

        {!loading && student && (student.ageYears === null || student.ageYears === undefined) && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <p className="font-semibold">Cadastro incompleto: data de nascimento obrigatória.</p>
            <p className="mt-1 text-xs leading-relaxed text-red-200/80">
              O professor precisa conhecer a idade para avaliar intensidade, volume, recuperação e progressão. Solicite à gestão que complete o cadastro antes de gerar resumo IA ou montar o treino.
            </p>
          </div>
        )}

        {loading ? (
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 text-sm text-[#a1a1a1]">
            Carregando detalhe do aluno...
          </div>
        ) : (
          <>
            <section className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4 md:p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[#22D3EE] font-semibold">
                    Resumo para transição de professor
                  </p>
                  <h2 className="text-lg font-bold text-[#f5f5f5] mt-1">
                    Como ler este aluno rapidamente
                  </h2>
                  <p className="text-sm text-[#d4d4d4] leading-relaxed mt-2 max-w-4xl">
                    {teacherReading}
                  </p>
                </div>

                {student?.ageYears === null || student?.ageYears === undefined ? (
                  <span
                    className="inline-flex cursor-not-allowed items-center justify-center rounded-xl bg-[#22D3EE]/30 text-[#6b6b6b] px-4 py-3 text-xs font-semibold"
                    title="Informe a data de nascimento antes de gerar o resumo IA"
                  >
                    Data de nascimento pendente
                  </span>
                ) : (
                  <Link
                    href={`/dashboard/resumo-aluno?studentId=${encodeURIComponent(studentId)}`}
                    className="inline-flex items-center justify-center rounded-xl bg-[#22D3EE] text-[#0a0a0a] px-4 py-3 text-xs font-semibold hover:bg-[#06B6D4] transition"
                  >
                    Gerar resumo IA
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SummaryField
                  label="Idade / nascimento"
                  value={
                    student?.ageYears === null || student?.ageYears === undefined
                      ? "Não informado — cadastro precisa ser completado"
                      : `${student.ageYears} ano(s) · ${formatDate(student.birthDate)}${student.isMinor ? " · menor de idade" : ""}`
                  }
                />
                <SummaryField label="Objetivo" value={profile.objective} />
                <SummaryField label="Nível atual" value={profile.activityLevel} />
                <SummaryField label="Ambiente/equipamentos" value={`${profile.trainingEnvironment} · ${profile.availableEquipment}`} />
                <SummaryField label="Tempo e preferência" value={`${profile.timeAvailableMinutes} · ${profile.preferredDays}`} />
                <SummaryField label="Dor/desconforto" value={profile.currentPain} />
                <SummaryField label="Restrição médica/física" value={profile.medicalRestriction} />
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
                <p className="text-xs uppercase text-[#6b6b6b]">Status</p>
                <p className="text-lg font-bold text-[#22D3EE] mt-1">
                  {normalizeStatus(student?.commercialStatus)}
                </p>
              </div>

              <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
                <p className="text-xs uppercase text-[#6b6b6b]">Professor</p>
                <p className="text-lg font-bold text-[#f5f5f5] mt-1">{professorName}</p>
              </div>

              <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
                <p className="text-xs uppercase text-[#6b6b6b]">Treinos/mês</p>
                <p className="text-lg font-bold text-[#f5f5f5] mt-1">
                  {student?.contractedTrainingDaysPerMonth || "-"}
                </p>
              </div>

              <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
                <p className="text-xs uppercase text-[#6b6b6b]">Cadastro</p>
                <p className="text-lg font-bold text-[#f5f5f5] mt-1">
                  {formatDate(student?.createdAt)}
                </p>
              </div>
            </section>

            <section className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4 md:p-5 space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "avisos", label: `Avisos (${tabCounts.avisos})` },
                  { key: "treinos", label: `Treinos (${tabCounts.treinos})` },
                  { key: "duvidas", label: `Dúvidas (${tabCounts.duvidas})` },
                  { key: "resumo", label: "Resumo PDF" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key as TabKey)}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      activeTab === tab.key
                        ? "bg-[#22D3EE] text-[#0a0a0a]"
                        : "bg-[#1a1a1a] text-[#a1a1a1] border border-[#ffffff10]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === "avisos" && renderGenericList(notices, "Nenhum aviso encontrado para este aluno.", "notice")}
              {activeTab === "treinos" && renderGenericList(workouts, "Nenhum treino encontrado para este aluno.", "workout")}
              {activeTab === "duvidas" && renderGenericList(questions, "Nenhuma dúvida encontrada para este aluno.", "question")}

              {activeTab === "resumo" && (
                <div id="student-summary-print" className="rounded-2xl border border-[#ffffff10] bg-[#0f0f0f] p-5 space-y-5">
                  <div>
                    <h2 className="text-lg font-semibold text-[#22D3EE]">Resumo do aluno</h2>
                    <p className="text-xs text-[#a1a1a1] mt-1">
                      Esta aba consolida os dados do cadastro, ficha inicial, histórico visível e leitura operacional para o professor.
                    </p>
                  </div>

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-[#22D3EE]">1. Identificação e contrato</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <SummaryField label="Aluno" value={student?.name || "Aluno"} />
                      <SummaryField label="E-mail" value={student?.email || "Sem e-mail"} />
                      <SummaryField label="Telefone" value={student?.phone || "Não informado"} />
                      <SummaryField label="Status" value={normalizeStatus(student?.commercialStatus)} />
                      <SummaryField label="Professor" value={professorName} />
                      <SummaryField label="Treinos contratados/mês" value={String(student?.contractedTrainingDaysPerMonth || "Não informado")} />
                      <SummaryField label="Cadastro" value={formatDate(student?.createdAt)} />
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-[#22D3EE]">2. Ficha inicial / onboarding</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <SummaryField label="Objetivo principal" value={profile.objective} />
                      <SummaryField label="Nível atual" value={profile.activityLevel} />
                      <SummaryField label="Ambiente de treino" value={profile.trainingEnvironment} />
                      <SummaryField label="Equipamentos disponíveis" value={profile.availableEquipment} />
                      <SummaryField label="Tempo disponível por treino" value={profile.timeAvailableMinutes} />
                      <SummaryField label="Dias/horários preferidos" value={profile.preferredDays} />
                      <SummaryField label="Dor/desconforto atual" value={profile.currentPain} />
                      <SummaryField label="Restrição médica/física" value={profile.medicalRestriction} />
                      <SummaryField label="Histórico de treino" value={profile.trainingHistory} />
                      <SummaryField label="Peso informado" value={profile.weightKg} />
                      <SummaryField label="Altura informada" value={profile.heightCm} />
                      <SummaryField label="Observações do aluno" value={profile.notes} />
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-[#22D3EE]">3. Histórico visível</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <SummaryField label="Treinos planejados/registrados" value={String(workoutStats.total)} />
                      <SummaryField label="Treinos concluídos" value={String(workoutStats.completed)} />
                      <SummaryField label="Treinos vencidos não concluídos" value={String(workoutStats.expired)} />
                      <SummaryField label="Treinos pendentes futuros" value={String(workoutStats.pending)} />
                      <SummaryField label="Dúvidas registradas" value={String(questions.length)} />
                      <SummaryField label="Avisos recentes" value={String(notices.length)} />
                    </div>
                  </section>

                  {notices.length > 0 && (
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-[#22D3EE]">4. Avisos recentes — resumo</h3>
                      <div className="space-y-2">
                        {notices.slice(0, 5).map((notice, index) => {
                          const compactDescription = getItemCompactDescription(notice);

                          return (
                            <div key={notice.id || index} className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4">
                              <p className="text-[#f5f5f5] text-sm font-semibold">{getItemTitle(notice, "Aviso")}</p>
                              <p className="text-[#a1a1a1] text-xs mt-1">
                                {formatDate(getItemDate(notice))} · {normalizeStatus(notice.type || notice.status || "")}
                              </p>
                              {compactDescription && (
                                <p className="text-[#d4d4d4] text-xs mt-2 whitespace-pre-wrap">{compactDescription}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-[#22D3EE]">5. Leitura operacional para o professor</h3>
                    <div className="rounded-xl bg-[#22D3EE]/10 border border-[#22D3EE]/20 p-4">
                      <p className="text-sm text-[#f5f5f5] leading-relaxed whitespace-pre-wrap">
                        {teacherReading}
                      </p>
                    </div>
                  </section>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="rounded-xl bg-[#22D3EE] text-[#0a0a0a] px-4 py-3 text-sm font-semibold hover:bg-[#06B6D4] transition"
                    >
                      Imprimir / salvar como PDF
                    </button>

                    <button
                      type="button"
                      onClick={loadData}
                      className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] text-[#f5f5f5] px-4 py-3 text-sm font-semibold hover:border-[#22D3EE]/40 transition"
                    >
                      Atualizar resumo
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {renderQuestionConversationModal()}
    </main>
  );
}

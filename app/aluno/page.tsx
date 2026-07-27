"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { AlunoCommercialStatusPanel } from "@/components/aluno/AlunoCommercialStatusPanel";
import ProfilePhotoEditor from "@/components/ProfilePhotoEditor";
import StudentSurveyPanel from "@/components/aluno/StudentSurveyPanel";
import EmailNotificationReminder from "@/components/aluno/EmailNotificationReminder";
import { StudentDidYouKnowCard } from "@/components/aluno/StudentDidYouKnowCard";
type PersonAvatarProps = {
  image?: string | null;
  name?: string | null;
  sizeClass?: string;
  textClass?: string;
};

function PersonAvatar({
  image,
  name,
  sizeClass = "h-9 w-9",
  textClass = "text-[10px]",
}: PersonAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials =
    parts.length === 0
      ? "FV"
      : parts.length === 1
        ? parts[0].slice(0, 2).toUpperCase()
        : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();

  return (
    <div
      className={`${sizeClass} relative shrink-0 overflow-hidden rounded-full border border-[#D4A373]/50 bg-[#D4A373]/15 flex items-center justify-center`}
      aria-label={`Foto de ${name || "usuário"}`}
    >
      <span className={`${textClass} font-bold text-[#D4A373]`}>{initials}</span>

      {image && !imageFailed && (
        <img
          src={image}
          alt={`Foto de ${name || "usuário"}`}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      )}
    </div>
  );
}

function getNoticeAuthorName(notice: any): string {
  return String(notice?.author?.name || "Equipe Funcional VIP Digital");
}

function getNoticeAuthorRoleLabel(notice: any): string {
  const role = String(notice?.author?.role || "").toUpperCase();

  if (role === "GESTOR" || role === "ADMIN") return "Gestão";
  if (role === "PROFESSOR" || role === "TEACHER") return "Professor";
  if (role === "ALUNO" || role === "STUDENT") return "Aluno";

  return "Funcional VIP Digital";
}

interface LibraryExercise {
  id: string;
  name: string;
  description: string;
  muscleGroup: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  sequenceImageUrl?: string | null;
  sequenceImageLabel?: string | null;
  sequenceImageNotes?: string | null;
  sequenceFramesCount?: number | null;
  sequenceGeneratedByAi?: boolean | null;
  sequencePrompt?: string | null;
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
}
export default function AlunoPage() {
  const [studentId, setStudentId] = useState<string>("");
  const [studentName, setStudentName] = useState("Aluno");
  const [studentImage, setStudentImage] = useState<string | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [completing, setCompleting] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [newQuestion, setNewQuestion] = useState("");
  const [questionTarget, setQuestionTarget] = useState<"PROFESSOR" | "GESTAO">("PROFESSOR");
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<any>(null);
  const [imgError, setImgError] = useState(false);
  const [showSequenceImage, setShowSequenceImage] = useState(false);
  const [showExerciseVideo, setShowExerciseVideo] = useState(false);
  const [exerciseLibraryByName, setExerciseLibraryByName] = useState<Record<string, LibraryExercise>>({});
  const [exerciseLibraryById, setExerciseLibraryById] = useState<Record<string, LibraryExercise>>({});
  const [selectedNotice, setSelectedNotice] = useState<any>(null);
  const [sendingCareEvent, setSendingCareEvent] = useState(false);
  const [careEventDetail, setCareEventDetail] = useState("");
  const [careEventSentForPlanId, setCareEventSentForPlanId] = useState<Record<string, boolean>>({});
  const [dashboardSummary, setDashboardSummary] = useState<any>(null);
  const [loadingDashboardSummary, setLoadingDashboardSummary] = useState(true);
  const [careEvents, setCareEvents] = useState<any[]>([]);
  const [loadingCareEvents, setLoadingCareEvents] = useState(false);
  const [sendingCareReturn, setSendingCareReturn] = useState(false);
  const [exerciseProgress, setExerciseProgress] = useState<Record<string, any>>({});
  const [savingExerciseId, setSavingExerciseId] = useState<string | null>(null);
  const [skipExercise, setSkipExercise] = useState<any>(null);
  const [skipReason, setSkipReason] = useState("");

  // Estados para o modal de dúvidas (thread)
  const [selectedQuestion, setSelectedQuestion] = useState<any>(null);
  const [followUpText, setFollowUpText] = useState("");
  const [followUpFile, setFollowUpFile] = useState<File | null>(null);
  const [sendingFollowUp, setSendingFollowUp] = useState(false);

  const getImageUrl = (url?: string): string | null => {
    if (!url) return null;
    if (url.startsWith("/")) {
      if (typeof window !== "undefined") {
        return window.location.origin + url;
      }
      return url;
    }
    return url;
  };

  function renderChatAttachment(msg: any) {
    if (!msg?.imageUrl && !msg?.videoUrl) return null;

    return (
      <div className="mt-2 space-y-2">
        {msg.imageUrl && (
          <a href={msg.imageUrl} target="_blank" rel="noreferrer" className="block">
            <img
              src={msg.imageUrl}
              alt="Imagem enviada na dúvida"
              className="max-h-52 max-w-full rounded-xl border border-[#ffffff10] bg-[#0a0a0a] object-contain"
            />
            <span className="mt-1 block text-[9px] text-blue-400 underline">Abrir imagem</span>
          </a>
        )}

        {msg.videoUrl && (
          <div className="space-y-1">
            <video src={msg.videoUrl} controls className="max-h-52 w-full rounded-xl border border-[#ffffff10] bg-black" />
            <a href={msg.videoUrl} target="_blank" rel="noreferrer" className="text-[9px] text-blue-400 underline">
              Abrir vídeo
            </a>
          </div>
        )}
      </div>
    );
  }

  async function fetchExerciseLibrary() {
    try {
      const res = await fetch("/api/exercise-library?active=1", {
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const exercises: LibraryExercise[] = data.exercises || [];
        const byName: Record<string, LibraryExercise> = {};
        const byId: Record<string, LibraryExercise> = {};

        exercises.forEach((exercise) => {
          if (exercise.id) {
            byId[exercise.id] = exercise;
          }

          if (exercise.name) {
            byName[exercise.name.toLowerCase()] = exercise;
          }
        });

        setExerciseLibraryByName(byName);
        setExerciseLibraryById(byId);
      }
    } catch {}
  }

  function compactText(value?: unknown): string {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function joinTextParts(parts: Array<string | null | undefined>): string {
    return parts
      .map((part) => compactText(part))
      .filter(Boolean)
      .join(" ");
  }

  function getExerciseLibraryInfo(exercise: any): LibraryExercise | null {
    const id = String(
      exercise?.libraryExerciseId ||
        exercise?.exerciseId ||
        exercise?.exerciseLibraryId ||
        ""
    ).trim();

    if (id && exerciseLibraryById[id]) {
      return exerciseLibraryById[id];
    }

    const name = String(exercise?.name || "").toLowerCase();
    return name ? exerciseLibraryByName[name] || null : null;
  }

  function getExerciseImageUrl(exercise: any): string | null {
    const libraryExercise = getExerciseLibraryInfo(exercise);
    return String(libraryExercise?.imageUrl || "") || null;
  }

  function getExerciseVideoUrl(exercise: any): string | null {
    const libraryExercise = getExerciseLibraryInfo(exercise);
    return String(exercise?.videoUrl || libraryExercise?.videoUrl || "") || null;
  }

  function getExerciseSequenceImageUrl(exercise: any): string | null {
    const libraryExercise = getExerciseLibraryInfo(exercise);
    return String(exercise?.sequenceImageUrl || libraryExercise?.sequenceImageUrl || "") || null;
  }

  function getExerciseSequenceLabel(exercise: any): string {
    const libraryExercise = getExerciseLibraryInfo(exercise);
    return compactText(exercise?.sequenceImageLabel || libraryExercise?.sequenceImageLabel) || "Sequência de execução";
  }

  function getExerciseSequenceNotes(exercise: any): string {
    const libraryExercise = getExerciseLibraryInfo(exercise);
    return compactText(exercise?.sequenceImageNotes || libraryExercise?.sequenceImageNotes);
  }

  function getExercisePurpose(exercise: any): string {
    const libraryExercise = getExerciseLibraryInfo(exercise);
    const objectiveText = compactText(exercise?.objectiveTags || libraryExercise?.objectiveTags)
      ? `Objetivo relacionado: ${compactText(exercise?.objectiveTags || libraryExercise?.objectiveTags)}.`
      : "";

    return joinTextParts([
      exercise?.purpose,
      libraryExercise?.description,
      !exercise?.purpose && !libraryExercise?.description ? exercise?.description : null,
      objectiveText,
    ]);
  }

  function getExerciseInstructions(exercise: any): string {
    const libraryExercise = getExerciseLibraryInfo(exercise);

    return (
      compactText(exercise?.instructions) ||
      compactText(libraryExercise?.instructions) ||
      compactText(exercise?.description) ||
      compactText(libraryExercise?.description)
    );
  }

  function getExerciseSafetyGuidance(exercise: any): string {
    const libraryExercise = getExerciseLibraryInfo(exercise);

    return joinTextParts([
      exercise?.safetyGuidance,
      libraryExercise?.safetyNotes,
      exercise?.restrictionTags || libraryExercise?.restrictionTags
        ? `Atenção: ${compactText(exercise?.restrictionTags || libraryExercise?.restrictionTags)}.`
        : null,
      exercise?.commonMistakes || libraryExercise?.commonMistakes
        ? `Evite: ${compactText(exercise?.commonMistakes || libraryExercise?.commonMistakes)}.`
        : null,
      exercise?.contraindications || libraryExercise?.contraindications
        ? `Contraindicação/atenção: ${compactText(exercise?.contraindications || libraryExercise?.contraindications)}.`
        : null,
    ]);
  }

  useEffect(() => {
    fetchStudentInfo();
    fetchDashboardSummary();
  }, []);
  useEffect(() => {
    if (studentId) {
      fetchPlans(studentId); fetchWorkouts(studentId);
      fetchNotices(studentId); fetchQuestions(studentId);
      fetchCareEvents(studentId);
      fetchExerciseLibrary();
    }
  }, [studentId, currentMonth, currentYear]);
  async function fetchStudentInfo() {
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const session = await res.json();
        const userName = session?.user?.name || session?.name || "";
        const userImage = session?.user?.image || session?.image || null;

        if (userImage) {
          setStudentImage(String(userImage));
        }

        const r2 = await fetch("/api/student/me");
        if (r2.ok) {
          const data = await r2.json();
          setStudentId(data.id);
          setStudentName(data.name);
          setStudentImage(data.image || data.photoUrl || data.avatarUrl || userImage || null);
        } else if (userName) {
          setStudentName(userName);
        }
      }
    } catch {}
    setLoading(false);
  }

  async function fetchDashboardSummary() {
    setLoadingDashboardSummary(true);

    try {
      const res = await fetch("/api/aluno/dashboard-summary", {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.summary) {
        setDashboardSummary(data.summary);

        if (data.summary?.student?.image) {
          setStudentImage(data.summary.student.image);
        }
      }
    } catch {}

    setLoadingDashboardSummary(false);
  }
  async function fetchPlans(id: string) {
    try {
      const res = await fetch("/api/workout-plan?studentId=" + id);
      if (res.ok) {
        const data = await res.json();
        const rawPlans = Array.isArray(data) ? data : [];

        setPlans(
          rawPlans.filter((plan: any) =>
            canStudentSeePlanByDate(plan.date || plan.createdAt)
          )
        );
      }
    } catch {}
  }
  function getSelectedWorkoutDateIso(day: number | null = selectedDay): string {
    if (day === null) return "";
    const date = new Date(currentYear, currentMonth, day, 12, 0, 0, 0);
    return date.toISOString();
  }

  async function fetchExerciseProgress(planId: string, day: number) {
    try {
      const params = new URLSearchParams({
        workoutPlanId: planId,
        date: getSelectedWorkoutDateIso(day),
      });
      const res = await fetch(`/api/workout/exercise-progress?${params.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        const next: Record<string, any> = {};
        for (const item of Array.isArray(data?.items) ? data.items : []) next[item.exerciseId] = item;
        setExerciseProgress(next);
      }
    } catch {}
  }

  async function saveExerciseProgress(exercise: any, status: "CONCLUIDO" | "PULADO" | "PENDENTE", options?: { effort?: string; skipReason?: string }) {
    if (!selectedPlan || selectedDay === null || !exercise?.id) return;

    const previousItem = exerciseProgress[exercise.id];
    const optimisticItem = {
      ...(previousItem || {}),
      exerciseId: exercise.id,
      workoutPlanId: selectedPlan.id,
      status,
      effort: status === "CONCLUIDO" ? (options?.effort || previousItem?.effort || null) : null,
      skipReason: status === "PULADO" ? (options?.skipReason || null) : null,
      completedAt: status === "PENDENTE" ? null : new Date().toISOString(),
    };

    setExerciseProgress((current) => ({ ...current, [exercise.id]: optimisticItem }));
    setSavingExerciseId(exercise.id);

    try {
      const res = await fetch("/api/workout/exercise-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutPlanId: selectedPlan.id,
          exerciseId: exercise.id,
          date: getSelectedWorkoutDateIso(),
          status,
          effort: options?.effort || (status === "CONCLUIDO" ? previousItem?.effort || null : null),
          skipReason: options?.skipReason || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.item) {
        setExerciseProgress((current) => ({ ...current, [exercise.id]: data.item }));
        setSkipExercise(null);
        setSkipReason("");
      } else {
        setExerciseProgress((current) => {
          const next = { ...current };
          if (previousItem) next[exercise.id] = previousItem;
          else delete next[exercise.id];
          return next;
        });
        setMessage({ type: "error", text: data?.error || "Não foi possível registrar o exercício. Confira se a atualização do banco foi aplicada." });
      }
    } catch {
      setExerciseProgress((current) => {
        const next = { ...current };
        if (previousItem) next[exercise.id] = previousItem;
        else delete next[exercise.id];
        return next;
      });
      setMessage({ type: "error", text: "Não foi possível registrar o exercício. Tente novamente." });
    } finally {
      setSavingExerciseId(null);
    }
  }

  function getExerciseTotals() {
    const exercises = Array.isArray(selectedPlan?.exercises) ? selectedPlan.exercises : [];
    const done = exercises.filter((exercise: any) => exerciseProgress[exercise.id]?.status === "CONCLUIDO").length;
    const skipped = exercises.filter((exercise: any) => exerciseProgress[exercise.id]?.status === "PULADO").length;
    return { total: exercises.length, done, skipped, resolved: done + skipped };
  }

  async function fetchWorkouts(id: string) {
    try {
      const url = "/api/workout/mark-complete?studentId=" + id + "&month=" + (currentMonth + 1) + "&year=" + currentYear;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const rawWorkouts = Array.isArray(data) ? data : [];

        setWorkouts(
          rawWorkouts.filter((workout: any) =>
            canStudentSeePlanByDate(workout.date || workout.createdAt)
          )
        );
      }
    } catch {}
  }
  async function fetchNotices(id: string) {
    try {
      const res = await fetch("/api/notices/student/" + id);
      if (res.ok) {
        const data = await res.json();
        setNotices(Array.isArray(data) ? data : []);
      }
    } catch {}
  }
  async function fetchQuestions(id: string) {
    try {
      const res = await fetch("/api/aluno/questions?studentId=" + id);
      if (res.ok) {
        const data = await res.json();
        setQuestions(Array.isArray(data) ? data : []);
      }
    } catch {}
  }
  async function fetchCareEvents(id: string) {
    setLoadingCareEvents(true);

    try {
      const res = await fetch("/api/student-care-events?studentId=" + id, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setCareEvents(Array.isArray(data?.events) ? data.events : []);
      }
    } catch {}

    setLoadingCareEvents(false);
  }
  async function markNoticeAsRead(noticeId: string) {
    try {
      await fetch("/api/notices/" + noticeId + "/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      setNotices((prev: any[]) =>
        prev.map((n) => (n.id === noticeId ? { ...n, readByStudent: true } : n))
      );
    } catch {}
  }
  async function markAsComplete(options?: {
    careEventType?: string;
    careEventDescription?: string | null;
    completionStatus?: "CONCLUIDO" | "NAO_CONCLUIDO_COM_RELATO" | "INTERROMPIDO_CUIDADO";
  }) {
    if (!selectedPlan || !studentId || selectedDay === null) return;

    if (isStudentTrainingBlocked()) {
      setMessage({
        type: "error",
        text: getTrainingBlockedMessage(),
      });
      setShowWorkoutModal(false);
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    if (!canValidateWorkoutDay(selectedDay)) {
      setMessage({
        type: "error",
        text: "O prazo para validar este treino já foi encerrado. Você pode visualizar o treino, mas não pode mais marcar como concluído.",
      });
      setShowWorkoutModal(false);
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    const careEventType = String(options?.careEventType || "").trim();
    const completionStatus = options?.completionStatus || "CONCLUIDO";
    const description = String(options?.careEventDescription ?? careEventDetail ?? "").trim();

    if (careEventType && !description) {
      setMessage({
        type: "error",
        text: "Explique em poucas palavras o que aconteceu antes de encerrar o treino com relato de cuidado.",
      });
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    setCompleting(true);
    setMessage(null);

    try {
      const planDate = new Date(currentYear, currentMonth, selectedDay);
      const res = await fetch("/api/workout/mark-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutPlanId: selectedPlan.id,
          studentId,
          date: planDate.toISOString(),
          completionStatus,
          careEventType: careEventType || null,
          careEventDescription: description || null,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        if (careEventType) {
          setCareEventSentForPlanId((current) => ({
            ...current,
            [selectedPlan.id]: true,
          }));
        }

        setCareEventDetail("");

        setMessage({
          type: "success",
          text:
            data?.message ||
            (completionStatus === "CONCLUIDO"
              ? "Treino concluído!"
              : "Treino encerrado com relato enviado ao professor."),
        });

        await fetchWorkouts(studentId);
        await fetchNotices(studentId);
        await fetchCareEvents(studentId);
        await fetchDashboardSummary();
        setShowWorkoutModal(false);
      } else {
        setMessage({
          type: "error",
          text: data?.error || "Não foi possível validar este treino.",
        });
        setShowWorkoutModal(false);
      }
    } catch {
      setMessage({
        type: "error",
        text: "Não foi possível validar este treino.",
      });
      setShowWorkoutModal(false);
    }

    setCompleting(false);
    setTimeout(() => setMessage(null), 4000);
  }

  // Envia nova dúvida (fora do modal) ou follow-up (dentro do modal)
  function getCareEventFriendlyMessage(eventType: string): string {
    if (eventType === "DOR_DESCONFORTO") {
      return "Obrigado por avisar. Sua segurança vem primeiro. O professor foi sinalizado para revisar seu treino antes de qualquer progressão.";
    }

    if (eventType === "EXERCICIO_DIFICIL") {
      return "Obrigado por contar. Vamos sinalizar o professor para ajustar carga, exercício ou volume. Treino bom precisa desafiar na medida certa.";
    }

    if (eventType === "NAO_ENTENDI") {
      return "Obrigado por avisar. O professor será sinalizado para deixar a orientação mais clara.";
    }

    if (eventType === "FALTA_TEMPO") {
      return "Obrigado por avisar. Vamos considerar isso para deixar sua próxima semana mais possível e realista.";
    }

    if (eventType === "DESMOTIVACAO") {
      return "Obrigado por ser sincero. Vamos considerar isso para uma retomada mais leve, sem culpa e com constância.";
    }

    return "Obrigado por compartilhar. Sua resposta ajuda o professor a cuidar melhor do seu treino.";
  }

  async function reportCareEvent(
    eventType: string,
    completionStatus: "CONCLUIDO" | "NAO_CONCLUIDO_COM_RELATO" | "INTERROMPIDO_CUIDADO" = "NAO_CONCLUIDO_COM_RELATO"
  ) {
    if (!studentId || !selectedPlan) return;

    setSendingCareEvent(true);

    try {
      await markAsComplete({
        careEventType: eventType,
        careEventDescription: careEventDetail,
        completionStatus,
      });
    } finally {
      setSendingCareEvent(false);
    }
  }

  async function requestCareReturn() {
    if (!studentId || !activePauseCareEvent) return;

    setSendingCareReturn(true);
    setMessage(null);

    try {
      const res = await fetch("/api/student-care-events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activePauseCareEvent.id,
          action: "REQUEST_RETURN",
          returnMessage:
            "Confirmo que me sinto apto(a) para retomar os treinos. Entendo que, caso ainda exista dor, limitação ou orientação médica pendente, devo informar o professor antes de voltar.",
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({
          type: "success",
          text: data?.message || "Seu professor foi avisado para revisar sua retomada.",
        });
        await fetchCareEvents(studentId);
        await fetchNotices(studentId);
        await fetchDashboardSummary();
      } else {
        setMessage({
          type: "error",
          text: data?.error || "Não foi possível solicitar retomada agora.",
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Não foi possível solicitar retomada agora.",
      });
    }

    setSendingCareReturn(false);
    setTimeout(() => setMessage(null), 5000);
  }

  async function handleSendQuestion(parentId?: string) {
    const text = parentId ? followUpText : newQuestion;
    const file = parentId ? followUpFile : questionFile;
    const content = text.trim() || (file ? "Anexo enviado pelo aluno." : "");

    if (!content || !studentId) return;

    if (parentId) setSendingFollowUp(true);
    else setSendingQuestion(true);

    try {
      const form = new FormData();
      form.append("content", content);
      form.append("studentId", studentId);

      if (parentId) {
        form.append("parentId", parentId);
      } else {
        form.append("target", questionTarget);
      }
      if (file) form.append("file", file);

      const res = await fetch("/api/aluno/questions", { method: "POST", body: form });
      const data = await res.json().catch(() => null);

      if (res.ok) {
        if (parentId) {
          setFollowUpText("");
          setFollowUpFile(null);
          setSelectedQuestion(null);
        } else {
          setNewQuestion("");
          setQuestionFile(null);
        }
        setMessage({ type: "success", text: "Dúvida enviada!" });
        await fetchQuestions(studentId);
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao enviar" });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao enviar" });
    }

    if (parentId) setSendingFollowUp(false);
    else setSendingQuestion(false);
    setTimeout(() => setMessage(null), 3000);
  }

  // ⚫ Cinza = duvida resolvida (fechada)
  // 🟢 Verde = professor/gestão respondeu (tem novidade)
  // 🔵 Azul = aluno enviou, aguardando resposta
  function getThreadStatus(q: any): "resolved" | "new_reply" | "waiting" {
    if (q.resolvedAt) return "resolved";

    const messages = [q, ...(q.children || [])];
    const last = messages[messages.length - 1];
    const lastRole = String(last?.senderRole || "").toUpperCase();

    if (last.answer) return "new_reply";
    if (lastRole === "TEACHER" || lastRole === "PROFESSOR" || lastRole === "GESTOR" || lastRole === "ADMIN") {
      return "new_reply";
    }

    return "waiting";
  }

  async function handleResolveDoubt(questionId: string) {
    try {
      const res = await fetch("/api/aluno/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: questionId, action: "resolve" }),
      });
      if (res.ok) {
        setSelectedQuestion(null);
        await fetchQuestions(studentId);
      }
    } catch {}
  }

  function getThreadPreview(q: any): string {
    const children = q.children || [];
    if (children.length > 0) {
      const last = children[children.length - 1];
      return last.content;
    }
    return q.content;
  }

  function getThreadTime(q: any): string {
    const children = q.children || [];
    if (children.length > 0) {
      const last = children[children.length - 1];
      return new Date(last.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    return new Date(q.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function getQuestionTargetLabel(q: any): string {
    if (q?.teacher?.name) {
      return "Professor: " + q.teacher.name;
    }

    if (q?.teacherId) {
      return "Professor";
    }

    return "Gestão";
  }

  function getMessageRole(msg: any): "STUDENT" | "TEACHER" | "GESTOR" {
    const role = String(msg?.senderRole || "").toUpperCase();

    if (role === "TEACHER" || role === "PROFESSOR") return "TEACHER";
    if (role === "GESTOR" || role === "ADMIN") return "GESTOR";

    return "STUDENT";
  }

  function getMessageAuthorLabel(msg: any, thread?: any): string {
    const role = getMessageRole(msg);

    if (role === "STUDENT") return "Você";
    if (role === "GESTOR") return "Gestão";

    return msg?.teacher?.name || thread?.teacher?.name || "Professor";
  }

  function getMessageDotClass(msg: any): string {
    const role = getMessageRole(msg);

    if (role === "STUDENT") return "bg-green-500";
    if (role === "GESTOR") return "bg-amber-500";

    return "bg-[#D4A373]";
  }

  function getMessageAuthorClass(msg: any): string {
    const role = getMessageRole(msg);

    if (role === "STUDENT") return "text-green-400";
    if (role === "GESTOR") return "text-amber-400";

    return "text-[#D4A373]";
  }

  function shouldShowLegacyAnswer(msg: any): boolean {
    const role = getMessageRole(msg);

    return role === "STUDENT" && Boolean(msg.answer);
  }

  function getStartOfCurrentWeek(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    return startOfWeek;
  }

  function getStartOfNextWeek(): Date {
    const startOfCurrentWeek = getStartOfCurrentWeek();
    const startOfNextWeek = new Date(startOfCurrentWeek);
    startOfNextWeek.setDate(startOfCurrentWeek.getDate() + 7);
    startOfNextWeek.setHours(0, 0, 0, 0);

    return startOfNextWeek;
  }

  function isSundayWorkoutReleaseWindowOpen(referenceDate = new Date()): boolean {
    return referenceDate.getDay() === 0 && referenceDate.getHours() >= 15;
  }

  function getStudentPlanVisibilityLimit(): Date {
    const limit = getStartOfNextWeek();

    // Aos domingos, a partir das 15h, os treinos da semana seguinte já ficam
    // disponíveis para o aluno consultar antes de começar na segunda-feira.
    if (isSundayWorkoutReleaseWindowOpen()) {
      limit.setDate(limit.getDate() + 7);
    }

    return limit;
  }

  function isDateInCurrentValidationWeek(date: Date): boolean {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);

    return normalized >= getStartOfCurrentWeek() && normalized < getStartOfNextWeek();
  }

  function getValidationDeadlineLabel(): string {
    const deadline = new Date(getStartOfCurrentWeek());
    deadline.setDate(deadline.getDate() + 4);

    return deadline.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
    });
  }

  function getStartOfValidationClosure(): Date {
    const closure = new Date(getStartOfCurrentWeek());
    closure.setDate(closure.getDate() + 5);
    closure.setHours(0, 0, 0, 0);

    return closure;
  }

  function canValidateWorkoutDay(day: number | null): boolean {
    if (day === null) return false;

    const selectedDate = new Date(currentYear, currentMonth, day);
    selectedDate.setHours(0, 0, 0, 0);

    const now = new Date();

    return (
      now < getStartOfValidationClosure() &&
      selectedDate >= getStartOfCurrentWeek() &&
      selectedDate < getStartOfValidationClosure()
    );
  }

  function isExpiredWorkoutDay(day: number): boolean {
    return hasPlan(day) && !isCompleted(day) && !canValidateWorkoutDay(day);
  }

  function canStudentSeePlanByDate(value?: string | null): boolean {
    if (!value) return false;

    const planDate = new Date(value);

    if (Number.isNaN(planDate.getTime())) return false;

    planDate.setHours(0, 0, 0, 0);

    /*
     * O aluno só enxerga treinos da semana vigente ou anteriores.
     * Treinos de semana futura podem ser planejados pelo professor,
     * mas não aparecem no calendário, nas bolinhas ou na lista do aluno.
     */
    return planDate < getStudentPlanVisibilityLimit();
  }

  function getWeekDayName(day: number): string {
    const date = new Date(currentYear, currentMonth, day);
    const dayIndex = date.getDay();
    const reverseMap: Record<number, string> = {
      0: "domingo", 1: "segunda", 2: "terca", 3: "quarta",
      4: "quinta", 5: "sexta", 6: "sabado",
    };
    return reverseMap[dayIndex];
  }
  function getPlanForDay(day: number): any | null {
    const selectedDate = new Date(currentYear, currentMonth, day);
    selectedDate.setHours(0, 0, 0, 0);

    if (selectedDate >= getStudentPlanVisibilityLimit()) {
      return null;
    }

    const dateStr = currentYear + "-" + String(currentMonth + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");

    return plans.find((p: any) => {
      if (!p.date) return false;
      if (!canStudentSeePlanByDate(p.date || p.createdAt)) return false;

      const planDate = new Date(p.date);
      const planStr = planDate.getUTCFullYear() + "-" + String(planDate.getUTCMonth() + 1).padStart(2, "0") + "-" + String(planDate.getUTCDate()).padStart(2, "0");

      return planStr === dateStr;
    }) || null;
  }
  function handleDayClick(day: number) {
    if (isStudentTrainingBlocked()) {
      setMessage({
        type: "error",
        text: getTrainingBlockedMessage(),
      });
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    const selectedDate = new Date(currentYear, currentMonth, day);
    selectedDate.setHours(0, 0, 0, 0);

    setSelectedDay(day);
    setSelectedExercise(null);
    setSelectedPlan(null);

    if (selectedDate >= getStudentPlanVisibilityLimit()) {
      return;
    }

    const plan = getPlanForDay(day);
    if (plan) {
      setSelectedPlan(plan);
      setExerciseProgress({});
      setCareEventDetail("");
      setShowWorkoutModal(true);
      void fetchExerciseProgress(plan.id, day);
    }
  }
  function isToday(day: number) {
    const d = new Date();
    return day === d.getDate() && currentMonth === d.getMonth() && currentYear === d.getFullYear();
  }
  function isCompleted(day: number) {
    const selectedDate = new Date(currentYear, currentMonth, day);
    selectedDate.setHours(0, 0, 0, 0);

    if (selectedDate >= getStudentPlanVisibilityLimit()) {
      return false;
    }

    const ds = currentYear + "-" + String(currentMonth + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    return workouts.some((w: any) => {
      const workoutDate = new Date(w.date);
      const workoutStr = workoutDate.getUTCFullYear() + "-" + String(workoutDate.getUTCMonth() + 1).padStart(2, "0") + "-" + String(workoutDate.getUTCDate()).padStart(2, "0");
      return workoutStr === ds && w.status === "CONCLUIDO";
    });
  }
  function hasPlan(day: number): boolean {
    return getPlanForDay(day) !== null;
  }
  function getCommercialUiState(): string {
    return String(dashboardSummary?.uiState || "").toUpperCase();
  }

  function isStudentTrainingBlocked(): boolean {
    const uiState = getCommercialUiState();

    return (
      Boolean(activePauseCareEvent) ||
      uiState === "PAUSA_POR_CUIDADO" ||
      uiState === "EXPERIENCIA_AGENDADA" ||
      uiState === "SEM_CONTRATO_ATIVO" ||
      uiState === "SUSPENSO_POR_PAGAMENTO" ||
      uiState === "AGUARDANDO_PAGAMENTO" ||
      uiState === "AGUARDANDO_VINCULO_PROFESSOR"
    );
  }

  function getTrainingBlockedTitle(): string {
    const uiState = getCommercialUiState();

    if (activePauseCareEvent || uiState === "PAUSA_POR_CUIDADO") {
      return String(activePauseCareEvent?.status || "").toUpperCase() === "EM_REVISAO"
        ? "Retomada em revisão"
        : "Treinos pausados por cuidado";
    }

    if (uiState === "EXPERIENCIA_AGENDADA") {
      return "Treinos começam na próxima janela segura";
    }

    if (uiState === "SUSPENSO_POR_PAGAMENTO") {
      return "Acesso aos treinos pausado";
    }

    return "Treinos indisponíveis no momento";
  }

  function getTrainingBlockedMessage(): string {
    const uiState = getCommercialUiState();

    if (activePauseCareEvent || uiState === "PAUSA_POR_CUIDADO") {
      const status = String(activePauseCareEvent?.status || "").toUpperCase();

      if (status === "EM_REVISAO") {
        return "Você já avisou que se sente apto(a) para retomar. Agora o professor precisa revisar e liberar sua retomada com segurança.";
      }

      return "Existe uma pausa por cuidado aberta. Seus treinos ficam pausados até você sinalizar aptidão de retomada e o professor revisar o caso.";
    }

    if (uiState === "EXPERIENCIA_AGENDADA") {
      return "Seu cadastro foi ativado, mas a primeira semana real de treino ainda não começou. Isso evita começar atrasado ou receber treinos corridos no fim da semana.";
    }

    if (uiState === "SUSPENSO_POR_PAGAMENTO") {
      return "Existe uma pendência de pagamento no seu ciclo. Fale com a equipe para regularizar e voltar a acessar os treinos.";
    }

    if (uiState === "SEM_CONTRATO_ATIVO") {
      return "Você está sem experiência ou contrato ativo no momento. Fale com a equipe para continuar seu acompanhamento.";
    }

    return "Seu acesso aos treinos está temporariamente indisponível. Fale com a equipe para regularizar.";
  }

  const activePauseCareEvent = careEvents.find((event: any) => {
    const eventType = String(event?.eventType || "").toUpperCase();
    const status = String(event?.status || "").toUpperCase();

    return eventType === "PAUSA_POR_CUIDADO" && status !== "RESOLVIDO";
  }) || null;
  const activePauseStatus = String(activePauseCareEvent?.status || "").toUpperCase();
  const hasRequestedCareReturn = activePauseStatus === "EM_REVISAO";

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const nomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const meses = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const unreadCount = notices.filter((n: any) => !n.readByStudent).length;
  const pendingCount = questions.filter((q: any) => getThreadStatus(q) === "new_reply").length;
  const profileImageUrl = getImageUrl(studentImage || dashboardSummary?.student?.image || null);
  if (loading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><p className="text-[#a1a1a1]">Carregando...</p></div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <ProfilePhotoEditor
          name={studentName}
          initialImageUrl={profileImageUrl}
          size="md"
          onUpdated={(imageUrl) => {
            setStudentImage(imageUrl);
            setDashboardSummary((current: any) =>
              current
                ? {
                    ...current,
                    student: {
                      ...current.student,
                      image: imageUrl,
                    },
                  }
                : current
            );
          }}
        />

        <div>
          <h1 className="text-lg font-bold text-[#f5f5f5]">Ola, {studentName}!</h1>
          <p className="text-xs text-[#a1a1a1]">Bem-vindo a sua area do aluno</p>
        </div>
      </div>
      {message && (
        <div className={"text-sm rounded-lg p-2.5 " + (message.type === "success" ? "bg-green-500/10 text-green-400" : message.type === "error" ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400")}>
          {message.text}
        </div>
      )}

      <EmailNotificationReminder />

      <AlunoCommercialStatusPanel />

      <StudentDidYouKnowCard />

      <StudentSurveyPanel />

      {activePauseCareEvent && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-red-300">
              {hasRequestedCareReturn ? "Retomada em revisão pelo professor" : "Treinos pausados por cuidado"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-red-100/80">
              {hasRequestedCareReturn
                ? "Recebemos sua sinalização de retomada. Aguarde o professor revisar e liberar com segurança antes de voltar aos treinos."
                : "Existe uma pausa por cuidado aberta. Se você ainda sente dor, limitação ou tem orientação médica pendente, não retome o treino. Quando se sentir apto(a), avise seu professor pelo botão abaixo."}
            </p>
            {activePauseCareEvent.description && (
              <p className="mt-2 text-[10px] leading-relaxed text-red-100/60">
                Último relato: {activePauseCareEvent.description}
              </p>
            )}
          </div>

          {!hasRequestedCareReturn && (
            <button
              type="button"
              onClick={requestCareReturn}
              disabled={sendingCareReturn || loadingCareEvents}
              className="inline-flex rounded-lg bg-red-400 px-3 py-2 text-[11px] font-semibold text-[#0a0a0a] hover:bg-red-300 transition disabled:opacity-50"
            >
              {sendingCareReturn ? "Enviando..." : "Estou apto para retomar os treinos"}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3">
        {/* AVISOS E FEEDBACKS */}
        <div className="lg:w-[30%] bg-[#111] border border-[#ffffff10] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-[#f5f5f5] text-xs">Avisos e Feedbacks</h2>
            {unreadCount > 0 && (
              <span className="bg-green-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          {notices.length === 0 ? (
            <p className="text-[#a1a1a1] text-[11px]">Nenhum aviso ou feedback no momento.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {notices.map((n: any) => (
                <div key={n.id}
                  onClick={() => { setSelectedNotice(n); if (!n.readByStudent) markNoticeAsRead(n.id); }}
                  className="bg-[#1a1a1a] rounded-lg p-2 cursor-pointer hover:bg-[#222] transition flex items-start gap-2.5">
                  <div className="relative shrink-0">
                    <PersonAvatar
                      image={n.author?.image}
                      name={getNoticeAuthorName(n)}
                      sizeClass="h-8 w-8"
                      textClass="text-[9px]"
                    />
                    <div
                      className={
                        "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#1a1a1a] " +
                        (n.readByStudent ? "bg-[#525252]" : "bg-green-500")
                      }
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#e5e5e5] font-medium truncate">{n.title || n.type || "Aviso"}</p>
                    <p className="text-[9px] text-[#a1a1a1] truncate">
                      {getNoticeAuthorName(n)} · {getNoticeAuthorRoleLabel(n)}
                    </p>
                    <p className="text-[9px] text-[#6b6b6b] mt-0.5">{new Date(n.createdAt).toLocaleDateString("pt-BR")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* TREINOS E DUVIDAS */}
        <div className="lg:w-[70%] space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="sm:w-[55%] bg-[#111] border border-[#ffffff10] rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-[#f5f5f5] text-xs">Meus Treinos</h2>
                <div className="flex items-center gap-1">
                  <button onClick={() => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); } else { setCurrentMonth(currentMonth - 1); } }}
                    className="text-[#a1a1a1] hover:text-white text-[8px] px-0.5">◀</button>
                  <span className="text-[#f5f5f5] text-[8px] font-medium">{meses[currentMonth]} {currentYear}</span>
                  <button onClick={() => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); } else { setCurrentMonth(currentMonth + 1); } }}
                    className="text-[#a1a1a1] hover:text-white text-[8px] px-0.5">▶</button>
                </div>
              </div>
              {loadingDashboardSummary ? (
                <div className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] p-4 text-[11px] text-[#a1a1a1]">
                  Verificando seu acesso aos treinos...
                </div>
              ) : isStudentTrainingBlocked() ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <p className="text-xs font-semibold text-amber-300">
                    {getTrainingBlockedTitle()}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">
                    {getTrainingBlockedMessage()}
                  </p>
                  <a
                    href="/aluno"
                    className="mt-3 inline-flex rounded-lg border border-amber-500/30 px-3 py-2 text-[10px] font-semibold text-amber-200"
                  >
                    Ver meu acompanhamento
                  </a>
                </div>
              ) : (
                <>
              <div className="grid grid-cols-7 gap-px">
                {nomes.map((d) => <div key={d} className="text-center text-[6px] text-[#525252] py-px">{d}</div>)}
                {Array.from({ length: firstDay }).map((_, i) => <div key={"e" + i} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const hoje = isToday(day);
                  const sel = selectedDay === day;
                  const done = isCompleted(day);
                  const plan = hasPlan(day);
                  const dayDate = new Date(currentYear, currentMonth, day);
                  dayDate.setHours(0, 0, 0, 0);
                  const isFutureHidden = dayDate >= getStudentPlanVisibilityLimit();
                  return (
                    <button key={day} onClick={() => handleDayClick(day)}
                      className={"aspect-square rounded-sm flex flex-col items-center justify-center text-[7px] transition " + (isFutureHidden ? "cursor-default opacity-40 " : "cursor-pointer ") +
                        (sel ? "bg-[#D4A373]/20 border border-[#D4A373] text-[#D4A373]" :
                         hoje ? "border border-[#D4A373]/50 text-[#D4A373] font-bold" :
                         "text-[#a1a1a1] hover:bg-white/5")}>
                      <span>{day}</span>
                      <div className="flex gap-px mt-px">
                        {done && <div className="w-[3px] h-[3px] rounded-full bg-green-500" />}
                        {plan && !done && canValidateWorkoutDay(day) && (
                          <div className="w-[3px] h-[3px] rounded-full bg-[#F97316]" />
                        )}
                        {isExpiredWorkoutDay(day) && (
                          <div className="w-[3px] h-[3px] rounded-full bg-[#EF4444]" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {plans.length === 0 && (
                <p className="text-[8px] text-[#D4A373] mt-1">Em breve...</p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-[#a1a1a1]">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" /> Concluído
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#F97316]" /> Disponível
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#EF4444]" /> Não concluído
                </span>
              </div>

              <p className="text-[8px] text-[#6b6b6b] mt-1 leading-relaxed">
                A conclusão fica disponível somente na semana vigente, até sexta-feira, 23h59. Depois disso, o treino permanece apenas para consulta.
              </p>
                </>
              )}
            </div>
            {/* SEÇÃO DE DÚVIDAS - LADO DIREITO */}
            <div className="sm:w-[45%] bg-[#111] border border-[#ffffff10] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-[#f5f5f5] text-xs">Conversas</h2>
                {pendingCount > 0 && (
                  <span className="bg-green-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </div>

              {/* Formulário de nova dúvida */}
              <label className="block text-[9px] text-[#a1a1a1] mb-1">
                Enviar para
              </label>
              <select
                value={questionTarget}
                onChange={(e) => setQuestionTarget(e.target.value as "PROFESSOR" | "GESTAO")}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#f5f5f5] outline-none focus:border-[#D4A373] mb-1.5"
              >
                <option value="PROFESSOR">Meu professor</option>
                <option value="GESTAO">Gestão</option>
              </select>

              <textarea value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)}
                placeholder={questionTarget === "GESTAO" ? "Pergunte para a gestão..." : "Pergunte para seu professor..."}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373] resize-none h-14 mb-1.5" />
              <div className="flex items-center gap-1 mb-1.5">
                <input type="file" accept="image/*,video/*" onChange={(e) => setQuestionFile(e.target.files?.[0] || null)}
                  className="text-[8px] text-[#a1a1a1] file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[8px] file:font-medium file:bg-[#D4A373] file:text-[#0a0a0a]" />
                {questionFile && <span className="text-[8px] text-[#D4A373]">1</span>}
              </div>
              <button onClick={() => handleSendQuestion()} disabled={sendingQuestion || (!newQuestion.trim() && !questionFile)}
                className="w-full bg-[#D4A373] text-[#0a0a0a] text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50">
                {sendingQuestion ? "..." : "Enviar"}
              </button>

              {/* Lista de threads */}
              {questions.length > 0 && (
                <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                  <p className="text-[9px] text-[#525252] mb-1">Suas conversas:</p>
                  {questions.map((q: any) => {
                    const status = getThreadStatus(q);
                    return (
                      <div key={q.id}
                        onClick={() => setSelectedQuestion(q)}
                        className={"bg-[#1a1a1a] rounded-lg p-2 flex items-start gap-2 cursor-pointer " + (status === "resolved" ? "opacity-60" : "hover:bg-[#222] transition")}>
                        <div className={"w-2.5 h-2.5 rounded-full mt-1 shrink-0 " + (
                          status === "resolved" ? "bg-[#525252]" :
                          status === "new_reply" ? "bg-green-500" : "bg-blue-500"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-[#e5e5e5] font-medium truncate">
                            {q.content.substring(0, 50)}{q.content.length > 50 ? "..." : ""}
                          </p>
                          <p className="text-[8px] text-[#D4A373] mt-0.5 truncate">
                            Conversa com: {getQuestionTargetLabel(q)}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <p className="text-[8px] text-[#6b6b6b]">{getThreadTime(q)}</p>
                            <span className={"text-[8px] px-1 py-px rounded " + (
                              status === "resolved" ? "bg-[#525252]/20 text-[#6b6b6b]" :
                              status === "new_reply" ? "bg-green-500/10 text-green-400" : "bg-blue-500/10 text-blue-400"
                            )}>
                              {status === "resolved" ? "Encerrada" : status === "new_reply" ? "Nova mensagem" : "Aguardando"}
                            </span>
                            {(q.children?.length || 0) > 0 && (
                              <span className="text-[7px] text-[#525252]">
                                {q.children.length + 1} msgs
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DA THREAD DE DÚVIDA */}
      {selectedQuestion && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setSelectedQuestion(null)}>
          <div className="bg-[#111] border border-[#ffffff15] rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#ffffff10] shrink-0">
              <div>
                <h2 className="text-sm font-bold text-[#f5f5f5]">Conversa</h2>
                <p className="text-[9px] text-[#D4A373] mt-0.5">
                  Conversa com: {getQuestionTargetLabel(selectedQuestion)}
                </p>
              </div>
              <button onClick={() => setSelectedQuestion(null)} className="text-[#a1a1a1] hover:text-white text-base w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition shrink-0">X</button>
            </div>

            {/* Histórico da thread (scrollável) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(() => {
                const messages: any[] = [selectedQuestion, ...(selectedQuestion.children || [])];

                return messages.map((msg: any, idx: number) => (
                  <div key={msg.id || idx}>
                    <div className="flex items-start gap-2">
                      <div className={"w-2 h-2 rounded-full mt-1.5 shrink-0 " + getMessageDotClass(msg)} />
                      <div className="flex-1 bg-[#1a1a1a] rounded-lg p-2.5 border border-[#ffffff08]">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={"text-[9px] font-semibold " + getMessageAuthorClass(msg)}>
                            {getMessageAuthorLabel(msg, selectedQuestion)}
                          </span>
                          <span className="text-[8px] text-[#525252]">
                            {new Date(msg.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>

                        <p className="text-xs text-[#e5e5e5]">{msg.content}</p>

                        {renderChatAttachment(msg)}
                      </div>
                    </div>

                    {shouldShowLegacyAnswer(msg) && (
                      <div className="flex items-start gap-2 ml-4 mt-2">
                        <div className="w-2 h-2 rounded-full mt-1.5 bg-[#D4A373] shrink-0" />
                        <div className="flex-1 bg-[#D4A373]/5 rounded-lg p-2.5 border border-[#D4A373]/15">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[9px] font-semibold text-[#D4A373]">
                              {msg.answeredBy?.name || getQuestionTargetLabel(selectedQuestion)}
                            </span>
                            <span className="text-[8px] text-[#525252]">
                              {msg.answeredAt ? new Date(msg.answeredAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                            </span>
                          </div>
                          <p className="text-xs text-[#e5e5e5]">{msg.answer}</p>
                        </div>
                      </div>
                    )}

                    {idx < messages.length - 1 && (
                      <div className="border-t border-[#ffffff05] my-2" />
                    )}
                  </div>
                ));
              })()}

              {(() => {
                const msgs = [selectedQuestion, ...(selectedQuestion.children || [])];
                const last = msgs[msgs.length - 1];
                if (!last.answer && !selectedQuestion.resolvedAt) {
                  return (
                    <div className="flex items-center gap-2 text-[10px] text-yellow-400 bg-yellow-500/10 rounded-lg p-2">
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Aguardando resposta de {getQuestionTargetLabel(selectedQuestion).toLowerCase()}...
                    </div>
                  );
                }
              })()}
            </div>

            {/* Área inferior - varia conforme status */}
            {selectedQuestion.resolvedAt ? (
              <div className="border-t border-[#ffffff10] p-3 shrink-0">
                <p className="text-[9px] text-[#525252] text-center italic">
                  Duvida encerrada. Se precisar de ajuda, abra uma nova duvida.
                </p>
                <button onClick={() => { setSelectedQuestion(null); setNewQuestion(""); }}
                  className="w-full mt-1 bg-[#2a2a2a] text-[#a1a1a1] text-xs font-semibold py-1.5 rounded-lg hover:bg-[#333] transition">
                  Nova duvida
                </button>
              </div>
            ) : (
              <div className="border-t border-[#ffffff10] p-3 shrink-0">
                {/* Botao "Marcar como resolvida" - aparece quando professor respondeu */}
                {(() => {
                  const msgs = [selectedQuestion, ...(selectedQuestion.children || [])];
                  const last = msgs[msgs.length - 1];
                  if (last.answer && !selectedQuestion.resolvedAt) {
                    return (
                      <button onClick={() => handleResolveDoubt(selectedQuestion.id)}
                        className="w-full text-[9px] bg-transparent border border-[#525252] text-[#6b6b6b] py-1.5 rounded-lg hover:border-[#D4A373] hover:text-[#D4A373] transition mb-1">
                        Marcar como resolvida
                      </button>
                    );
                  }
                })()}

                <p className="text-[9px] text-[#D4A373] font-medium mb-1">
                  {(() => {
                    const msgs = [selectedQuestion, ...(selectedQuestion.children || [])];
                    const last = msgs[msgs.length - 1];
                    return last.answer
                      ? "Nao entendeu? Continue perguntando:"
                      : "Enquanto isso, envie mais detalhes:";
                  })()}
                </p>
                <textarea value={followUpText} onChange={(e) => setFollowUpText(e.target.value)}
                  placeholder="Digite aqui..."
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373] resize-none h-14 mb-1.5" />
                <div className="flex items-center gap-1 mb-1.5">
                  <input type="file" accept="image/*,video/*" onChange={(e) => setFollowUpFile(e.target.files?.[0] || null)}
                    className="text-[8px] text-[#a1a1a1] file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[8px] file:font-medium file:bg-[#D4A373] file:text-[#0a0a0a]" />
                  {followUpFile && <span className="text-[8px] text-[#D4A373]">1</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleSendQuestion(selectedQuestion.id)}
                    disabled={sendingFollowUp || (!followUpText.trim() && !followUpFile)}
                    className="flex-1 bg-[#D4A373] text-[#0a0a0a] text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50">
                    {sendingFollowUp ? "..." : "Continuar perguntando"}
                  </button>
                  <button onClick={() => { setSelectedQuestion(null); setNewQuestion(""); }}
                    className="text-[8px] text-[#6b6b6b] hover:text-white px-2 transition-colors">
                    Nova duvida
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {skipExercise && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-amber-500/30 bg-[#111] p-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[#f5f5f5]">Por que não realizou?</h3>
            <p className="mt-1 text-[10px] text-[#a1a1a1]">{skipExercise.name}</p>
            <div className="mt-3 grid gap-2">
              {["Não deu tempo", "Senti dor ou desconforto", "Muito difícil", "Não tinha equipamento", "Não entendi como fazer", "Outro motivo"].map((reason) => (
                <button key={reason} type="button" onClick={() => setSkipReason(reason)} className={`rounded-lg border px-3 py-2 text-left text-[11px] ${skipReason === reason ? "border-amber-400 bg-amber-500/20 text-amber-200" : "border-[#ffffff10] bg-[#1a1a1a] text-[#e5e5e5]"}`}>{reason}</button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => { setSkipExercise(null); setSkipReason(""); }} className="flex-1 rounded-lg border border-[#ffffff10] py-2 text-[11px] text-[#a1a1a1]">Cancelar</button>
              <button type="button" disabled={!skipReason || savingExerciseId === skipExercise.id} onClick={() => saveExerciseProgress(skipExercise, "PULADO", { skipReason })} className="flex-1 rounded-lg bg-amber-500 py-2 text-[11px] font-semibold text-black disabled:opacity-40">Registrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DO AVISO */}
      {selectedNotice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setSelectedNotice(null)}>
          <div className="bg-[#111] border border-[#ffffff15] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-4 border-b border-[#ffffff10]">
              <div className="flex min-w-0 items-center gap-3">
                <PersonAvatar
                  image={selectedNotice.author?.image}
                  name={getNoticeAuthorName(selectedNotice)}
                  sizeClass="h-11 w-11"
                  textClass="text-xs"
                />

                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-[#D4A373] truncate">
                    {getNoticeAuthorName(selectedNotice)} · {getNoticeAuthorRoleLabel(selectedNotice)}
                  </p>
                  <h2 className="text-sm font-bold text-[#f5f5f5] truncate">{selectedNotice.title || selectedNotice.type || "Aviso"}</h2>
                  <p className="text-[10px] text-[#a1a1a1] mt-0.5">{new Date(selectedNotice.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
              <button onClick={() => setSelectedNotice(null)} className="text-[#a1a1a1] hover:text-white text-base w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition shrink-0">X</button>
            </div>
            <div className="p-4">
              <p className="text-sm text-[#e5e5e5] leading-relaxed whitespace-pre-line">{selectedNotice.content}</p>

              <div className="mt-5 flex items-center gap-3 border-t border-[#ffffff10] pt-3">
                <PersonAvatar
                  image={selectedNotice.author?.image}
                  name={getNoticeAuthorName(selectedNotice)}
                  sizeClass="h-9 w-9"
                  textClass="text-[10px]"
                />
                <div>
                  <p className="text-[9px] text-[#6b6b6b]">Enviado por</p>
                  <p className="text-[11px] font-semibold text-[#e5e5e5]">{getNoticeAuthorName(selectedNotice)}</p>
                  <p className="text-[9px] text-[#D4A373]">{getNoticeAuthorRoleLabel(selectedNotice)} · Funcional VIP Digital</p>
                </div>
              </div>
            </div>
            <div className="p-3 border-t border-[#ffffff10]">
              <button onClick={() => setSelectedNotice(null)} className="w-full bg-[#D4A373] text-[#0a0a0a] text-xs font-semibold py-2 rounded-lg hover:bg-[#c4956a] transition">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
           {/* MODAL DO TREINO */}
      {showWorkoutModal && selectedPlan && !selectedExercise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-[#ffffff15] rounded-2xl w-full max-w-lg max-h-[75vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-[#ffffff10] sticky top-0 bg-[#111] z-10">
              <div>
                <h2 className="text-sm font-bold text-[#f5f5f5]">{selectedPlan.name}</h2>
                <p className="text-[10px] text-[#a1a1a1]">{getWeekDayName(selectedDay!)} - {selectedDay}/{currentMonth + 1}/{currentYear}</p>
                {selectedDay !== null && (
                  <p className="text-[9px] mt-0.5 text-[#D4A373]">
                    {canValidateWorkoutDay(selectedDay)
                      ? `Validação liberada até ${getValidationDeadlineLabel()}`
                      : "Prazo de validação encerrado. Treino disponível apenas para consulta."}
                  </p>
                )}
              </div>
              <button onClick={() => { setShowWorkoutModal(false); setSelectedExercise(null); }}
                className="text-[#a1a1a1] hover:text-white text-base w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition shrink-0">X</button>
            </div>
            <div className="p-3 space-y-2">
              {(selectedPlan.objective ||
                selectedPlan.focusAreas ||
                selectedPlan.intensity ||
                selectedPlan.estimatedDurationMinutes ||
                selectedPlan.estimatedCaloriesMin ||
                selectedPlan.estimatedCaloriesMax ||
                selectedPlan.studentSummary ||
                selectedPlan.safetyNote) && (
                <div className="bg-[#0a0a0a] border border-[#D4A373]/20 rounded-xl p-3 space-y-2">
                  <div>
                    <p className="text-[10px] text-[#D4A373] uppercase tracking-[0.18em] font-semibold">
                      Resumo do treino
                    </p>
                    {selectedPlan.studentSummary && (
                      <p className="text-[11px] text-[#e5e5e5] leading-relaxed mt-1">
                        {selectedPlan.studentSummary}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {selectedPlan.objective && (
                      <div className="bg-[#111] rounded-lg p-2 border border-[#ffffff08] col-span-2">
                        <p className="text-[9px] text-[#6b6b6b]">Objetivo</p>
                        <p className="text-[11px] text-[#f5f5f5]">{selectedPlan.objective}</p>
                      </div>
                    )}

                    {selectedPlan.focusAreas && (
                      <div className="bg-[#111] rounded-lg p-2 border border-[#ffffff08] col-span-2">
                        <p className="text-[9px] text-[#6b6b6b]">Você vai trabalhar</p>
                        <p className="text-[11px] text-[#f5f5f5]">{selectedPlan.focusAreas}</p>
                      </div>
                    )}

                    {selectedPlan.intensity && (
                      <div className="bg-[#111] rounded-lg p-2 border border-[#ffffff08]">
                        <p className="text-[9px] text-[#6b6b6b]">Intensidade</p>
                        <p className="text-[11px] text-[#f5f5f5]">{selectedPlan.intensity}</p>
                      </div>
                    )}

                    {selectedPlan.estimatedDurationMinutes && (
                      <div className="bg-[#111] rounded-lg p-2 border border-[#ffffff08]">
                        <p className="text-[9px] text-[#6b6b6b]">Tempo estimado</p>
                        <p className="text-[11px] text-[#f5f5f5]">
                          {selectedPlan.estimatedDurationMinutes} min
                        </p>
                      </div>
                    )}

                    {(selectedPlan.estimatedCaloriesMin || selectedPlan.estimatedCaloriesMax) && (
                      <div className="bg-[#111] rounded-lg p-2 border border-[#ffffff08] col-span-2">
                        <p className="text-[9px] text-[#6b6b6b]">Gasto energético estimado</p>
                        <p className="text-[11px] text-[#f5f5f5]">
                          {selectedPlan.estimatedCaloriesMin && selectedPlan.estimatedCaloriesMax
                            ? `${selectedPlan.estimatedCaloriesMin} a ${selectedPlan.estimatedCaloriesMax} kcal`
                            : selectedPlan.estimatedCaloriesMin
                              ? `a partir de ${selectedPlan.estimatedCaloriesMin} kcal`
                              : `até ${selectedPlan.estimatedCaloriesMax} kcal`}
                        </p>
                        <p className="text-[9px] text-[#6b6b6b] mt-0.5 leading-relaxed">
                          Estimativa aproximada. Pode variar conforme ritmo, carga, execução, condicionamento e tempo real de treino.
                        </p>
                      </div>
                    )}
                  </div>

                  {selectedPlan.safetyNote && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                      <p className="text-[10px] text-amber-300 leading-relaxed">
                        {selectedPlan.safetyNote}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {(() => {
                const totals = getExerciseTotals();
                const percent = totals.total ? Math.round((totals.resolved / totals.total) * 100) : 0;
                return totals.total ? (
                  <div className="rounded-xl border border-[#D4A373]/20 bg-[#0a0a0a] p-3">
                    <div className="mb-2 flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-[#f5f5f5]">Progresso do treino</span>
                      <span className="text-[#D4A373]">{totals.resolved} de {totals.total} • {percent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#242424]">
                      <div className="h-full rounded-full bg-[#D4A373] transition-all" style={{ width: `${percent}%` }} />
                    </div>
                    {totals.total - totals.resolved === 1 && <p className="mt-2 text-[10px] text-green-300">Falta só mais um exercício. Vamos terminar!</p>}
                  </div>
                ) : null;
              })()}

              {selectedPlan.exercises?.sort((a: any, b: any) => a.order - b.order).map((ex: any, idx: number) => {
                const progress = exerciseProgress[ex.id];
                const done = progress?.status === "CONCLUIDO";
                const skipped = progress?.status === "PULADO";
                return (
                <div key={ex.id || idx}
                  className={`rounded-xl p-2.5 border transition ${done ? "bg-green-500/10 border-green-500/30" : skipped ? "bg-amber-500/10 border-amber-500/30" : "bg-[#1a1a1a] border-[#ffffff08]"}`}>
                  <div className="flex items-start gap-2">
                    <div
                      className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border ${done ? "bg-green-500 text-white border-green-400" : "bg-[#D4A373]/15 text-[#D4A373] border-[#D4A373]/30"}`}
                    >
                      {done ? "✓" : idx + 1}
                    </div>
                    <button type="button" onClick={() => { setSelectedExercise(ex); setImgError(false); setShowSequenceImage(false); setShowExerciseVideo(false); }} className="flex-1 min-w-0 text-left">
                      <p className={`text-sm font-medium ${done ? "text-green-300 line-through decoration-green-500/50" : "text-[#f5f5f5]"}`}>{ex.name}</p>
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-[9px] text-[#a1a1a1]">
                        <span>{ex.series || '-'} series x {ex.reps || '-'} reps</span>
                        {ex.weight && <span>Carga: {ex.weight}kg</span>}
                        {ex.restTime && <span>Descanso: {ex.restTime}</span>}
                      </div>
                      {done && <p className="mt-1 text-[9px] text-green-400">Feito {progress?.effort ? `• ${progress.effort === "FACIL" ? "Fácil" : progress.effort === "DIFICIL" ? "Difícil" : "Na medida"}` : ""}</p>}
                      {skipped && <p className="mt-1 text-[9px] text-amber-300">Não realizado • {progress.skipReason}</p>}
                    </button>
                    {!isCompleted(selectedDay!) && (
                      <div className="flex shrink-0 flex-col gap-1.5">
                        <button
                          type="button"
                          disabled={savingExerciseId === ex.id}
                          onClick={() => saveExerciseProgress(ex, done ? "PENDENTE" : "CONCLUIDO")}
                          className={`min-w-[68px] rounded-lg border px-2 py-1.5 text-[9px] font-semibold transition ${done ? "border-green-500/40 bg-green-500/15 text-green-300" : "border-[#D4A373]/40 bg-[#D4A373]/15 text-[#E7B785]"}`}
                        >
                          {savingExerciseId === ex.id ? "Salvando..." : done ? "✓ Feito" : "Marcar feito"}
                        </button>
                        {!done && (
                          <button
                            type="button"
                            onClick={() => { setSkipExercise(ex); setSkipReason(""); }}
                            className="min-w-[68px] rounded-lg border border-[#ffffff10] px-2 py-1 text-[9px] text-[#a1a1a1]"
                          >
                            Não fiz
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )})}
              {(!selectedPlan.exercises || selectedPlan.exercises.length === 0) && (
                <p className="text-center text-[#6b6b6b] text-sm py-6">Nenhum exercicio cadastrado neste treino.</p>
              )}
            </div>
            {selectedPlan.notes && (
              <div className="px-3 pb-3">
                <div className="bg-[#D4A373]/10 border border-[#D4A373]/20 rounded-xl p-2">
                  <p className="text-[9px] text-[#D4A373] font-semibold mb-0.5">Observacoes</p>
                  <p className="text-[11px] text-[#e5e5e5]">{selectedPlan.notes}</p>
                </div>
              </div>
            )}
            {selectedDay !== null && (
              <div className="px-3 pb-3 space-y-2">
                {!canValidateWorkoutDay(selectedDay) && !isCompleted(selectedDay) && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                    <p className="text-[11px] font-semibold text-red-300">
                      Prazo de conclusão encerrado
                    </p>
                    <p className="mt-1 text-[10px] text-red-200/90 leading-relaxed">
                      Este treino poderia ser concluído até sexta-feira, 23h59. Agora ele permanece disponível somente para consulta e será registrado como não concluído.
                    </p>
                  </div>
                )}

                {!isCompleted(selectedDay) && canValidateWorkoutDay(selectedDay) && (
                  <div className="bg-[#0a0a0a] border border-[#ffffff10] rounded-xl p-3 space-y-2">
                    <div>
                      <p className="text-[11px] text-[#D4A373] font-semibold">
                        Precisa de algum ajuste ou cuidado?
                      </p>
                      <p className="text-[10px] text-[#a1a1a1] leading-relaxed mt-0.5">
                        Conte o que aconteceu antes de encerrar o treino. O relato será salvo junto com o encerramento,
                        para o professor ajustar sua próxima semana sem transformar dificuldade em cobrança.
                      </p>
                    </div>

                    <textarea
                      value={careEventDetail}
                      onChange={(event) => setCareEventDetail(event.target.value)}
                      placeholder="Obrigatório se for encerrar com relato: explique em poucas palavras o que aconteceu."
                      className="w-full min-h-[60px] bg-[#111] border border-[#ffffff10] rounded-lg px-3 py-2 text-[11px] text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                    />

                    {careEventSentForPlanId[selectedPlan?.id] ? (
                      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2">
                        <p className="text-[10px] text-green-400">
                          Recebemos seu relato. Obrigado por avisar — isso ajuda o professor a cuidar melhor do seu treino.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={sendingCareEvent || completing}
                          onClick={() => reportCareEvent("FALTA_TEMPO", "NAO_CONCLUIDO_COM_RELATO")}
                          className="text-[10px] px-3 py-2 rounded-lg bg-[#1a1a1a] text-[#e5e5e5] hover:border-[#D4A373]/50 border border-[#ffffff10] disabled:opacity-50"
                        >
                          Não consegui concluir por falta de tempo
                        </button>

                        <button
                          type="button"
                          disabled={sendingCareEvent || completing}
                          onClick={() => reportCareEvent("EXERCICIO_DIFICIL", "NAO_CONCLUIDO_COM_RELATO")}
                          className="text-[10px] px-3 py-2 rounded-lg bg-[#1a1a1a] text-[#e5e5e5] hover:border-[#D4A373]/50 border border-[#ffffff10] disabled:opacity-50"
                        >
                          Não consegui concluir: exercício difícil
                        </button>

                        <button
                          type="button"
                          disabled={sendingCareEvent || completing}
                          onClick={() => reportCareEvent("NAO_ENTENDI", "NAO_CONCLUIDO_COM_RELATO")}
                          className="text-[10px] px-3 py-2 rounded-lg bg-[#1a1a1a] text-[#e5e5e5] hover:border-[#D4A373]/50 border border-[#ffffff10] disabled:opacity-50"
                        >
                          Não entendi e não concluí
                        </button>

                        <button
                          type="button"
                          disabled={sendingCareEvent || completing}
                          onClick={() => reportCareEvent("DESMOTIVACAO", "NAO_CONCLUIDO_COM_RELATO")}
                          className="text-[10px] px-3 py-2 rounded-lg bg-[#1a1a1a] text-[#e5e5e5] hover:border-[#D4A373]/50 border border-[#ffffff10] disabled:opacity-50"
                        >
                          Não concluí por desmotivação
                        </button>

                        <button
                          type="button"
                          disabled={sendingCareEvent || completing}
                          onClick={() => reportCareEvent("DOR_DESCONFORTO", "CONCLUIDO")}
                          className="sm:col-span-2 text-[10px] px-3 py-2 rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20 disabled:opacity-50"
                        >
                          Concluí, mas senti dor ou desconforto
                        </button>

                        <button
                          type="button"
                          disabled={sendingCareEvent || completing}
                          onClick={() => reportCareEvent("PAUSA_POR_CUIDADO", "INTERROMPIDO_CUIDADO")}
                          className="sm:col-span-2 text-[10px] px-3 py-2 rounded-lg bg-red-600/20 text-red-200 hover:bg-red-600/30 border border-red-500/30 disabled:opacity-50"
                        >
                          Não consegui concluir por dor, acidente ou orientação médica
                        </button>

                        <button
                          type="button"
                          disabled={sendingCareEvent || completing}
                          onClick={() => reportCareEvent("OUTRO", "NAO_CONCLUIDO_COM_RELATO")}
                          className="sm:col-span-2 text-[10px] px-3 py-2 rounded-lg bg-[#1a1a1a] text-[#e5e5e5] hover:border-[#D4A373]/50 border border-[#ffffff10] disabled:opacity-50"
                        >
                          Outro motivo / não concluí
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {(isCompleted(selectedDay) || canValidateWorkoutDay(selectedDay)) && (() => {
                  const totals = getExerciseTotals();
                  const allDone = totals.total > 0 && totals.done === totals.total;
                  const allResolved = totals.total > 0 && totals.resolved === totals.total;
                  return (
                    <div className="space-y-2">
                      {!isCompleted(selectedDay) && !allResolved && (
                        <p className="text-center text-[10px] text-[#a1a1a1]">Marque todos os exercícios como feitos ou informe o motivo dos que não realizou.</p>
                      )}
                      <button
                        onClick={() => {
                          if (allDone) return markAsComplete();
                          if (allResolved && totals.skipped > 0) {
                            const skippedItems = (selectedPlan.exercises || []).filter((ex: any) => exerciseProgress[ex.id]?.status === "PULADO");
                            const detail = skippedItems.map((ex: any) => `${ex.name}: ${exerciseProgress[ex.id]?.skipReason}`).join(" | ");
                            setCareEventDetail(detail);
                            return markAsComplete({ careEventType: "OUTRO", careEventDescription: detail, completionStatus: "NAO_CONCLUIDO_COM_RELATO" });
                          }
                        }}
                        disabled={completing || isCompleted(selectedDay) || !allResolved}
                        className={"w-full text-xs font-semibold py-2.5 rounded-lg transition " + (
                          isCompleted(selectedDay)
                            ? "bg-green-500/20 text-green-400 border border-green-500/30 cursor-default"
                            : allDone
                              ? "bg-green-500 text-white hover:bg-green-600"
                              : allResolved
                                ? "bg-amber-500 text-black hover:bg-amber-400"
                                : "bg-[#242424] text-[#6b6b6b] cursor-not-allowed"
                        )}
                      >
                        {completing ? "..." : isCompleted(selectedDay) ? "Treino Concluído ✓" : allDone ? "Concluir Treino" : allResolved ? "Encerrar treino com relato" : `Faltam ${Math.max(0, totals.total - totals.resolved)} exercício(s)`}
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
            <div className="p-2.5 border-t border-[#ffffff10]">
              <p className="text-[8px] text-[#525252] text-center">Clique em um exercicio para ver detalhes</p>
            </div>
          </div>
        </div>
      )}
      {/* MODAL DETALHE DO EXERCICIO */}
      {selectedExercise && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-[#ffffff15] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl">
            {(() => {
              const imgUrl = getImageUrl(selectedExercise.imageUrl) || getExerciseImageUrl(selectedExercise);
              const videoUrl = getImageUrl(getExerciseVideoUrl(selectedExercise) || undefined);

              if (showExerciseVideo && videoUrl) {
                return (
                  <div className="relative w-full overflow-hidden rounded-t-2xl bg-black">
                    <video
                      key={videoUrl}
                      src={videoUrl}
                      controls
                      autoPlay
                      playsInline
                      preload="metadata"
                      className="h-auto max-h-[280px] w-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setShowExerciseVideo(false)}
                      aria-label="Fechar vídeo e voltar para a imagem"
                      className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/80 px-3 py-1.5 text-[10px] font-semibold text-white shadow-lg backdrop-blur-sm transition hover:bg-black"
                    >
                      <span aria-hidden="true">×</span>
                      Voltar para imagem
                    </button>
                  </div>
                );
              }

              if (imgUrl && !imgError) {
                return (
                  <div className="relative flex w-full items-center justify-center overflow-hidden rounded-t-2xl bg-[#1a1a1a]" style={{ maxHeight: '280px' }}>
                    <img
                      src={imgUrl}
                      alt={selectedExercise.name}
                      className="h-auto max-h-[280px] w-full object-contain"
                      onError={() => setImgError(true)}
                    />
                    {videoUrl && (
                      <button
                        type="button"
                        onClick={() => setShowExerciseVideo(true)}
                        className="absolute bottom-3 left-1/2 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[#D4A373]/60 bg-black/80 px-4 py-2 text-[10px] font-semibold text-white shadow-xl backdrop-blur-sm transition hover:border-[#D4A373] hover:bg-black sm:text-xs"
                      >
                        <svg className="h-4 w-4 shrink-0 text-[#D4A373]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Veja o vídeo com orientação narrada
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="relative flex h-20 w-full items-center justify-center gap-1 rounded-t-2xl bg-gradient-to-br from-[#1a1a1a] to-[#222]">
                  <svg className="h-6 w-6 text-[#333]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-[9px] text-[#444]">Sem foto</p>
                  {videoUrl && (
                    <button
                      type="button"
                      onClick={() => setShowExerciseVideo(true)}
                      className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#D4A373]/60 bg-black/80 px-3 py-1.5 text-[9px] font-semibold text-white"
                    >
                      <span className="text-[#D4A373]" aria-hidden="true">▶</span>
                      Ver orientação narrada
                    </button>
                  )}
                </div>
              );
            })()}
            <div className="flex items-center justify-between p-3 border-b border-[#ffffff10]">
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedExercise(null)} className="text-[#a1a1a1] hover:text-white">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-base font-bold text-[#f5f5f5]">{selectedExercise.name}</h2>
              </div>
              <button onClick={() => setSelectedExercise(null)} className="text-[#a1a1a1] hover:text-white text-base w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition">X</button>
            </div>
            <div className="p-3 space-y-2.5">
              <div className="grid grid-cols-4 gap-1.5">
                <div className="bg-[#1a1a1a] rounded-lg p-2 text-center border border-[#ffffff08]">
                  <p className="text-base font-bold text-[#D4A373]">{selectedExercise.series || '-'}</p>
                  <p className="text-[8px] text-[#6b6b6b]">Series</p>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-2 text-center border border-[#ffffff08]">
                  <p className="text-base font-bold text-[#D4A373]">{selectedExercise.reps || '-'}</p>
                  <p className="text-[8px] text-[#6b6b6b]">Repeticoes</p>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-2 text-center border border-[#ffffff08]">
                  <p className="text-base font-bold text-[#D4A373]">{selectedExercise.weight ? selectedExercise.weight + ' kg' : '-'}</p>
                  <p className="text-[8px] text-[#6b6b6b]">Carga</p>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-2 text-center border border-[#ffffff08]">
                  <p className="text-base font-bold text-[#D4A373]">{selectedExercise.restTime || '-'}</p>
                  <p className="text-[8px] text-[#6b6b6b]">Descanso</p>
                </div>
              </div>
              {(() => {
                const sequenceUrl = getImageUrl(getExerciseSequenceImageUrl(selectedExercise) || undefined);

                if (!sequenceUrl) return null;

                return (
                  <div className="space-y-2">
                    {sequenceUrl && (
                      <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-[10px] font-semibold text-blue-300">
                              {getExerciseSequenceLabel(selectedExercise)}
                            </h3>
                            <p className="mt-1 text-[10px] leading-relaxed text-blue-100/70">
                              Veja a execução em etapas antes de iniciar o exercício.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowSequenceImage((current) => !current)}
                            className="shrink-0 rounded-lg border border-blue-400/30 px-3 py-1.5 text-[10px] font-semibold text-blue-200"
                          >
                            {showSequenceImage ? "Ocultar" : "Ver sequência"}
                          </button>
                        </div>

                        {showSequenceImage && (
                          <div className="mt-3 space-y-2">
                            <img
                              src={sequenceUrl}
                              alt={getExerciseSequenceLabel(selectedExercise)}
                              className="max-h-[360px] w-full rounded-xl border border-blue-500/20 bg-[#0a0a0a] object-contain"
                            />
                            {getExerciseSequenceNotes(selectedExercise) && (
                              <p className="text-[10px] leading-relaxed text-blue-100/80">
                                {getExerciseSequenceNotes(selectedExercise)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })()}

              {getExercisePurpose(selectedExercise) && (
                <div>
                  <h3 className="text-[10px] font-semibold text-[#D4A373] mb-1">
                    Pra que serve este exercício
                  </h3>
                  <div className="bg-[#1a1a1a] rounded-lg p-2.5 border border-[#ffffff08]">
                    <p className="text-xs text-[#e5e5e5] leading-relaxed whitespace-pre-line">
                      {getExercisePurpose(selectedExercise)}
                    </p>
                  </div>
                </div>
              )}

              {getExerciseInstructions(selectedExercise) && (
                <div>
                  <h3 className="text-[10px] font-semibold text-[#D4A373] mb-1">
                    Como executar
                  </h3>
                  <div className="bg-[#1a1a1a] rounded-lg p-2.5 border border-[#ffffff08]">
                    <p className="text-xs text-[#e5e5e5] leading-relaxed whitespace-pre-line">
                      {getExerciseInstructions(selectedExercise)}
                    </p>
                  </div>
                </div>
              )}

              {getExerciseSafetyGuidance(selectedExercise) && (
                <div>
                  <h3 className="text-[10px] font-semibold text-amber-300 mb-1">
                    Cuidados para executar com segurança
                  </h3>
                  <div className="bg-amber-500/10 rounded-lg p-2.5 border border-amber-500/20">
                    <p className="text-xs text-amber-100/90 leading-relaxed whitespace-pre-line">
                      {getExerciseSafetyGuidance(selectedExercise)}
                    </p>
                  </div>
                </div>
              )}

              {selectedExercise.notes && (
                <div>
                  <h3 className="text-[10px] font-semibold text-[#D4A373] mb-1">Observacoes</h3>
                  <div className="bg-[#1a1a1a] rounded-lg p-2.5 border border-[#ffffff08]">
                    <p className="text-xs text-[#e5e5e5]">{selectedExercise.notes}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-[#ffffff10] space-y-2">
              {!isCompleted(selectedDay || 0) && (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={savingExerciseId === selectedExercise.id}
                    onClick={() => saveExerciseProgress(
                      selectedExercise,
                      exerciseProgress[selectedExercise.id]?.status === "CONCLUIDO" ? "PENDENTE" : "CONCLUIDO"
                    )}
                    className={`w-full rounded-lg border py-3 text-[12px] font-bold transition ${exerciseProgress[selectedExercise.id]?.status === "CONCLUIDO" ? "border-green-500/40 bg-green-500/15 text-green-300" : "border-[#D4A373] bg-[#D4A373] text-[#0a0a0a]"}`}
                  >
                    {savingExerciseId === selectedExercise.id
                      ? "Salvando..."
                      : exerciseProgress[selectedExercise.id]?.status === "CONCLUIDO"
                        ? "✓ Exercício feito — tocar para desmarcar"
                        : "Marcar exercício como feito"}
                  </button>

                  <div>
                    <p className="mb-2 text-center text-[10px] text-[#a1a1a1]">Como foi este exercício?</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[["FACIL", "😊 Fácil"], ["NA_MEDIDA", "😐 Na medida"], ["DIFICIL", "🥵 Difícil"]].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          disabled={savingExerciseId === selectedExercise.id}
                          onClick={() => saveExerciseProgress(selectedExercise, "CONCLUIDO", { effort: value })}
                          className={`rounded-lg border px-2 py-2 text-[10px] font-semibold transition ${exerciseProgress[selectedExercise.id]?.effort === value ? "border-green-500 bg-green-500/20 text-green-300" : "border-[#ffffff10] bg-[#1a1a1a] text-[#e5e5e5]"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-center text-[9px] text-[#6b6b6b]">Ao escolher uma opção, o exercício também será marcado como feito.</p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setSelectedExercise(null)}
                className="w-full bg-[#D4A373] text-[#0a0a0a] text-[11px] font-semibold py-2.5 rounded-lg hover:bg-[#c4956a] transition"
              >
                Voltar para os exercícios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

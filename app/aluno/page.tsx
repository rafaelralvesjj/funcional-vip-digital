"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
interface LibraryExercise {
  id: string;
  name: string;
  description: string;
  muscleGroup: string;
  imageUrl?: string;
}
export default function AlunoPage() {
  const [studentId, setStudentId] = useState<string>("");
  const [studentName, setStudentName] = useState("Aluno");
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
  const [exerciseImages, setExerciseImages] = useState<Record<string, string>>({});
  const [selectedNotice, setSelectedNotice] = useState<any>(null);

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
  async function fetchExerciseLibrary() {
    try {
      const res = await fetch("/api/exercise-library");
      if (res.ok) {
        const data = await res.json();
        const exercises: LibraryExercise[] = data.exercises || [];
        const imageMap: Record<string, string> = {};
        exercises.forEach((ex) => {
          if (ex.imageUrl) {
            imageMap[ex.name.toLowerCase()] = ex.imageUrl;
          }
        });
        setExerciseImages(imageMap);
      }
    } catch {}
  }
  function getExerciseImageUrl(exerciseName: string): string | null {
    const key = exerciseName.toLowerCase();
    return exerciseImages[key] || null;
  }
  useEffect(() => { fetchStudentInfo(); }, []);
  useEffect(() => {
    if (studentId) {
      fetchPlans(studentId); fetchWorkouts(studentId);
      fetchNotices(studentId); fetchQuestions(studentId);
      fetchExerciseLibrary();
    }
  }, [studentId, currentMonth, currentYear]);
  async function fetchStudentInfo() {
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const session = await res.json();
        const userName = session?.user?.name || session?.name || "";
        const r2 = await fetch("/api/student/me");
        if (r2.ok) {
          const data = await r2.json();
          setStudentId(data.id);
          setStudentName(data.name);
        } else if (userName) {
          setStudentName(userName);
        }
      }
    } catch {}
    setLoading(false);
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
  async function markAsComplete() {
    if (!selectedPlan || !studentId || selectedDay === null) return;

    if (!canValidateWorkoutDay(selectedDay)) {
      setMessage({
        type: "error",
        text: "O prazo para validar este treino já foi encerrado. Você pode visualizar o treino, mas não pode mais marcar como concluído.",
      });
      setShowWorkoutModal(false);
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    setCompleting(true); setMessage(null);
    try {
      const planDate = new Date(currentYear, currentMonth, selectedDay);
      const res = await fetch("/api/workout/mark-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutPlanId: selectedPlan.id,
          studentId,
          date: planDate.toISOString(),
        }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Treino concluido!" });
        fetchWorkouts(studentId);
        setShowWorkoutModal(false);
      } else {
        const data = await res.json().catch(() => null);
        setMessage({
          type: "error",
          text: data?.error || "Não foi possível validar este treino.",
        });
        setShowWorkoutModal(false);
      }
    } catch {}
    setCompleting(false);
    setTimeout(() => setMessage(null), 3000);
  }

  // Envia nova dúvida (fora do modal) ou follow-up (dentro do modal)
  async function handleSendQuestion(parentId?: string) {
    const text = parentId ? followUpText : newQuestion;
    if (!text.trim() || !studentId) return;

    if (parentId) setSendingFollowUp(true);
    else setSendingQuestion(true);

    try {
      const form = new FormData();
      form.append("content", text.trim());
      form.append("studentId", studentId);

      if (parentId) {
        form.append("parentId", parentId);
      } else {
        form.append("target", questionTarget);
      }
      const file = parentId ? followUpFile : questionFile;
      if (file) form.append("file", file);

      const res = await fetch("/api/aluno/questions", { method: "POST", body: form });
      if (res.ok) {
        if (parentId) {
          setFollowUpText("");
          setFollowUpFile(null);
          setSelectedQuestion(null);
        } else {
          setNewQuestion("");
          setQuestionFile(null);
        }
        setMessage({ type: "success", text: "Duvida enviada!" });
        await fetchQuestions(studentId);
      } else {
        setMessage({ type: "error", text: "Erro ao enviar" });
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

  function isDateInCurrentValidationWeek(date: Date): boolean {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);

    return normalized >= getStartOfCurrentWeek() && normalized < getStartOfNextWeek();
  }

  function getValidationDeadlineLabel(): string {
    const deadline = new Date(getStartOfNextWeek());
    deadline.setDate(deadline.getDate() - 1);

    return deadline.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
    });
  }

  function canValidateWorkoutDay(day: number | null): boolean {
    if (day === null) return false;

    const selectedDate = new Date(currentYear, currentMonth, day);
    selectedDate.setHours(0, 0, 0, 0);

    return isDateInCurrentValidationWeek(selectedDate);
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
    return planDate < getStartOfNextWeek();
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

    if (selectedDate >= getStartOfNextWeek()) {
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
    const selectedDate = new Date(currentYear, currentMonth, day);
    selectedDate.setHours(0, 0, 0, 0);

    setSelectedDay(day);
    setSelectedExercise(null);
    setSelectedPlan(null);

    if (selectedDate >= getStartOfNextWeek()) {
      return;
    }

    const plan = getPlanForDay(day);
    if (plan) {
      setSelectedPlan(plan);
      setShowWorkoutModal(true);
    }
  }
  function isToday(day: number) {
    const d = new Date();
    return day === d.getDate() && currentMonth === d.getMonth() && currentYear === d.getFullYear();
  }
  function isCompleted(day: number) {
    const selectedDate = new Date(currentYear, currentMonth, day);
    selectedDate.setHours(0, 0, 0, 0);

    if (selectedDate >= getStartOfNextWeek()) {
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
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const nomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const meses = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const unreadCount = notices.filter((n: any) => !n.readByStudent).length;
  const pendingCount = questions.filter((q: any) => getThreadStatus(q) === "new_reply").length;

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><p className="text-[#a1a1a1]">Carregando...</p></div>;
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold text-[#f5f5f5]">Ola, {studentName}!</h1>
        <p className="text-xs text-[#a1a1a1]">Bem-vindo a sua area do aluno</p>
      </div>
      {message && (
        <div className={"text-sm rounded-lg p-2.5 " + (message.type === "success" ? "bg-green-500/10 text-green-400" : message.type === "error" ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400")}>
          {message.text}
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
                  className="bg-[#1a1a1a] rounded-lg p-2 cursor-pointer hover:bg-[#222] transition flex items-start gap-2">
                  <div className={"w-2 h-2 rounded-full mt-1 shrink-0 " + (n.readByStudent ? "bg-[#525252]" : "bg-green-500")} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#e5e5e5] font-medium truncate">{n.title || n.type || "Aviso"}</p>
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
                  const isFutureHidden = dayDate >= getStartOfNextWeek();
                  return (
                    <button key={day} onClick={() => handleDayClick(day)}
                      className={"aspect-square rounded-sm flex flex-col items-center justify-center text-[7px] transition " + (isFutureHidden ? "cursor-default opacity-40 " : "cursor-pointer ") +
                        (sel ? "bg-[#D4A373]/20 border border-[#D4A373] text-[#D4A373]" :
                         hoje ? "border border-[#D4A373]/50 text-[#D4A373] font-bold" :
                         "text-[#a1a1a1] hover:bg-white/5")}>
                      <span>{day}</span>
                      <div className="flex gap-px mt-px">
                        {done && <div className="w-[2px] h-[2px] rounded-full bg-green-500" />}
                        {plan && !done && <div className="w-[2px] h-[2px] rounded-full bg-[#D4A373]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
              {plans.length === 0 && (
                <p className="text-[8px] text-[#D4A373] mt-1">Em breve...</p>
              )}

              <p className="text-[8px] text-[#6b6b6b] mt-1 leading-relaxed">
                Treinos de semanas anteriores ficam disponíveis para consulta, mas a validação só pode ser feita na semana vigente, até domingo.
              </p>
            </div>
            {/* SEÇÃO DE DÚVIDAS - LADO DIREITO */}
            <div className="sm:w-[45%] bg-[#111] border border-[#ffffff10] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-[#f5f5f5] text-xs">Duvidas</h2>
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
              <button onClick={() => handleSendQuestion()} disabled={sendingQuestion || !newQuestion.trim()}
                className="w-full bg-[#D4A373] text-[#0a0a0a] text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50">
                {sendingQuestion ? "..." : "Enviar"}
              </button>

              {/* Lista de threads */}
              {questions.length > 0 && (
                <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                  <p className="text-[9px] text-[#525252] mb-1">Suas duvidas:</p>
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
                            Para: {getQuestionTargetLabel(q)}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <p className="text-[8px] text-[#6b6b6b]">{getThreadTime(q)}</p>
                            <span className={"text-[8px] px-1 py-px rounded " + (
                              status === "resolved" ? "bg-[#525252]/20 text-[#6b6b6b]" :
                              status === "new_reply" ? "bg-green-500/10 text-green-400" : "bg-blue-500/10 text-blue-400"
                            )}>
                              {status === "resolved" ? "Resolvida" : status === "new_reply" ? "Nova resposta" : "Aguardando"}
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
                <h2 className="text-sm font-bold text-[#f5f5f5]">Duvida</h2>
                <p className="text-[9px] text-[#D4A373] mt-0.5">
                  Para: {getQuestionTargetLabel(selectedQuestion)}
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

                        {(msg.imageUrl || msg.videoUrl) && (
                          <div className="mt-1.5 flex gap-2">
                            {msg.imageUrl && (
                              <a href={msg.imageUrl} target="_blank" className="text-[9px] text-blue-400 hover:text-blue-300 underline flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                Ver imagem
                              </a>
                            )}

                            {msg.videoUrl && (
                              <a href={msg.videoUrl} target="_blank" className="text-[9px] text-blue-400 hover:text-blue-300 underline flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Ver video
                              </a>
                            )}
                          </div>
                        )}
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
                    disabled={sendingFollowUp || !followUpText.trim()}
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

      {/* MODAL DO AVISO */}
      {selectedNotice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setSelectedNotice(null)}>
          <div className="bg-[#111] border border-[#ffffff15] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#ffffff10]">
              <div>
                <h2 className="text-sm font-bold text-[#f5f5f5]">{selectedNotice.title || selectedNotice.type || "Aviso"}</h2>
                <p className="text-[10px] text-[#a1a1a1] mt-0.5">{new Date(selectedNotice.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <button onClick={() => setSelectedNotice(null)} className="text-[#a1a1a1] hover:text-white text-base w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition shrink-0">X</button>
            </div>
            <div className="p-4">
              <p className="text-sm text-[#e5e5e5] leading-relaxed whitespace-pre-line">{selectedNotice.content}</p>
              {selectedNotice.author && (
                <div className="mt-4 pt-3 border-t border-[#ffffff10]">
                  <p className="text-[10px] text-[#6b6b6b]">
                    Enviado por: <span className="text-[#a1a1a1]">{selectedNotice.author.name}</span>
                    {selectedNotice.author.role && (
                      <span className={"ml-1 px-1.5 py-0.5 rounded text-[9px] " + (selectedNotice.author.role === "GESTOR" ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-400")}>
                        {selectedNotice.author.role === "GESTOR" ? "Gestao" : "Professor"}
                      </span>
                    )}
                  </p>
                </div>
              )}
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
            <div className="p-3 space-y-1.5">
              {selectedPlan.exercises?.sort((a: any, b: any) => a.order - b.order).map((ex: any, idx: number) => (
                <div key={ex.id || idx}
                  onClick={() => { setSelectedExercise(ex); setImgError(false); }}
                  className="bg-[#1a1a1a] rounded-xl p-2.5 border border-[#ffffff08] cursor-pointer hover:border-[#D4A373]/40 transition active:scale-[0.98]">
                  <div className="flex items-start gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#D4A373]/20 text-[#D4A373] text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#f5f5f5]">{ex.name}</p>
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-[9px] text-[#a1a1a1]">
                        <span>{ex.series || '-'} series x {ex.reps || '-'} reps</span>
                        {ex.weight && <span>Carga: {ex.weight}kg</span>}
                        {ex.restTime && <span>Descanso: {ex.restTime}</span>}
                      </div>
                    </div>
                    <svg className="w-3.5 h-3.5 text-[#525252] shrink-0 mt-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
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
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2">
                    <p className="text-[10px] text-amber-300 leading-relaxed">
                      Este treino pertence a uma semana já encerrada. Ele continua disponível para consulta,
                      mas não pode mais ser validado para não distorcer sua avaliação de adesão.
                    </p>
                  </div>
                )}

                <button
                  onClick={markAsComplete}
                  disabled={completing || isCompleted(selectedDay) || !canValidateWorkoutDay(selectedDay)}
                  className={"w-full text-xs font-semibold py-2.5 rounded-lg transition " + (
                    isCompleted(selectedDay)
                      ? "bg-green-500/20 text-green-400 border border-green-500/30 cursor-default"
                      : !canValidateWorkoutDay(selectedDay)
                        ? "bg-[#2a2a2a] text-[#6b6b6b] border border-[#ffffff10] cursor-not-allowed"
                        : "bg-green-500 text-white hover:bg-green-600"
                  )}
                >
                  {completing
                    ? "..."
                    : isCompleted(selectedDay)
                      ? "Treino Concluido ✓"
                      : !canValidateWorkoutDay(selectedDay)
                        ? "Prazo encerrado"
                        : "Concluir Treino"}
                </button>
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
              const imgUrl = getImageUrl(selectedExercise.imageUrl) || getExerciseImageUrl(selectedExercise.name);
              return imgUrl && !imgError ? (
                <div className="w-full bg-[#1a1a1a] rounded-t-2xl overflow-hidden flex items-center justify-center" style={{ maxHeight: '280px' }}>
                  <img src={imgUrl} alt={selectedExercise.name} className="w-full h-auto max-h-[280px] object-contain" onError={() => setImgError(true)} />
                </div>
              ) : (
                <div className="w-full h-20 bg-gradient-to-br from-[#1a1a1a] to-[#222] rounded-t-2xl flex items-center justify-center gap-1">
                  <svg className="w-6 h-6 text-[#333]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-[9px] text-[#444]">Sem foto</p>
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
              {selectedExercise.description && (
                <div>
                  <h3 className="text-[10px] font-semibold text-[#D4A373] mb-1">Descricao</h3>
                  <div className="bg-[#1a1a1a] rounded-lg p-2.5 border border-[#ffffff08]">
                    <p className="text-xs text-[#e5e5e5] leading-relaxed whitespace-pre-line">{selectedExercise.description}</p>
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
            <div className="p-3 border-t border-[#ffffff10] flex gap-2">
              <button onClick={() => setSelectedExercise(null)} className="flex-1 bg-[#1a1a1a] text-[#a1a1a1] text-[11px] font-semibold py-2 rounded-lg hover:bg-[#222] transition border border-[#ffffff10]">Voltar</button>
              <button onClick={() => { setShowWorkoutModal(false); setSelectedExercise(null); }} className="flex-1 bg-[#D4A373] text-[#0a0a0a] text-[11px] font-semibold py-2 rounded-lg hover:bg-[#c4956a] transition">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

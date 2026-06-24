"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
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
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<any>(null);
  const [imgError, setImgError] = useState(false);

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

  useEffect(() => { fetchStudentInfo(); }, []);
  useEffect(() => {
    if (studentId) {
      fetchPlans(studentId); fetchWorkouts(studentId);
      fetchNotices(studentId); fetchQuestions(studentId);
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
        setPlans(Array.isArray(data) ? data : []);
      }
    } catch {}
  }
  async function fetchWorkouts(id: string) {
    try {
      const url = "/api/workout/mark-complete?studentId=" + id + "&month=" + (currentMonth + 1) + "&year=" + currentYear;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setWorkouts(Array.isArray(data) ? data : []);
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
  async function markAsComplete() {
    if (!selectedPlan || !studentId) return;
    setCompleting(true); setMessage(null);
    try {
      const res = await fetch("/api/workout/mark-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutPlanId: selectedPlan.id, studentId }),
      });
      if (res.ok) { setMessage({ type: "success", text: "Treino concluido!" }); fetchWorkouts(studentId); }
    } catch {}
    setCompleting(false);
    setTimeout(() => setMessage(null), 3000);
  }
  async function handleSendQuestion() {
    if (!newQuestion.trim() || !studentId) return;
    setSendingQuestion(true);
    try {
      const form = new FormData();
      form.append("content", newQuestion.trim());
      form.append("studentId", studentId);
      if (questionFile) form.append("file", questionFile);
      const res = await fetch("/api/aluno/questions", { method: "POST", body: form });
      if (res.ok) { setNewQuestion(""); setQuestionFile(null); setMessage({ type: "success", text: "Duvida enviada!" }); fetchQuestions(studentId); }
      else { setMessage({ type: "error", text: "Erro ao enviar" }); }
    } catch { setMessage({ type: "error", text: "Erro ao enviar" }); }
    setSendingQuestion(false);
    setTimeout(() => setMessage(null), 3000);
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
    const dateStr = currentYear + "-" + String(currentMonth + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    return plans.find((p: any) => {
      if (!p.date) return false;
      const planDate = new Date(p.date);
      const planStr = planDate.getUTCFullYear() + "-" + String(planDate.getUTCMonth() + 1).padStart(2, "0") + "-" + String(planDate.getUTCDate()).padStart(2, "0");
      return planStr === dateStr;
    }) || null;
  }
  function handleDayClick(day: number) {
    setSelectedDay(day);
    setSelectedExercise(null);
    const plan = getPlanForDay(day);
    setSelectedPlan(plan);
  }
  function isToday(day: number) {
    const d = new Date();
    return day === d.getDate() && currentMonth === d.getMonth() && currentYear === d.getFullYear();
  }
  function isCompleted(day: number) {
    if (!selectedPlan) return false;
    const ds = currentYear + "-" + String(currentMonth + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    return workouts.some((w: any) => {
      if (w.workoutPlanId !== selectedPlan.id) return false;
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
        <div className="lg:w-[30%] bg-[#111] border border-[#ffffff10] rounded-xl p-3">
          <h2 className="font-semibold text-[#f5f5f5] text-xs mb-2">Avisos e Feedbacks</h2>
          {notices.length === 0 ? (
            <p className="text-[#a1a1a1] text-[11px]">Nenhum aviso ou feedback no momento.</p>
          ) : (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {notices.map((n: any) => (
                <div key={n.id} className="bg-[#1a1a1a] rounded-lg p-2">
                  <p className="text-xs text-[#e5e5e5]">{n.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
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
                  return (
                    <button key={day} onClick={() => handleDayClick(day)}
                      className={"aspect-square rounded-sm flex flex-col items-center justify-center text-[7px] transition cursor-pointer " +
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
              {selectedPlan && selectedDay && (
                <div onClick={() => setShowWorkoutModal(true)} className="mt-1 pt-1 border-t border-[#ffffff10] cursor-pointer hover:bg-white/[0.02] rounded-lg transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[9px] text-[#f5f5f5] font-medium">{selectedPlan.name}</span>
                      <p className="text-[7px] text-[#525252]">
                        {getWeekDayName(selectedDay)} - {selectedDay}/{currentMonth + 1}
                      </p>
                    </div>
                    {isToday(selectedDay) && (
                      <button onClick={(e) => { e.stopPropagation(); markAsComplete(); }} disabled={completing}
                        className="bg-[#D4A373] text-[#0a0a0a] text-[7px] font-semibold px-1.5 py-0.5 rounded disabled:opacity-50">
                        {completing ? "..." : isCompleted(selectedDay) ? "OK" : "OK"}
                      </button>
                    )}
                  </div>
                  {selectedPlan.exercises?.sort((a: any, b: any) => a.order - b.order).slice(0, 3).map((ex: any, idx: number) => (
                    <div key={ex.id || idx} className="flex items-center gap-1 py-px">
                      <span className="w-3 h-3 rounded-full bg-[#D4A373]/20 text-[#D4A373] text-[6px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                      <span className="text-[8px] text-[#a1a1a1]">{ex.name}</span>
                      <span className="text-[7px] text-[#6b6b6b] ml-auto">{ex.series}x{ex.reps}</span>
                    </div>
                  ))}
                  {selectedPlan.exercises?.length > 3 && <p className="text-[6px] text-[#525252]">+{selectedPlan.exercises.length - 3} exercicios</p>}
                  {selectedPlan.notes && <p className="text-[7px] text-[#6b6b6b] mt-px">{selectedPlan.notes}</p>}
                </div>
              )}
              {(!selectedPlan || !selectedDay) && plans.length > 0 && (
                <p className="text-[8px] text-[#525252] mt-1">Clique em um dia para ver o treino</p>
              )}
              {plans.length === 0 && (
                <p className="text-[8px] text-[#D4A373] mt-1">Em breve...</p>
              )}
            </div>
            <div className="sm:w-[45%] bg-[#111] border border-[#ffffff10] rounded-xl p-3">
              <h2 className="font-semibold text-[#f5f5f5] text-xs mb-2">Duvidas</h2>
              <textarea value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Pergunte aqui..."
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373] resize-none h-14 mb-1.5" />
              <div className="flex items-center gap-1 mb-1.5">
                <span className="text-[9px] text-[#a1a1a1]"></span>
                <input type="file" accept="image/*,video/*" onChange={(e) => setQuestionFile(e.target.files?.[0] || null)}
                  className="text-[8px] text-[#a1a1a1] file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[8px] file:font-medium file:bg-[#D4A373] file:text-[#0a0a0a]" />
                {questionFile && <span className="text-[8px] text-[#D4A373]">1</span>}
              </div>
              <button onClick={handleSendQuestion} disabled={sendingQuestion || !newQuestion.trim()}
                className="w-full bg-[#D4A373] text-[#0a0a0a] text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50">
                {sendingQuestion ? "..." : "Enviar"}
              </button>
              {questions.length > 0 && (
                <div className="mt-1.5 space-y-1 max-h-16 overflow-y-auto">
                  {questions.slice(0, 2).map((q: any) => (
                    <div key={q.id} className="bg-[#1a1a1a] rounded p-1.5">
                      <p className="text-[9px] text-[#e5e5e5]">{q.content}</p>
                      {q.answer && <p className="text-[8px] text-[#D4A373] mt-px">R: {q.answer}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Modal do treino completo - MAIS COMPACTO */}
      {showWorkoutModal && selectedPlan && !selectedExercise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-[#ffffff15] rounded-2xl w-full max-w-lg max-h-[75vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-[#ffffff10] sticky top-0 bg-[#111] z-10">
              <div>
                <h2 className="text-sm font-bold text-[#f5f5f5]">{selectedPlan.name}</h2>
                <p className="text-[10px] text-[#a1a1a1]">
                  {getWeekDayName(selectedDay!)} - {selectedDay}/{currentMonth + 1}/{currentYear}
                </p>
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
            <div className="p-2.5 border-t border-[#ffffff10]">
              <p className="text-[8px] text-[#525252] text-center">Clique em um exercicio para ver detalhes</p>
            </div>
          </div>
        </div>
      )}
      {/* Modal de detalhe do exercicio - MAIS COMPACTO */}
      {selectedExercise && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-[#ffffff15] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl">
            {/* Foto com URL absoluta */}
            {getImageUrl(selectedExercise.imageUrl) && !imgError ? (
              <div className="w-full h-36 bg-[#1a1a1a] rounded-t-2xl overflow-hidden">
                <img src={getImageUrl(selectedExercise.imageUrl)}
                  alt={selectedExercise.name}
                  className="w-full h-full object-cover"
                  onError={() => setImgError(true)} />
              </div>
            ) : (
              <div className="w-full h-20 bg-gradient-to-br from-[#1a1a1a] to-[#222] rounded-t-2xl flex items-center justify-center gap-1">
                <svg className="w-6 h-6 text-[#333]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-[9px] text-[#444]">Sem foto</p>
              </div>
            )}
            <div className="flex items-center justify-between p-3 border-b border-[#ffffff10]">
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedExercise(null)}
                  className="text-[#a1a1a1] hover:text-white">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-base font-bold text-[#f5f5f5]">{selectedExercise.name}</h2>
              </div>
              <button onClick={() => setSelectedExercise(null)}
                className="text-[#a1a1a1] hover:text-white text-base w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition">X</button>
            </div>
            <div className="p-3 space-y-2.5">
              {/* Stats grid mais compacta */}
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
                    <p className="text-xs 

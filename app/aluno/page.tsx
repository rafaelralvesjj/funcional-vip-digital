"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

export default function AlunoPage() {
  const [studentId, setStudentId] = useState<string>("");
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
  const [studentName, setStudentName] = useState("Aluno");
  const [loading, setLoading] = useState(true);
  const [newQuestion, setNewQuestion] = useState("");
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [sendingQuestion, setSendingQuestion] = useState(false);

  useEffect(() => {
    fetchStudentInfo();
  }, []);

  useEffect(() => {
    if (studentId) {
      fetchPlans(studentId);
      fetchWorkouts(studentId);
      fetchNotices(studentId);
      fetchQuestions(studentId);
    }
  }, [studentId, currentMonth, currentYear]);

  async function fetchStudentInfo() {
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const session = await res.json();
        const id = session?.user?.id || session?.id || "";
        setStudentId(id);
        if (id) {
          const r2 = await fetch("/api/students");
          if (r2.ok) {
            const data = await r2.json();
            const list = Array.isArray(data) ? data : data.students || data || [];
            const found = list.find((s: any) => s.id === id);
            if (found) setStudentName(found.name);
          }
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
        if (Array.isArray(data) && data.length > 0) {
          setSelectedPlan(data[0]);
        }
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
    setCompleting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/workout/mark-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutPlanId: selectedPlan.id, studentId }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Treino concluido!" });
        fetchWorkouts(studentId);
      }
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

      const res = await fetch("/api/aluno/questions", {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        setNewQuestion("");
        setQuestionFile(null);
        setMessage({ type: "success", text: "Duvida enviada!" });
        fetchQuestions(studentId);
      } else {
        setMessage({ type: "error", text: "Erro ao enviar" });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao enviar" });
    }
    setSendingQuestion(false);
    setTimeout(() => setMessage(null), 3000);
  }

  function isToday(day: number) {
    const d = new Date();
    return day === d.getDate() && currentMonth === d.getMonth() && currentYear === d.getFullYear();
  }

  function isCompleted(day: number) {
    if (!selectedPlan) return false;
    const ds = currentYear + "-" + String(currentMonth + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    return workouts.some((w: any) => w.workoutPlanId === selectedPlan.id && w.date.startsWith(ds) && w.status === "CONCLUIDO");
  }

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const nomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const meses = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  if (loading) {
    return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><p className="text-[#a1a1a1]">Carregando...</p></div>;
  }

  return (
    <div>
      {message && (
        <div className={"mb-4 text-sm rounded-lg p-3 " + (message.type === "success" ? "bg-green-500/10 text-green-400" : message.type === "error" ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400")}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Coluna Esquerda - Avisos */}
        <div>
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-4">
            <h2 className="font-semibold text-[#f5f5f5] text-sm mb-3">📢 Avisos e Feedbacks</h2>
            {notices.length === 0 ? (
              <p className="text-[#a1a1a1] text-xs">Nenhum aviso ou feedback no momento.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {notices.map((n: any) => (
                  <div key={n.id} className="bg-[#1a1a1a] rounded-lg p-2.5">
                    <p className="text-xs text-[#e5e5e5]">{n.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Coluna Direita */}
        <div className="lg:col-span-2 space-y-4">
          {/* Calendario compacto */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-[#f5f5f5] text-sm">📅 Meus Treinos</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); } else { setCurrentMonth(currentMonth - 1); } }}
                  className="text-[#a1a1a1] hover:text-white px-1 text-xs">←</button>
                <span className="text-[#f5f5f5] text-xs font-medium">{meses[currentMonth]} {currentYear}</span>
                <button onClick={() => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); } else { setCurrentMonth(currentMonth + 1); } }}
                  className="text-[#a1a1a1] hover:text-white px-1 text-xs">→</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {nomes.map((d) => <div key={d} className="text-center text-[10px] text-[#525252] py-1">{d}</div>)}
              {Array.from({ length: firstDay }).map((_, i) => <div key={"e" + i} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const hoje = isToday(day);
                const sel = selectedDay === day;
                const done = isCompleted(day);
                return (
                  <button key={day} onClick={() => setSelectedDay(day)}
                    className={"aspect-square rounded flex flex-col items-center justify-center text-[11px] transition cursor-pointer " +
                      (sel ? "bg-[#D4A373]/20 border border-[#D4A373] text-[#D4A373]" :
                       hoje ? "border border-[#D4A373]/50 text-[#D4A373] font-bold" :
                       "text-[#a1a1a1] hover:bg-white/5")}>
                    <span>{day}</span>
                    {done && <div className="w-1 h-1 rounded-full bg-green-500 mt-0.5" />}
                    {hoje && !done && plans.length > 0 && <div className="w-1 h-1 rounded-full bg-[#D4A373] mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detalhe do Treino */}
          {plans.length > 0 && selectedPlan && (
            <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-[#f5f5f5] text-sm">{selectedPlan.name}</h3>
                  {selectedPlan.description && <p className="text-[#a1a1a1] text-xs">{selectedPlan.description}</p>}
                </div>
                {selectedDay !== null && isToday(selectedDay) && (
                  <button onClick={markAsComplete} disabled={completing}
                    className="bg-[#D4A373] text-[#0a0a0a] text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
                    {completing ? "..." : isCompleted(selectedDay) ? "✅" : "Concluir"}
                  </button>
                )}
              </div>
              {selectedPlan.exercises?.sort((a: any, b: any) => a.order - b.order).map((ex: any, idx: number) => (
                <div key={ex.id || idx} className="bg-[#1a1a1a] rounded-lg p-2.5 mb-1.5 last:mb-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#D4A373]/20 text-[#D4A373] text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                    <span className="text-[#f5f5f5] text-xs font-medium">{ex.name}</span>
                  </div>
                  <div className="text-[10px] text-[#a1a1a1] ml-7">{ex.series}x{ex.reps}{ex.weight ? " | " + ex.weight : ""}{ex.restTime ? " | Desc: " + ex.restTime : ""}</div>
                  {ex.notes && <p className="text-[10px] text-[#6b6b6b] ml-7 mt-0.5">{ex.notes}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Duvidas */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-4">
            <h2 className="font-semibold text-[#f5f5f5] text-sm mb-3">❓ Duvidas</h2>
            <textarea value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="Tem alguma duvida? Pergunte aqui..."
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2.5 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373] resize-none h-16 mb-2" />
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-[#a1a1a1]">📎 Anexar foto/video</span>
              <input type="file" accept="image/*,video/*" onChange={(e) => setQuestionFile(e.target.files?.[0] || null)}
                className="text-[10px] text-[#a1a1a1] file:mr-1 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[10px] file:font-medium file:bg-[#D4A373] file:text-[#0a0a0a]" />
              {questionFile && <span className="text-[10px] text-[#D4A373]">1 arquivo</span>}
            </div>
            <button onClick={handleSendQuestion} disabled={sendingQuestion || !newQuestion.trim()}
              className="w-full bg-[#D4A373] text-[#0a0a0a] text-sm font-semibold py-2 rounded-lg disabled:opacity-50">
              {sendingQuestion ? "Enviando..." : "Enviar duvida"}
            </button>
            {questions.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] text-[#525252] font-medium">Suas duvidas:</p>
                {questions.map((q: any) => (
                  <div key={q.id} className="bg-[#1a1a1a] rounded-lg p-2.5">
                    <p className="text-xs text-[#e5e5e5]">{q.content}</p>
                    {q.answer && (
                      <div className="mt-1.5 pt-1.5 border-t border-[#ffffff10]">
                        <p className="text-[10px] text-[#D4A373] font-medium">Resposta:</p>
                        <p className="text-xs text-[#a1a1a1] mt-0.5">{q.answer}</p>
                        {q.answeredBy?.name && <p className="text-[10px] text-[#525252] mt-0.5">— {q.answeredBy.name}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

export default function AlunoPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState<string>("");
  const [plans, setPlans] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [completing, setCompleting] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [studentName, setStudentName] = useState("Aluno");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudentInfo();
  }, []);

  useEffect(() => {
    if (studentId) {
      fetchPlans(studentId);
      fetchWorkouts(studentId);
      fetchNotices(studentId);
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

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="border-b border-[#ffffff10] bg-[#111111] px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#D4A373] flex items-center justify-center text-[#0a0a0a] font-bold text-sm">F</div>
          <span className="text-[#D4A373] font-bold">Funcional Vip Digital</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[#a1a1a1] text-sm">{studentName}</span>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="text-xs text-[#525252] hover:text-red-400 transition">Sair</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-[#f5f5f5] mb-1">Ola, {studentName}!</h1>
        <p className="text-[#a1a1a1] text-sm mb-6">Bem-vindo a sua area do aluno</p>

        {message && (
          <div className={"mb-4 text-sm rounded-lg p-3 " + (message.type === "success" ? "bg-green-500/10 text-green-400" : "bg-blue-500/10 text-blue-400")}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda - Avisos */}
          <div className="space-y-6">
            <div className="bg-[#111] border border-[#ffffff10] rounded-xl p-5">
              <h2 className="font-semibold text-[#f5f5f5] mb-4">📢 Avisos e Feedbacks</h2>
              {notices.length === 0 ? (
                <p className="text-[#a1a1a1] text-sm">Nenhum aviso ou feedback no momento.</p>
              ) : (
                <div className="space-y-3">
                  {notices.map((n: any) => (
                    <div key={n.id} className="bg-[#1a1a1a] rounded-lg p-3">
                      <p className="text-sm text-[#e5e5e5]">{n.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Coluna Direita - Treinos + Duvidas */}
          <div className="lg:col-span-2 space-y-6">
            {/* Calendario */}
            <div className="bg-[#111] border border-[#ffffff10] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-[#f5f5f5]">📅 Meus Treinos</h2>
                <div className="flex items-center gap-3">
                  <button onClick={() => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); } else { setCurrentMonth(currentMonth - 1); } }}
                    className="text-[#a1a1a1] hover:text-white px-2">←</button>
                  <span className="text-[#f5f5f5] text-sm">{meses[currentMonth]} {currentYear}</span>
                  <button onClick={() => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); } else { setCurrentMonth(currentMonth + 1); } }}
                    className="text-[#a1a1a1] hover:text-white px-2">→</button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {nomes.map((d) => <div key={d} className="text-center text-xs text-[#525252] py-2">{d}</div>)}
                {Array.from({ length: firstDay }).map((_, i) => <div key={"e" + i} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const hoje = isToday(day);
                  const sel = selectedDay === day;
                  const done = isCompleted(day);
                  return (
                    <button key={day} onClick={() => setSelectedDay(day)}
                      className={"aspect-square rounded-lg border flex flex-col items-center justify-center text-sm transition cursor-pointer " + 
                        (sel ? "bg-[#D4A373]/20 border-[#D4A373] text-[#D4A373]" : 
                         hoje ? "border-[#D4A373]/50 text-[#D4A373] font-bold" : 
                         "border-transparent text-[#a1a1a1] hover:bg-white/5")}>
                      <span>{day}</span>
                      {done && <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-0.5" />}
                      {hoje && !done && plans.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-[#D4A373] mt-0.5" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[#ffffff10] text-xs text-[#525252]">
                <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 mr-1" /> Completo</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#D4A373] mr-1" /> Hoje</span>
              </div>
            </div>

            {/* Detalhe do Treino */}
            {plans.length > 0 && selectedPlan ? (
              <div className="bg-[#111] border border-[#ffffff10] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[#f5f5f5]">{selectedPlan.name}</h3>
                    {selectedPlan.description && <p className="text-[#a1a1a1] text-sm">{selectedPlan.description}</p>}
                  </div>
                  {selectedDay !== null && isToday(selectedDay) && (
                    <button onClick={markAsComplete} disabled={completing}
                      className="bg-[#D4A373] text-[#0a0a0a] text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#c49463] disabled:opacity-50">
                      {completing ? "⏳" : isCompleted(selectedDay) ? "✅ Concluido" : "✅ Marcar como feito"}
                    </button>
                  )}
                </div>
                {selectedPlan.exercises?.sort((a: any, b: any) => a.order - b.order).map((ex: any, idx: number) => (
                  <div key={ex.id || idx} className="bg-[#1a1a1a] rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-6 h-6 rounded-full bg-[#D4A373]/20 text-[#D4A373] text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                      <span className="text-[#f5f5f5] font-medium text-sm">{ex.name}</span>
                    </div>
                    <div className="text-xs text-[#a1a1a1] ml-8">{ex.series}x{ex.reps}{ex.weight ? " | " + ex.weight : ""}{ex.restTime ? " | Desc: " + ex.restTime : ""}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Duvidas */}
            <div className="bg-[#111] border border-[#ffffff10] rounded-xl p-5">
              <h2 className="font-semibold text-[#f5f5f5] mb-4">❓ Duvidas</h2>
              <p className="text-[#a1a1a1] text-sm">Tem alguma duvida? Pergunte aqui...</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

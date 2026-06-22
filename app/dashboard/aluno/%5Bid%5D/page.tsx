"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { signOut } from "next-auth/react";

interface Exercise {
  id: string;
  name: string;
  description: string;
  series: number;
  reps: string;
  weight: string;
  restTime: string;
  notes: string;
  order: number;
  imageUrl?: string;
  videoUrl?: string;
}

interface WorkoutPlan {
  id: string;
  name: string;
  description: string;
  weekDay: string;
  notes: string;
  createdAt: string;
  exercises: Exercise[];
}

interface Workout {
  id: string;
  workoutPlanId: string;
  date: string;
  status: string;
}

interface Notice {
  id: string;
  title: string;
  content: string;
  type: string;
  createdAt: string;
  author: { name: string };
}

interface StudentInfo {
  id: string;
  name: string;
}

const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const meses = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export default function AlunoDashboardPage() {
  const params = useParams();
  const studentId = params.id as string;

  const [student, setStudent] = useState<<StudentInfo | null>(null);
  const [plans, setPlans] = useState<<WorkoutPlan[]>([]);
  const [workouts, setWorkouts] = useState<<Workout[]>([]);
  const [notices, setNotices] = useState<<Notice[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<<WorkoutPlan | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [showExerciseImage, setShowExerciseImage] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => {
    if (studentId) {
      fetchStudent();
      fetchPlans();
      fetchWorkouts();
      fetchNotices();
    }
  }, [studentId, currentMonth, currentYear]);

  async function fetchStudent() {
    try {
      const res = await fetch(`/api/students`);
      if (res.ok) {
        const data = await res.json();
        const students = Array.isArray(data) ? data : data.students || data || [];
        const found = students.find((s: any) => s.id === studentId);
        if (found) setStudent(found);
      }
    } catch {}
  }

  async function fetchPlans() {
    try {
      const res = await fetch(`/api/workout-plan?studentId=${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setPlans(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) {
          setSelectedPlan(data[0]);
        }
      }
    } catch {}
  }

  async function fetchWorkouts() {
    try {
      const res = await fetch(
        `/api/workout/mark-complete?studentId=${studentId}&month=${currentMonth + 1}&year=${currentYear}`
      );
      if (res.ok) {
        const data = await res.json();
        setWorkouts(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function fetchNotices() {
    try {
      const res = await fetch(`/api/notices/student/${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setNotices(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function markAsComplete(planId: string) {
    setCompleting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/workout/mark-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutPlanId: planId, studentId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.alreadyDone) {
          setMessage({ type: "info", text: "Você já concluiu este treino hoje!" });
        } else {
          setMessage({ type: "success", text: data.message || "Treino concluído! 🎉" });
          fetchWorkouts();
        }
      } else {
        setMessage({ type: "error", text: "Erro ao marcar treino" });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao marcar treino" });
    } finally {
      setCompleting(false);
      setTimeout(() => setMessage(null), 4000);
    }
  }

  function getDaysInMonth(month: number, year: number) {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfMonth(month: number, year: number) {
    return new Date(year, month, 1).getDay();
  }

  function isPlanCompletedOnDate(planId: string, day: number) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return workouts.some(
      (w) => w.workoutPlanId === planId && w.date.startsWith(dateStr) && w.status === "CONCLUIDO"
    );
  }

  function isToday(day: number) {
    const today = new Date();
    return day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
  }

  function hasPlanOnDay(day: number) {
    return plans.length > 0;
  }

  function handleDayClick(day: number) {
    setSelectedDay(day);
    setMessage(null);
  }

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
  const today = new Date();

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="border-b border-[#ffffff10] bg-[#111111]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#D4A373] flex items-center justify-center text-[#0a0a0a] font-bold text-sm">F</div>
            <span className="text-[#D4A373] font-bold">Funcional Vip Digital</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[#a1a1a1] text-sm">{student?.name || "Aluno"}</span>
            <button onClick={() => signOut({ callbackUrl: "/" })}
              className="text-xs text-[#525252] hover:text-red-400 transition">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#f5f5f5]">Olá, {student?.name || "Aluno"}! 👋</h1>
          <p className="text-[#a1a1a1] text-sm mt-1">Bem-vindo à sua área do aluno</p>
        </div>

        {message && (
          <div className={`mb-6 text-sm rounded-lg p-4 border ${
            message.type === "success" 
              ? "bg-green-500/10 border-green-500/20 text-green-400"
              : message.type === "info"
              ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
              : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda: Avisos e Progresso */}
          <div className="space-y-6">
            <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">📢</span>
                <h2 className="font-semibold text-[#f5f5f5]">Avisos e Feedbacks</h2>
              </div>
              
              {notices.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-[#a1a1a1] text-sm">Nenhum aviso ou feedback no momento.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {notices.map((notice) => (
                    <div key={notice.id} className="bg-[#1a1a1a] rounded-lg p-3 border border-[#ffffff10]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[#D4A373] font-medium">
                          {notice.type === "ALERTA" ? "⚠️ Alerta" : "📢 Aviso"}
                        </span>
                        <span className="text-xs text-[#525252]">
                          {new Date(notice.createdAt).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-sm text-[#e5e5e5]">{notice.content}</p>
                      {notice.author?.name && (
                        <p className="text-xs text-[#525252] mt-1">— {notice.author.name}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🔥</span>
                <h2 className="font-semibold text-[#f5f5f5]">Progresso do Mês</h2>
              </div>
              <div className="text-center py-4">
                {plans.length > 0 ? (
                  <>
                    <div className="text-4xl font-bold text-[#D4A373] mb-1">
                      {workouts.filter(w => w.status === "CONCLUIDO").length}
                    </div>
                    <p className="text-[#a1a1a1] text-xs">
                      treinos concluídos este mês
                    </p>
                    <div className="mt-4 bg-[#1a1a1a] rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-[#D4A373] h-full rounded-full transition-all duration-500"
                        style={{ 
                          width: `${plans.length > 0 ? Math.min(100, (workouts.filter(w => w.status === "CONCLUIDO").length / Math.max(plans.length, 1)) * 100) : 0}%` 
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-[#525252] text-sm">Nenhum treino este mês ainda</p>
                )}
              </div>
            </div>
          </div>

          {/* Coluna Direita: Calendário e Treinos */}
          <div className="lg:col-span-2 space-y-6">
            {/* CALENDÁRIO */}
            <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📅</span>
                  <h2 className="font-semibold text-[#f5f5f5]">Meus Treinos</h2>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => {
                    if (currentMonth === 0) {
                      setCurrentMonth(11);
                      setCurrentYear(currentYear - 1);
                    } else {
                      setCurrentMonth(currentMonth - 1);
                    }
                  }}
                    className="text-[#a1a1a1] hover:text-[#f5f5f5] transition text-sm px-2 py-1">
                    ←
                  </button>
                  <span className="text-[#f5f5f5] text-sm font-medium">
                    {meses[currentMonth]} {currentYear}
                  </span>
                  <button onClick={() => {
                    if (currentMonth === 11) {
                      setCurrentMonth(0);
                      setCurrentYear(currentYear + 1);
                    } else {
                      setCurrentMonth(currentMonth + 1);
                    }
                  }}
                    className="text-[#a1a1a1] hover:text-[#f5f5f5] transition text-sm px-2 py-1">
                    →
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {diasSemana.map((dia) => (
                  <div key={dia} className="text-center text-xs text-[#525252] font-medium py-2">{dia}</div>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const hasWorkout = hasPlanOnDay(day);
                  const isSelected = selectedDay === day;
                  const isHoje = isToday(day);
                  const allCompleted = plans.length > 0 && plans.every(p => isPlanCompletedOnDate(p.id, day));
                  const someCompleted = plans.length > 0 && plans.some(p => isPlanCompletedOnDate(p.id, day));

                  let bgColor = "";
                  if (isSelected) bgColor = "bg-[#D4A373]/20 border-[#D4A373]";
                  else if (isHoje) bgColor = "border-[#D4A373]/50";
                  else bgColor = "border-transparent";

                  let dotColor = "";
                  if (allCompleted) dotColor = "bg-green-500";
                  else if (someCompleted) dotColor = "bg-yellow-500";
                  else if (!isHoje && hasWorkout && day < today.getDate()) dotColor = "bg-red-500";
                  else if (isHoje && hasWorkout) dotColor = "bg-[#D4A373]";

                  return (
                    <button
                      key={day}
                      onClick={() => handleDayClick(day)}
                      disabled={!hasWorkout && !isHoje}
                      className={`aspect-square rounded-lg border ${bgColor} flex flex-col items-center justify-center relative transition
                        ${hasWorkout || isHoje ? "hover:bg-white/5 cursor-pointer" : "opacity-30 cursor-default"}
                        ${!hasWorkout && !isHoje ? "text-[#2a2a2a]" : "text-[#a1a1a1]"}
                      `}
                    >
                      <span className={`text-sm ${isHoje ? "text-[#D4A373] font-bold" : ""} ${isSelected ? "text-[#D4A373]" : ""}`}>
                        {day}
                      </span>
                      {dotColor && (
                        <div className={`w-1.5 h-1.5 rounded-full ${dotColor} mt-0.5`} />
                      )}
                      {isHoje && !dotColor && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#D4A373]/30 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[#ffffff10]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-xs text-[#525252]">Completo</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                  <span className="text-xs text-[#525252]">Parcial</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-xs text-[#525252]">Não feito</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#D4A373]" />
                  <span className="text-xs text-[#525252]">Hoje</span>
                </div>
              </div>
            </div>

            {/* Detalhe do Treino */}
            {plans.length > 0 && selectedPlan && (
              <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[#f5f5f5]">{selectedPlan.name}</h3>
                    {selectedPlan.description && (
                      <p className="text-sm text-[#a1a1a1] mt-0.5">{selectedPlan.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedDay !== null && isToday(selectedDay!) && (
                      <button
                        onClick={() => markAsComplete(selectedPlan.id)}
                        disabled={completing || isPlanCompletedOnDate(selectedPlan.id, selectedDay!)}
                        className={`text-sm font-medium px-4 py-2 rounded-lg transition ${
                          isPlanCompletedOnDate(selectedPlan.id, selectedDay!)
                            ? "bg-green-500/10 text-green-400 cursor-default"
                            : "bg-[#D4A373] text-[#0a0a0a] hover:bg-[#c49463]"
                        }`}
                      >
                        {completing ? "⏳" : isPlanCompletedOnDate(selectedPlan.id, selectedDay!) ? "✅ Concluído" : "✅ Marcar como feito"}
                      </button>
                    )}
                    {selectedDay !== null && !isToday(selectedDay!) && isPlanCompletedOnDate(selectedPlan.id, selectedDay!) && (
                      <span className="text-sm text-green-400 font-medium bg-green-500/10 px-3 py-1.5 rounded-lg">
                        ✅ Concluído
                      </span>
                    )}
                    {selectedDay !== null && !isToday(selectedDay!) && !isPlanCompletedOnDate(selectedPlan.id, selectedDay!) && (
                      <span className="text-sm text-red-400 font-medium bg-red-500/10 px-3 py-1.5 rounded-lg">
                        ❌ Não concluído
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedPlan.exercises
                    .sort((a, b) => a.order - b.order)
                    .map((exercise, index) => (
                      <div key={exercise.id || index}
                        className="bg-[#1a1a1a] border border-[#ffffff10] rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-[#D4A373]/20 text-[#D4A373] text-xs font-bold flex items-center justify-center">
                                {index + 1}
                              </span>
                              <h4 className="text-[#f5f5f5] font-medium">{exercise.name}</h4>
                            </div>

                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div className="bg-[#0a0a0a] rounded-lg p-2 text-center">
                                <p className="text-[#D4A373] text-xs font-medium">Séries</p>
                                <p className="text-[#f5f5f5] text-sm font-bold">{exercise.series}</p>
                              </div>
                              <div className="bg-[#0a0a0a] rounded-lg p-2 text-center">
                                <p className="text-[#D4A373] text-xs font-medium">Repetições</p>
                                <p className="text-[#f5f5f5] text-sm font-bold">{exercise.reps}</p>
                              </div>
                              {exercise.weight && (
                                <div className="bg-[#0a0a0a] rounded-lg p-2 text-center">
                                  <p className="text-[#D4A373] text-xs font-medium">Carga</p>
                                  <p className="text-[#f5f5f5] text-sm font-bold">{exercise.weight}</p>
                                </div>
                              )}
                              {exercise.restTime && (
                                <div className="bg-[#0a0a0a] rounded-lg p-2 text-center">
                                  <p className="text-[#D4A373] text-xs font-medium">Descanso</p>
                                  <p className="text-[#f5f5f5] text-sm font-bold">{exercise.restTime}</p>
                                </div>
                              )}
                            </div>

                            {exercise.notes && (
                              <p className="text-xs text-[#6b6b6b] mt-2">📝 {exercise.notes}</p>
                            )}
                          </div>

                          <button
                            onClick={() => setShowExerciseImage(exercise.imageUrl || exercise.name)}
                            className="ml-3 text-sm text-[#D4A373] hover:text-[#c49463] transition flex items-center gap-1 shrink-0"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                              <circle cx="8.5" cy="8.5" r="1.5"/>
                              <polyline points="21 15 16 10 5 21"/>
                            </svg>
                            <span className="text-xs">Ver imagem</span>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {plans.length === 0 && (
              <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">🏋️</div>
                <h3 className="text-lg font-semibold text-[#f5f5f5] mb-2">Nenhum treino ainda</h3>
                <p className="text-[#a1a1a1] text-sm">
                  Seu professor ainda não montou seus treinos personalizados.
                </p>
                <p className="text-[#525252] text-xs mt-2">
                  Assim que ele enviar, você verá aqui no calendário!
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {showExerciseImage && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setShowExerciseImage(null)}
        >
          <div className="max-w-lg w-full bg-[#111111] rounded-2xl overflow-hidden border border-[#ffffff10]">
            <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between">
              <h3 className="text-[#f5f5f5] font-medium text-sm">{showExerciseImage}</h3>
              <button onClick={() => setShowExerciseImage(null)}
                className="text-[#a1a1a1] hover:text-[#f5f5f5] transition text-lg">
                ✕
              </button>
            </div>
            <div className="p-6 text-center">
              <div className="text-6xl mb-4">🏋️</div>
              <p className="text-[#a1a1a1] text-sm mb-4">
                O professor disponibilizará a foto do exercício em breve.
              </p>
              <p className="text-[#525252] text-xs">
                Exercício: <span className="text-[#D4A373]">{showExerciseImage}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";


interface Student {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  active: boolean;
  createdAt: string;
}

interface WorkoutPlan {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  date?: string;
  createdAt: string;
  exercises: Exercise[];
}

interface Exercise {
  id: string;
  name: string;
  series?: number;
  reps?: string;
  weight?: string;
  restTime?: string;
  notes?: string;
  order: number;
}

interface Notice {
  id: string;
  title?: string;
  content: string;
  type: string;
  expiresAt?: string;
  createdAt: string;
  author?: { name: string };
}

interface Avaliacao {
  id: string;
  tipo: string;
  mesReferencia: number;
  objetivo: string;
  peso?: number;
  altura?: number;
  createdAt: string;
}

export default function PerfilAlunoPage() {
  const params = useParams();
  const studentId = params.id as string;

  const [student, setStudent] = useState<Student | null>(null);
  const [workoutPlans, setWorkoutPlans] = useState<WorkoutPlan[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"treinos" | "avisos" | "avaliacoes">("treinos");

  // Estados para editar treino
  const [editingWorkout, setEditingWorkout] = useState<string | null>(null);
  const [editWorkoutName, setEditWorkoutName] = useState("");
  const [editWorkoutDesc, setEditWorkoutDesc] = useState("");

  // Estados para editar aviso
  const [editingNotice, setEditingNotice] = useState<string | null>(null);
  const [editNoticeTitle, setEditNoticeTitle] = useState("");
  const [editNoticeContent, setEditNoticeContent] = useState("");

  useEffect(() => {
    if (studentId) {
      fetchStudent();
      fetchWorkoutPlans();
      fetchNotices();
      fetchAvaliacoes();
    }
  }, [studentId]);

  async function fetchStudent() {
    try {
      const res = await fetch(`/api/student/${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setStudent(data);
      }
    } catch {}
    setLoading(false);
  }

  async function fetchWorkoutPlans() {
    try {
      const res = await fetch(`/api/workout-plan?studentId=${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setWorkoutPlans(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function fetchNotices() {
    try {
      const res = await fetch(`/api/notices?studentId=${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setNotices(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function fetchAvaliacoes() {
    try {
      const res = await fetch(`/api/avaliacao?alunoId=${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setAvaliacoes(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function handleDeleteWorkout(workoutId: string) {
    if (!confirm("Tem certeza que deseja excluir este treino?")) return;
    try {
      const res = await fetch(`/api/workout-plan?id=${workoutId}`, { method: "DELETE" });
      if (res.ok) {
        fetchWorkoutPlans();
      }
    } catch {}
  }

  async function handleEditWorkout(workoutId: string) {
    try {
      const res = await fetch(`/api/workout-plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: workoutId,
          name: editWorkoutName,
          description: editWorkoutDesc,
        }),
      });
      if (res.ok) {
        setEditingWorkout(null);
        fetchWorkoutPlans();
      }
    } catch {}
  }

  async function handleDeleteNotice(noticeId: string) {
    if (!confirm("Tem certeza que deseja excluir este aviso?")) return;
    try {
      const res = await fetch(`/api/notices?id=${noticeId}`, { method: "DELETE" });
      if (res.ok) {
        fetchNotices();
      }
    } catch {}
  }

  async function handleEditNotice(noticeId: string) {
    try {
      const res = await fetch(`/api/notices`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: noticeId,
          title: editNoticeTitle,
          content: editNoticeContent,
        }),
      });
      if (res.ok) {
        setEditingNotice(null);
        fetchNotices();
      }
    } catch {}
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-6 flex items-center justify-center">
        <p className="text-[#6b6b6b]">Carregando...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-6 flex items-center justify-center">
        <p className="text-[#6b6b6b]">Aluno não encontrado</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header do Aluno */}
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#D4A373]/20 flex items-center justify-center text-2xl font-bold text-[#D4A373]">
              {student.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#f5f5f5]">{student.name}</h1>
              <p className="text-sm text-[#6b6b6b]">
                {student.email && `${student.email}  |  `}
                {student.phone && `${student.phone}  |  `}
                Aluno desde {formatDate(student.createdAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-2 border-b border-[#ffffff10] pb-2">
          {(["treinos", "avisos", "avaliacoes"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab
                  ? "bg-[#D4A373] text-[#0a0a0a]"
                  : "text-[#a1a1a1] hover:text-[#f5f5f5] hover:bg-[#ffffff10]"
              }`}
            >
              {tab === "treinos" && `Treinos (${workoutPlans.length})`}
              {tab === "avisos" && `Avisos (${notices.length})`}
              {tab === "avaliacoes" && `Avaliações (${avaliacoes.length})`}
            </button>
          ))}
        </div>

        {/* Conteúdo das Abas */}
        {activeTab === "treinos" && (
          <div className="space-y-3">
            {workoutPlans.length === 0 ? (
              <p className="text-[#525252] text-sm text-center py-8">Nenhum treino enviado para este aluno.</p>
            ) : (
              workoutPlans.map((plan) => (
                <div key={plan.id} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
                  {editingWorkout === plan.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editWorkoutName}
                        onChange={(e) => setEditWorkoutName(e.target.value)}
                        className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                        placeholder="Nome do treino"
                      />
                      <textarea
                        value={editWorkoutDesc}
                        onChange={(e) => setEditWorkoutDesc(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373] resize-none"
                        placeholder="Descrição"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditWorkout(plan.id)}
                          className="bg-[#D4A373] text-[#0a0a0a] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#b88a5e]"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditingWorkout(null)}
                          className="text-[#a1a1a1] px-4 py-2 rounded-lg text-sm hover:bg-[#ffffff10]"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-[#f5f5f5]">{plan.name}</h3>
                          {plan.description && (
                            <p className="text-sm text-[#a1a1a1] mt-1">{plan.description}</p>
                          )}
                          <p className="text-[11px] text-[#6b6b6b] mt-2">
                            {formatDate(plan.createdAt)} {plan.date && `| Data: ${formatDate(plan.date)}`}
                          </p>
                          {plan.exercises.length > 0 && (
                            <div className="mt-3 space-y-1">
                              <p className="text-[11px] text-[#D4A373] font-medium">Exercícios:</p>
                              {plan.exercises.map((ex) => (
                                <p key={ex.id} className="text-xs text-[#a1a1a1]">
                                  {ex.name} {ex.series && `- ${ex.series}x`} {ex.reps && `${ex.reps}`}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingWorkout(plan.id);
                              setEditWorkoutName(plan.name);
                              setEditWorkoutDesc(plan.description || "");
                            }}
                            className="text-[#D4A373] hover:text-[#b88a5e] text-xs px-2 py-1 rounded transition"
                            title="Editar treino"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteWorkout(plan.id)}
                            className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded transition"
                            title="Excluir treino"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "avisos" && (
          <div className="space-y-3">
            {notices.length === 0 ? (
              <p className="text-[#525252] text-sm text-center py-8">Nenhum aviso enviado para este aluno.</p>
            ) : (
              notices.map((notice) => (
                <div key={notice.id} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
                  {editingNotice === notice.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editNoticeTitle}
                        onChange={(e) => setEditNoticeTitle(e.target.value)}
                        className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                        placeholder="Título do aviso"
                      />
                      <textarea
                        value={editNoticeContent}
                        onChange={(e) => setEditNoticeContent(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373] resize-none"
                        placeholder="Conteúdo do aviso"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditNotice(notice.id)}
                          className="bg-[#D4A373] text-[#0a0a0a] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#b88a5e]"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditingNotice(null)}
                          className="text-[#a1a1a1] px-4 py-2 rounded-lg text-sm hover:bg-[#ffffff10]"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          {notice.title && (
                            <h3 className="text-sm font-semibold text-[#f5f5f5] mb-1">{notice.title}</h3>
                          )}
                          <p className="text-sm text-[#e5e5e5]">{notice.content}</p>
                          <p className="text-[11px] text-[#6b6b6b] mt-2">{formatDate(notice.createdAt)}</p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingNotice(notice.id);
                              setEditNoticeTitle(notice.title || "");
                              setEditNoticeContent(notice.content);
                            }}
                            className="text-[#D4A373] hover:text-[#b88a5e] text-xs px-2 py-1 rounded transition"
                            title="Editar aviso"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteNotice(notice.id)}
                            className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded transition"
                            title="Excluir aviso"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "avaliacoes" && (
          <div className="space-y-3">
            {avaliacoes.length === 0 ? (
              <p className="text-[#525252] text-sm text-center py-8">Nenhuma avaliação registrada para este aluno.</p>
            ) : (
              avaliacoes.map((av) => (
                <div key={av.id} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-[#f5f5f5]">
                        {av.tipo} - Mês {av.mesReferencia}
                      </h3>
                      <p className="text-sm text-[#a1a1a1] mt-1">{av.objetivo}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-[#6b6b6b]">
                        {av.peso && <span>Peso: {av.peso}kg</span>}
                        {av.altura && <span>Altura: {av.altura}m</span>}
                        <span>{formatDate(av.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

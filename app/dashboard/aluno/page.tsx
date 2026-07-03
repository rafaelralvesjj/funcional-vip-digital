"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type TabKey = "avisos" | "treinos" | "duvidas";

interface Student {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  image?: string | null;
  user?: {
    id?: string;
    name?: string | null;
  } | null;
}

interface NoticeItem {
  id: string;
  title?: string | null;
  content?: string | null;
  type?: string | null;
  createdAt?: string | null;
  readByStudent?: boolean;
  author?: {
    name?: string | null;
    role?: string | null;
  } | null;
}

interface WorkoutPlan {
  id: string;
  name?: string | null;
  description?: string | null;
  date?: string | null;
  createdAt?: string | null;
  notes?: string | null;
  exercises?: Array<{
    id?: string;
    name?: string | null;
    series?: number | null;
    reps?: string | null;
    weight?: string | null;
    restTime?: string | null;
    notes?: string | null;
    order?: number | null;
  }>;
}

interface QuestionItem {
  id: string;
  content?: string | null;
  answer?: string | null;
  senderRole?: string | null;
  createdAt?: string | null;
  answeredAt?: string | null;
  resolvedAt?: string | null;
  children?: QuestionItem[];
  answeredBy?: {
    name?: string | null;
    role?: string | null;
  } | null;
  student?: {
    name?: string | null;
  } | null;
  teacher?: {
    name?: string | null;
  } | null;
}

function normalizeArray<T = any>(data: any, keys: string[] = []): T[] {
  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  return [];
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name?: string | null) {
  return (name || "?").charAt(0).toUpperCase();
}

function tabClass(active: boolean) {
  return (
    "rounded-lg px-4 py-2 text-sm font-medium transition " +
    (active
      ? "bg-[#D4A373] text-[#0a0a0a]"
      : "bg-[#111111] text-[#a1a1a1] border border-[#ffffff10] hover:text-[#f5f5f5] hover:border-[#D4A373]/40")
  );
}

export default function AlunoDetalhePage() {
  const [studentId, setStudentId] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutPlan[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("avisos");
  const [loading, setLoading] = useState(true);
  const [questionLoadError, setQuestionLoadError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id =
      params.get("studentId") ||
      params.get("id") ||
      params.get("alunoId") ||
      "";

    setStudentId(id);
  }, []);

  useEffect(() => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    loadStudentData(studentId);
  }, [studentId]);

  async function loadStudentData(id: string) {
    setLoading(true);
    setQuestionLoadError(false);

    try {
      const [studentsResult, noticesResult, workoutsResult, questionsResult] =
        await Promise.allSettled([
          fetch("/api/students", { cache: "no-store" }),
          fetch(`/api/notices/student/${id}`, { cache: "no-store" }),
          fetch(`/api/workout-plan?studentId=${id}`, { cache: "no-store" }),
          fetch(`/api/questions?studentId=${id}`, { cache: "no-store" }),
        ]);

      if (studentsResult.status === "fulfilled" && studentsResult.value.ok) {
        const data = await studentsResult.value.json();
        const students = normalizeArray<Student>(data, ["students", "data", "items"]);
        setStudent(students.find((item) => item.id === id) || null);
      }

      if (noticesResult.status === "fulfilled" && noticesResult.value.ok) {
        const data = await noticesResult.value.json();
        setNotices(normalizeArray<NoticeItem>(data, ["notices", "data", "items"]));
      } else {
        setNotices([]);
      }

      if (workoutsResult.status === "fulfilled" && workoutsResult.value.ok) {
        const data = await workoutsResult.value.json();
        setWorkouts(normalizeArray<WorkoutPlan>(data, ["plans", "workoutPlans", "data", "items"]));
      } else {
        setWorkouts([]);
      }

      if (questionsResult.status === "fulfilled" && questionsResult.value.ok) {
        const data = await questionsResult.value.json();
        setQuestions(normalizeArray<QuestionItem>(data, ["questions", "data", "items"]));
      } else {
        /*
         * Alguns projetos têm GET de dúvidas em outra rota.
         * Mantemos a aba funcionando mesmo se esta API não retornar.
         */
        setQuestions([]);
        setQuestionLoadError(true);
      }
    } catch (error) {
      console.error("Erro ao carregar detalhes do aluno:", error);
      setNotices([]);
      setWorkouts([]);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }

  const orderedWorkouts = useMemo(() => {
    return [...workouts].sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt || 0).getTime();
      const dateB = new Date(b.date || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [workouts]);

  const orderedNotices = useMemo(() => {
    return [...notices].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [notices]);

  const orderedQuestions = useMemo(() => {
    return [...questions].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [questions]);

  if (!studentId) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-[#D4A373]">Aluno</h1>
        <div className="mt-6 bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <p className="text-sm text-[#a1a1a1]">
            Selecione um aluno na lista para visualizar avisos, treinos e dúvidas.
          </p>
          <Link
            href="/dashboard/alunos"
            className="inline-block mt-4 text-sm text-[#D4A373] hover:text-[#c49563]"
          >
            Voltar para alunos
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="text-center py-12 text-[#525252]">Carregando aluno...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link
          href="/dashboard/alunos"
          className="text-sm text-[#D4A373] hover:text-[#c49563]"
        >
          ← Voltar para alunos
        </Link>
      </div>

      <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-5 md:p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#D4A373]/20 text-[#D4A373] flex items-center justify-center font-bold text-lg shrink-0">
            {getInitials(student?.name)}
          </div>

          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-[#D4A373] truncate">
              {student?.name || "Aluno"}
            </h1>

            <p className="text-sm text-[#a1a1a1] truncate">
              {student?.email || "E-mail não informado"}
              {student?.phone ? ` | ${student.phone}` : ""}
            </p>

            <p className="text-xs text-[#6b6b6b] mt-1">
              Professor: {student?.user?.name || "Não informado"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <button
          type="button"
          onClick={() => setActiveTab("avisos")}
          className={tabClass(activeTab === "avisos")}
        >
          Avisos recebidos ({orderedNotices.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("treinos")}
          className={tabClass(activeTab === "treinos")}
        >
          Treinos recebidos ({orderedWorkouts.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("duvidas")}
          className={tabClass(activeTab === "duvidas")}
        >
          Dúvidas ({orderedQuestions.length})
        </button>
      </div>

      {activeTab === "avisos" && (
        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
            Avisos recebidos pelo aluno
          </h2>

          {orderedNotices.length === 0 ? (
            <p className="text-sm text-[#a1a1a1]">
              Este aluno ainda não recebeu avisos.
            </p>
          ) : (
            <div className="space-y-3">
              {orderedNotices.map((notice) => (
                <div
                  key={notice.id}
                  className="bg-[#0a0a0a] border border-[#ffffff10] rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#f5f5f5] truncate">
                        {notice.title || "Aviso"}
                      </p>
                      <p className="text-[11px] text-[#6b6b6b]">
                        {notice.author?.name || "Sistema"} • {formatDate(notice.createdAt)}
                      </p>
                    </div>

                    <span
                      className={
                        "text-[10px] px-2 py-1 rounded-full shrink-0 " +
                        (notice.readByStudent
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-amber-500/10 text-amber-400")
                      }
                    >
                      {notice.readByStudent ? "Lido" : "Pendente"}
                    </span>
                  </div>

                  {notice.content && (
                    <p className="text-sm text-[#a1a1a1] whitespace-pre-wrap">
                      {notice.content}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "treinos" && (
        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
            Treinos recebidos pelo aluno
          </h2>

          {orderedWorkouts.length === 0 ? (
            <p className="text-sm text-[#a1a1a1]">
              Este aluno ainda não recebeu treinos.
            </p>
          ) : (
            <div className="space-y-3">
              {orderedWorkouts.map((workout) => (
                <div
                  key={workout.id}
                  className="bg-[#0a0a0a] border border-[#ffffff10] rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#f5f5f5] truncate">
                        {workout.name || "Treino"}
                      </p>
                      <p className="text-[11px] text-[#6b6b6b]">
                        Data: {formatDate(workout.date || workout.createdAt)}
                      </p>
                    </div>

                    <span className="text-[10px] px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 shrink-0">
                      {workout.exercises?.length || 0} exercício(s)
                    </span>
                  </div>

                  {workout.description && (
                    <p className="text-sm text-[#a1a1a1] mb-3">
                      {workout.description}
                    </p>
                  )}

                  {workout.exercises && workout.exercises.length > 0 && (
                    <div className="space-y-2">
                      {workout.exercises.map((exercise, index) => (
                        <div
                          key={exercise.id || `${workout.id}-${index}`}
                          className="bg-[#111111] border border-[#ffffff10] rounded-lg p-3"
                        >
                          <p className="text-sm text-[#f5f5f5] font-medium">
                            {index + 1}. {exercise.name || "Exercício"}
                          </p>

                          <p className="text-xs text-[#a1a1a1] mt-1">
                            {exercise.series ? `${exercise.series} séries` : "Séries não informadas"}
                            {exercise.reps ? ` • ${exercise.reps} repetições` : ""}
                            {exercise.weight ? ` • ${exercise.weight}` : ""}
                            {exercise.restTime ? ` • descanso ${exercise.restTime}` : ""}
                          </p>

                          {exercise.notes && (
                            <p className="text-xs text-[#6b6b6b] mt-1">
                              {exercise.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {workout.notes && (
                    <p className="text-xs text-[#6b6b6b] mt-3">
                      Observações: {workout.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "duvidas" && (
        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
            Dúvidas do aluno
          </h2>

          {questionLoadError && (
            <p className="text-xs text-amber-400 mb-4">
              Não foi possível carregar a rota de dúvidas. A tela continua disponível para avisos e treinos.
            </p>
          )}

          {orderedQuestions.length === 0 ? (
            <p className="text-sm text-[#a1a1a1]">
              Este aluno ainda não possui dúvidas registradas.
            </p>
          ) : (
            <div className="space-y-3">
              {orderedQuestions.map((question) => (
                <div
                  key={question.id}
                  className="bg-[#0a0a0a] border border-[#ffffff10] rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <p className="text-sm font-semibold text-[#f5f5f5]">
                        {question.student?.name || student?.name || "Aluno"}
                      </p>
                      <p className="text-[11px] text-[#6b6b6b]">
                        {formatDateTime(question.createdAt)}
                      </p>
                    </div>

                    <span
                      className={
                        "text-[10px] px-2 py-1 rounded-full shrink-0 " +
                        (question.resolvedAt
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-amber-500/10 text-amber-400")
                      }
                    >
                      {question.resolvedAt ? "Encerrada" : "Aberta"}
                    </span>
                  </div>

                  <p className="text-sm text-[#a1a1a1] whitespace-pre-wrap">
                    {question.content || "-"}
                  </p>

                  {question.answer && (
                    <div className="mt-3 bg-[#111111] border border-[#ffffff10] rounded-lg p-3">
                      <p className="text-xs text-[#D4A373] mb-1">
                        Resposta
                      </p>
                      <p className="text-sm text-[#a1a1a1] whitespace-pre-wrap">
                        {question.answer}
                      </p>
                    </div>
                  )}

                  {question.children && question.children.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {question.children.map((reply) => (
                        <div
                          key={reply.id}
                          className="bg-[#111111] border border-[#ffffff10] rounded-lg p-3"
                        >
                          <p className="text-[11px] text-[#6b6b6b] mb-1">
                            {reply.answeredBy?.name || reply.teacher?.name || reply.student?.name || "Usuário"} • {formatDateTime(reply.createdAt)}
                          </p>

                          <p className="text-sm text-[#a1a1a1] whitespace-pre-wrap">
                            {reply.content || "-"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

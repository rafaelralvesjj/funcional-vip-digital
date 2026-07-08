"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type TabKey = "avisos" | "treinos" | "duvidas" | "resumo";

type Student = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  active?: boolean;
  commercialStatus?: string | null;
  contractedTrainingDaysPerMonth?: number | null;
  professorName?: string | null;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
  createdAt?: string | null;
};

type AnyItem = Record<string, any>;

function formatDate(value?: string | null): string {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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

function getListFromResponse(json: any, keys: string[]): AnyItem[] {
  if (Array.isArray(json)) return json;

  for (const key of keys) {
    if (Array.isArray(json?.[key])) return json[key];
  }

  return [];
}

function getItemTitle(item: AnyItem, fallback: string): string {
  return String(item.title || item.name || item.subject || item.planName || item.content || fallback || "Registro");
}

function getItemDescription(item: AnyItem): string {
  return String(item.description || item.content || item.message || item.answer || item.notes || item.studentSummary || "");
}

function getItemDate(item: AnyItem): string | null {
  return item.date || item.scheduledDate || item.workoutDate || item.createdAt || item.updatedAt || null;
}

export default function StudentDetailPage() {
  const params = useParams();
  const studentId = String(params?.studentId || "");

  const [activeTab, setActiveTab] = useState<TabKey>("avisos");
  const [student, setStudent] = useState<Student | null>(null);
  const [notices, setNotices] = useState<AnyItem[]>([]);
  const [workouts, setWorkouts] = useState<AnyItem[]>([]);
  const [questions, setQuestions] = useState<AnyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

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
      const [studentsJson, noticesJson, workoutsJson, questionsJson] = await Promise.all([
        safeFetch("/api/students"),
        safeFetch(`/api/notices?studentId=${encodeURIComponent(studentId)}`),
        safeFetch(`/api/workout-plan?studentId=${encodeURIComponent(studentId)}`),
        safeFetch(`/api/questions?studentId=${encodeURIComponent(studentId)}`),
      ]);

      const students = getListFromResponse(studentsJson, ["students", "data"]);
      const selectedStudent = students.find((item) => item.id === studentId) || null;

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

  const tabCounts = useMemo(
    () => ({
      avisos: notices.length,
      treinos: workouts.length,
      duvidas: questions.length,
    }),
    [notices.length, workouts.length, questions.length]
  );

  function renderEmpty(text: string) {
    return (
      <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-5 text-sm text-[#a1a1a1]">
        {text}
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
            <div key={item.id || index} className="rounded-2xl border border-[#ffffff10] bg-[#0f0f0f] p-4 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-[#f5f5f5]">{title}</h3>
                    {status && (
                      <span className="rounded-full bg-[#D4A373]/15 text-[#D4A373] px-2 py-1 text-[11px] font-semibold">
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
                </div>

                {kind === "workout" && (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/dashboard/montar-treino?studentId=${studentId}&workoutId=${item.id || ""}`}
                      className="rounded-xl bg-[#1a1a1a] border border-[#D4A373]/30 text-[#D4A373] px-3 py-2 text-xs font-semibold"
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

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-4 md:p-6 text-[#f5f5f5]">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <Link href="/dashboard/students" className="text-xs text-[#D4A373] underline">
              ← Voltar para alunos
            </Link>

            <p className="text-xs uppercase tracking-[0.3em] text-[#D4A373] mt-4 mb-2">
              Detalhe do aluno
            </p>

            <h1 className="text-2xl font-bold text-[#D4A373]">
              {student?.name || "Aluno"}
            </h1>

            <p className="text-sm text-[#a1a1a1] mt-2">
              {student?.email || "Sem e-mail"}
              {student?.phone ? ` · ${student.phone}` : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={loadData}
            className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] text-[#f5f5f5] px-4 py-3 text-sm font-semibold hover:border-[#D4A373]/40 transition"
          >
            Atualizar
          </button>
        </div>

        {message && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
            {message}
          </div>
        )}

        {loading ? (
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 text-sm text-[#a1a1a1]">
            Carregando detalhe do aluno...
          </div>
        ) : (
          <>
            <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
                <p className="text-xs uppercase text-[#6b6b6b]">Status</p>
                <p className="text-lg font-bold text-[#D4A373] mt-1">
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
                        ? "bg-[#D4A373] text-[#0a0a0a]"
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
                <div id="student-summary-print" className="rounded-2xl border border-[#ffffff10] bg-[#0f0f0f] p-5 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[#D4A373]">Resumo do aluno</h2>
                    <p className="text-xs text-[#a1a1a1] mt-1">
                      Esta aba organiza o ciclo do aluno para leitura rápida do professor. Use o botão abaixo para imprimir ou salvar como PDF pelo navegador.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4">
                      <p className="text-xs uppercase text-[#6b6b6b]">Aluno</p>
                      <p className="text-[#f5f5f5] font-semibold mt-1">{student?.name || "Aluno"}</p>
                      <p className="text-[#a1a1a1] text-xs mt-1">{student?.email || "Sem e-mail"}</p>
                    </div>

                    <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4">
                      <p className="text-xs uppercase text-[#6b6b6b]">Contexto</p>
                      <p className="text-[#f5f5f5] font-semibold mt-1">{normalizeStatus(student?.commercialStatus)}</p>
                      <p className="text-[#a1a1a1] text-xs mt-1">Professor: {professorName}</p>
                    </div>

                    <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4">
                      <p className="text-xs uppercase text-[#6b6b6b]">Histórico visível</p>
                      <p className="text-[#f5f5f5] font-semibold mt-1">
                        {workouts.length} treino(s), {questions.length} dúvida(s), {notices.length} aviso(s)
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4">
                      <p className="text-xs uppercase text-[#6b6b6b]">Observação</p>
                      <p className="text-[#a1a1a1] text-xs mt-1">
                        Confirmar onboarding, objetivo, restrições, ambiente de treino e equipamentos antes de personalizar novos treinos.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-xl bg-[#D4A373] text-[#0a0a0a] px-4 py-3 text-sm font-semibold hover:bg-[#c49563] transition"
                  >
                    Imprimir / salvar como PDF
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

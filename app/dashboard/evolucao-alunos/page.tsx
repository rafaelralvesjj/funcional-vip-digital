"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type FeedbackItem = {
  id: string;
  student_id: string;
  professor_id?: string | null;
  milestone: number;
  status: string;
  completed_workouts_count: number;
  current_completed_count?: number | null;
  contract_id?: string | null;
  draft?: string | null;
  final_content?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  ready_at?: string | null;
  sent_at?: string | null;
  student_name?: string | null;
  student_email?: string | null;
  student_phone?: string | null;
  professor_name?: string | null;
  professor_email?: string | null;
  commercial_status?: string | null;
  contracted_training_days_per_month?: number | null;
  open_care_events?: number | null;
  open_questions?: number | null;
  first_assessment_at?: string | null;
  latest_assessment_at?: string | null;
};

type Message = {
  type: "success" | "error" | "info";
  text: string;
};

function formatDate(value?: string | null): string {
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

function normalizeStatus(status?: string | null): string {
  const value = String(status || "").toUpperCase();

  const labels: Record<string, string> = {
    PENDENTE_PROFESSOR: "Pendente do professor",
    AGUARDANDO_BIOIMPEDANCIA: "Aguardando formulário/avaliação",
    RASCUNHO: "Rascunho salvo",
    ENVIADO: "Enviado ao aluno",
  };

  return labels[value] || value || "Não informado";
}

function getStatusClass(status?: string | null): string {
  const value = String(status || "").toUpperCase();

  if (value === "ENVIADO") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (value === "AGUARDANDO_BIOIMPEDANCIA") return "bg-blue-500/10 text-blue-300 border-blue-500/20";
  if (value === "RASCUNHO") return "bg-amber-500/10 text-amber-300 border-amber-500/20";

  return "bg-[#00A19C]/10 text-[#00A19C] border-[#00A19C]/20";
}

function getDefaultContent(item: FeedbackItem): string {
  return String(item.final_content || item.draft || "").trim();
}

export default function EvolucaoAlunosPage() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [includeSent, setIncludeSent] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    loadFeedbacks();
  }, [includeSent]);

  async function loadFeedbacks() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/evolution-feedbacks${includeSent ? "?includeSent=1" : ""}`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setMessage({ type: "error", text: data?.error || "Erro ao buscar feedbacks." });
        setFeedbacks([]);
        return;
      }

      const list: FeedbackItem[] = Array.isArray(data?.feedbacks)
        ? (data.feedbacks as FeedbackItem[])
        : [];
      const nextDrafts: Record<string, string> = {};

      list.forEach((item) => {
        nextDrafts[item.id] = getDefaultContent(item);
      });

      setFeedbacks(list);
      setCounts((data?.counts || {}) as Record<string, number>);
      setDrafts(nextDrafts);
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar feedbacks de evolução." });
      setFeedbacks([]);
    }

    setLoading(false);
  }

  async function runAction(id: string, action: "SAVE_DRAFT" | "SEND_FEEDBACK") {
    const content = String(drafts[id] || "").trim();

    if (!content) {
      setMessage({ type: "error", text: "Escreva o conteúdo do feedback antes de continuar." });
      return;
    }

    setSavingId(id);
    setMessage(null);

    try {
      const res = await fetch("/api/evolution-feedbacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, content }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setMessage({ type: "error", text: data?.error || "Não foi possível processar o feedback." });
        return;
      }

      setMessage({ type: "success", text: data?.message || "Feedback processado." });
      await loadFeedbacks();
    } catch {
      setMessage({ type: "error", text: "Erro ao processar feedback." });
    }

    setSavingId(null);
  }

  const pendingCount = useMemo(() => {
    return feedbacks.filter((item) => String(item.status || "").toUpperCase() !== "ENVIADO").length;
  }, [feedbacks]);

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-4 md:p-6 text-[#f5f5f5]">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link href="/dashboard" className="text-xs text-[#00A19C] underline">
              ← Voltar para dashboard
            </Link>

            <p className="mt-4 text-xs uppercase tracking-[0.3em] text-[#00A19C]">
              Evolução dos alunos
            </p>

            <h1 className="mt-2 text-2xl font-bold text-[#f5f5f5]">
              Feedbacks de 20 em 20 treinos
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#a1a1a1]">
              Quando o aluno completa 20, 40, 60 treinos concluídos, o sistema cria uma pendência para o professor revisar e enviar uma devolutiva humana ao aluno.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIncludeSent((current) => !current)}
              className="rounded-xl border border-[#ffffff10] bg-[#111] px-4 py-3 text-xs font-semibold text-[#a1a1a1] hover:border-[#00A19C]/40 hover:text-white"
            >
              {includeSent ? "Ocultar enviados" : "Mostrar enviados"}
            </button>

            <button
              type="button"
              onClick={loadFeedbacks}
              className="rounded-xl bg-[#00A19C] px-4 py-3 text-xs font-semibold text-[#0a0a0a] hover:bg-[#008B87]"
            >
              Atualizar
            </button>
          </div>
        </div>

        {message && (
          <div
            className={
              "rounded-xl border px-4 py-3 text-sm " +
              (message.type === "success"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : message.type === "error"
                  ? "border-red-500/20 bg-red-500/10 text-red-400"
                  : "border-blue-500/20 bg-blue-500/10 text-blue-300")
            }
          >
            {message.text}
          </div>
        )}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-[#ffffff10] bg-[#111] p-4">
            <p className="text-xs uppercase text-[#6b6b6b]">Pendentes</p>
            <p className="mt-1 text-2xl font-bold text-[#00A19C]">{pendingCount}</p>
          </div>

          <div className="rounded-2xl border border-[#ffffff10] bg-[#111] p-4">
            <p className="text-xs uppercase text-[#6b6b6b]">Rascunhos</p>
            <p className="mt-1 text-2xl font-bold text-amber-300">{counts.RASCUNHO || 0}</p>
          </div>

          <div className="rounded-2xl border border-[#ffffff10] bg-[#111] p-4">
            <p className="text-xs uppercase text-[#6b6b6b]">Enviados</p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">{counts.ENVIADO || 0}</p>
          </div>

          <div className="rounded-2xl border border-[#ffffff10] bg-[#111] p-4">
            <p className="text-xs uppercase text-[#6b6b6b]">Próximo gatilho</p>
            <p className="mt-1 text-sm font-semibold text-[#f5f5f5]">20 treinos concluídos</p>
          </div>
        </section>

        <section className="rounded-2xl border border-[#ffffff10] bg-[#111] p-4 md:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[#00A19C]">Fila de feedbacks</h2>
            <p className="mt-1 text-xs text-[#a1a1a1]">
              O rascunho é automático. O professor pode ajustar o tom antes de enviar ao aluno.
            </p>
          </div>

          {loading ? (
            <div className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] p-5 text-sm text-[#a1a1a1]">
              Carregando feedbacks...
            </div>
          ) : feedbacks.length === 0 ? (
            <div className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] p-5 text-sm text-[#a1a1a1]">
              Nenhum feedback de evolução pendente no momento.
            </div>
          ) : (
            <div className="space-y-4">
              {feedbacks.map((item) => {
                const isSent = String(item.status || "").toUpperCase() === "ENVIADO";
                const hasCare = Number(item.open_care_events || 0) > 0;
                const hasQuestions = Number(item.open_questions || 0) > 0;

                return (
                  <article key={item.id} className="rounded-2xl border border-[#ffffff10] bg-[#0f0f0f] p-4 space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${getStatusClass(item.status)}`}>
                            {normalizeStatus(item.status)}
                          </span>
                          <span className="rounded-full border border-[#ffffff10] bg-[#1a1a1a] px-2 py-1 text-[10px] font-semibold text-[#a1a1a1]">
                            Marco {item.milestone} treinos
                          </span>
                          {hasCare && (
                            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-300">
                              Cuidado aberto
                            </span>
                          )}
                          {hasQuestions && (
                            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-300">
                              Dúvida aberta
                            </span>
                          )}
                        </div>

                        <h3 className="mt-2 text-base font-bold text-[#f5f5f5]">
                          {item.student_name || "Aluno"}
                        </h3>

                        <p className="mt-1 text-xs text-[#a1a1a1]">
                          Professor: <span className="text-[#00A19C]">{item.professor_name || "Não informado"}</span>
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs md:min-w-[320px]">
                        <div className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] p-3">
                          <p className="text-[10px] uppercase text-[#6b6b6b]">Concluídos no gatilho</p>
                          <p className="mt-1 font-bold text-[#f5f5f5]">{item.completed_workouts_count || item.milestone}</p>
                        </div>
                        <div className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] p-3">
                          <p className="text-[10px] uppercase text-[#6b6b6b]">Concluídos agora</p>
                          <p className="mt-1 font-bold text-[#f5f5f5]">{item.current_completed_count ?? "-"}</p>
                        </div>
                        <div className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] p-3">
                          <p className="text-[10px] uppercase text-[#6b6b6b]">Criado em</p>
                          <p className="mt-1 font-bold text-[#f5f5f5]">{formatDate(item.created_at)}</p>
                        </div>
                        <div className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] p-3">
                          <p className="text-[10px] uppercase text-[#6b6b6b]">Enviado em</p>
                          <p className="mt-1 font-bold text-[#f5f5f5]">{formatDate(item.sent_at)}</p>
                        </div>
                      </div>
                    </div>

                    {(hasCare || hasQuestions) && !isSent && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                        Antes de enviar, revise os alertas/dúvidas em aberto para que o feedback seja acolhedor e seguro, não apenas uma mensagem automática de parabéns.
                      </div>
                    )}

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#00A19C]">
                        Feedback para o aluno
                      </label>
                      <textarea
                        value={drafts[item.id] || ""}
                        onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                        disabled={isSent}
                        rows={10}
                        className="w-full rounded-xl border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm leading-relaxed text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C] disabled:opacity-70"
                        placeholder="Escreva a devolutiva para o aluno..."
                      />
                    </div>

                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/dashboard/students/${item.student_id}`}
                          className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-xs font-semibold text-[#a1a1a1] hover:border-[#00A19C]/40 hover:text-white"
                        >
                          Ver ficha do aluno
                        </Link>

                        <Link
                          href={`/dashboard/resumo-aluno?studentId=${item.student_id}`}
                          className="rounded-lg border border-[#00A19C]/30 bg-[#00A19C]/10 px-3 py-2 text-xs font-semibold text-[#00A19C] hover:bg-[#00A19C]/20"
                        >
                          Gerar resumo IA
                        </Link>
                      </div>

                      {!isSent && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => runAction(item.id, "SAVE_DRAFT")}
                            disabled={savingId === item.id}
                            className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-2 text-xs font-semibold text-[#a1a1a1] hover:border-[#00A19C]/40 hover:text-white disabled:opacity-50"
                          >
                            {savingId === item.id ? "Salvando..." : "Salvar rascunho"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm("Enviar este feedback para o aluno agora?")) {
                                runAction(item.id, "SEND_FEEDBACK");
                              }
                            }}
                            disabled={savingId === item.id}
                            className="rounded-lg bg-[#00A19C] px-4 py-2 text-xs font-semibold text-[#0a0a0a] hover:bg-[#008B87] disabled:opacity-50"
                          >
                            {savingId === item.id ? "Enviando..." : "Enviar ao aluno"}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

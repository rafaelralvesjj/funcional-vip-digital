"use client";

import { useEffect, useMemo, useState } from "react";

type Feedback = {
  id: string;
  studentName: string;
  professorName: string;
  milestone: number;
  status: string;
  completedWorkoutsCount: number;
  draft?: string | null;
  finalContent?: string | null;
  createdAt: string;
  readyAt?: string | null;
  sentAt?: string | null;
  baselineAvaliacao?: any;
  currentAvaliacao?: any;
};

function getStatusLabel(status: string) {
  if (status === "AGUARDANDO_BIOIMPEDANCIA") return "Aguardando bioimpedância";
  if (status === "PRONTO_REVISAO") return "Pronto para revisão";
  if (status === "ENVIADO") return "Enviado ao aluno";

  return status || "Não informado";
}

function getStatusClass(status: string) {
  if (status === "AGUARDANDO_BIOIMPEDANCIA") {
    return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
  }

  if (status === "PRONTO_REVISAO") {
    return "bg-green-500/10 text-green-400 border border-green-500/20";
  }

  if (status === "ENVIADO") {
    return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
  }

  return "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20";
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMetric(value: any, suffix = "") {
  if (value === null || value === undefined || value === "") return "-";

  return `${Number(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}${suffix}`;
}

export default function FeedbacksEvolucaoPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("PRONTO_REVISAO");

  async function loadFeedbacks() {
    setLoading(true);

    try {
      const res = await fetch("/api/evolution-feedback", {
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setFeedbacks(list);

        const draftMap: Record<string, string> = {};
        list.forEach((item: Feedback) => {
          draftMap[item.id] = item.finalContent || item.draft || "";
        });
        setDrafts(draftMap);
      } else {
        setMessage({ type: "error", text: "Erro ao carregar feedbacks." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar feedbacks." });
    }

    setLoading(false);
  }

  useEffect(() => {
    loadFeedbacks();
  }, []);

  const filteredFeedbacks = useMemo(() => {
    if (filter === "TODOS") return feedbacks;

    return feedbacks.filter((feedback) => feedback.status === filter);
  }, [feedbacks, filter]);

  const counters = useMemo(() => {
    return {
      ready: feedbacks.filter((item) => item.status === "PRONTO_REVISAO").length,
      waitingBio: feedbacks.filter((item) => item.status === "AGUARDANDO_BIOIMPEDANCIA").length,
      sent: feedbacks.filter((item) => item.status === "ENVIADO").length,
      total: feedbacks.length,
    };
  }, [feedbacks]);

  async function saveFeedback(id: string) {
    setSavingId(id);
    setMessage(null);

    try {
      const res = await fetch("/api/evolution-feedback", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          action: "save",
          content: drafts[id] || "",
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Rascunho salvo." });
        await loadFeedbacks();
      } else {
        const data = await res.json().catch(() => null);
        setMessage({ type: "error", text: data?.error || "Erro ao salvar." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao salvar." });
    }

    setSavingId(null);
  }

  async function sendFeedback(id: string) {
    const confirmed = window.confirm("Enviar este feedback para o aluno por aviso e e-mail?");

    if (!confirmed) return;

    setSavingId(id);
    setMessage(null);

    try {
      const res = await fetch("/api/evolution-feedback", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          action: "send",
          content: drafts[id] || "",
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Feedback enviado ao aluno." });
        await loadFeedbacks();
      } else {
        const data = await res.json().catch(() => null);
        setMessage({ type: "error", text: data?.error || "Erro ao enviar." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao enviar." });
    }

    setSavingId(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-[#00A19C] uppercase tracking-[0.3em] mb-2">
          Acompanhamento
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-[#f5f5f5]">
          Feedbacks de evolução
        </h1>
        <p className="text-sm text-[#a1a1a1] mt-2 max-w-3xl">
          A cada 20 treinos concluídos, o sistema verifica se o aluno já atualizou a bioimpedância.
          Se atualizou, o feedback fica pronto para revisão do professor. Se não atualizou, o aluno recebe o pedido de preenchimento.
        </p>
      </div>

      {message && (
        <div
          className={
            "rounded-xl px-4 py-3 text-sm " +
            (message.type === "success"
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20")
          }
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => setFilter("PRONTO_REVISAO")}
          className="bg-[#111] border border-[#ffffff10] rounded-xl p-4 text-left hover:border-[#00A19C]/40 transition"
        >
          <p className="text-xs text-[#a1a1a1]">Para revisar</p>
          <p className="text-2xl font-bold text-[#00A19C]">{counters.ready}</p>
        </button>

        <button
          onClick={() => setFilter("AGUARDANDO_BIOIMPEDANCIA")}
          className="bg-[#111] border border-[#ffffff10] rounded-xl p-4 text-left hover:border-[#00A19C]/40 transition"
        >
          <p className="text-xs text-[#a1a1a1]">Aguardando bio</p>
          <p className="text-2xl font-bold text-amber-400">{counters.waitingBio}</p>
        </button>

        <button
          onClick={() => setFilter("ENVIADO")}
          className="bg-[#111] border border-[#ffffff10] rounded-xl p-4 text-left hover:border-[#00A19C]/40 transition"
        >
          <p className="text-xs text-[#a1a1a1]">Enviados</p>
          <p className="text-2xl font-bold text-blue-400">{counters.sent}</p>
        </button>

        <button
          onClick={() => setFilter("TODOS")}
          className="bg-[#111] border border-[#ffffff10] rounded-xl p-4 text-left hover:border-[#00A19C]/40 transition"
        >
          <p className="text-xs text-[#a1a1a1]">Total</p>
          <p className="text-2xl font-bold text-[#f5f5f5]">{counters.total}</p>
        </button>
      </div>

      {loading ? (
        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-6">
          <p className="text-[#a1a1a1]">Carregando feedbacks...</p>
        </div>
      ) : filteredFeedbacks.length === 0 ? (
        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-6">
          <p className="text-[#a1a1a1]">Nenhum feedback encontrado neste filtro.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredFeedbacks.map((feedback) => (
            <div
              key={feedback.id}
              className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5"
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={"text-[10px] px-2 py-1 rounded-full " + getStatusClass(feedback.status)}>
                      {getStatusLabel(feedback.status)}
                    </span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-[#00A19C]/10 text-[#00A19C] border border-[#00A19C]/20">
                      {feedback.milestone} treinos
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-[#f5f5f5]">
                    {feedback.studentName}
                  </h2>
                  <p className="text-xs text-[#a1a1a1]">
                    Professor: {feedback.professorName} · Concluídos: {feedback.completedWorkoutsCount}
                  </p>
                </div>

                <div className="text-xs text-[#6b6b6b] md:text-right">
                  <p>Criado: {formatDate(feedback.createdAt)}</p>
                  {feedback.readyAt && <p>Pronto: {formatDate(feedback.readyAt)}</p>}
                  {feedback.sentAt && <p>Enviado: {formatDate(feedback.sentAt)}</p>}
                </div>
              </div>

              {(feedback.baselineAvaliacao || feedback.currentAvaliacao) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div className="bg-[#1a1a1a] border border-[#ffffff08] rounded-xl p-3">
                    <p className="text-xs text-[#00A19C] font-semibold mb-2">
                      Avaliação anterior
                    </p>
                    <p className="text-xs text-[#a1a1a1]">
                      Data: {formatDate(feedback.baselineAvaliacao?.createdAt)}
                    </p>
                    <p className="text-xs text-[#a1a1a1]">
                      Peso: {formatMetric(feedback.baselineAvaliacao?.peso, " kg")}
                    </p>
                    <p className="text-xs text-[#a1a1a1]">
                      Abdômen: {formatMetric(feedback.baselineAvaliacao?.abdomen, " cm")}
                    </p>
                  </div>

                  <div className="bg-[#1a1a1a] border border-[#ffffff08] rounded-xl p-3">
                    <p className="text-xs text-[#00A19C] font-semibold mb-2">
                      Avaliação atual
                    </p>
                    <p className="text-xs text-[#a1a1a1]">
                      Data: {formatDate(feedback.currentAvaliacao?.createdAt)}
                    </p>
                    <p className="text-xs text-[#a1a1a1]">
                      Peso: {formatMetric(feedback.currentAvaliacao?.peso, " kg")}
                    </p>
                    <p className="text-xs text-[#a1a1a1]">
                      Abdômen: {formatMetric(feedback.currentAvaliacao?.abdomen, " cm")}
                    </p>
                  </div>
                </div>
              )}

              {feedback.status === "AGUARDANDO_BIOIMPEDANCIA" ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <p className="text-sm text-amber-400 font-medium">
                    Aguardando nova bioimpedância/formulário do aluno.
                  </p>
                  <p className="text-xs text-[#a1a1a1] mt-1">
                    Enquanto o aluno não preencher, o feedback de evolução fica bloqueado porque não há comparação atualizada.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={drafts[feedback.id] || ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [feedback.id]: event.target.value,
                      }))
                    }
                    disabled={feedback.status === "ENVIADO"}
                    className="w-full min-h-[260px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C] disabled:opacity-70"
                  />

                  {feedback.status !== "ENVIADO" && (
                    <div className="flex flex-col md:flex-row gap-2 md:justify-end">
                      <button
                        onClick={() => saveFeedback(feedback.id)}
                        disabled={savingId === feedback.id}
                        className="px-4 py-2 rounded-lg border border-[#ffffff15] text-[#a1a1a1] text-sm hover:text-white hover:border-[#00A19C]/40 transition disabled:opacity-50"
                      >
                        {savingId === feedback.id ? "Salvando..." : "Salvar rascunho"}
                      </button>

                      <button
                        onClick={() => sendFeedback(feedback.id)}
                        disabled={savingId === feedback.id || !(drafts[feedback.id] || "").trim()}
                        className="px-4 py-2 rounded-lg bg-[#00A19C] text-[#0a0a0a] font-semibold text-sm hover:bg-[#008B87] transition disabled:opacity-50"
                      >
                        {savingId === feedback.id ? "Enviando..." : "Enviar feedback ao aluno"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

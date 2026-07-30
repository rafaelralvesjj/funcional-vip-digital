"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Survey = {
  id: string;
  studentId: string;
  surveyType: string;
  surveyLabel: string;
  status: string;
  nps?: number | null;
  overallRating?: number | null;
  supportRating?: number | null;
  workoutFitRating?: number | null;
  evolutionRating?: number | null;
  favoritePoint?: string | null;
  mainDifficulty?: string | null;
  improvementSuggestion?: string | null;
  openFeedback?: string | null;
  createdAt?: string | null;
  answeredAt?: string | null;
  student?: {
    name?: string | null;
    email?: string | null;
  } | null;
  professor?: {
    id?: string | null;
    name?: string | null;
  } | null;
};

function formatDate(value?: string | null) {
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

function getStatusLabel(status?: string | null) {
  const normalized = String(status || "").toUpperCase();

  if (normalized === "PENDING") return "Pendente";
  if (normalized === "ANSWERED") return "Respondida";
  if (normalized === "DISMISSED") return "Dispensada";

  return normalized || "-";
}

function getStatusClass(status?: string | null) {
  const normalized = String(status || "").toUpperCase();

  if (normalized === "ANSWERED") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (normalized === "PENDING") return "bg-amber-500/10 text-amber-400 border-amber-500/20";

  return "bg-[#ffffff10] text-[#a1a1a1] border-[#ffffff10]";
}

function scoreTone(value?: number | null) {
  if (value === null || value === undefined) return "text-[#a1a1a1]";
  if (value <= 6) return "text-red-400";
  if (value <= 8) return "text-amber-400";
  return "text-emerald-400";
}

export default function PesquisasAlunosPage() {
  const [status, setStatus] = useState("ALL");
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchSurveys();
  }, [status]);

  async function fetchSurveys() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/student-surveys?status=${encodeURIComponent(status)}`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setSurveys(Array.isArray(data?.surveys) ? data.surveys : []);
      } else {
        setMessage(data?.error || "Não foi possível carregar as pesquisas.");
      }
    } catch {
      setMessage("Não foi possível carregar as pesquisas.");
    }

    setLoading(false);
  }

  const counts = useMemo(() => {
    return surveys.reduce(
      (acc, survey) => {
        acc.total += 1;
        if (String(survey.status).toUpperCase() === "PENDING") acc.pending += 1;
        if (String(survey.status).toUpperCase() === "ANSWERED") acc.answered += 1;
        if ((survey.nps ?? 10) <= 6 || (survey.overallRating ?? 10) <= 6) acc.attention += 1;
        return acc;
      },
      { total: 0, pending: 0, answered: 0, attention: 0 }
    );
  }, [surveys]);

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-6 text-[#f5f5f5]">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-[#ffffff10] bg-[#111111] p-6">
          <p className="text-xs uppercase tracking-[0.25em] text-[#22D3EE]">
            Escuta do aluno
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[#f5f5f5]">
            Pesquisas de satisfação e evolução
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#a1a1a1]">
            Acompanhe pesquisas geradas no fim da experiência, no início do plano pago e após 30 dias de acompanhamento. Use as respostas para melhorar retenção, cuidado e vínculo com o aluno.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-[#ffffff10] bg-[#111111] p-4">
            <p className="text-xs uppercase text-[#6b6b6b]">Total</p>
            <p className="mt-1 text-2xl font-bold text-[#22D3EE]">{counts.total}</p>
          </div>
          <div className="rounded-2xl border border-[#ffffff10] bg-[#111111] p-4">
            <p className="text-xs uppercase text-[#6b6b6b]">Pendentes</p>
            <p className="mt-1 text-2xl font-bold text-amber-400">{counts.pending}</p>
          </div>
          <div className="rounded-2xl border border-[#ffffff10] bg-[#111111] p-4">
            <p className="text-xs uppercase text-[#6b6b6b]">Respondidas</p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">{counts.answered}</p>
          </div>
          <div className="rounded-2xl border border-[#ffffff10] bg-[#111111] p-4">
            <p className="text-xs uppercase text-[#6b6b6b]">Atenção</p>
            <p className="mt-1 text-2xl font-bold text-red-400">{counts.attention}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#ffffff10] bg-[#111111] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#f5f5f5]">Registros</h2>
              <p className="text-xs text-[#a1a1a1]">Filtre para acompanhar pendências e respostas.</p>
            </div>

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] outline-none"
            >
              <option value="ALL">Todas</option>
              <option value="PENDING">Pendentes</option>
              <option value="ANSWERED">Respondidas</option>
            </select>
          </div>
        </div>

        {message && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-[#ffffff10] bg-[#111111] p-6 text-sm text-[#a1a1a1]">
            Carregando pesquisas...
          </div>
        ) : surveys.length === 0 ? (
          <div className="rounded-2xl border border-[#ffffff10] bg-[#111111] p-6 text-sm text-[#a1a1a1]">
            Nenhuma pesquisa encontrada para este filtro.
          </div>
        ) : (
          <div className="space-y-3">
            {surveys.map((survey) => (
              <div key={survey.id} className="rounded-2xl border border-[#ffffff10] bg-[#111111] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${getStatusClass(survey.status)}`}>
                        {getStatusLabel(survey.status)}
                      </span>
                      <span className="rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/10 px-2 py-1 text-[10px] font-semibold text-[#22D3EE]">
                        {survey.surveyLabel}
                      </span>
                    </div>

                    <h3 className="mt-3 text-base font-bold text-[#f5f5f5]">
                      {survey.student?.name || "Aluno"}
                    </h3>
                    <p className="text-xs text-[#a1a1a1]">
                      Professor: <span className="text-[#22D3EE]">{survey.professor?.name || "Não vinculado"}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-[#6b6b6b]">
                      Criada em {formatDate(survey.createdAt)} {survey.answeredAt ? `· respondida em ${formatDate(survey.answeredAt)}` : ""}
                    </p>
                  </div>

                  <Link
                    href={`/dashboard/students/${survey.studentId}`}
                    className="inline-flex items-center justify-center rounded-lg border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-3 py-2 text-xs font-semibold text-[#22D3EE] hover:bg-[#22D3EE]/20"
                  >
                    Ver ficha
                  </Link>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
                  <div className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-3">
                    <p className="text-[10px] uppercase text-[#6b6b6b]">Nota geral</p>
                    <p className={`text-lg font-bold ${scoreTone(survey.overallRating)}`}>{survey.overallRating ?? "-"}</p>
                  </div>
                  <div className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-3">
                    <p className="text-[10px] uppercase text-[#6b6b6b]">NPS</p>
                    <p className={`text-lg font-bold ${scoreTone(survey.nps)}`}>{survey.nps ?? "-"}</p>
                  </div>
                  <div className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-3">
                    <p className="text-[10px] uppercase text-[#6b6b6b]">Acompanhamento</p>
                    <p className={`text-lg font-bold ${scoreTone(survey.supportRating)}`}>{survey.supportRating ?? "-"}</p>
                  </div>
                  <div className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-3">
                    <p className="text-[10px] uppercase text-[#6b6b6b]">Treino adequado</p>
                    <p className={`text-lg font-bold ${scoreTone(survey.workoutFitRating)}`}>{survey.workoutFitRating ?? "-"}</p>
                  </div>
                  <div className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-3">
                    <p className="text-[10px] uppercase text-[#6b6b6b]">Evolução</p>
                    <p className={`text-lg font-bold ${scoreTone(survey.evolutionRating)}`}>{survey.evolutionRating ?? "-"}</p>
                  </div>
                </div>

                {(survey.favoritePoint || survey.mainDifficulty || survey.improvementSuggestion || survey.openFeedback) && (
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    {survey.favoritePoint && (
                      <div className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-3">
                        <p className="text-[10px] font-semibold uppercase text-[#22D3EE]">Gostou</p>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-[#e5e5e5]">{survey.favoritePoint}</p>
                      </div>
                    )}
                    {survey.mainDifficulty && (
                      <div className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-3">
                        <p className="text-[10px] font-semibold uppercase text-amber-400">Dificuldade</p>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-[#e5e5e5]">{survey.mainDifficulty}</p>
                      </div>
                    )}
                    {survey.improvementSuggestion && (
                      <div className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-3">
                        <p className="text-[10px] font-semibold uppercase text-blue-300">Sugestão</p>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-[#e5e5e5]">{survey.improvementSuggestion}</p>
                      </div>
                    )}
                    {survey.openFeedback && (
                      <div className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-3">
                        <p className="text-[10px] font-semibold uppercase text-[#a1a1a1]">Comentário</p>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-[#e5e5e5]">{survey.openFeedback}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

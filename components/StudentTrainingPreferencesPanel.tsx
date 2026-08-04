"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type RelatedWorkout = {
  id: string;
  date: string;
  status: string;
  workoutPlanId?: string | null;
  workoutPlanName?: string | null;
};

type TrainingPreference = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail?: string | null;
  studentImage?: string | null;
  professorId?: string | null;
  professorName?: string | null;
  sourceConversationId: string;
  sourceQuestionId: string;
  source: string;
  category: string;
  summary: string;
  originalMessage: string;
  status: string;
  currentWeekAction: string;
  relatedWorkoutId?: string | null;
  relatedWorkoutPlanId?: string | null;
  relatedWorkout?: RelatedWorkout | null;
  handledAt?: string | null;
  handledByName?: string | null;
  createdAt: string;
  updatedAt: string;
};

type PreferencePermissions = {
  role: string;
  canManagePreferences: boolean;
  readOnly: boolean;
  label: string;
};

type FilterMode = "PENDENTES" | "ATIVAS" | "HISTORICO";

function formatDate(value?: string | null): string {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(value?: string | null): string {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getInitials(name: string): string {
  const parts = String(name || "Aluno")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return `${parts[0]?.[0] || "A"}${parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : ""}`.toUpperCase();
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    CARDIO_CORRIDA: "Cardio e corrida",
    AMBIENTE_TREINO: "Ambiente de treino",
    EQUIPAMENTOS: "Equipamentos e recursos",
    OBJETIVO_TREINO: "Objetivo de treino",
    INTENSIDADE_VOLUME: "Intensidade, carga e volume",
    EXERCICIO_EVITAR: "Exercício a evitar",
    EXERCICIO_PRIORIZAR: "Prioridade de treino",
    ROTINA_TREINO: "Rotina de treino",
    PREFERENCIA_GERAL: "Preferência geral",
  };

  return labels[category] || category.replaceAll("_", " ").toLowerCase();
}

function getSourceLabel(source: string): string {
  return String(source || "CHAT").toUpperCase() === "WORKOUT_COMPLETION"
    ? "Relato ao concluir treino"
    : "Conversa no chat";
}

function getStatusLabel(preference: TrainingPreference): string {
  if (preference.status === "SUPERSEDED") return "Substituída por preferência mais recente";
  if (preference.status === "DISCARDED") return "Classificação descartada";
  if (preference.currentWeekAction === "ADAPTED") return "Aplicada no treino desta semana";
  if (preference.currentWeekAction === "FUTURE_ONLY") return "Aplicar nos próximos treinos";
  if (preference.currentWeekAction === "NOT_APPLICABLE") return "Ativa para próximos treinos";
  if (preference.currentWeekAction === "PENDING") return "Aguardando decisão do professor";
  return preference.status === "ACTIVE" ? "Ativa" : preference.status;
}

function getStatusStyle(preference: TrainingPreference): string {
  if (preference.status === "DISCARDED" || preference.status === "SUPERSEDED") {
    return "border-zinc-700 bg-zinc-800 text-zinc-400";
  }

  if (preference.currentWeekAction === "PENDING") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }

  if (preference.currentWeekAction === "ADAPTED") {
    return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  }

  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

export default function StudentTrainingPreferencesPanel() {
  const [preferences, setPreferences] = useState<TrainingPreference[]>([]);
  const [permissions, setPermissions] = useState<PreferencePermissions>({
    role: "",
    canManagePreferences: false,
    readOnly: true,
    label: "Carregando permissões...",
  });
  const [filter, setFilter] = useState<FilterMode>("PENDENTES");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function loadPreferences() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/student-training-preferences", {
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage({ type: "error", text: data?.error || "Erro ao carregar preferências." });
        setLoading(false);
        return;
      }

      setPreferences(Array.isArray(data?.preferences) ? data.preferences : []);
      setPermissions({
        role: String(data?.permissions?.role || ""),
        canManagePreferences: Boolean(data?.permissions?.canManagePreferences),
        readOnly: Boolean(data?.permissions?.readOnly ?? true),
        label: String(data?.permissions?.label || "Preferências carregadas."),
      });
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar preferências." });
    }

    setLoading(false);
  }

  useEffect(() => {
    loadPreferences();
  }, []);

  const counters = useMemo(() => {
    return {
      total: preferences.length,
      pending: preferences.filter(
        (item) => item.status === "ACTIVE" && item.currentWeekAction === "PENDING"
      ).length,
      active: preferences.filter((item) => item.status === "ACTIVE").length,
      adapted: preferences.filter((item) => item.currentWeekAction === "ADAPTED").length,
      future: preferences.filter((item) =>
        item.status === "ACTIVE" && ["FUTURE_ONLY", "NOT_APPLICABLE"].includes(item.currentWeekAction)
      ).length,
    };
  }, [preferences]);

  const filteredPreferences = useMemo(() => {
    const term = search.trim().toLowerCase();

    return preferences.filter((item) => {
      const matchesFilter =
        filter === "HISTORICO"
          ? true
          : filter === "ATIVAS"
            ? item.status === "ACTIVE"
            : item.status === "ACTIVE" && item.currentWeekAction === "PENDING";

      if (!matchesFilter) return false;
      if (!term) return true;

      return [
        item.studentName,
        item.studentEmail,
        item.professorName,
        item.category,
        item.summary,
        item.originalMessage,
        item.status,
        item.currentWeekAction,
        getSourceLabel(item.source),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [filter, preferences, search]);

  async function applyFutureOnly(preference: TrainingPreference) {
    const confirmed = window.confirm(
      "Manter o treino atual e considerar esta preferência somente nos próximos treinos?"
    );

    if (!confirmed) return;

    setSavingId(preference.id);
    setMessage(null);

    try {
      const response = await fetch("/api/workout-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "FUTURE_ONLY",
          preferenceId: preference.id,
          workoutId: preference.relatedWorkoutId || null,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage({ type: "error", text: data?.error || "Erro ao registrar decisão." });
      } else {
        await loadPreferences();
        setMessage({
          type: "success",
          text: data?.message || "Preferência mantida para os próximos treinos.",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao registrar decisão." });
    }

    setSavingId(null);
  }

  async function dismissPreference(preference: TrainingPreference) {
    const confirmed = window.confirm(
      "Descartar esta classificação? A mensagem continuará no histórico da conversa, mas não será usada como preferência ativa."
    );

    if (!confirmed) return;

    setSavingId(preference.id);
    setMessage(null);

    try {
      const response = await fetch("/api/student-training-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: preference.id, action: "DISMISS" }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage({ type: "error", text: data?.error || "Erro ao descartar classificação." });
      } else {
        await loadPreferences();
        setMessage({ type: "success", text: data?.message || "Classificação descartada." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao descartar classificação." });
    }

    setSavingId(null);
  }

  return (
    <div className="space-y-5">
      {message && (
        <div
          className={
            "rounded-xl border px-4 py-3 text-sm " +
            (message.type === "success"
              ? "border-green-500/20 bg-green-500/10 text-green-400"
              : "border-red-500/20 bg-red-500/10 text-red-400")
          }
        >
          {message.text}
        </div>
      )}

      <div
        className={
          "rounded-xl border px-4 py-3 text-xs " +
          (permissions.canManagePreferences
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            : "border-blue-500/20 bg-blue-500/10 text-blue-300")
        }
      >
        {permissions.label}
      </div>

      <div className="space-y-4 rounded-2xl border border-[#ffffff10] bg-[#111] p-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <button
            type="button"
            onClick={() => setFilter("PENDENTES")}
            className="rounded-xl bg-[#1a1a1a] p-4 text-left hover:ring-1 hover:ring-emerald-500/40"
          >
            <p className="text-[10px] uppercase text-[#6b6b6b]">Pendentes</p>
            <p className="text-2xl font-bold text-emerald-400">{counters.pending}</p>
          </button>

          <button
            type="button"
            onClick={() => setFilter("ATIVAS")}
            className="rounded-xl bg-[#1a1a1a] p-4 text-left hover:ring-1 hover:ring-[#00A19C]/40"
          >
            <p className="text-[10px] uppercase text-[#6b6b6b]">Ativas</p>
            <p className="text-2xl font-bold text-[#f5f5f5]">{counters.active}</p>
          </button>

          <div className="rounded-xl bg-[#1a1a1a] p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Aplicadas</p>
            <p className="text-2xl font-bold text-blue-400">{counters.adapted}</p>
          </div>

          <div className="rounded-xl bg-[#1a1a1a] p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Próximos treinos</p>
            <p className="text-2xl font-bold text-amber-400">{counters.future}</p>
          </div>

          <button
            type="button"
            onClick={() => setFilter("HISTORICO")}
            className="rounded-xl bg-[#1a1a1a] p-4 text-left hover:ring-1 hover:ring-zinc-500/40"
          >
            <p className="text-[10px] uppercase text-[#6b6b6b]">Histórico</p>
            <p className="text-2xl font-bold text-[#f5f5f5]">{counters.total}</p>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por aluno, professor, preferência ou origem..."
            className="w-full rounded-xl border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none placeholder:text-[#6b6b6b] focus:border-[#00A19C]"
          />

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as FilterMode)}
            className="w-full rounded-xl border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
          >
            <option value="PENDENTES">Aguardando decisão</option>
            <option value="ATIVAS">Todas as ativas</option>
            <option value="HISTORICO">Histórico completo</option>
          </select>

          <button
            type="button"
            onClick={loadPreferences}
            disabled={loading}
            className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#a1a1a1] hover:text-white disabled:opacity-50"
          >
            Atualizar
          </button>
        </div>

        <div className="rounded-xl border border-[#00A19C]/20 bg-[#00A19C]/10 p-4">
          <p className="mb-1 text-xs font-semibold text-[#00A19C]">Como usar</p>
          <p className="text-xs leading-relaxed text-[#a1a1a1]">
            A preferência pode nascer no chat ou no relato ao concluir um treino. Quando houver outro treino PENDENTE na semana, o professor poderá abrir a conversa e adaptar somente esse treino. Sem treino pendente, a informação continua ativa e entra automaticamente no resumo usado para as próximas semanas.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-[#ffffff10] bg-[#111] p-8 text-center text-sm text-[#a1a1a1]">
            Carregando preferências de treino...
          </div>
        ) : filteredPreferences.length === 0 ? (
          <div className="rounded-2xl border border-[#ffffff10] bg-[#111] p-8 text-center text-sm text-[#a1a1a1]">
            Nenhuma preferência encontrada neste filtro.
          </div>
        ) : (
          filteredPreferences.map((preference) => {
            const canManageActive =
              permissions.canManagePreferences && preference.status === "ACTIVE";
            const canTreatPending =
              canManageActive && preference.currentWeekAction === "PENDING";

            return (
              <article
                key={preference.id}
                className="space-y-4 rounded-2xl border border-[#ffffff10] bg-[#111] p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#00A19C]/30 bg-[#1a1a1a]">
                      {preference.studentImage ? (
                        <img
                          src={preference.studentImage}
                          alt={preference.studentName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-bold text-[#00A19C]">
                          {getInitials(preference.studentName)}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300">
                          {getCategoryLabel(preference.category)}
                        </span>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${getStatusStyle(preference)}`}>
                          {getStatusLabel(preference)}
                        </span>
                        <span className="rounded-full bg-[#1a1a1a] px-2 py-1 text-[10px] text-[#a1a1a1]">
                          {getSourceLabel(preference.source)}
                        </span>
                      </div>

                      <h2 className="text-lg font-semibold text-[#f5f5f5]">
                        {preference.studentName}
                      </h2>
                      <p className="mt-1 text-xs text-[#a1a1a1]">
                        Professor: {preference.professorName || "Não informado"} · Registrada em {formatDate(preference.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/dashboard/students/${encodeURIComponent(preference.studentId)}`}
                      className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-xs text-[#a1a1a1] hover:text-white"
                    >
                      Ver ficha
                    </Link>

                    {permissions.role === "TEACHER" && (
                      <Link
                        href={`/dashboard/conversas?conversationId=${encodeURIComponent(preference.sourceConversationId)}`}
                        className="rounded-lg bg-[#00A19C] px-3 py-2 text-xs font-semibold text-[#0a0a0a] hover:bg-[#008B87]"
                      >
                        {canTreatPending ? "Abrir conversa e tratar" : "Abrir conversa"}
                      </Link>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-4">
                    <p className="mb-2 text-xs font-semibold text-[#00A19C]">Preferência estruturada</p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#e5e5e5]">
                      {preference.summary}
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-4">
                    <p className="mb-2 text-xs font-semibold text-[#00A19C]">Relato original do aluno</p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#e5e5e5]">
                      “{preference.originalMessage}”
                    </p>
                  </div>
                </div>

                {preference.relatedWorkout ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <p className="text-xs font-semibold text-emerald-300">
                      Treino relacionado: {preference.relatedWorkout.workoutPlanName || "Treino pendente"}
                    </p>
                    <p className="mt-1 text-xs text-emerald-100/80">
                      Data: {formatDateOnly(preference.relatedWorkout.date)} · Status: {preference.relatedWorkout.status}
                    </p>
                  </div>
                ) : (
                  preference.status === "ACTIVE" && (
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-xs text-blue-300">
                      Não existe outro treino PENDENTE relacionado. A preferência permanece ativa para as próximas montagens.
                    </div>
                  )
                )}

                {preference.handledAt && (
                  <p className="text-xs text-[#6b6b6b]">
                    Tratada em {formatDate(preference.handledAt)} por {preference.handledByName || "professor responsável"}.
                  </p>
                )}

                {canManageActive && (
                  <div className="flex flex-col gap-2 border-t border-[#ffffff10] pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-[#a1a1a1]">
                      {canTreatPending
                        ? "Adapte pela conversa para revisar o JSON antes de substituir o treino pendente."
                        : "A preferência segue ativa para as próximas montagens e pode ser descartada se tiver sido classificada incorretamente."}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {canTreatPending && (
                        <button
                          type="button"
                          disabled={savingId === preference.id}
                          onClick={() => applyFutureOnly(preference)}
                          className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                        >
                          Aplicar somente nos próximos
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={savingId === preference.id}
                        onClick={() => dismissPreference(preference)}
                        className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:text-white disabled:opacity-50"
                      >
                        Descartar classificação
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

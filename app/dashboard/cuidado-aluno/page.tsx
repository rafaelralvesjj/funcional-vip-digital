"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import StudentTrainingPreferencesPanel from "@/components/StudentTrainingPreferencesPanel";

type CommercialImpact = {
  applies: boolean;
  status: string;
  label: string;
  message: string;
  managementAction?: string | null;
  pauseStartedAt?: string | null;
  pauseResolvedAt?: string | null;
  pauseDays?: number | null;
  shouldBlockTrainingUntilResolved?: boolean | null;
  countsAsCompletedWorkout?: boolean | null;
  countsAsAbsence?: boolean | null;
  countsAsLowAdherence?: boolean | null;
  contractId?: string | null;
  contractType?: string | null;
  contractStatus?: string | null;
  contractCommercialStatus?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  contractPriceCents?: number | null;
  workoutsPerWeek?: number | null;
  workoutsPerMonth?: number | null;
  totalContractedWorkouts?: number | null;
  planName?: string | null;
};

type CareEvent = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail?: string | null;
  professorId?: string | null;
  professorName?: string | null;
  eventType: string;
  severity: string;
  status: string;
  source: string;
  title: string;
  description?: string | null;
  studentMessage?: string | null;
  professorMessage?: string | null;
  relatedWorkoutPlanName?: string | null;
  relatedWorkoutDate?: string | null;
  weekStart?: string | null;
  weekEnd?: string | null;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
  returnConfirmationSent?: boolean;
  commercialImpact?: CommercialImpact | null;
  createdAt: string;
};

type CarePermissions = {
  role: string;
  canManageEvents: boolean;
  readOnly: boolean;
  label: string;
};

function getEventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    FALTA_TEMPO: "Falta de tempo",
    EXERCICIO_DIFICIL: "Exercício difícil",
    DOR_DESCONFORTO: "Dor/desconforto",
    RELATO_DOR_DUVIDA: "Relato de dor no chat/dúvidas",
    PAUSA_POR_CUIDADO: "Pausa por cuidado",
    PAUSA_BAIXA_ADERENCIA: "Pausa por baixa adesão",
    NAO_ENTENDI: "Não entendi",
    DESMOTIVACAO: "Desmotivação",
    BAIXA_ADERENCIA: "Baixa aderência",
    OUTRO: "Outro motivo",
  };

  return labels[type] || type;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ABERTO: "Aberto",
    REQUER_REVISAO: "Requer revisão",
    EM_REVISAO: "Em revisão",
    RESOLVIDO: "Resolvido",
  };

  return labels[status] || status;
}

function getCareEventStatusLabel(event: CareEvent): string {
  if (["PAUSA_POR_CUIDADO", "PAUSA_BAIXA_ADERENCIA"].includes(event.eventType) && event.status === "EM_REVISAO") {
    return "Retomada solicitada";
  }

  if (event.eventType === "PAUSA_BAIXA_ADERENCIA" && event.status === "REQUER_REVISAO") {
    return "Aguardando pedido de retomada";
  }

  if (event.eventType === "PAUSA_POR_CUIDADO" && event.status === "REQUER_REVISAO") {
    return "Aguardando aptidão";
  }

  return getStatusLabel(event.status);
}

function getSeverityLabel(severity: string): string {
  const labels: Record<string, string> = {
    CUIDADO: "Cuidado crítico",
    REVISAO: "Revisão",
    ALERTA: "Alerta",
    ATENCAO: "Atenção",
  };

  return labels[severity] || severity;
}

function getSeverityStyle(severity: string): string {
  if (severity === "CUIDADO") {
    return "bg-red-500/10 text-red-400 border-red-500/20";
  }

  if (severity === "REVISAO") {
    return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  }

  return "bg-blue-500/10 text-blue-400 border-blue-500/20";
}

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

function formatMoney(valueInCents?: number | null): string {
  if (typeof valueInCents !== "number") return "-";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueInCents / 100);
}

function getContractTypeLabel(type?: string | null): string {
  if (type === "TRIAL") return "Experiência gratuita";
  if (type === "PAID") return "Plano pago";
  return type || "Sem contrato vinculado";
}

function getCommercialImpactStyle(status?: string | null): string {
  if (!status || status === "SEM_IMPACTO_ESPECIFICO") {
    return "border-[#ffffff10] bg-[#0a0a0a] text-[#a1a1a1]";
  }

  if (status.includes("EXPERIENCIA")) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  }

  if (status.includes("COMPENSACAO")) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-200";
  }

  return "border-blue-500/20 bg-blue-500/10 text-blue-200";
}

function getCommercialImpactLabel(event: CareEvent): string {
  const impact = event.commercialImpact;

  if (!impact?.applies) return "Sem impacto comercial específico";

  return impact.label || "Impacto comercial";
}

function buildContextForAi(event: CareEvent): string {
  return [
    "CONTEXTO DE CUIDADO DO ALUNO PARA APOIO NA PRÓXIMA MONTAGEM DE TREINO",
    "",
    `Aluno: ${event.studentName}`,
    `Tipo de sinal: ${getEventTypeLabel(event.eventType)}`,
    `Severidade: ${getSeverityLabel(event.severity)}`,
    `Status: ${getCareEventStatusLabel(event)}`,
    `Relato do aluno: ${event.description || "não informado"}`,
    `Mensagem sugerida ao professor: ${event.professorMessage || "não informada"}`,
    `Treino relacionado: ${event.relatedWorkoutPlanName || "não informado"}`,
    `Data do treino: ${event.relatedWorkoutDate ? formatDate(event.relatedWorkoutDate) : "não informada"}`,
    `Impacto comercial: ${getCommercialImpactLabel(event)}`,
    event.commercialImpact?.applies
      ? `Dias em pausa/impacto: ${event.commercialImpact.pauseDays || 0}. Regra: não conta como treino feito, falta ou baixa adesão comum.`
      : "",
    "",
    "Orientação para IA:",
    "- Não gere SQL.",
    "- Não substitua avaliação profissional.",
    "- Se houver pausa por cuidado, não montar/liberar treino normal enquanto o evento estiver aberto.",
    "- Se houver dor/desconforto, priorize segurança, regressão de exercício e revisão humana.",
    "- Se houver exercício difícil, sugira simplificação, menor volume, menor carga ou variação regressiva.",
    "- Se houver falta de tempo/desmotivação, sugira treino mais objetivo, curto e aderente.",
  ].join("\n");
}

export default function CuidadoAlunoPage() {
  const [events, setEvents] = useState<CareEvent[]>([]);
  const [status, setStatus] = useState("TODOS");
  const [search, setSearch] = useState("");
  const [resolutionNotesById, setResolutionNotesById] = useState<Record<string, string>>({});
  const [permissions, setPermissions] = useState<CarePermissions>({
    role: "",
    canManageEvents: false,
    readOnly: true,
    label: "Carregando permissões...",
  });
  const [loading, setLoading] = useState(true);
  const [signalsRecovered, setSignalsRecovered] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const canManageEvents = permissions.canManageEvents;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"CARE" | "PREFERENCES">("CARE");

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    setActiveTab(tab === "preferencias" ? "PREFERENCES" : "CARE");
  }, []);

  function changeTab(nextTab: "CARE" | "PREFERENCES") {
    setActiveTab(nextTab);
    router.replace(
      nextTab === "PREFERENCES"
        ? "/dashboard/cuidado-aluno?tab=preferencias"
        : "/dashboard/cuidado-aluno",
      { scroll: false }
    );
  }

  async function loadEvents() {
    setLoading(true);
    setMessage(null);

    try {
      await fetch("/api/student-message-signals/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 60 }),
      }).catch(() => null);
      setSignalsRecovered(true);

      const url = status === "TODOS" ? "/api/student-care-events" : `/api/student-care-events?status=${status}`;
      const res = await fetch(url, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);

      if (res.ok) {
        setEvents(Array.isArray(data?.events) ? data.events : []);
        setPermissions({
          role: String(data?.permissions?.role || ""),
          canManageEvents: Boolean(data?.permissions?.canManageEvents),
          readOnly: Boolean(data?.permissions?.readOnly ?? true),
          label: String(data?.permissions?.label || "Gestão visualiza; professor trata os eventos dos próprios alunos."),
        });
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao carregar cuidado dos alunos." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar cuidado dos alunos." });
    }

    setLoading(false);
  }

  useEffect(() => {
    loadEvents();
  }, [status]);

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return events;

    return events.filter((event) =>
      [
        event.studentName,
        event.studentEmail,
        event.professorName,
        event.title,
        event.description,
        event.eventType,
        event.severity,
        event.status,
        event.commercialImpact?.label,
        event.commercialImpact?.status,
        event.commercialImpact?.message,
        event.commercialImpact?.planName,
        event.commercialImpact?.contractType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [events, search]);

  const counters = useMemo(() => {
    return {
      total: events.length,
      cuidado: events.filter((event) => event.severity === "CUIDADO" && event.status !== "RESOLVIDO").length,
      revisar: events.filter((event) => event.status === "REQUER_REVISAO" || event.status === "EM_REVISAO").length,
      abertos: events.filter((event) => event.status === "ABERTO").length,
      comercial: events.filter((event) => event.commercialImpact?.applies).length,
    };
  }, [events]);

  async function updateEvent(event: CareEvent, nextStatus: string) {
    if (!canManageEvents) {
      setMessage({ type: "error", text: "A gestão visualiza os eventos, mas somente o professor responsável pode alterar o status." });
      return;
    }

    setSavingId(event.id);
    setMessage(null);

    try {
      const res = await fetch("/api/student-care-events", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: event.id,
          status: nextStatus,
          resolutionNotes: resolutionNotesById[event.id] || event.resolutionNotes || null,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        const adjustmentMessage = data?.commercialAdjustment?.message;
        setMessage({
          type: "success",
          text: adjustmentMessage
            ? `Evento atualizado com sucesso. ${adjustmentMessage}`
            : "Evento atualizado com sucesso.",
        });
        await loadEvents();
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao atualizar evento." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao atualizar evento." });
    }

    setSavingId(null);
  }

  async function sendReturnConfirmation(event: CareEvent) {
    if (!canManageEvents) {
      setMessage({ type: "error", text: "A gestão visualiza os eventos, mas somente o professor responsável pode confirmar a retomada." });
      return;
    }

    setSavingId(event.id);
    setMessage(null);

    try {
      const res = await fetch("/api/student-care-events", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: event.id,
          action: "SEND_RETURN_CONFIRMATION",
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({
          type: "success",
          text: data?.message || "Confirmação de retomada enviada ao aluno.",
        });
        await loadEvents();
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao enviar confirmação de retomada." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao enviar confirmação de retomada." });
    }

    setSavingId(null);
  }

  async function activateCarePause(event: CareEvent) {
    if (!canManageEvents) {
      setMessage({ type: "error", text: "A gestão visualiza os eventos, mas somente o professor responsável pode pausar treinos por cuidado." });
      return;
    }

    setSavingId(event.id);
    setMessage(null);

    const pauseReason = String(
      resolutionNotesById[event.id] ?? event.resolutionNotes ?? event.description ?? ""
    ).trim();

    try {
      const res = await fetch("/api/student-care-events", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: event.id,
          action: "ACTIVATE_CARE_PAUSE",
          pauseReason: pauseReason || event.description || null,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({
          type: "success",
          text: data?.message || "Treinos pausados por cuidado com sucesso.",
        });
        await loadEvents();
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao pausar treinos por cuidado." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao pausar treinos por cuidado." });
    }

    setSavingId(null);
  }

  async function saveEventNotes(event: CareEvent) {
    if (!canManageEvents) {
      setMessage({ type: "error", text: "A gestão visualiza os eventos, mas somente o professor responsável pode salvar anotações." });
      return;
    }

    setSavingId(event.id);
    setMessage(null);

    const resolutionNotes = String(
      resolutionNotesById[event.id] ?? event.resolutionNotes ?? ""
    ).trim();

    try {
      const res = await fetch("/api/student-care-events", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: event.id,
          status: event.status,
          resolutionNotes: resolutionNotes || null,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.event) {
        setEvents((current) =>
          current.map((item) => (item.id === event.id ? data.event : item))
        );
        setResolutionNotesById((current) => {
          const next = { ...current };
          delete next[event.id];
          return next;
        });
        setMessage({ type: "success", text: "Anotação salva. O evento continua com o mesmo status." });
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao salvar anotação." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao salvar anotação." });
    }

    setSavingId(null);
  }

  async function copyAiContext(event: CareEvent) {
    try {
      await navigator.clipboard.writeText(buildContextForAi(event));
      setMessage({ type: "success", text: "Contexto copiado para usar na IA." });
    } catch {
      setMessage({ type: "error", text: "Não foi possível copiar o contexto." });
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <p className="text-xs text-[#00A19C] uppercase tracking-[0.3em] mb-2">
            Experiência e retenção
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-[#00A19C]">
            Acompanhamento do Aluno
          </h1>
          <p className="text-sm text-[#a1a1a1] mt-2 max-w-4xl">
            Central única para acompanhar eventos de cuidado e preferências de treino. A conversa mantém o contexto humano; esta tela organiza as pendências que exigem decisão do professor.
          </p>
        </div>

        <Link
          href="/dashboard/indicadores-cuidado"
          className="inline-flex items-center justify-center rounded-xl bg-[#1a1a1a] border border-[#00A19C]/30 text-[#00A19C] px-4 py-3 text-sm font-semibold hover:border-[#00A19C] transition"
        >
          Ver indicadores comerciais
        </Link>
      </div>

      <div className="border-b border-[#ffffff10]">
        <div className="flex flex-wrap gap-6">
          <button
            type="button"
            onClick={() => changeTab("CARE")}
            className={`border-b-2 px-2 py-4 text-sm font-semibold transition ${
              activeTab === "CARE"
                ? "border-[#00A19C] text-[#00A19C]"
                : "border-transparent text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Eventos de cuidado
          </button>

          <button
            type="button"
            onClick={() => changeTab("PREFERENCES")}
            className={`border-b-2 px-2 py-4 text-sm font-semibold transition ${
              activeTab === "PREFERENCES"
                ? "border-[#00A19C] text-[#00A19C]"
                : "border-transparent text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Preferências de treino
          </button>
        </div>
      </div>

      {activeTab === "CARE" && (
        <div className="space-y-5">

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

      <div className={"rounded-xl px-4 py-3 text-xs border " + (canManageEvents ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-blue-500/10 text-blue-300 border-blue-500/20")}>
        {permissions.label}
      </div>

      <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Histórico</p>
            <p className="text-2xl font-bold text-[#f5f5f5]">{counters.total}</p>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Críticos ativos</p>
            <p className="text-2xl font-bold text-red-400">{counters.cuidado}</p>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Revisão</p>
            <p className="text-2xl font-bold text-yellow-400">{counters.revisar}</p>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Abertos</p>
            <p className="text-2xl font-bold text-blue-400">{counters.abertos}</p>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Impacto comercial</p>
            <p className="text-2xl font-bold text-amber-400">{counters.comercial}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por aluno, professor, tipo, relato ou status..."
            className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
          />

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
          >
            <option value="TODOS">Todos os status</option>
            <option value="ABERTO">Aberto</option>
            <option value="REQUER_REVISAO">Requer revisão</option>
            <option value="EM_REVISAO">Em revisão</option>
            <option value="RESOLVIDO">Resolvido</option>
          </select>

          <button
            type="button"
            onClick={loadEvents}
            disabled={loading}
            className="px-4 py-3 rounded-xl bg-[#1a1a1a] text-[#a1a1a1] hover:text-white border border-[#ffffff10] text-sm disabled:opacity-50"
          >
            Atualizar
          </button>
        </div>

        <div className="rounded-xl bg-[#00A19C]/10 border border-[#00A19C]/20 p-4">
          <p className="text-xs text-[#00A19C] font-semibold mb-1">
            Como usar
          </p>
          <p className="text-xs text-[#a1a1a1] leading-relaxed">
            Antes de montar ou liberar a próxima semana, veja se há eventos em aberto. Dor leve/desconforto entra como alerta; dor forte, torção, inchaço, tontura, falta de ar, formigamento, queda ou travamento entram como cuidado crítico. Pausa por cuidado aparece também com impacto comercial: não conta como treino feito, falta ou baixa adesão comum. Em experiência gratuita, o sistema preserva o período ao liberar retomada; em plano pago, registra avaliação comercial para a gestão.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-8 text-sm text-[#a1a1a1] text-center">
            Carregando eventos de cuidado...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-8 text-sm text-[#a1a1a1] text-center">
            Nenhum evento encontrado.
          </div>
        ) : (
          filteredEvents.map((event) => (
            <div
              key={event.id}
              className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4"
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`text-[10px] px-2 py-1 rounded-full border font-semibold ${getSeverityStyle(event.severity)}`}>
                      {getSeverityLabel(event.severity)}
                    </span>

                    <span className="text-[10px] px-2 py-1 rounded-full bg-[#1a1a1a] text-[#a1a1a1]">
                      {getCareEventStatusLabel(event)}
                    </span>

                    <span className="text-[10px] px-2 py-1 rounded-full bg-[#00A19C]/10 text-[#00A19C]">
                      {getEventTypeLabel(event.eventType)}
                    </span>
                  </div>

                  <h2 className="text-lg font-semibold text-[#f5f5f5]">
                    {event.studentName}
                  </h2>

                  <p className="text-xs text-[#a1a1a1] mt-1">
                    Professor: {event.professorName || "Não informado"} · Criado em {formatDate(event.createdAt)}
                  </p>

                  {["PAUSA_POR_CUIDADO", "PAUSA_BAIXA_ADERENCIA"].includes(event.eventType) && event.status === "EM_REVISAO" && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-green-300 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                        {event.eventType === "PAUSA_BAIXA_ADERENCIA"
                          ? "Aluno pediu para voltar. Converse pelo chat, combine uma programação possível e resolva o evento quando estiver pronto para montar a retomada."
                          : "Aluno sinalizou aptidão para retomar. Confirme as condições atuais pelo botão da tela e resolva o evento somente depois da resposta do aluno."}
                      </p>
                      {event.eventType === "PAUSA_POR_CUIDADO" && event.returnConfirmationSent ? (
                        <p className="text-xs text-[#4fd1cc] bg-[#00A19C]/10 border border-[#00A19C]/20 rounded-lg px-3 py-2">
                          A mensagem de confirmação já foi enviada pelo chat e encaminhada por e-mail. Aguarde a resposta do aluno antes de liberar a retomada.
                        </p>
                      ) : null}
                    </div>
                  )}

                  {event.relatedWorkoutPlanName && (
                    <p className="text-xs text-[#6b6b6b] mt-1">
                      Treino relacionado: {event.relatedWorkoutPlanName} · {formatDate(event.relatedWorkoutDate)}
                    </p>
                  )}

                  {event.commercialImpact?.applies && (
                    <div className={`mt-3 rounded-xl border px-3 py-3 text-xs ${getCommercialImpactStyle(event.commercialImpact.status)}`}>
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                        <div>
                          <p className="font-semibold">
                            {event.commercialImpact.label}
                          </p>
                          <p className="mt-1 leading-relaxed opacity-90">
                            {event.commercialImpact.message}
                          </p>
                        </div>
                        <div className="shrink-0 rounded-lg bg-black/20 px-2 py-1 text-[10px] font-semibold">
                          {event.commercialImpact.pauseDays || 0} dia(s) em pausa
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyAiContext(event)}
                    className="text-xs px-3 py-2 rounded-lg bg-[#1a1a1a] text-[#a1a1a1] hover:text-white border border-[#ffffff10]"
                  >
                    Copiar contexto IA
                  </button>

                  {canManageEvents && event.status !== "EM_REVISAO" && event.status !== "RESOLVIDO" && (
                    <button
                      type="button"
                      disabled={savingId === event.id}
                      onClick={() => updateEvent(event, "EM_REVISAO")}
                      className="text-xs px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                    >
                      Marcar em revisão
                    </button>
                  )}

                  {canManageEvents && event.eventType !== "PAUSA_POR_CUIDADO" && event.status !== "RESOLVIDO" && ["CUIDADO", "REVISAO"].includes(event.severity) && (
                    <button
                      type="button"
                      disabled={savingId === event.id}
                      onClick={() => activateCarePause(event)}
                      className="text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      Pausar treinos por cuidado
                    </button>
                  )}

                  {canManageEvents && event.eventType === "PAUSA_POR_CUIDADO" && event.status === "EM_REVISAO" && (
                    event.returnConfirmationSent ? (
                      <span className="text-xs px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        Confirmação enviada
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={savingId === event.id}
                        onClick={() => sendReturnConfirmation(event)}
                        className="text-xs px-3 py-2 rounded-lg bg-[#00A19C]/15 text-[#4fd1cc] border border-[#00A19C]/30 hover:bg-[#00A19C]/25 disabled:opacity-50"
                      >
                        {savingId === event.id ? "Enviando..." : "Confirmar condições para retomada"}
                      </button>
                    )
                  )}

                  {canManageEvents && event.status !== "RESOLVIDO" && (
                    <button
                      type="button"
                      disabled={savingId === event.id}
                      onClick={() => updateEvent(event, "RESOLVIDO")}
                      className="text-xs px-3 py-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20"
                    >
                      {["PAUSA_POR_CUIDADO", "PAUSA_BAIXA_ADERENCIA"].includes(event.eventType)
                        ? "Resolver e liberar retomada"
                        : "Resolver"}
                    </button>
                  )}

                  {!canManageEvents && event.status !== "RESOLVIDO" && (
                    <span className="text-xs px-3 py-2 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20">
                      Somente leitura
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] border border-[#ffffff10] rounded-xl p-4">
                  <p className="text-xs text-[#00A19C] font-semibold mb-2">
                    Relato do aluno
                  </p>
                  <p className="text-sm text-[#e5e5e5] leading-relaxed whitespace-pre-wrap">
                    {event.description || "Sem detalhe adicional."}
                  </p>
                </div>

                <div className="bg-[#0a0a0a] border border-[#ffffff10] rounded-xl p-4">
                  <p className="text-xs text-[#00A19C] font-semibold mb-2">
                    Leitura para o professor
                  </p>
                  <p className="text-sm text-[#e5e5e5] leading-relaxed whitespace-pre-wrap">
                    {event.professorMessage || "Sem mensagem registrada."}
                  </p>
                </div>
              </div>

              {event.commercialImpact?.applies && (
                <div className="bg-[#0a0a0a] border border-amber-500/20 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                    <div>
                      <p className="text-xs text-amber-300 font-semibold mb-1">
                        Visão comercial da pausa
                      </p>
                      <p className="text-sm text-[#e5e5e5] leading-relaxed">
                        {event.commercialImpact.managementAction || event.commercialImpact.message}
                      </p>
                    </div>
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-300">
                      {getContractTypeLabel(event.commercialImpact.contractType)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="rounded-lg bg-[#111] border border-[#ffffff10] p-2">
                      <p className="text-[8px] uppercase text-[#6b6b6b]">Plano/ciclo</p>
                      <p className="text-[10px] font-semibold text-[#e5e5e5]">
                        {event.commercialImpact.planName || getContractTypeLabel(event.commercialImpact.contractType)}
                      </p>
                    </div>

                    <div className="rounded-lg bg-[#111] border border-[#ffffff10] p-2">
                      <p className="text-[8px] uppercase text-[#6b6b6b]">Dias pausados</p>
                      <p className="text-[10px] font-semibold text-[#e5e5e5]">
                        {event.commercialImpact.pauseDays || 0} dia(s)
                      </p>
                    </div>

                    <div className="rounded-lg bg-[#111] border border-[#ffffff10] p-2">
                      <p className="text-[8px] uppercase text-[#6b6b6b]">Vigência</p>
                      <p className="text-[10px] font-semibold text-[#e5e5e5]">
                        {formatDateOnly(event.commercialImpact.contractStartDate)} a {formatDateOnly(event.commercialImpact.contractEndDate)}
                      </p>
                    </div>

                    <div className="rounded-lg bg-[#111] border border-[#ffffff10] p-2">
                      <p className="text-[8px] uppercase text-[#6b6b6b]">Valor</p>
                      <p className="text-[10px] font-semibold text-[#e5e5e5]">
                        {formatMoney(event.commercialImpact.contractPriceCents)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px]">
                    <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-2 text-green-300">
                      Não conta como treino feito
                    </div>
                    <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-2 text-green-300">
                      Não conta como falta
                    </div>
                    <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-2 text-green-300">
                      Não conta como baixa adesão comum
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <label className="text-xs text-[#a1a1a1]">
                    Anotação de resolução/revisão
                  </label>

                  {canManageEvents && (
                    <button
                      type="button"
                      disabled={savingId === event.id}
                      onClick={() => saveEventNotes(event)}
                      className="self-start sm:self-auto text-xs px-3 py-2 rounded-lg bg-[#00A19C]/15 text-[#4fd1cc] border border-[#00A19C]/30 hover:bg-[#00A19C]/25 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingId === event.id ? "Salvando..." : "Salvar anotação"}
                    </button>
                  )}
                </div>

                <textarea
                  value={resolutionNotesById[event.id] ?? event.resolutionNotes ?? ""}
                  onChange={(input) =>
                    setResolutionNotesById((current) => ({
                      ...current,
                      [event.id]: input.target.value,
                    }))
                  }
                  placeholder={canManageEvents ? "Ex.: treino revisado, carga reduzida, exercício substituído, aluno orientado..." : "Gestão visualiza este campo. Somente o professor responsável registra resolução/revisão."}
                  disabled={!canManageEvents}
                  className="w-full min-h-[80px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C] disabled:opacity-60 disabled:cursor-not-allowed"
                />

                {canManageEvents && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[11px] text-[#6b6b6b]">
                      Salvar a anotação não resolve o evento nem altera o status atual.
                    </p>
                    {event.eventType !== "PAUSA_POR_CUIDADO" && event.status !== "RESOLVIDO" && ["CUIDADO", "REVISAO"].includes(event.severity) ? (
                      <p className="text-[11px] text-red-300/80">
                        Se decidir interromper os próximos treinos até nova liberação, use o botão “Pausar treinos por cuidado”. O aluno será avisado e verá o botão para sinalizar retorno quando estiver apto(a).
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
        </div>
      )}

      {activeTab === "PREFERENCES" && (
        signalsRecovered ? (
          <StudentTrainingPreferencesPanel />
        ) : (
          <div className="rounded-xl border border-[#ffffff10] bg-[#111111] p-5 text-sm text-[#a1a1a1]">
            Atualizando os sinais recentes do chat...
          </div>
        )
      )}
    </div>
  );
}

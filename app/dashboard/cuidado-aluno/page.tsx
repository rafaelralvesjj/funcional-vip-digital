"use client";

import { useEffect, useMemo, useState } from "react";

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
    RELATO_DOR_DUVIDA: "Relato de dor no chat",
    PAUSA_POR_CUIDADO: "Pausa por cuidado",
    RELATO_DOR_DUVIDA: "Relato de dor no chat/dúvidas",
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

function buildContextForAi(event: CareEvent): string {
  return [
    "CONTEXTO DE CUIDADO DO ALUNO PARA APOIO NA PRÓXIMA MONTAGEM DE TREINO",
    "",
    `Aluno: ${event.studentName}`,
    `Tipo de sinal: ${getEventTypeLabel(event.eventType)}`,
    `Severidade: ${getSeverityLabel(event.severity)}`,
    `Status: ${getStatusLabel(event.status)}`,
    `Relato do aluno: ${event.description || "não informado"}`,
    `Mensagem sugerida ao professor: ${event.professorMessage || "não informada"}`,
    `Treino relacionado: ${event.relatedWorkoutPlanName || "não informado"}`,
    `Data do treino: ${event.relatedWorkoutDate ? formatDate(event.relatedWorkoutDate) : "não informada"}`,
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
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const canManageEvents = permissions.canManageEvents;

  async function loadEvents() {
    setLoading(true);
    setMessage(null);

    try {
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
        setMessage({ type: "success", text: "Evento atualizado com sucesso." });
        await loadEvents();
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao atualizar evento." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao atualizar evento." });
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
      <div>
        <p className="text-xs text-[#D4A373] uppercase tracking-[0.3em] mb-2">
          Experiência e retenção
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-[#D4A373]">
          Central de Cuidado do Aluno
        </h1>
        <p className="text-sm text-[#a1a1a1] mt-2 max-w-4xl">
          Aqui aparecem sinais importantes do aluno: treino difícil, dor/desconforto, falta de tempo,
          dúvida de execução, desmotivação e baixa aderência. O professor trata os alertas dos próprios alunos; a gestão acompanha em modo leitura.
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

      <div className={"rounded-xl px-4 py-3 text-xs border " + (canManageEvents ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-blue-500/10 text-blue-300 border-blue-500/20")}>
        {permissions.label}
      </div>

      <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por aluno, professor, tipo, relato ou status..."
            className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
          />

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
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

        <div className="rounded-xl bg-[#D4A373]/10 border border-[#D4A373]/20 p-4">
          <p className="text-xs text-[#D4A373] font-semibold mb-1">
            Como usar
          </p>
          <p className="text-xs text-[#a1a1a1] leading-relaxed">
            Antes de montar ou liberar a próxima semana, veja se há eventos em aberto. Dor leve/desconforto entra como alerta; dor forte, torção, inchaço, tontura, falta de ar, formigamento, queda ou travamento entram como cuidado crítico. Se relatou dificuldade, simplifique. Se relatou falta de tempo, reduza complexidade e aumente aderência. A IA apoia, mas o professor responsável valida e resolve os alertas; a gestão apenas acompanha.
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
                      {getStatusLabel(event.status)}
                    </span>

                    <span className="text-[10px] px-2 py-1 rounded-full bg-[#D4A373]/10 text-[#D4A373]">
                      {getEventTypeLabel(event.eventType)}
                    </span>
                  </div>

                  <h2 className="text-lg font-semibold text-[#f5f5f5]">
                    {event.studentName}
                  </h2>

                  <p className="text-xs text-[#a1a1a1] mt-1">
                    Professor: {event.professorName || "Não informado"} · Criado em {formatDate(event.createdAt)}
                  </p>

                  {event.relatedWorkoutPlanName && (
                    <p className="text-xs text-[#6b6b6b] mt-1">
                      Treino relacionado: {event.relatedWorkoutPlanName} · {formatDate(event.relatedWorkoutDate)}
                    </p>
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

                  {canManageEvents && event.status !== "RESOLVIDO" && (
                    <button
                      type="button"
                      disabled={savingId === event.id}
                      onClick={() => updateEvent(event, "RESOLVIDO")}
                      className="text-xs px-3 py-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20"
                    >
                      Resolver
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
                  <p className="text-xs text-[#D4A373] font-semibold mb-2">
                    Relato do aluno
                  </p>
                  <p className="text-sm text-[#e5e5e5] leading-relaxed whitespace-pre-wrap">
                    {event.description || "Sem detalhe adicional."}
                  </p>
                </div>

                <div className="bg-[#0a0a0a] border border-[#ffffff10] rounded-xl p-4">
                  <p className="text-xs text-[#D4A373] font-semibold mb-2">
                    Leitura para o professor
                  </p>
                  <p className="text-sm text-[#e5e5e5] leading-relaxed whitespace-pre-wrap">
                    {event.professorMessage || "Sem mensagem registrada."}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs text-[#a1a1a1] block mb-1">
                  Anotação de resolução/revisão
                </label>
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
                  className="w-full min-h-[80px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373] disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

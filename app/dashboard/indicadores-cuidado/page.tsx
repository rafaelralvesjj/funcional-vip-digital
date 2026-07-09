"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type IndicatorResponse = {
  ok: boolean;
  period: {
    days: number;
    startAt: string;
    generatedAt: string;
  };
  permissions: {
    role: string;
    canSeeAll: boolean;
    label: string;
  };
  cards: {
    totalEvents: number;
    criticalActiveEvents: number;
    reviewActiveEvents: number;
    openPauseEvents: number;
    openPausedStudents: number;
    returnRequested: number;
    waitingAptitude: number;
    trialToPreserve: number;
    paidCompensationPending: number;
    withoutContract: number;
    totalOpenPauseDays: number;
    avgOpenPauseDays: number;
    resolvedPausesInPeriod: number;
    trialExtendedInPeriod: number;
    paidReviewsRegisteredInPeriod: number;
  };
  breakdown: {
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    byContractType: Record<string, number>;
    byProfessor: Record<string, number>;
  };
  openPauses: PauseEvent[];
  resolvedPauses: PauseEvent[];
  lifecycleEvents: LifecycleEvent[];
  managementGuidance: string[];
};

type PauseEvent = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail?: string | null;
  professorName?: string | null;
  eventType: string;
  severity: string;
  status: string;
  statusLabel: string;
  title: string;
  description?: string | null;
  professorMessage?: string | null;
  createdAt?: string | null;
  resolvedAt?: string | null;
  pauseDays: number;
  commercialImpact?: {
    applies: boolean;
    status: string;
    label: string;
    managementAction: string;
    contractId?: string | null;
    contractType?: string | null;
    contractTypeLabel?: string | null;
    contractStatus?: string | null;
    contractCommercialStatus?: string | null;
    contractStartDate?: string | null;
    contractEndDate?: string | null;
    contractPriceCents?: number | null;
    workoutsPerWeek?: number | null;
    workoutsPerMonth?: number | null;
    planName?: string | null;
  } | null;
};

type LifecycleEvent = {
  id: string;
  eventType: string;
  eventKey: string;
  channel: string;
  createdAt?: string | null;
  studentName: string;
  contractTypeLabel?: string | null;
  contractEndDate?: string | null;
};

function formatDate(value?: string | null): string {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(valueInCents?: number | null): string {
  if (typeof valueInCents !== "number") return "-";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueInCents / 100);
}

function getStatusStyle(status: string): string {
  if (status === "EM_REVISAO") return "bg-green-500/10 text-green-400 border-green-500/20";
  if (status === "REQUER_REVISAO") return "bg-red-500/10 text-red-400 border-red-500/20";
  if (status === "RESOLVIDO") return "bg-[#1a1a1a] text-[#a1a1a1] border-[#ffffff10]";

  return "bg-blue-500/10 text-blue-400 border-blue-500/20";
}

function getCommercialStyle(status?: string | null): string {
  const normalized = String(status || "").toUpperCase();

  if (normalized.includes("EXPERIENCIA")) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (normalized.includes("COMPENSACAO")) return "bg-amber-500/10 text-amber-300 border-amber-500/20";

  return "bg-blue-500/10 text-blue-300 border-blue-500/20";
}

function humanizeKey(key: string): string {
  const labels: Record<string, string> = {
    ABERTO: "Aberto",
    REQUER_REVISAO: "Requer revisão",
    EM_REVISAO: "Retomada solicitada / em revisão",
    RESOLVIDO: "Resolvido",
    PAUSA_POR_CUIDADO: "Pausa por cuidado",
    DOR_DESCONFORTO: "Dor/desconforto",
    RELATO_DOR_DUVIDA: "Relato de dor no chat",
    EXERCICIO_DIFICIL: "Exercício difícil",
    FALTA_TEMPO: "Falta de tempo",
    NAO_ENTENDI: "Não entendi",
    DESMOTIVACAO: "Desmotivação",
    BAIXA_ADERENCIA: "Baixa aderência",
    OUTRO: "Outro",
    TRIAL_EXTENDED_BY_CARE_PAUSE: "Experiência prorrogada",
    PAID_CARE_PAUSE_COMPENSATION_REVIEW: "Avaliação comercial registrada",
  };

  return labels[key] || key.replaceAll("_", " ").toLowerCase();
}

function sortedEntries(map?: Record<string, number>): [string, number][] {
  return Object.entries(map || {}).sort((a, b) => b[1] - a[1]);
}

function buildManagementSummary(data: IndicatorResponse): string {
  return [
    "RELATÓRIO DE CUIDADO E IMPACTO COMERCIAL — FUNCIONAL VIP DIGITAL",
    "",
    `Período considerado: últimos ${data.period.days} dias, mantendo pausas em aberto mesmo que tenham iniciado antes.`,
    `Gerado em: ${formatDateTime(data.period.generatedAt)}`,
    `Visão: ${data.permissions.label}`,
    "",
    "Indicadores principais:",
    `- Alunos atualmente pausados por cuidado: ${data.cards.openPausedStudents}`,
    `- Eventos de pausa por cuidado em aberto: ${data.cards.openPauseEvents}`,
    `- Retomadas solicitadas aguardando professor: ${data.cards.returnRequested}`,
    `- Experiências gratuitas a preservar: ${data.cards.trialToPreserve}`,
    `- Planos pagos com avaliação comercial pendente: ${data.cards.paidCompensationPending}`,
    `- Dias totais em pausa aberta: ${data.cards.totalOpenPauseDays}`,
    `- Média de dias por pausa aberta: ${data.cards.avgOpenPauseDays}`,
    `- Experiências prorrogadas no período: ${data.cards.trialExtendedInPeriod}`,
    `- Avaliações comerciais registradas no período: ${data.cards.paidReviewsRegisteredInPeriod}`,
    "",
    "Regras de leitura:",
    ...data.managementGuidance.map((item) => `- ${item}`),
    "",
    "Pausas abertas:",
    ...(data.openPauses.length
      ? data.openPauses.map((event) =>
          `- ${event.studentName} | ${event.statusLabel} | ${event.pauseDays} dia(s) | ${event.commercialImpact?.label || "Sem impacto"} | Professor: ${event.professorName || "não informado"}`
        )
      : ["- Nenhuma pausa aberta no momento."]),
  ].join("\n");
}

export default function IndicadoresCuidadoPage() {
  const [data, setData] = useState<IndicatorResponse | null>(null);
  const [periodDays, setPeriodDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(true);

  async function loadIndicators() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/student-care-events/indicators?days=${periodDays}`, {
        cache: "no-store",
      });
      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Erro ao carregar indicadores.");
      }

      setData(json);
    } catch (error) {
      setData(null);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Erro ao carregar indicadores.",
      });
    }

    setLoading(false);
  }

  useEffect(() => {
    loadIndicators();
  }, [periodDays]);

  const pausesToShow = useMemo(() => {
    if (!data) return [];

    return onlyOpen ? data.openPauses : [...data.openPauses, ...data.resolvedPauses];
  }, [data, onlyOpen]);

  async function copySummary() {
    if (!data) return;

    try {
      await navigator.clipboard.writeText(buildManagementSummary(data));
      setMessage({ type: "success", text: "Resumo executivo copiado." });
    } catch {
      setMessage({ type: "error", text: "Não foi possível copiar o resumo." });
    }
  }

  function downloadReport() {
    if (!data) return;

    const blob = new Blob([buildManagementSummary(data)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `relatorio-cuidado-comercial-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <p className="text-xs text-[#D4A373] uppercase tracking-[0.3em] mb-2">
            Gestão e indicadores
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-[#D4A373]">
            Indicadores de cuidado e impacto comercial
          </h1>
          <p className="text-sm text-[#a1a1a1] mt-2 max-w-4xl">
            Consolida alunos em pausa por cuidado, dias parados, experiências a preservar e planos pagos que precisam de decisão comercial. A gestão enxerga tudo; professores enxergam seus próprios alunos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/cuidado-aluno"
            className="inline-flex rounded-xl border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm font-semibold text-[#a1a1a1] hover:text-white"
          >
            Voltar para Central de Cuidado
          </Link>
          <button
            type="button"
            onClick={loadIndicators}
            disabled={loading}
            className="inline-flex rounded-xl border border-[#D4A373]/30 bg-[#D4A373]/10 px-4 py-3 text-sm font-semibold text-[#D4A373] disabled:opacity-50"
          >
            Atualizar
          </button>
        </div>
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

      <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-xs text-blue-300">
        {data?.permissions?.label || "Carregando permissões..."}
      </div>

      <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#f5f5f5]">Recorte do relatório</p>
            <p className="text-xs text-[#a1a1a1] mt-1">
              Pausas abertas sempre aparecem, mesmo que tenham começado antes do período escolhido.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[7, 30, 60, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setPeriodDays(days)}
                className={
                  "rounded-lg px-3 py-2 text-xs font-semibold border " +
                  (periodDays === days
                    ? "bg-[#D4A373] text-[#0a0a0a] border-[#D4A373]"
                    : "bg-[#1a1a1a] text-[#a1a1a1] border-[#ffffff10] hover:text-white")
                }
              >
                {days} dias
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] p-8 text-center text-sm text-[#a1a1a1]">
            Carregando indicadores...
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard title="Alunos pausados" value={data.cards.openPausedStudents} tone="red" subtitle="pausa aberta" />
              <MetricCard title="Retomadas solicitadas" value={data.cards.returnRequested} tone="green" subtitle="aguardando professor" />
              <MetricCard title="Experiências a preservar" value={data.cards.trialToPreserve} tone="emerald" subtitle="gratuitas" />
              <MetricCard title="Compensações pendentes" value={data.cards.paidCompensationPending} tone="amber" subtitle="planos pagos" />
              <MetricCard title="Dias pausados" value={data.cards.totalOpenPauseDays} tone="blue" subtitle="total em aberto" />
              <MetricCard title="Média de dias" value={data.cards.avgOpenPauseDays} tone="blue" subtitle="por pausa aberta" />
              <MetricCard title="Críticos ativos" value={data.cards.criticalActiveEvents} tone="red" subtitle="todos os sinais" />
              <MetricCard title="Revisões ativas" value={data.cards.reviewActiveEvents} tone="amber" subtitle="requer/em revisão" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <BreakdownCard title="Por status" items={sortedEntries(data.breakdown.byStatus)} />
              <BreakdownCard title="Por tipo de evento" items={sortedEntries(data.breakdown.byType)} />
              <BreakdownCard title="Por tipo de ciclo" items={sortedEntries(data.breakdown.byContractType)} />
            </div>

            <div className="rounded-xl border border-[#D4A373]/20 bg-[#D4A373]/10 p-4">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#D4A373]">Leitura executiva</p>
                  <div className="mt-2 space-y-1 text-xs leading-relaxed text-[#a1a1a1]">
                    {data.managementGuidance.map((item) => (
                      <p key={item}>• {item}</p>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={copySummary}
                    className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-xs font-semibold text-[#a1a1a1] hover:text-white border border-[#ffffff10]"
                  >
                    Copiar resumo
                  </button>
                  <button
                    type="button"
                    onClick={downloadReport}
                    className="rounded-lg bg-[#D4A373] px-3 py-2 text-xs font-semibold text-[#0a0a0a]"
                  >
                    Baixar .txt
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center text-sm text-red-300">
            Não foi possível carregar os indicadores.
          </div>
        )}
      </div>

      {data && (
        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#f5f5f5]">Pausas por cuidado</h2>
              <p className="text-xs text-[#a1a1a1] mt-1">
                Lista operacional para professor e gestão priorizarem retomada segura e decisão comercial.
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#a1a1a1]">
              <input
                type="checkbox"
                checked={onlyOpen}
                onChange={(event) => setOnlyOpen(event.target.checked)}
              />
              Mostrar somente abertas
            </label>
          </div>

          {pausesToShow.length === 0 ? (
            <div className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] p-8 text-center text-sm text-[#a1a1a1]">
              Nenhuma pausa por cuidado encontrada.
            </div>
          ) : (
            <div className="space-y-3">
              {pausesToShow.map((event) => (
                <div key={event.id} className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] p-4 space-y-3">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${getStatusStyle(event.status)}`}>
                          {event.statusLabel}
                        </span>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${getCommercialStyle(event.commercialImpact?.status)}`}>
                          {event.commercialImpact?.label || "Impacto comercial"}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-[#f5f5f5]">{event.studentName}</h3>
                      <p className="text-xs text-[#a1a1a1] mt-1">
                        Professor: {event.professorName || "Não informado"} · Início: {formatDateTime(event.createdAt)} · {event.pauseDays} dia(s) em pausa
                      </p>
                    </div>

                    <div className="rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-xs text-[#e5e5e5]">
                      {event.commercialImpact?.contractTypeLabel || "Sem contrato"}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <InfoItem label="Plano" value={event.commercialImpact?.planName || event.commercialImpact?.contractTypeLabel || "-"} />
                    <InfoItem label="Vigência" value={`${formatDate(event.commercialImpact?.contractStartDate)} a ${formatDate(event.commercialImpact?.contractEndDate)}`} />
                    <InfoItem label="Valor" value={formatMoney(event.commercialImpact?.contractPriceCents)} />
                    <InfoItem label="Treinos" value={event.commercialImpact?.workoutsPerMonth ? `${event.commercialImpact.workoutsPerMonth}/mês` : "-"} />
                    <InfoItem label="Dias pausados" value={`${event.pauseDays} dia(s)`} />
                  </div>

                  <div className="rounded-lg border border-[#ffffff10] bg-[#0a0a0a] p-3">
                    <p className="text-[10px] font-semibold text-[#D4A373]">Ação recomendada</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#e5e5e5]">
                      {event.commercialImpact?.managementAction || "Avaliar manualmente."}
                    </p>
                  </div>

                  {event.description && (
                    <p className="text-xs leading-relaxed text-[#a1a1a1]">
                      <span className="text-[#D4A373] font-semibold">Relato:</span> {event.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {data && data.lifecycleEvents.length > 0 && (
        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-3">
          <h2 className="text-lg font-bold text-[#f5f5f5]">Registros comerciais do período</h2>
          <div className="space-y-2">
            {data.lifecycleEvents.map((event) => (
              <div key={event.id} className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] p-3 text-xs text-[#e5e5e5]">
                <p className="font-semibold text-[#D4A373]">{humanizeKey(event.eventType)}</p>
                <p className="mt-1 text-[#a1a1a1]">
                  {event.studentName} · {event.contractTypeLabel || "Contrato"} · registrado em {formatDateTime(event.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, subtitle, tone }: { title: string; value: number; subtitle: string; tone: "red" | "green" | "emerald" | "amber" | "blue" }) {
  const styles: Record<typeof tone, string> = {
    red: "text-red-400",
    green: "text-green-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    blue: "text-blue-400",
  };

  return (
    <div className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] p-4">
      <p className="text-[10px] uppercase tracking-wide text-[#6b6b6b]">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${styles[tone]}`}>{value}</p>
      <p className="mt-1 text-[10px] text-[#6b6b6b]">{subtitle}</p>
    </div>
  );
}

function BreakdownCard({ title, items }: { title: string; items: [string, number][] }) {
  return (
    <div className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] p-4">
      <p className="text-sm font-semibold text-[#f5f5f5]">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-[#6b6b6b]">Sem dados.</p>
        ) : (
          items.slice(0, 6).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-[#a1a1a1] truncate">{humanizeKey(key)}</span>
              <span className="rounded-full bg-[#0a0a0a] px-2 py-1 font-semibold text-[#D4A373]">{value}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#ffffff10] bg-[#111] p-2">
      <p className="text-[8px] uppercase tracking-wide text-[#6b6b6b]">{label}</p>
      <p className="mt-0.5 text-[10px] font-semibold text-[#e5e5e5]">{value}</p>
    </div>
  );
}

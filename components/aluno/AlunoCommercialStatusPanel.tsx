"use client";

import { useEffect, useState } from "react";

type DashboardSummary = {
  student: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    commercialStatus: string;
  };
  currentCycle: {
    id: string;
    type: string;
    status: string;
    commercialStatus: string;
    startDate: string;
    endDate: string;
    daysLeft: number;
    daysUntilStart?: number | null;
    workoutsPerWeek: number;
    workoutsPerMonth: number;
    totalContractedWorkouts: number;
    priceCents: number;
    planName: string | null;
  } | null;
  professor: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  payment: {
    id: string;
    status: string;
    dueDate: string;
    paidAt: string | null;
    amountCents: number;
    method: string | null;
    paymentLinkUrl: string | null;
  } | null;
  currentCarePause?: {
    id: string;
    eventType: string;
    severity: string;
    status: string;
    title: string;
    description: string | null;
    studentMessage: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  commercialImpact?: {
    status: "SEM_IMPACTO" | "CONGELAR_EXPERIENCIA" | "AVALIAR_COMPENSACAO";
    affectsTrainingDelivery: boolean;
    countsAsCompletedWorkout: boolean;
    countsAsAbsence: boolean;
    recommendedAction: string | null;
    preservedTrialDays: number | null;
    message: string | null;
  };
  flags: {
    isTrial: boolean;
    isPaid: boolean;
    isAwaitingPayment: boolean;
    isWithoutActiveContract: boolean;
    isTrainingBlocked: boolean;
    hasProfessor: boolean;
    hasPaymentIssue: boolean;
    hasOpenCarePause?: boolean;
    hasCarePauseAwaitingReturn?: boolean;
    hasCarePauseUnderReview?: boolean;
    shouldEvaluateCommercialCompensation?: boolean;
    isTrialScheduledToStart?: boolean;
    daysUntilTrialStart?: number | null;
  };
  uiState:
    | "EXPERIENCIA_ATIVA"
    | "CONTRATO_ATIVO"
    | "PAUSA_POR_CUIDADO"
    | "EXPERIENCIA_AGENDADA"
    | "AGUARDANDO_PAGAMENTO"
    | "AGUARDANDO_VINCULO_PROFESSOR"
    | "SUSPENSO_POR_PAGAMENTO"
    | "SEM_CONTRATO_ATIVO";
  hasActiveAccess: boolean;
  shouldBlockTraining: boolean;
  title: string;
  message: string;
  actionLabel: string | null;
};

type RequestState = "idle" | "loading" | "success" | "error";

function formatDate(value?: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMoney(valueInCents?: number | null) {
  if (typeof valueInCents !== "number") return "—";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueInCents / 100);
}

function getCycleLabel(summary: DashboardSummary) {
  if (!summary.currentCycle) return "Sem ciclo ativo";
  if (summary.currentCycle.type === "TRIAL") return "Experiência gratuita";
  if (summary.currentCycle.type === "PAID") return "Plano pago";
  return summary.currentCycle.type;
}

function getStatusTitle(summary: DashboardSummary) {
  if (summary.uiState === "PAUSA_POR_CUIDADO") return "Treinos pausados por cuidado";
  if (summary.uiState === "EXPERIENCIA_AGENDADA") return "Experiência agendada para início seguro";
  if (summary.uiState === "EXPERIENCIA_ATIVA") return "Experiência gratuita ativa";
  if (summary.uiState === "AGUARDANDO_VINCULO_PROFESSOR") return "Experiência ativa, aguardando professor";
  if (summary.uiState === "CONTRATO_ATIVO") return "Plano ativo";
  if (summary.uiState === "AGUARDANDO_PAGAMENTO") return "Aguardando pagamento";
  if (summary.uiState === "SUSPENSO_POR_PAGAMENTO") return "Acesso suspenso por pagamento";
  return "Sem contrato ativo";
}

function getCarePauseStatusLabel(status?: string | null) {
  const normalized = String(status || "").toUpperCase();

  if (normalized === "EM_REVISAO") return "Retomada solicitada, aguardando professor";
  if (normalized === "REQUER_REVISAO") return "Aguardando sinalização de retomada";
  if (normalized === "ABERTO") return "Pausa aberta";

  return normalized || "Pausa aberta";
}

export function AlunoCommercialStatusPanel() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestStatus, setRequestStatus] = useState<RequestState>("idle");
  const [requestMessage, setRequestMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      try {
        const response = await fetch("/api/aluno/dashboard-summary", {
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);

        if (!active) return;

        if (response.ok && data?.summary) {
          setSummary(data.summary);
        }
      } catch {
        // Se o resumo falhar, a tela antiga do aluno continua funcionando normalmente.
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSummary();

    return () => {
      active = false;
    };
  }, []);

  async function handleContinueTrial() {
    setRequestStatus("loading");
    setRequestMessage(null);

    try {
      const response = await fetch("/api/aluno/continuar-experiencia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível registrar seu interesse agora.");
      }

      setRequestStatus("success");
      setRequestMessage(
        data.alreadyRequested
          ? "Seu interesse em continuar já estava registrado. A equipe irá acompanhar seu pedido."
          : data.message || "Recebemos seu interesse em continuar. A equipe irá acompanhar seu pedido."
      );
    } catch (error) {
      setRequestStatus("error");
      setRequestMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar seu interesse agora. Tente novamente mais tarde."
      );
    }
  }

  if (loading) {
    return (
      <section className="bg-[#111] border border-[#ffffff10] rounded-xl p-3">
        <p className="text-[11px] text-[#a1a1a1]">Carregando acompanhamento...</p>
      </section>
    );
  }

  if (!summary) return null;

  const cycle = summary.currentCycle;
  const isCarePause = summary.uiState === "PAUSA_POR_CUIDADO" || Boolean(summary.flags?.hasOpenCarePause);
  const isTrialScheduled = summary.uiState === "EXPERIENCIA_AGENDADA" || Boolean(summary.flags?.isTrialScheduledToStart);
  const canRequestTrialContinuation =
    summary.flags?.isTrial &&
    Boolean(cycle) &&
    !isCarePause &&
    !isTrialScheduled &&
    summary.uiState !== "SEM_CONTRATO_ATIVO" &&
    summary.uiState !== "SUSPENSO_POR_PAGAMENTO";

  const isButtonDisabled = requestStatus === "loading" || requestStatus === "success";

  return (
    <section className="rounded-xl border border-[#ffffff10] bg-[#111] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#00A19C]">
            Meu acompanhamento
          </p>
          <h2 className="mt-0.5 text-[13px] font-bold leading-snug text-[#f5f5f5]">
            {getStatusTitle(summary)}
          </h2>
        </div>

        {cycle && (
          <div className="shrink-0 rounded-full border border-[#ffffff10] bg-[#1a1a1a] px-2.5 py-1 text-[9px] text-[#e5e5e5]">
            {isTrialScheduled && (cycle.daysUntilStart || summary.flags?.daysUntilTrialStart)
              ? `Começa em ${cycle.daysUntilStart || summary.flags?.daysUntilTrialStart} dia(s)`
              : cycle.daysLeft >= 0
                ? `${cycle.daysLeft} dia(s)`
                : "Vencido"}
          </div>
        )}
      </div>

      <p className="mt-1.5 text-[10px] leading-relaxed text-[#9a9a9a]">
        {summary.message}
      </p>

      {isTrialScheduled && (
        <div className="mt-2 rounded-lg border border-[#00A19C]/20 bg-[#00A19C]/10 px-2.5 py-2">
          <p className="text-[10px] font-semibold text-[#00A19C]">
            Início na próxima janela segura
          </p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            <InfoItem label="Início" value={formatDate(cycle?.startDate)} />
            <InfoItem label="Vencimento" value={formatDate(cycle?.endDate)} />
            <InfoItem label="Treinos" value="Semana segura" />
          </div>
        </div>
      )}

      {isCarePause && (
        <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-2">
          <p className="text-[10px] font-semibold text-red-300">Pausa por cuidado ativa</p>
          <p className="mt-0.5 text-[9px] leading-relaxed text-red-100/75">
            Aguarde a liberação do professor antes de retomar os treinos.
          </p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            <InfoItem label="Status" value={getCarePauseStatusLabel(summary.currentCarePause?.status)} />
            <InfoItem
              label="Impacto"
              value={summary.commercialImpact?.status === "CONGELAR_EXPERIENCIA" ? "Preservar ciclo" : "Em avaliação"}
            />
            <InfoItem label="Treinos" value="Pausados" />
          </div>
        </div>
      )}

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <InfoItem label="Ciclo" value={getCycleLabel(summary)} />
        <InfoItem label="Vencimento" value={formatDate(cycle?.endDate)} />
        <InfoItem label="Professor" value={summary.professor?.name || "Aguardando"} />
        <InfoItem
          label="Treinos"
          value={cycle ? `${cycle.totalContractedWorkouts} · ${cycle.workoutsPerWeek}/sem` : "—"}
        />
      </div>

      {summary.payment && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-2.5 py-2 text-[9px] text-[#bdbdbd]">
          <span><strong className="text-[#f5f5f5]">Pagamento:</strong> {summary.payment.status}</span>
          <span><strong className="text-[#f5f5f5]">Vence:</strong> {formatDate(summary.payment.dueDate)}</span>
          <span><strong className="text-[#f5f5f5]">Valor:</strong> {formatMoney(summary.payment.amountCents)}</span>
          {summary.payment.paymentLinkUrl && summary.payment.status !== "PAGO" && (
            <a
              href={summary.payment.paymentLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto rounded-md bg-[#00A19C] px-2.5 py-1 text-[9px] font-semibold text-[#0a0a0a]"
            >
              Pagar
            </a>
          )}
        </div>
      )}

      {canRequestTrialContinuation && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-emerald-300">Gostou da experiência?</p>
            <p className="mt-0.5 text-[9px] leading-snug text-emerald-100/75">
              Avise a equipe que deseja continuar.
            </p>
          </div>

          <button
            type="button"
            onClick={handleContinueTrial}
            disabled={isButtonDisabled}
            className="shrink-0 rounded-lg bg-[#00A19C] px-3 py-1.5 text-[10px] font-semibold text-[#0a0a0a] disabled:opacity-60"
          >
            {requestStatus === "loading"
              ? "Enviando..."
              : requestStatus === "success"
                ? "Registrado"
                : "Quero continuar"}
          </button>
        </div>
      )}

      {requestMessage && (
        <p className={"mt-1.5 text-[9px] leading-relaxed " + (requestStatus === "error" ? "text-red-300" : "text-emerald-200")}>
          {requestMessage}
        </p>
      )}
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[#ffffff0d] bg-[#1a1a1a] px-2 py-1.5">
      <p className="truncate text-[7px] uppercase tracking-wide text-[#6b6b6b]">{label}</p>
      <p className="mt-0.5 truncate text-[9px] font-semibold text-[#e5e5e5]" title={value}>
        {value}
      </p>
    </div>
  );
}

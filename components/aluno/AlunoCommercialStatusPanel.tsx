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
  flags: {
    isTrial: boolean;
    isPaid: boolean;
    isAwaitingPayment: boolean;
    isWithoutActiveContract: boolean;
    isTrainingBlocked: boolean;
    hasProfessor: boolean;
    hasPaymentIssue: boolean;
  };
  uiState:
    | "EXPERIENCIA_ATIVA"
    | "CONTRATO_ATIVO"
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
  if (summary.uiState === "EXPERIENCIA_ATIVA") return "Experiência gratuita ativa";
  if (summary.uiState === "AGUARDANDO_VINCULO_PROFESSOR") return "Experiência ativa, aguardando professor";
  if (summary.uiState === "CONTRATO_ATIVO") return "Plano ativo";
  if (summary.uiState === "AGUARDANDO_PAGAMENTO") return "Aguardando pagamento";
  if (summary.uiState === "SUSPENSO_POR_PAGAMENTO") return "Acesso suspenso por pagamento";
  return "Sem contrato ativo";
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
  const canRequestTrialContinuation =
    summary.flags?.isTrial &&
    Boolean(cycle) &&
    summary.uiState !== "SEM_CONTRATO_ATIVO" &&
    summary.uiState !== "SUSPENSO_POR_PAGAMENTO";

  const isButtonDisabled = requestStatus === "loading" || requestStatus === "success";

  return (
    <section className="bg-[#111] border border-[#ffffff10] rounded-xl p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-[0.18em] text-[#D4A373] font-semibold">
            Meu acompanhamento
          </p>
          <h2 className="mt-1 text-sm font-bold text-[#f5f5f5]">
            {getStatusTitle(summary)}
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-[#a1a1a1]">
            {summary.message}
          </p>
        </div>

        {cycle && (
          <div className="shrink-0 rounded-full border border-[#ffffff10] bg-[#1a1a1a] px-3 py-1 text-[10px] text-[#e5e5e5]">
            {cycle.daysLeft >= 0 ? `${cycle.daysLeft} dia(s) restante(s)` : "Ciclo vencido"}
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
        <InfoItem label="Ciclo" value={getCycleLabel(summary)} />
        <InfoItem label="Vencimento" value={formatDate(cycle?.endDate)} />
        <InfoItem label="Professor" value={summary.professor?.name || "Aguardando vínculo"} />
        <InfoItem
          label="Treinos"
          value={cycle ? `${cycle.totalContractedWorkouts} no ciclo · ${cycle.workoutsPerWeek}/semana` : "—"}
        />
      </div>

      {summary.payment && (
        <div className="mt-3 rounded-lg border border-[#ffffff10] bg-[#0a0a0a] p-3">
          <p className="text-[10px] font-semibold text-[#f5f5f5]">Pagamento</p>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <InfoItem label="Status" value={summary.payment.status} />
            <InfoItem label="Vencimento" value={formatDate(summary.payment.dueDate)} />
            <InfoItem label="Valor" value={formatMoney(summary.payment.amountCents)} />
          </div>

          {summary.payment.paymentLinkUrl && summary.payment.status !== "PAGO" && (
            <a
              href={summary.payment.paymentLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex rounded-lg bg-[#D4A373] px-3 py-1.5 text-[11px] font-semibold text-[#0a0a0a]"
            >
              Ir para pagamento
            </a>
          )}
        </div>
      )}

      {canRequestTrialContinuation && (
        <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
          <p className="text-[11px] font-semibold text-emerald-300">
            Gostou da experiência?
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-emerald-100/80">
            Clique em “Quero continuar” para avisar a equipe que deseja seguir com um plano pago.
          </p>

          <button
            type="button"
            onClick={handleContinueTrial}
            disabled={isButtonDisabled}
            className="mt-2 rounded-lg bg-[#D4A373] px-3 py-1.5 text-[11px] font-semibold text-[#0a0a0a] disabled:opacity-60"
          >
            {requestStatus === "loading"
              ? "Enviando..."
              : requestStatus === "success"
                ? "Interesse registrado"
                : "Quero continuar"}
          </button>

          {requestMessage && (
            <p className={"mt-2 text-[10px] leading-relaxed " + (requestStatus === "error" ? "text-red-300" : "text-emerald-200")}>
              {requestMessage}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] p-2">
      <p className="text-[8px] uppercase tracking-wide text-[#6b6b6b]">{label}</p>
      <p className="mt-0.5 text-[10px] font-semibold text-[#e5e5e5]">{value}</p>
    </div>
  );
}

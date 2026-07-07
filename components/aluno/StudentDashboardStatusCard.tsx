import type { StudentDashboardSummary } from "@/lib/student-dashboard-summary";

type Props = {
  summary: NonNullable<StudentDashboardSummary>;
};

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

function formatCurrency(valueInCents: number | null | undefined) {
  if (typeof valueInCents !== "number") return "—";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueInCents / 100);
}

function getStatusContent(summary: NonNullable<StudentDashboardSummary>) {
  const cycle = summary.currentCycle;

  if (!cycle || summary.uiState === "SEM_CONTRATO_ATIVO") {
    return {
      title: "Você está sem contrato ativo no momento",
      description:
        "Para continuar treinando com acompanhamento, fale com a equipe ou escolha um novo plano.",
      tone: "warning",
    };
  }

  if (summary.uiState === "AGUARDANDO_PAGAMENTO") {
    return {
      title: "Seu plano está aguardando pagamento",
      description:
        "Assim que o pagamento for confirmado, seu contrato será ativado e o acompanhamento seguirá normalmente.",
      tone: "warning",
    };
  }

  if (summary.uiState === "AGUARDANDO_VINCULO_PROFESSOR") {
    return {
      title:
        cycle.type === "TRIAL"
          ? "Sua experiência gratuita está ativa"
          : "Seu ciclo está ativo, aguardando professor",
      description:
        "Estamos vinculando um professor ao seu acompanhamento. Em breve seus treinos serão organizados.",
      tone: "info",
    };
  }

  if (summary.uiState === "EXPERIENCIA_ATIVA") {
    return {
      title: "Sua experiência gratuita está ativa",
      description:
        "Aproveite este período para conhecer o acompanhamento e testar a rotina de treinos.",
      tone: "success",
    };
  }

  if (summary.uiState === "CONTRATO_ATIVO") {
    return {
      title: "Seu plano está ativo",
      description:
        "Seu acompanhamento está liberado conforme a quantidade de treinos contratada no ciclo atual.",
      tone: "success",
    };
  }

  if (summary.uiState === "SUSPENSO_POR_PAGAMENTO") {
    return {
      title: "Seu acompanhamento está suspenso",
      description:
        "Identificamos uma pendência de pagamento. Regularize para retomar o acompanhamento.",
      tone: "warning",
    };
  }

  return {
    title: "Acompanhamento em atualização",
    description: "Estamos atualizando as informações do seu ciclo.",
    tone: "info",
  };
}

export function StudentDashboardStatusCard({ summary }: Props) {
  const cycle = summary.currentCycle;
  const professor = summary.professor;
  const payment = summary.payment;
  const statusContent = getStatusContent(summary);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-sm font-medium text-zinc-500">Meu acompanhamento</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">
          Olá, {summary.student.name}
        </h1>
      </div>

      <div className="rounded-2xl bg-zinc-50 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              {statusContent.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              {statusContent.description}
            </p>
          </div>

          {cycle?.daysLeft !== null && cycle?.daysLeft !== undefined && (
            <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200">
              {cycle.daysLeft >= 0
                ? `${cycle.daysLeft} dia(s) restante(s)`
                : "Ciclo vencido"}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <InfoItem
          label="Tipo de ciclo"
          value={
            cycle?.type === "TRIAL"
              ? "Experiência gratuita"
              : cycle?.type === "PAID"
                ? "Plano pago"
                : "—"
          }
        />
        <InfoItem label="Vencimento" value={formatDate(cycle?.endDate)} />
        <InfoItem
          label="Professor"
          value={professor?.name ?? "Aguardando vínculo"}
        />
        <InfoItem
          label="Treinos do ciclo"
          value={
            cycle
              ? `${cycle.totalContractedWorkouts} no ciclo · ${cycle.workoutsPerWeek}/semana`
              : "—"
          }
        />
      </div>

      {payment && (
        <div className="mt-5 rounded-2xl border border-zinc-200 p-4">
          <h3 className="text-sm font-semibold text-zinc-950">Pagamento</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <InfoItem label="Status" value={payment.status} />
            <InfoItem label="Vencimento" value={formatDate(payment.dueDate)} />
            <InfoItem label="Valor" value={formatCurrency(payment.amountCents)} />
          </div>

          {payment.paymentLinkUrl && payment.status !== "PAGO" && (
            <a
              href={payment.paymentLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
            >
              Ir para pagamento
            </a>
          )}
        </div>
      )}

      {summary.flags.isTrial && (
        <div className="mt-5 rounded-2xl border border-zinc-200 p-4">
          <h3 className="text-sm font-semibold text-zinc-950">
            Gostou da experiência?
          </h3>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Para continuar com o acompanhamento após o período experimental, fale com a equipe e escolha o melhor plano para você.
          </p>
        </div>
      )}
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

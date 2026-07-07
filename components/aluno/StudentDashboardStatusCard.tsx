import type { StudentDashboardSummary } from "@/lib/student-dashboard-summary";

type Props = {
  summary: StudentDashboardSummary;
};

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatMoney(valueInCents?: number | null) {
  if (typeof valueInCents !== "number") return "-";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueInCents / 100);
}

function getBadge(summary: StudentDashboardSummary) {
  const badgeByState: Record<string, string> = {
    EXPERIENCIA_ATIVA: "Experiência ativa",
    CONTRATO_ATIVO: "Plano ativo",
    AGUARDANDO_PAGAMENTO: "Pagamento pendente",
    AGUARDANDO_VINCULO_PROFESSOR: "Aguardando professor",
    SUSPENSO_POR_PAGAMENTO: "Acesso suspenso",
    SEM_CONTRATO_ATIVO: "Sem contrato ativo",
  };

  return badgeByState[summary.uiState] || "Status do aluno";
}

function getCardStyle(summary: StudentDashboardSummary) {
  if (summary.uiState === "SEM_CONTRATO_ATIVO" || summary.uiState === "SUSPENSO_POR_PAGAMENTO") {
    return "border-red-200 bg-red-50 text-red-950";
  }

  if (summary.uiState === "AGUARDANDO_PAGAMENTO" || summary.uiState === "AGUARDANDO_VINCULO_PROFESSOR") {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-950";
}

export function StudentDashboardStatusCard({ summary }: Props) {
  const cycle = summary.currentCycle;
  const payment = summary.payment;

  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${getCardStyle(summary)}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <span className="inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            {getBadge(summary)}
          </span>

          <h2 className="mt-3 text-2xl font-bold">{summary.title}</h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 opacity-90">{summary.message}</p>
        </div>

        {summary.shouldBlockTraining ? (
          <div className="rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold shadow-sm">
            Treinos bloqueados até regularização
          </div>
        ) : (
          <div className="rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold shadow-sm">
            Acesso liberado
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase opacity-70">Ciclo</p>
          <p className="mt-1 font-bold">
            {cycle?.type === "TRIAL" ? "Experiência gratuita" : cycle?.planName || "Plano"}
          </p>
        </div>

        <div className="rounded-xl bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase opacity-70">Vencimento</p>
          <p className="mt-1 font-bold">{formatDate(cycle?.endDate)}</p>
        </div>

        <div className="rounded-xl bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase opacity-70">Professor</p>
          <p className="mt-1 font-bold">{summary.professor?.name || "Aguardando vínculo"}</p>
        </div>

        <div className="rounded-xl bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase opacity-70">Treinos do ciclo</p>
          <p className="mt-1 font-bold">
            {cycle ? `${cycle.totalContractedWorkouts} treinos` : "Não definido"}
          </p>
        </div>
      </div>

      {cycle ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-white/60 p-4 text-sm">
            <p className="font-semibold">Frequência contratada</p>
            <p className="mt-1 opacity-80">
              {cycle.workoutsPerWeek} por semana / {cycle.workoutsPerMonth} por mês
            </p>
          </div>

          <div className="rounded-xl bg-white/60 p-4 text-sm">
            <p className="font-semibold">Status do contrato</p>
            <p className="mt-1 opacity-80">{cycle.status}</p>
          </div>

          <div className="rounded-xl bg-white/60 p-4 text-sm">
            <p className="font-semibold">Pagamento</p>
            <p className="mt-1 opacity-80">
              {payment
                ? `${payment.status} • ${formatMoney(payment.amountCents)} • venc. ${formatDate(payment.dueDate)}`
                : "Sem pagamento pendente"}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-white/75 p-4 text-sm">
          <p className="font-semibold">Próximo passo</p>
          <p className="mt-1 leading-6 opacity-85">
            Fale com a equipe para ativar uma experiência ou contratar um plano. Enquanto não houver contrato ativo, o painel mantém a orientação visível e evita que o aluno siga como se estivesse regularizado.
          </p>
        </div>
      )}

      {summary.actionLabel ? (
        <div className="mt-5">
          <span className="inline-flex rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-sm">
            {summary.actionLabel}
          </span>
        </div>
      ) : null}
    </section>
  );
}

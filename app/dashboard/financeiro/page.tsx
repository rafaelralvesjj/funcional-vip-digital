"use client";

import { useEffect, useMemo, useState } from "react";

type StudentOption = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  professorId?: string | null;
  professorName?: string | null;
  commercialStatus: string;
  contractedTrainingDaysPerMonth?: number | null;
  active: boolean;
};

type PlanOption = {
  id: string;
  name: string;
  workoutsPerWeek: number;
  workoutsPerMonth: number;
  durationMonths?: number | null;
  priceCents: number;
  allowTrial: boolean;
  trialDays: number;
  active: boolean;
};

type ContractItem = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail?: string | null;
  planId?: string | null;
  planName: string;
  professorId?: string | null;
  professorName?: string | null;
  contractNumber?: string | null;
  type: string;
  status: string;
  commercialStatus: string;
  startDate: string;
  endDate: string;
  durationMonths: number;
  workoutsPerWeek: number;
  workoutsPerMonth: number;
  totalContractedWorkouts: number;
  priceCents: number;
  paymentMode?: string | null;
  source?: string | null;
  notes?: string | null;
  createdAt: string;
};

type PaymentItem = {
  id: string;
  contractId: string;
  studentId: string;
  studentName: string;
  studentEmail?: string | null;
  contractNumber?: string | null;
  contractType?: string | null;
  contractStatus?: string | null;
  planName: string;
  professorName?: string | null;
  amountCents: number;
  dueDate: string;
  paidAt?: string | null;
  status: string;
  method?: string | null;
  provider?: string | null;
  paymentLinkUrl?: string | null;
  notes?: string | null;
  createdAt: string;
};

type TrialContinuationRequestItem = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail?: string | null;
  studentPhone?: string | null;
  studentCommercialStatus?: string | null;
  professorId?: string | null;
  professorName?: string | null;
  contractId?: string | null;
  contractNumber?: string | null;
  contractType?: string | null;
  contractStatus?: string | null;
  contractEndDate?: string | null;
  status: string;
  severity?: string | null;
  title?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

type ContractsResponse = {
  contracts: ContractItem[];
  students: StudentOption[];
  plans: PlanOption[];
  noContractStudents: StudentOption[];
  awaitingPaymentStudents?: StudentOption[];
  trialContinuationRequests?: TrialContinuationRequestItem[];
  metrics: {
    totalContracts: number;
    activeContracts: number;
    activePaidContracts?: number;
    activeTrialContracts?: number;
    endingSoonContracts: number;
    trialEndingSoonContracts?: number;
    paidEndingSoonContracts?: number;
    expiredContracts: number;
    expiredTrialContracts?: number;
    expiredPaidContracts?: number;
    trialContracts: number;
    awaitingPaymentContracts?: number;
    suspendedContracts?: number;
    finalizedContracts?: number;
    cancelledContracts?: number;
    noContractStudents: number;
    awaitingPaymentStudents?: number;
    openTrialContinuationRequests?: number;
    convertedFromTrialContracts?: number;
    trialConversionRatePercent?: number;
    expectedRevenueCents: number;
    activePaidRevenueCents?: number;
    awaitingPaymentRevenueCents?: number;
    studentCommercialStatusCounts?: Record<string, number>;
  };
};

type PaymentsResponse = {
  payments: PaymentItem[];
  metrics: {
    totalPayments: number;
    paidPayments: number;
    openPayments: number;
    overduePayments: number;
    partialPayments: number;
    cancelledPayments: number;
    receivedCents: number;
    openCents: number;
    overdueCents: number;
  };
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string | null): string {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMoney(cents?: number | null): string {
  const value = Number(cents || 0) / 100;

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatPercent(value?: number | null): string {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed)) return "0%";

  return `${parsed}%`;
}

function moneyToCents(value: string): number {
  const normalized = String(value || "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) return 0;

  return Math.round(parsed * 100);
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: "Rascunho",
    AWAITING_ACCEPTANCE: "Aguardando aceite",
    AWAITING_PAYMENT: "Aguardando pagamento",
    ACTIVE: "Ativo",
    FINALIZED: "Finalizado",
    CANCELLED: "Cancelado",
    SUSPENDED: "Suspenso",
  };

  return labels[status] || status;
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    PAID: "Pago",
    TRIAL: "Experiência grátis",
  };

  return labels[type] || type;
}

function paymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    EM_ABERTO: "Em aberto",
    PAGO: "Pago",
    ATRASADO: "Atrasado",
    PARCIAL: "Parcial",
    CANCELADO: "Cancelado",
  };

  return labels[status] || status;
}

export default function FinanceiroPage() {
  const [contractsData, setContractsData] = useState<ContractsResponse | null>(null);
  const [paymentsData, setPaymentsData] = useState<PaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingContract, setSavingContract] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [filter, setFilter] = useState("VENCENDO");
  const [paymentFilter, setPaymentFilter] = useState("TODOS");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [studentId, setStudentId] = useState("");
  const [pendingStudentIdFromUrl, setPendingStudentIdFromUrl] = useState("");
  const [planId, setPlanId] = useState("");
  const [type, setType] = useState("PAID");
  const [durationMonths, setDurationMonths] = useState("1");
  const [startDate, setStartDate] = useState(todayIso());
  const [priceReais, setPriceReais] = useState("");
  const [activateNow, setActivateNow] = useState(false);
  const [notes, setNotes] = useState("");

  const [paymentContractId, setPaymentContractId] = useState("");
  const [paymentAmountReais, setPaymentAmountReais] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [paymentStatus, setPaymentStatus] = useState("EM_ABERTO");
  const [paymentLinkUrl, setPaymentLinkUrl] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [activateContractOnPaid, setActivateContractOnPaid] = useState(true);

  const [conversionTrialContractId, setConversionTrialContractId] = useState("");
  const [conversionPlanId, setConversionPlanId] = useState("");
  const [conversionDurationMonths, setConversionDurationMonths] = useState("1");
  const [conversionStartDate, setConversionStartDate] = useState(todayIso());
  const [conversionDueDate, setConversionDueDate] = useState(todayIso());
  const [conversionPriceReais, setConversionPriceReais] = useState("");
  const [conversionPaymentMethod, setConversionPaymentMethod] = useState("PIX");
  const [conversionPaymentStatus, setConversionPaymentStatus] = useState("EM_ABERTO");
  const [conversionPaymentLinkUrl, setConversionPaymentLinkUrl] = useState("");
  const [conversionNotes, setConversionNotes] = useState("");
  const [convertingTrial, setConvertingTrial] = useState(false);

  async function loadData() {
    setLoading(true);
    setMessage(null);

    try {
      const [contractsRes, paymentsRes] = await Promise.all([
        fetch("/api/student-contracts", {
          cache: "no-store",
        }),
        fetch("/api/contract-payments", {
          cache: "no-store",
        }),
      ]);

      const contractsJson = await contractsRes.json().catch(() => null);
      const paymentsJson = await paymentsRes.json().catch(() => null);

      if (contractsRes.ok) {
        setContractsData(contractsJson);
      } else {
        const detail = contractsJson?.message ? ` Detalhe: ${contractsJson.message}` : "";
        setMessage({
          type: "error",
          text: `${contractsJson?.error || "Erro ao carregar contratos."}${detail}`,
        });
      }

      if (paymentsRes.ok) {
        setPaymentsData(paymentsJson);
      } else {
        const detail = paymentsJson?.message ? ` Detalhe: ${paymentsJson.message}` : "";
        setMessage({
          type: "error",
          text: `${paymentsJson?.error || "Erro ao carregar pagamentos."}${detail}`,
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Erro ao carregar financeiro. Verifique se o SQL TXT da Fase 2 foi rodado no Neon.",
      });
    }

    setLoading(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialStudentId = params.get("studentId") || "";

    if (initialStudentId) {
      setPendingStudentIdFromUrl(initialStudentId);
      setStudentId(initialStudentId);
      setFilter("EXPERIENCIA");
    }

    loadData();
  }, []);

  useEffect(() => {
    if (!contractsData || !pendingStudentIdFromUrl) return;

    const selectedStudent = contractsData.students.find(
      (student) => student.id === pendingStudentIdFromUrl
    );

    if (!selectedStudent) {
      setMessage({
        type: "error",
        text: "Aluno recebido pela URL, mas não encontrado no Financeiro.",
      });
      return;
    }

    setStudentId(pendingStudentIdFromUrl);

    const activeTrialContract = contractsData.contracts.find(
      (contract) =>
        contract.studentId === pendingStudentIdFromUrl &&
        contract.type === "TRIAL" &&
        contract.status === "ACTIVE"
    );

    if (activeTrialContract) {
      setConversionTrialContractId(activeTrialContract.id);
      setFilter("EXPERIENCIA");
      setMessage({
        type: "success",
        text: `Experiência de ${selectedStudent.name} selecionada. Agora escolha o plano pago e conclua a conversão.`,
      });

      window.setTimeout(() => {
        document.getElementById("converter-experiencia")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 150);

      return;
    }

    setMessage({
      type: "error",
      text: `Aluno ${selectedStudent.name} selecionado, mas não encontramos uma experiência ativa para converter. Verifique se a experiência já foi finalizada, vencida ou convertida.`,
    });
  }, [contractsData, pendingStudentIdFromUrl]);

  const selectedPlan = useMemo(() => {
    return contractsData?.plans.find((plan) => plan.id === planId) || null;
  }, [contractsData, planId]);

  useEffect(() => {
    if (!selectedPlan) return;

    setDurationMonths(String(selectedPlan.durationMonths || 1));
    setPriceReais(selectedPlan.priceCents ? String(selectedPlan.priceCents / 100) : "");
    setType(selectedPlan.allowTrial ? "TRIAL" : "PAID");
    setActivateNow(Boolean(selectedPlan.allowTrial));
  }, [selectedPlan?.id]);

  const selectedPaymentContract = useMemo(() => {
    return contractsData?.contracts.find((contract) => contract.id === paymentContractId) || null;
  }, [contractsData, paymentContractId]);

  useEffect(() => {
    if (!selectedPaymentContract) return;

    if (selectedPaymentContract.priceCents > 0) {
      setPaymentAmountReais(String(selectedPaymentContract.priceCents / 100));
    }
  }, [selectedPaymentContract?.id]);

  const activeTrialContracts = useMemo(() => {
    return (contractsData?.contracts || []).filter(
      (contract) => contract.type === "TRIAL" && contract.status === "ACTIVE"
    );
  }, [contractsData]);

  const paidPlans = useMemo(() => {
    return (contractsData?.plans || []).filter((plan) => !plan.allowTrial && plan.active !== false);
  }, [contractsData]);

  const selectedConversionPlan = useMemo(() => {
    return paidPlans.find((plan) => plan.id === conversionPlanId) || null;
  }, [paidPlans, conversionPlanId]);

  useEffect(() => {
    if (!selectedConversionPlan) return;

    setConversionDurationMonths(String(selectedConversionPlan.durationMonths || 1));
    setConversionPriceReais(
      selectedConversionPlan.priceCents ? String(selectedConversionPlan.priceCents / 100) : ""
    );
  }, [selectedConversionPlan?.id]);

  const calculatedPreview = useMemo(() => {
    const months = Number(durationMonths || selectedPlan?.durationMonths || 1);
    const workoutsPerMonth = selectedPlan?.workoutsPerMonth || 0;
    const workoutsPerWeek = selectedPlan?.workoutsPerWeek || 0;

    if (!selectedPlan) {
      return null;
    }

    const end = new Date(`${startDate}T12:00:00`);
    end.setMonth(end.getMonth() + Math.max(months, 1));
    end.setDate(end.getDate() - 1);

    return {
      workoutsPerWeek,
      workoutsPerMonth,
      total: workoutsPerMonth * Math.max(months, 1),
      endDate: end.toISOString(),
    };
  }, [selectedPlan, durationMonths, startDate]);

  const filteredContracts = useMemo(() => {
    const contracts = contractsData?.contracts || [];
    const now = new Date();
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);

    if (filter === "TODOS") return contracts;

    if (filter === "ATIVOS") {
      return contracts.filter((contract) => contract.status === "ACTIVE");
    }

    if (filter === "PAGOS_ATIVOS") {
      return contracts.filter((contract) => contract.type === "PAID" && contract.status === "ACTIVE");
    }

    if (filter === "VENCENDO") {
      return contracts.filter((contract) => {
        const endDate = new Date(contract.endDate);
        return contract.status === "ACTIVE" && endDate >= now && endDate <= in7Days;
      });
    }

    if (filter === "VENCIDOS") {
      return contracts.filter((contract) => {
        const endDate = new Date(contract.endDate);
        return contract.status === "ACTIVE" && endDate < now;
      });
    }

    if (filter === "EXPERIENCIA") {
      return contracts.filter((contract) => contract.type === "TRIAL");
    }

    if (filter === "EXPERIENCIA_VENCENDO") {
      return contracts.filter((contract) => {
        const endDate = new Date(contract.endDate);
        return contract.type === "TRIAL" && contract.status === "ACTIVE" && endDate >= now && endDate <= in7Days;
      });
    }

    if (filter === "CONVERTIDOS") {
      return contracts.filter((contract) => contract.type === "PAID" && contract.source === "CONVERSAO_EXPERIENCIA");
    }

    if (filter === "PAGAMENTO") {
      return contracts.filter((contract) => contract.status === "AWAITING_PAYMENT" || contract.status === "SUSPENDED");
    }

    return contracts;
  }, [contractsData, filter]);

  const filteredPayments = useMemo(() => {
    const payments = paymentsData?.payments || [];

    if (paymentFilter === "TODOS") return payments;

    return payments.filter((payment) => payment.status === paymentFilter);
  }, [paymentsData, paymentFilter]);

  function contractFilterLabel(item: string): string {
    const labels: Record<string, string> = {
      VENCENDO: "Vencendo",
      VENCIDOS: "Vencidos",
      ATIVOS: "Ativos",
      PAGOS_ATIVOS: "Pagos ativos",
      EXPERIENCIA: "Experiências",
      EXPERIENCIA_VENCENDO: "Exp. vencendo",
      CONVERTIDOS: "Convertidos",
      PAGAMENTO: "Aguardando pagamento",
      TODOS: "Todos",
    };

    return labels[item] || item;
  }

  async function handleCreateContract(event: React.FormEvent) {
    event.preventDefault();

    if (!studentId || !planId) {
      setMessage({ type: "error", text: "Selecione o aluno e o plano." });
      return;
    }

    setSavingContract(true);
    setMessage(null);

    try {
      const status = type === "PAID" && !activateNow ? "AWAITING_PAYMENT" : activateNow ? "ACTIVE" : "DRAFT";

      const res = await fetch("/api/student-contracts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId,
          planId,
          type,
          status,
          activate: activateNow,
          durationMonths: Number(durationMonths || 1),
          startDate,
          priceCents: moneyToCents(priceReais),
          paymentMode: type === "TRIAL" ? "GRATUITO" : "UNICO",
          source: "MANUAL",
          notes,
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({
          type: "success",
          text:
            type === "PAID" && !activateNow
              ? "Contrato criado aguardando pagamento. Agora gere ou registre o pagamento manual."
              : "Contrato criado com sucesso.",
        });

        const createdId = json?.contract?.id;
        if (createdId) {
          setPaymentContractId(createdId);
          setPaymentAmountReais(priceReais);
        }

        setNotes("");
        await loadData();
      } else {
        setMessage({ type: "error", text: json?.error || "Erro ao criar contrato." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao criar contrato." });
    }

    setSavingContract(false);
  }

  async function handleUpdateContractStatus(contractId: string, status: string) {
    setMessage(null);

    try {
      const res = await fetch("/api/student-contracts", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: contractId,
          status,
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({ type: "success", text: "Contrato atualizado." });
        await loadData();
      } else {
        setMessage({ type: "error", text: json?.error || "Erro ao atualizar contrato." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao atualizar contrato." });
    }
  }

  async function handleCreatePayment(event: React.FormEvent) {
    event.preventDefault();

    if (!paymentContractId) {
      setMessage({ type: "error", text: "Selecione um contrato." });
      return;
    }

    const amountCents = moneyToCents(paymentAmountReais);

    if (amountCents <= 0) {
      setMessage({ type: "error", text: "Informe um valor maior que zero." });
      return;
    }

    setSavingPayment(true);
    setMessage(null);

    try {
      const res = await fetch("/api/contract-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contractId: paymentContractId,
          amountCents,
          dueDate: paymentDueDate,
          method: paymentMethod,
          status: paymentStatus,
          paymentLinkUrl,
          notes: paymentNotes,
          activateContract: paymentStatus === "PAGO" && activateContractOnPaid,
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({
          type: "success",
          text:
            paymentStatus === "PAGO" && activateContractOnPaid
              ? "Pagamento registrado como pago e contrato ativado."
              : "Pagamento registrado.",
        });
        setPaymentLinkUrl("");
        setPaymentNotes("");
        setPaymentStatus("EM_ABERTO");
        await loadData();
      } else {
        setMessage({ type: "error", text: json?.error || "Erro ao registrar pagamento." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao registrar pagamento." });
    }

    setSavingPayment(false);
  }

  async function handleUpdatePaymentStatus(paymentId: string, status: string) {
    setMessage(null);

    try {
      const res = await fetch("/api/contract-payments", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: paymentId,
          status,
          activateContract: status === "PAGO",
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({
          type: "success",
          text:
            status === "PAGO"
              ? "Pagamento marcado como pago e contrato ativado."
              : "Pagamento atualizado.",
        });
        await loadData();
      } else {
        setMessage({ type: "error", text: json?.error || "Erro ao atualizar pagamento." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao atualizar pagamento." });
    }
  }

  async function handleConvertTrial(event: React.FormEvent) {
    event.preventDefault();

    if (!conversionTrialContractId || !conversionPlanId) {
      setMessage({
        type: "error",
        text: "Selecione a experiência e o plano pago.",
      });
      return;
    }

    const priceCents = moneyToCents(conversionPriceReais);

    if (priceCents <= 0) {
      setMessage({
        type: "error",
        text: "Informe o valor do contrato pago.",
      });
      return;
    }

    setConvertingTrial(true);
    setMessage(null);

    try {
      const res = await fetch("/api/student-contracts/convert-trial", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trialContractId: conversionTrialContractId,
          planId: conversionPlanId,
          durationMonths: Number(conversionDurationMonths || 1),
          startDate: conversionStartDate,
          dueDate: conversionDueDate,
          priceCents,
          paymentMethod: conversionPaymentMethod,
          paymentStatus: conversionPaymentStatus,
          paymentLinkUrl: conversionPaymentLinkUrl,
          paymentNotes: conversionNotes,
          notes: conversionNotes,
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({
          type: "success",
          text:
            json?.message ||
            "Experiência convertida para contrato pago.",
        });

        setConversionPaymentLinkUrl("");
        setConversionNotes("");
        setConversionPaymentStatus("EM_ABERTO");
        setConversionTrialContractId("");
        setConversionPlanId("");

        await loadData();
      } else {
        setMessage({
          type: "error",
          text: json?.error || "Erro ao converter experiência.",
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Erro ao converter experiência.",
      });
    }

    setConvertingTrial(false);
  }

  const metrics = contractsData?.metrics;
  const paymentMetrics = paymentsData?.metrics;

  return (
    <main className="p-6 space-y-6 bg-[#0a0a0a] min-h-screen text-[#f5f5f5]">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-[#D4A373] mb-2">
          Contratos, ciclos e pagamentos
        </p>
        <h1 className="text-3xl font-bold text-[#D4A373]">Financeiro</h1>
        <p className="text-sm text-[#a1a1a1] mt-2 max-w-5xl">
          Controle manual de contratos, experiência gratuita, vencimentos e pagamentos. Nesta fase,
          você registra quando o aluno pagou e o sistema ativa o contrato/ciclo correspondente.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === "success"
              ? "bg-green-500/10 border-green-500/20 text-green-300"
              : "bg-red-500/10 border-red-500/20 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading && (
        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-6 text-sm text-[#a1a1a1]">
          Carregando financeiro...
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-xs uppercase text-[#6b6b6b]">Contratos pagos ativos</p>
          <p className="text-2xl font-bold text-green-400">{metrics?.activePaidContracts ?? metrics?.activeContracts ?? 0}</p>
          <p className="text-[11px] text-[#6b6b6b] mt-1">Receita ativa: {formatMoney(metrics?.activePaidRevenueCents || 0)}</p>
        </div>

        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-xs uppercase text-[#6b6b6b]">Experiências ativas</p>
          <p className="text-2xl font-bold text-blue-400">{metrics?.activeTrialContracts ?? metrics?.trialContracts ?? 0}</p>
          <p className="text-[11px] text-[#6b6b6b] mt-1">Vencendo: {metrics?.trialEndingSoonContracts ?? 0}</p>
        </div>

        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-xs uppercase text-[#6b6b6b]">Interesses em continuar</p>
          <p className="text-2xl font-bold text-[#D4A373]">{metrics?.openTrialContinuationRequests ?? 0}</p>
          <a
            href="/dashboard/gestor/interesses-experiencia"
            className="text-[11px] text-[#D4A373] underline mt-1 inline-block"
          >
            Abrir fila
          </a>
        </div>

        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-xs uppercase text-[#6b6b6b]">Taxa de conversão</p>
          <p className="text-2xl font-bold text-[#D4A373]">{formatPercent(metrics?.trialConversionRatePercent)}</p>
          <p className="text-[11px] text-[#6b6b6b] mt-1">Convertidos: {metrics?.convertedFromTrialContracts ?? 0}</p>
        </div>

        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-xs uppercase text-[#6b6b6b]">Aguardando pagamento</p>
          <p className="text-2xl font-bold text-yellow-400">{metrics?.awaitingPaymentContracts ?? 0}</p>
          <p className="text-[11px] text-[#6b6b6b] mt-1">Alunos: {metrics?.awaitingPaymentStudents ?? 0}</p>
        </div>

        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-xs uppercase text-[#6b6b6b]">Receita em aberto</p>
          <p className="text-2xl font-bold text-yellow-400">{formatMoney(metrics?.awaitingPaymentRevenueCents ?? paymentMetrics?.openCents ?? 0)}</p>
          <p className="text-[11px] text-[#6b6b6b] mt-1">Pagamentos: {paymentMetrics?.openPayments || 0}</p>
        </div>

        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-xs uppercase text-[#6b6b6b]">Pagamentos atrasados</p>
          <p className="text-2xl font-bold text-red-400">{formatMoney(paymentMetrics?.overdueCents || 0)}</p>
          <p className="text-[11px] text-[#6b6b6b] mt-1">Qtd.: {paymentMetrics?.overduePayments || 0}</p>
        </div>

        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-xs uppercase text-[#6b6b6b]">Sem contrato ativo</p>
          <p className="text-2xl font-bold text-[#D4A373]">{metrics?.noContractStudents || 0}</p>
          <p className="text-[11px] text-[#6b6b6b] mt-1">Acompanhar para não perder aluno</p>
        </div>
      </div>

      <section className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[#D4A373]">Visão executiva do funil</h2>
          <p className="text-xs text-[#a1a1a1] mt-1">
            Leitura rápida da jornada: experiência, interesse, conversão e pagamento.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4">
            <p className="text-xs uppercase text-[#6b6b6b]">Experiência</p>
            <p className="text-sm text-[#f5f5f5] mt-2">
              Ativas: <strong className="text-blue-300">{metrics?.activeTrialContracts ?? metrics?.trialContracts ?? 0}</strong>
            </p>
            <p className="text-sm text-[#f5f5f5] mt-1">
              Vencendo: <strong className="text-yellow-300">{metrics?.trialEndingSoonContracts ?? 0}</strong>
            </p>
            <p className="text-sm text-[#f5f5f5] mt-1">
              Vencidas: <strong className="text-red-300">{metrics?.expiredTrialContracts ?? 0}</strong>
            </p>
          </div>

          <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4">
            <p className="text-xs uppercase text-[#6b6b6b]">Conversão</p>
            <p className="text-sm text-[#f5f5f5] mt-2">
              Interessados: <strong className="text-[#D4A373]">{metrics?.openTrialContinuationRequests ?? 0}</strong>
            </p>
            <p className="text-sm text-[#f5f5f5] mt-1">
              Convertidos: <strong className="text-green-300">{metrics?.convertedFromTrialContracts ?? 0}</strong>
            </p>
            <p className="text-sm text-[#f5f5f5] mt-1">
              Taxa simples: <strong className="text-[#D4A373]">{formatPercent(metrics?.trialConversionRatePercent)}</strong>
            </p>
          </div>

          <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4">
            <p className="text-xs uppercase text-[#6b6b6b]">Contrato pago</p>
            <p className="text-sm text-[#f5f5f5] mt-2">
              Ativos: <strong className="text-green-300">{metrics?.activePaidContracts ?? 0}</strong>
            </p>
            <p className="text-sm text-[#f5f5f5] mt-1">
              Vencendo: <strong className="text-yellow-300">{metrics?.paidEndingSoonContracts ?? 0}</strong>
            </p>
            <p className="text-sm text-[#f5f5f5] mt-1">
              Suspensos: <strong className="text-red-300">{metrics?.suspendedContracts ?? 0}</strong>
            </p>
          </div>
        </div>
      </section>

      <section id="converter-experiencia" className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4 scroll-mt-6">
        <div>
          <h2 className="text-lg font-semibold text-[#D4A373]">Converter experiência para plano pago</h2>
          <p className="text-xs text-[#a1a1a1] mt-1">
            Use quando o aluno em experiência decidiu continuar. Se já pagou, marque como Pago para ativar o contrato imediatamente.
          </p>

          {pendingStudentIdFromUrl && (
            <div className="mt-3 rounded-xl bg-[#D4A373]/10 border border-[#D4A373]/20 p-3 text-xs text-[#f5f5f5]">
              Você veio da fila de alunos interessados em continuar. Quando houver uma experiência ativa para esse aluno, ela já fica selecionada aqui.
            </div>
          )}
        </div>

        <form onSubmit={handleConvertTrial} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Experiência ativa</label>
              <select
                value={conversionTrialContractId}
                onChange={(event) => setConversionTrialContractId(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              >
                <option value="">Selecione...</option>
                {activeTrialContracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.studentName} · vence em {formatDate(contract.endDate)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Plano pago</label>
              <select
                value={conversionPlanId}
                onChange={(event) => setConversionPlanId(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              >
                <option value="">Selecione...</option>
                {paidPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {formatMoney(plan.priceCents)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Duração</label>
              <select
                value={conversionDurationMonths}
                onChange={(event) => setConversionDurationMonths(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              >
                {[1, 2, 3, 6, 12].map((month) => (
                  <option key={month} value={month}>
                    {month} {month === 1 ? "mês" : "meses"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Início do contrato pago</label>
              <input
                type="date"
                value={conversionStartDate}
                onChange={(event) => setConversionStartDate(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              />
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Vencimento do pagamento</label>
              <input
                type="date"
                value={conversionDueDate}
                onChange={(event) => setConversionDueDate(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              />
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Valor</label>
              <input
                value={conversionPriceReais}
                onChange={(event) => setConversionPriceReais(event.target.value)}
                placeholder="Ex.: 297,00"
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              />
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Forma</label>
              <select
                value={conversionPaymentMethod}
                onChange={(event) => setConversionPaymentMethod(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              >
                <option value="PIX">Pix</option>
                <option value="CARTAO">Cartão</option>
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="LINK_EXTERNO">Link externo</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Status do pagamento</label>
              <select
                value={conversionPaymentStatus}
                onChange={(event) => setConversionPaymentStatus(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              >
                <option value="EM_ABERTO">Em aberto</option>
                <option value="PAGO">Pago</option>
                <option value="PARCIAL">Parcial</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Link de pagamento</label>
              <input
                value={conversionPaymentLinkUrl}
                onChange={(event) => setConversionPaymentLinkUrl(event.target.value)}
                placeholder="Cole o link, se houver"
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              />
            </div>
          </div>

          <textarea
            value={conversionNotes}
            onChange={(event) => setConversionNotes(event.target.value)}
            placeholder="Observações da conversão..."
            className="w-full min-h-[80px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
          />

          <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4 text-xs text-[#a1a1a1]">
            Se o status for <strong className="text-green-300">Pago</strong>, o sistema finaliza a experiência e ativa o contrato pago.
            Se ficar <strong className="text-yellow-300">Em aberto</strong>, o contrato pago fica aguardando pagamento e a experiência continua ativa.
          </div>

          <button
            type="submit"
            disabled={convertingTrial || activeTrialContracts.length === 0}
            className="bg-[#D4A373] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#c49563] transition disabled:opacity-50"
          >
            {convertingTrial ? "Convertendo..." : "Converter experiência"}
          </button>
        </form>
      </section>

      <section className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[#D4A373]">Criar contrato / ciclo</h2>
          <p className="text-xs text-[#a1a1a1] mt-1">
            Para plano pago, deixe desmarcado “Ativar agora” quando ainda estiver aguardando pagamento.
          </p>
        </div>

        <form onSubmit={handleCreateContract} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Aluno</label>
              <select
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              >
                <option value="">Selecione...</option>
                {(contractsData?.students || []).map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} {student.commercialStatus ? `· ${student.commercialStatus}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Plano</label>
              <select
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              >
                <option value="">Selecione...</option>
                {(contractsData?.plans || []).map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {formatMoney(plan.priceCents)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Tipo</label>
              <select
                value={type}
                onChange={(event) => {
                  const nextType = event.target.value;
                  setType(nextType);
                  setActivateNow(nextType === "TRIAL");
                }}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              >
                <option value="PAID">Pago</option>
                <option value="TRIAL">Experiência grátis</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Duração em meses</label>
              <select
                value={durationMonths}
                onChange={(event) => setDurationMonths(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              >
                {[1, 2, 3, 6, 12].map((month) => (
                  <option key={month} value={month}>
                    {month} {month === 1 ? "mês" : "meses"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Data de início</label>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              />
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Valor total do contrato</label>
              <input
                value={priceReais}
                onChange={(event) => setPriceReais(event.target.value)}
                placeholder="Ex.: 297,00"
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              />
            </div>
          </div>

          {calculatedPreview && (
            <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4 text-sm text-[#d6d6d6]">
              <strong className="text-[#D4A373]">Prévia:</strong>{" "}
              {calculatedPreview.workoutsPerWeek} treino(s)/semana · {calculatedPreview.workoutsPerMonth} treino(s)/mês · total de{" "}
              {calculatedPreview.total} treino(s) · fim em {formatDate(calculatedPreview.endDate)}
            </div>
          )}

          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Observações internas..."
            className="w-full min-h-[80px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
          />

          <label className="flex items-start gap-2 text-xs text-[#a1a1a1]">
            <input
              type="checkbox"
              checked={activateNow}
              onChange={(event) => setActivateNow(event.target.checked)}
              className="mt-0.5 accent-[#D4A373]"
            />
            <span>
              Ativar contrato agora. Para contrato pago, marque apenas se o pagamento já foi confirmado.
              Se desmarcado, ficará como aguardando pagamento.
            </span>
          </label>

          <button
            type="submit"
            disabled={savingContract}
            className="bg-[#D4A373] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#c49563] transition disabled:opacity-50"
          >
            {savingContract ? "Criando..." : "Criar contrato"}
          </button>
        </form>
      </section>

      <section className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[#D4A373]">Registrar pagamento manual</h2>
          <p className="text-xs text-[#a1a1a1] mt-1">
            Use quando o aluno pagar por Pix, transferência, cartão fora do sistema ou link externo.
          </p>
        </div>

        <form onSubmit={handleCreatePayment} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Contrato</label>
              <select
                value={paymentContractId}
                onChange={(event) => setPaymentContractId(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              >
                <option value="">Selecione...</option>
                {(contractsData?.contracts || []).map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.studentName} · {contract.planName} · {statusLabel(contract.status)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Valor</label>
              <input
                value={paymentAmountReais}
                onChange={(event) => setPaymentAmountReais(event.target.value)}
                placeholder="Ex.: 297,00"
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              />
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Vencimento</label>
              <input
                type="date"
                value={paymentDueDate}
                onChange={(event) => setPaymentDueDate(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              />
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Forma</label>
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              >
                <option value="PIX">Pix</option>
                <option value="CARTAO">Cartão</option>
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="LINK_EXTERNO">Link externo</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Status</label>
              <select
                value={paymentStatus}
                onChange={(event) => setPaymentStatus(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              >
                <option value="EM_ABERTO">Em aberto</option>
                <option value="PAGO">Pago</option>
                <option value="ATRASADO">Atrasado</option>
                <option value="PARCIAL">Parcial</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Link de pagamento</label>
              <input
                value={paymentLinkUrl}
                onChange={(event) => setPaymentLinkUrl(event.target.value)}
                placeholder="Cole aqui o link externo, se houver"
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              />
            </div>
          </div>

          <textarea
            value={paymentNotes}
            onChange={(event) => setPaymentNotes(event.target.value)}
            placeholder="Observações do pagamento..."
            className="w-full min-h-[80px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
          />

          <label className="flex items-start gap-2 text-xs text-[#a1a1a1]">
            <input
              type="checkbox"
              checked={activateContractOnPaid}
              onChange={(event) => setActivateContractOnPaid(event.target.checked)}
              className="mt-0.5 accent-[#D4A373]"
            />
            <span>
              Se o pagamento for marcado como pago, ativar automaticamente o contrato e substituir o ciclo anterior.
            </span>
          </label>

          <button
            type="submit"
            disabled={savingPayment}
            className="bg-[#D4A373] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#c49563] transition disabled:opacity-50"
          >
            {savingPayment ? "Registrando..." : "Registrar pagamento"}
          </button>
        </form>
      </section>

      <section className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#D4A373]">Pagamentos</h2>
            <p className="text-xs text-[#a1a1a1] mt-1">
              Marque como pago quando confirmar o recebimento. Isso ativa o contrato vinculado.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {["TODOS", "EM_ABERTO", "PAGO", "ATRASADO", "PARCIAL", "CANCELADO"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPaymentFilter(item)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  paymentFilter === item
                    ? "bg-[#D4A373] text-[#0a0a0a]"
                    : "bg-[#1a1a1a] text-[#a1a1a1] border border-[#ffffff10]"
                }`}
              >
                {item === "TODOS" ? "Todos" : paymentStatusLabel(item)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredPayments.length === 0 ? (
            <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4 text-sm text-[#a1a1a1]">
              Nenhum pagamento encontrado.
            </div>
          ) : (
            filteredPayments.map((payment) => (
              <div
                key={payment.id}
                className="rounded-2xl border border-[#ffffff10] bg-[#0f0f0f] p-4 space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-[#f5f5f5]">{payment.studentName}</h3>
                      <span className="rounded-full bg-[#D4A373]/15 text-[#D4A373] px-2 py-1 text-[11px] font-semibold">
                        {paymentStatusLabel(payment.status)}
                      </span>
                    </div>
                    <p className="text-xs text-[#a1a1a1] mt-1">
                      {payment.planName} · {typeLabel(payment.contractType || "")} · {payment.method || "-"}
                    </p>
                    <p className="text-xs text-[#6b6b6b] mt-1">
                      Vencimento: {formatDate(payment.dueDate)}
                      {payment.paidAt ? ` · Pago em: ${formatDate(payment.paidAt)}` : ""}
                    </p>
                    {payment.paymentLinkUrl && (
                      <a
                        href={payment.paymentLinkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#D4A373] underline mt-1 inline-block"
                      >
                        Abrir link de pagamento
                      </a>
                    )}
                  </div>

                  <div className="text-left lg:text-right">
                    <p className="text-xl font-bold text-[#D4A373]">{formatMoney(payment.amountCents)}</p>
                    <p className="text-xs text-[#6b6b6b]">{payment.contractNumber || "Sem número"}</p>
                  </div>
                </div>

                {payment.notes && (
                  <p className="text-xs text-[#a1a1a1] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl p-3">
                    {payment.notes}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {payment.status !== "PAGO" && (
                    <button
                      type="button"
                      onClick={() => handleUpdatePaymentStatus(payment.id, "PAGO")}
                      className="rounded-xl bg-green-500/15 border border-green-500/20 text-green-300 px-3 py-2 text-xs font-semibold"
                    >
                      Marcar pago e ativar contrato
                    </button>
                  )}

                  {payment.status !== "ATRASADO" && payment.status !== "PAGO" && (
                    <button
                      type="button"
                      onClick={() => handleUpdatePaymentStatus(payment.id, "ATRASADO")}
                      className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 px-3 py-2 text-xs font-semibold"
                    >
                      Marcar atrasado
                    </button>
                  )}

                  {payment.status !== "CANCELADO" && (
                    <button
                      type="button"
                      onClick={() => handleUpdatePaymentStatus(payment.id, "CANCELADO")}
                      className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] text-[#a1a1a1] px-3 py-2 text-xs font-semibold"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#D4A373]">Contratos e ciclos</h2>
            <p className="text-xs text-[#a1a1a1] mt-1">
              Acompanhe experiências, contratos pagos, vencimentos e suspensões.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {["VENCENDO", "VENCIDOS", "ATIVOS", "PAGOS_ATIVOS", "EXPERIENCIA", "EXPERIENCIA_VENCENDO", "CONVERTIDOS", "PAGAMENTO", "TODOS"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  filter === item
                    ? "bg-[#D4A373] text-[#0a0a0a]"
                    : "bg-[#1a1a1a] text-[#a1a1a1] border border-[#ffffff10]"
                }`}
              >
                {contractFilterLabel(item)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredContracts.length === 0 ? (
            <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4 text-sm text-[#a1a1a1]">
              Nenhum contrato encontrado.
            </div>
          ) : (
            filteredContracts.map((contract) => (
              <div
                key={contract.id}
                className="rounded-2xl border border-[#ffffff10] bg-[#0f0f0f] p-4 space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-[#f5f5f5]">{contract.studentName}</h3>
                      <span className="rounded-full bg-[#D4A373]/15 text-[#D4A373] px-2 py-1 text-[11px] font-semibold">
                        {statusLabel(contract.status)}
                      </span>
                      <span className="rounded-full bg-[#ffffff08] text-[#a1a1a1] px-2 py-1 text-[11px]">
                        {typeLabel(contract.type)}
                      </span>
                    </div>
                    <p className="text-xs text-[#a1a1a1] mt-1">
                      {contract.planName} · Professor: {contract.professorName || "Sem professor"}
                    </p>
                    <p className="text-xs text-[#6b6b6b] mt-1">
                      {formatDate(contract.startDate)} até {formatDate(contract.endDate)} · {contract.totalContractedWorkouts} treino(s)
                    </p>
                  </div>

                  <div className="text-left lg:text-right">
                    <p className="text-xl font-bold text-[#D4A373]">{formatMoney(contract.priceCents)}</p>
                    <p className="text-xs text-[#6b6b6b]">{contract.contractNumber || "Sem número"}</p>
                  </div>
                </div>

                {contract.notes && (
                  <p className="text-xs text-[#a1a1a1] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl p-3">
                    {contract.notes}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {contract.status !== "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateContractStatus(contract.id, "ACTIVE")}
                      className="rounded-xl bg-green-500/15 border border-green-500/20 text-green-300 px-3 py-2 text-xs font-semibold"
                    >
                      Ativar
                    </button>
                  )}

                  {contract.status !== "SUSPENDED" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateContractStatus(contract.id, "SUSPENDED")}
                      className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 px-3 py-2 text-xs font-semibold"
                    >
                      Suspender
                    </button>
                  )}

                  {contract.status !== "FINALIZED" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateContractStatus(contract.id, "FINALIZED")}
                      className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] text-[#a1a1a1] px-3 py-2 text-xs font-semibold"
                    >
                      Finalizar
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentContractId(contract.id);
                      setPaymentAmountReais(contract.priceCents ? String(contract.priceCents / 100) : "");
                      setPaymentDueDate(todayIso());
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="rounded-xl bg-[#1a1a1a] border border-[#D4A373]/30 text-[#D4A373] px-3 py-2 text-xs font-semibold"
                  >
                    Registrar pagamento
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

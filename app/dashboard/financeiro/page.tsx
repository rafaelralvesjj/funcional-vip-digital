"use client";

import { useEffect, useMemo, useState } from "react";
import { filterServicePlansEligibleForPaidContracting } from "@/lib/service-plan-eligibility";

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

type PlanBillingOption = {
  id: string;
  billingCycle: string;
  amountCents: number;
  active: boolean;
  recommended: boolean;
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
  billingOptions?: PlanBillingOption[];
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
  renewedFromContractId?: string | null;
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

type CommercialStatusCategory =
  | "EM_TESTE"
  | "TESTE_TERMINA_EM_BREVE"
  | "AGUARDANDO_PAGAMENTO"
  | "CONTRATO_ATIVO"
  | "PAGAMENTO_ATRASADO"
  | "SUSPENSO"
  | "ENCERRADO";

type CommercialStatusCard = {
  category: CommercialStatusCategory;
  label: string;
  count: number;
};

type CommercialStatusRow = {
  studentId: string;
  studentName: string;
  category: CommercialStatusCategory;
  categoryLabel: string;
  contractId: string;
  contractType: string;
  contractStatus: string;
  planName: string;
  billingLabel: string;
  nextDate: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  paymentLinkUrl: string | null;
};

type FinanceiroOverviewResponse = {
  cards: CommercialStatusCard[];
  rows: CommercialStatusRow[];
};

type FinanceiroDetailPayment = {
  id: string;
  status: string;
  amountCents: number;
  dueDate: string;
  paidAt: string | null;
  method: string | null;
  provider: string | null;
  paymentLinkUrl: string | null;
  externalReference: string | null;
  providerPaymentId: string | null;
  providerSubscriptionId: string | null;
  receiptUrl: string | null;
  notes: string | null;
  createdAt: string;
};

type FinanceiroDetailContract = {
  id: string;
  type: string;
  status: string;
  commercialStatus: string;
  source: string | null;
  paymentMode: string | null;
  planName: string;
  billingLabel: string;
  billingCycle: string | null;
  billingOptionAmountCents: number | null;
  priceCents: number;
  durationMonths: number;
  startDate: string;
  endDate: string;
  acceptedAt: string | null;
  activatedAt: string | null;
  finalizedAt: string | null;
  cancelledAt: string | null;
  suspendedAt: string | null;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  renewedFromContractId: string | null;
  notes: string | null;
  payments: FinanceiroDetailPayment[];
};

type FinanceiroDetailResponse = {
  student: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    cpfCnpj: string | null;
    asaasCustomerId: string | null;
    commercialStatus: string;
  };
  currentRow: CommercialStatusRow | null;
  contracts: FinanceiroDetailContract[];
  history: { date: string; label: string; contractId: string; paymentId: string | null }[];
};

// Mesma ordem/rótulos de lib/commercial-status-resolver.ts (servidor) — só
// para exibição enquanto overview ainda não carregou; a categoria de cada
// aluno em si sempre vem calculada pela API (resolveStudentCommercialRow),
// nunca recalculada aqui no cliente.
const COMMERCIAL_STATUS_CATEGORIES_FALLBACK: CommercialStatusCard[] = [
  { category: "EM_TESTE", label: "Em teste", count: 0 },
  { category: "TESTE_TERMINA_EM_BREVE", label: "Teste termina em até 2 dias", count: 0 },
  { category: "AGUARDANDO_PAGAMENTO", label: "Aguardando pagamento", count: 0 },
  { category: "CONTRATO_ATIVO", label: "Contratos ativos", count: 0 },
  { category: "PAGAMENTO_ATRASADO", label: "Pagamento atrasado", count: 0 },
  { category: "SUSPENSO", label: "Suspensos", count: 0 },
  { category: "ENCERRADO", label: "Encerrados", count: 0 },
];

const COMMERCIAL_STATUS_CATEGORY_LABELS: Record<CommercialStatusCategory, string> = {
  EM_TESTE: "Em teste",
  TESTE_TERMINA_EM_BREVE: "Teste termina em até 2 dias",
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  CONTRATO_ATIVO: "Contratos ativos",
  PAGAMENTO_ATRASADO: "Pagamento atrasado",
  SUSPENSO: "Suspensos",
  ENCERRADO: "Encerrados",
};

const COMMERCIAL_STATUS_BADGE_CLASSES: Record<CommercialStatusCategory, string> = {
  EM_TESTE: "bg-blue-500/15 border-blue-500/30 text-blue-300",
  TESTE_TERMINA_EM_BREVE: "bg-yellow-500/15 border-yellow-500/30 text-yellow-300",
  AGUARDANDO_PAGAMENTO: "bg-yellow-500/15 border-yellow-500/30 text-yellow-300",
  CONTRATO_ATIVO: "bg-green-500/15 border-green-500/30 text-green-300",
  PAGAMENTO_ATRASADO: "bg-red-500/15 border-red-500/30 text-red-300",
  SUSPENSO: "bg-orange-500/15 border-orange-500/30 text-orange-300",
  ENCERRADO: "bg-[#1a1a1a] border-[#ffffff10] text-[#6b6b6b]",
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

  const [overview, setOverview] = useState<FinanceiroOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CommercialStatusCategory | null>(null);
  const [tableSearch, setTableSearch] = useState("");

  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FinanceiroDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [savingContract, setSavingContract] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [renewingContractId, setRenewingContractId] = useState("");
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

  async function loadOverview() {
    setOverviewLoading(true);

    try {
      const res = await fetch("/api/financeiro/overview", { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (res.ok) {
        setOverview(json);
      } else {
        setMessage({ type: "error", text: json?.error || "Erro ao carregar a situação comercial dos alunos." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar a situação comercial dos alunos." });
    }

    setOverviewLoading(false);
  }

  async function loadDetail(targetStudentId: string) {
    setDetailLoading(true);

    try {
      const res = await fetch(`/api/financeiro/overview/${targetStudentId}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (res.ok) {
        setDetail(json);
      } else {
        setMessage({ type: "error", text: json?.error || "Erro ao carregar o detalhe financeiro do aluno." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar o detalhe financeiro do aluno." });
    }

    setDetailLoading(false);
  }

  function openStudentDetail(targetStudentId: string) {
    setDetailStudentId(targetStudentId);
    loadDetail(targetStudentId);
  }

  function closeStudentDetail() {
    setDetailStudentId(null);
    setDetail(null);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialStudentId = params.get("studentId") || "";

    if (initialStudentId) {
      setPendingStudentIdFromUrl(initialStudentId);
      setStudentId(initialStudentId);
    }

    loadData();
    loadOverview();
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
    // Regra explícita de elegibilidade (lib/service-plan-eligibility.ts):
    // modelo novo = ativo com BillingOption ativa; compatibilidade legada =
    // plano pago antigo ativo (allowTrial=false); um plano antigo só de
    // teste (allowTrial=true, sem BillingOption) nunca aparece aqui.
    return filterServicePlansEligibleForPaidContracting(contractsData?.plans || []);
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

  // Alunos já renovados (StudentContract.renewedFromContractId aponta pra
  // cá) não podem mostrar o botão "Renovar" de novo no drawer de detalhe.
  const renewedSourceContractIds = useMemo(() => {
    return new Set(
      (contractsData?.contracts || [])
        .filter((contract) => contract.renewedFromContractId && contract.status !== "CANCELLED")
        .map((contract) => String(contract.renewedFromContractId))
    );
  }, [contractsData]);

  const filteredOverviewRows = useMemo(() => {
    const rows = overview?.rows || [];
    const search = tableSearch.trim().toLowerCase();

    return rows.filter((row) => {
      if (activeCategory && row.category !== activeCategory) return false;
      if (search && !row.studentName.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [overview, activeCategory, tableSearch]);

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
        await loadOverview();
        if (detailStudentId) await loadDetail(detailStudentId);
      } else {
        setMessage({ type: "error", text: json?.error || "Erro ao criar contrato." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao criar contrato." });
    }

    setSavingContract(false);
  }

  async function handleRenewContract(contract: ContractItem) {
    if (renewingContractId) return;

    const confirmed = window.confirm(
      `Renovar o contrato de ${contract.studentName}?\n\nO próximo ciclo será criado automaticamente para começar no dia seguinte ao término do contrato atual, com cobrança de ${formatMoney(contract.priceCents)} em aberto. O contrato atual continuará ativo até o vencimento.`
    );

    if (!confirmed) return;

    setRenewingContractId(contract.id);
    setMessage(null);

    try {
      const res = await fetch(`/api/student-contracts/${contract.id}/renew`, {
        method: "POST",
      });

      const json = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({
          type: "success",
          text:
            json?.message ||
            `Renovação criada. A cobrança de ${formatMoney(contract.priceCents)} está em aberto para o próximo ciclo.`,
        });
        if (json?.contract?.id) {
          setPaymentContractId(json.contract.id);
          setPaymentAmountReais(String(contract.priceCents / 100));
        }
        await loadData();
        await loadOverview();
        if (detailStudentId) await loadDetail(detailStudentId);
      } else {
        setMessage({ type: "error", text: json?.error || "Erro ao renovar contrato." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao renovar contrato." });
    }

    setRenewingContractId("");
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
        await loadOverview();
        if (detailStudentId) await loadDetail(detailStudentId);
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
        await loadOverview();
        if (detailStudentId) await loadDetail(detailStudentId);
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
        await loadOverview();
        if (detailStudentId) await loadDetail(detailStudentId);
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
        await loadOverview();
        if (detailStudentId) await loadDetail(detailStudentId);
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
  const currentRow = detail?.currentRow ?? null;
  const currentPaymentId = currentRow?.paymentId ?? null;

  return (
    <main className="p-6 space-y-6 bg-[#0a0a0a] min-h-screen text-[#f5f5f5]">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-[#00A19C] mb-2">
          Contratos, ciclos e pagamentos
        </p>
        <h1 className="text-3xl font-bold text-[#00A19C]">Financeiro</h1>
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
        {(overview?.cards || COMMERCIAL_STATUS_CATEGORIES_FALLBACK).map((card) => {
          const isActive = activeCategory === card.category;

          return (
            <button
              key={card.category}
              type="button"
              onClick={() => setActiveCategory(isActive ? null : card.category)}
              className={`text-left bg-[#111] border rounded-2xl p-4 transition ${
                isActive ? "border-[#00A19C] ring-1 ring-[#00A19C]" : "border-[#ffffff10] hover:border-[#ffffff30]"
              }`}
            >
              <p className="text-xs uppercase text-[#6b6b6b]">{card.label}</p>
              <p className="text-2xl font-bold text-[#f5f5f5] mt-1">{overviewLoading ? "…" : card.count}</p>
            </button>
          );
        })}
      </div>

      {activeCategory && (
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className="text-xs text-[#00A19C] underline"
        >
          Limpar filtro de situação ({COMMERCIAL_STATUS_CATEGORY_LABELS[activeCategory]})
        </button>
      )}

      <section id="converter-experiencia" className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4 scroll-mt-6">
        <div>
          <h2 className="text-lg font-semibold text-[#00A19C]">Converter experiência para plano pago</h2>
          <p className="text-xs text-[#a1a1a1] mt-1">
            Use quando o aluno em experiência decidiu continuar. Se já pagou, marque como Pago para ativar o contrato imediatamente.
          </p>

          {pendingStudentIdFromUrl && (
            <div className="mt-3 rounded-xl bg-[#00A19C]/10 border border-[#00A19C]/20 p-3 text-xs text-[#f5f5f5]">
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
              />
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Vencimento do pagamento</label>
              <input
                type="date"
                value={conversionDueDate}
                onChange={(event) => setConversionDueDate(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
              />
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Valor</label>
              <input
                value={conversionPriceReais}
                onChange={(event) => setConversionPriceReais(event.target.value)}
                placeholder="Ex.: 297,00"
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
              />
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Forma</label>
              <select
                value={conversionPaymentMethod}
                onChange={(event) => setConversionPaymentMethod(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
              />
            </div>
          </div>

          <textarea
            value={conversionNotes}
            onChange={(event) => setConversionNotes(event.target.value)}
            placeholder="Observações da conversão..."
            className="w-full min-h-[80px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
          />

          <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4 text-xs text-[#a1a1a1]">
            Se o status for <strong className="text-green-300">Pago</strong>, o sistema finaliza a experiência e ativa o contrato pago.
            Se ficar <strong className="text-yellow-300">Em aberto</strong>, o contrato pago fica aguardando pagamento e a experiência continua ativa.
          </div>

          <button
            type="submit"
            disabled={convertingTrial || activeTrialContracts.length === 0}
            className="bg-[#00A19C] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#008B87] transition disabled:opacity-50"
          >
            {convertingTrial ? "Convertendo..." : "Converter experiência"}
          </button>
        </form>
      </section>

      <section className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[#00A19C]">Criar contrato / ciclo</h2>
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
              />
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Valor total do contrato</label>
              <input
                value={priceReais}
                onChange={(event) => setPriceReais(event.target.value)}
                placeholder="Ex.: 297,00"
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
              />
            </div>
          </div>

          {calculatedPreview && (
            <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4 text-sm text-[#d6d6d6]">
              <strong className="text-[#00A19C]">Prévia:</strong>{" "}
              {calculatedPreview.workoutsPerWeek} treino(s)/semana · {calculatedPreview.workoutsPerMonth} treino(s)/mês · total de{" "}
              {calculatedPreview.total} treino(s) · fim em {formatDate(calculatedPreview.endDate)}
            </div>
          )}

          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Observações internas..."
            className="w-full min-h-[80px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
          />

          <label className="flex items-start gap-2 text-xs text-[#a1a1a1]">
            <input
              type="checkbox"
              checked={activateNow}
              onChange={(event) => setActivateNow(event.target.checked)}
              className="mt-0.5 accent-[#00A19C]"
            />
            <span>
              Ativar contrato agora. Para contrato pago, marque apenas se o pagamento já foi confirmado.
              Se desmarcado, ficará como aguardando pagamento.
            </span>
          </label>

          <button
            type="submit"
            disabled={savingContract}
            className="bg-[#00A19C] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#008B87] transition disabled:opacity-50"
          >
            {savingContract ? "Criando..." : "Criar contrato"}
          </button>
        </form>
      </section>

      <section className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[#00A19C]">Registrar pagamento manual</h2>
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
              />
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Vencimento</label>
              <input
                type="date"
                value={paymentDueDate}
                onChange={(event) => setPaymentDueDate(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
              />
            </div>

            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1">Forma</label>
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
              />
            </div>
          </div>

          <textarea
            value={paymentNotes}
            onChange={(event) => setPaymentNotes(event.target.value)}
            placeholder="Observações do pagamento..."
            className="w-full min-h-[80px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
          />

          <label className="flex items-start gap-2 text-xs text-[#a1a1a1]">
            <input
              type="checkbox"
              checked={activateContractOnPaid}
              onChange={(event) => setActivateContractOnPaid(event.target.checked)}
              className="mt-0.5 accent-[#00A19C]"
            />
            <span>
              Se o pagamento for marcado como pago, ativar automaticamente o contrato e substituir o ciclo anterior.
            </span>
          </label>

          <button
            type="submit"
            disabled={savingPayment}
            className="bg-[#00A19C] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#008B87] transition disabled:opacity-50"
          >
            {savingPayment ? "Registrando..." : "Registrar pagamento"}
          </button>
        </form>
      </section>

      <section className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#00A19C]">Alunos</h2>
            <p className="text-xs text-[#a1a1a1] mt-1">
              Uma linha por aluno, com a situação comercial calculada automaticamente (ver cards acima para filtrar).
            </p>
          </div>

          <input
            value={tableSearch}
            onChange={(event) => setTableSearch(event.target.value)}
            placeholder="Buscar aluno..."
            className="bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C] w-full lg:w-64"
          />
        </div>

        <div className="overflow-x-auto">
          {overviewLoading ? (
            <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4 text-sm text-[#a1a1a1]">
              Carregando situação comercial...
            </div>
          ) : filteredOverviewRows.length === 0 ? (
            <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4 text-sm text-[#a1a1a1]">
              Nenhum aluno encontrado para esse filtro.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[#6b6b6b] border-b border-[#ffffff10]">
                  <th className="py-2 pr-3">Aluno</th>
                  <th className="py-2 pr-3">Situação</th>
                  <th className="py-2 pr-3">Plano</th>
                  <th className="py-2 pr-3">Cobrança</th>
                  <th className="py-2 pr-3">Próxima data</th>
                  <th className="py-2 pr-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filteredOverviewRows.map((row) => (
                  <tr key={row.studentId} className="border-b border-[#ffffff08] hover:bg-[#ffffff05]">
                    <td className="py-3 pr-3 font-medium text-[#f5f5f5]">{row.studentName}</td>
                    <td className="py-3 pr-3">
                      <span
                        className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${COMMERCIAL_STATUS_BADGE_CLASSES[row.category]}`}
                      >
                        {row.categoryLabel}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-[#d6d6d6]">{row.planName}</td>
                    <td className="py-3 pr-3 text-[#d6d6d6]">{row.billingLabel}</td>
                    <td className="py-3 pr-3 text-[#d6d6d6]">{formatDate(row.nextDate)}</td>
                    <td className="py-3 pr-3">
                      <button
                        type="button"
                        onClick={() => openStudentDetail(row.studentId)}
                        className="rounded-xl bg-[#1a1a1a] border border-[#00A19C]/30 text-[#00A19C] px-3 py-2 text-xs font-semibold"
                      >
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {detailStudentId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={closeStudentDetail}>
          <div
            className="w-full max-w-xl h-full bg-[#111] border-l border-[#ffffff10] overflow-y-auto p-6 space-y-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#00A19C]">{detail?.student.name || "Carregando..."}</h2>
                {detail?.student.email && <p className="text-xs text-[#a1a1a1]">{detail.student.email}</p>}
                {detail?.student.phone && <p className="text-xs text-[#a1a1a1]">{detail.student.phone}</p>}
              </div>
              <button type="button" onClick={closeStudentDetail} className="text-[#a1a1a1] hover:text-[#f5f5f5] text-sm">
                Fechar
              </button>
            </div>

            {detailLoading && !detail && (
              <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4 text-sm text-[#a1a1a1]">
                Carregando detalhe financeiro...
              </div>
            )}

            {currentRow && (
              <div className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4 space-y-2">
                <span
                  className={`inline-block rounded-full border px-2 py-1 text-[11px] font-semibold ${COMMERCIAL_STATUS_BADGE_CLASSES[currentRow.category]}`}
                >
                  {currentRow.categoryLabel}
                </span>
                <p className="text-sm text-[#f5f5f5]">
                  {currentRow.planName} · {currentRow.billingLabel}
                </p>
                <p className="text-xs text-[#6b6b6b]">Próxima data: {formatDate(currentRow.nextDate)}</p>

                <div className="flex flex-wrap gap-2 pt-2">
                  {currentRow.contractStatus !== "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateContractStatus(currentRow.contractId, "ACTIVE")}
                      className="rounded-xl bg-green-500/15 border border-green-500/20 text-green-300 px-3 py-2 text-xs font-semibold"
                    >
                      Ativar
                    </button>
                  )}
                  {currentRow.contractStatus !== "SUSPENDED" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateContractStatus(currentRow.contractId, "SUSPENDED")}
                      className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 px-3 py-2 text-xs font-semibold"
                    >
                      Suspender
                    </button>
                  )}
                  {currentRow.contractStatus !== "FINALIZED" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateContractStatus(currentRow.contractId, "FINALIZED")}
                      className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] text-[#a1a1a1] px-3 py-2 text-xs font-semibold"
                    >
                      Finalizar
                    </button>
                  )}
                  {currentPaymentId && currentRow.paymentStatus !== "PAGO" && (
                    <button
                      type="button"
                      onClick={() => handleUpdatePaymentStatus(currentPaymentId, "PAGO")}
                      className="rounded-xl bg-green-500/15 border border-green-500/20 text-green-300 px-3 py-2 text-xs font-semibold"
                    >
                      Marcar pago e ativar contrato
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentContractId(currentRow.contractId);
                      setPaymentAmountReais("");
                      setPaymentDueDate(todayIso());
                      closeStudentDetail();
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="rounded-xl bg-[#1a1a1a] border border-[#00A19C]/30 text-[#00A19C] px-3 py-2 text-xs font-semibold"
                  >
                    Registrar pagamento
                  </button>
                  {currentRow.contractType === "TRIAL" && (
                    <button
                      type="button"
                      onClick={() => {
                        setConversionTrialContractId(currentRow.contractId);
                        closeStudentDetail();
                        window.setTimeout(() => {
                          document.getElementById("converter-experiencia")?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }, 150);
                      }}
                      className="rounded-xl bg-[#00A19C]/15 border border-[#00A19C]/30 text-[#00A19C] px-3 py-2 text-xs font-semibold"
                    >
                      Converter para plano pago
                    </button>
                  )}
                  {currentRow.contractType === "PAID" &&
                    currentRow.contractStatus === "ACTIVE" &&
                    (renewedSourceContractIds.has(currentRow.contractId) ? (
                      <span className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] text-[#6b6b6b] px-3 py-2 text-xs font-semibold">
                        Renovação já criada
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const legacyContract = contractsData?.contracts.find((c) => c.id === currentRow.contractId);
                          if (legacyContract) handleRenewContract(legacyContract);
                        }}
                        disabled={Boolean(renewingContractId)}
                        className="rounded-xl bg-[#00A19C]/15 border border-[#00A19C]/30 text-[#00A19C] px-3 py-2 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {renewingContractId === currentRow.contractId ? "Renovando..." : "Renovar"}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {detail && detail.contracts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[#00A19C]">Contratos e cobranças</h3>
                {detail.contracts.map((contract) => (
                  <div key={contract.id} className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] p-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#f5f5f5]">{typeLabel(contract.type)}</span>
                      <span className="rounded-full bg-[#ffffff08] text-[#a1a1a1] px-2 py-1 text-[11px]">
                        {statusLabel(contract.status)}
                      </span>
                      {contract.source && (
                        <span className="rounded-full bg-[#ffffff08] text-[#6b6b6b] px-2 py-1 text-[11px]">{contract.source}</span>
                      )}
                    </div>
                    <p className="text-xs text-[#a1a1a1]">
                      {contract.planName} · {contract.billingLabel}
                    </p>
                    <p className="text-xs text-[#6b6b6b]">
                      {formatDate(contract.startDate)} até {formatDate(contract.endDate)}
                    </p>
                    {contract.termsAcceptedAt && (
                      <p className="text-xs text-[#6b6b6b]">
                        Termos aceitos: versão {contract.termsVersion || "?"} em {formatDate(contract.termsAcceptedAt)}
                      </p>
                    )}

                    {contract.payments.length > 0 && (
                      <div className="pt-2 space-y-2">
                        {contract.payments.map((payment) => (
                          <div key={payment.id} className="rounded-lg bg-[#0f0f0f] border border-[#ffffff08] p-3 text-xs space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-[#f5f5f5]">{formatMoney(payment.amountCents)}</span>
                              <span className="rounded-full bg-[#00A19C]/15 text-[#00A19C] px-2 py-1 text-[11px] font-semibold">
                                {paymentStatusLabel(payment.status)}
                              </span>
                            </div>
                            <p className="text-[#6b6b6b]">
                              Vencimento: {formatDate(payment.dueDate)}
                              {payment.paidAt ? ` · Pago em: ${formatDate(payment.paidAt)}` : ""}
                              {payment.method ? ` · ${payment.method}` : ""}
                            </p>
                            {/* Referências reais da Asaas só aparecem quando a cobrança
                                de fato passou pelo checkout/webhook self-service — nunca
                                um valor inventado ou um link estático. */}
                            {(payment.provider === "ASAAS" || payment.providerPaymentId || payment.providerSubscriptionId) && (
                              <p className="text-[#6b6b6b] break-all">
                                Asaas: {payment.providerPaymentId || "-"}
                                {payment.providerSubscriptionId ? ` · assinatura ${payment.providerSubscriptionId}` : ""}
                                {payment.externalReference ? ` · ref. ${payment.externalReference}` : ""}
                              </p>
                            )}
                            {payment.paymentLinkUrl && (
                              <a
                                href={payment.paymentLinkUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#00A19C] underline inline-block"
                              >
                                Abrir link de pagamento
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {detail && detail.history.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[#00A19C]">Histórico</h3>
                <div className="space-y-1">
                  {detail.history.map((event, index) => (
                    <p key={`${event.contractId}-${event.paymentId || "c"}-${index}`} className="text-xs text-[#a1a1a1]">
                      <span className="text-[#6b6b6b]">{formatDate(event.date)}</span> — {event.label}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

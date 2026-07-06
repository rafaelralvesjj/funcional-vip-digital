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

type ApiResponse = {
  contracts: ContractItem[];
  students: StudentOption[];
  plans: PlanOption[];
  noContractStudents: StudentOption[];
  metrics: {
    totalContracts: number;
    activeContracts: number;
    endingSoonContracts: number;
    expiredContracts: number;
    trialContracts: number;
    noContractStudents: number;
    expectedRevenueCents: number;
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

function commercialStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    LEAD: "Lead",
    EXPERIENCIA_ATIVA: "Experiência ativa",
    CONTRATO_ATIVO: "Contrato ativo",
    SEM_CONTRATO_ATIVO: "Sem contrato ativo",
    SUSPENSO_POR_PAGAMENTO: "Suspenso por pagamento",
    AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
    AGUARDANDO_ACEITE: "Aguardando aceite",
    INATIVO: "Inativo",
  };

  return labels[status] || status;
}

function daysUntil(value: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(value);
  date.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function statusStyle(status: string): string {
  if (status === "ACTIVE") return "bg-green-500/10 text-green-400 border-green-500/20";
  if (status === "SUSPENDED") return "bg-red-500/10 text-red-400 border-red-500/20";
  if (status === "AWAITING_PAYMENT") return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  if (status === "FINALIZED") return "bg-[#1a1a1a] text-[#a1a1a1] border-[#ffffff10]";
  return "bg-blue-500/10 text-blue-400 border-blue-500/20";
}

export default function FinanceiroPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("VENCENDO");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [studentId, setStudentId] = useState("");
  const [planId, setPlanId] = useState("");
  const [type, setType] = useState("PAID");
  const [durationMonths, setDurationMonths] = useState("1");
  const [startDate, setStartDate] = useState(todayIso());
  const [priceReais, setPriceReais] = useState("");
  const [activateNow, setActivateNow] = useState(true);
  const [notes, setNotes] = useState("");

  async function loadData() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/student-contracts", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);

      if (res.ok) {
        setData(json);
      } else {
        const detail = json?.message ? ` Detalhe: ${json.message}` : "";
        setMessage({ type: "error", text: `${json?.error || "Erro ao carregar financeiro."}${detail}` });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar financeiro. Abra a aba Network para ver a resposta da rota /api/student-contracts." });
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedPlan = useMemo(() => {
    return data?.plans.find((plan) => plan.id === planId) || null;
  }, [data, planId]);

  useEffect(() => {
    if (!selectedPlan) return;

    setDurationMonths(String(selectedPlan.durationMonths || 1));
    setPriceReais(selectedPlan.priceCents ? String(selectedPlan.priceCents / 100) : "");
    setType(selectedPlan.allowTrial ? "TRIAL" : "PAID");
  }, [selectedPlan?.id]);

  const calculatedPreview = useMemo(() => {
    const months = Number(durationMonths || selectedPlan?.durationMonths || 1);
    const workoutsPerMonth = selectedPlan?.workoutsPerMonth || 0;
    const workoutsPerWeek = selectedPlan?.workoutsPerWeek || 0;
    const totalWorkouts = workoutsPerMonth * Math.max(months, 1);

    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + Math.max(months, 1));
    end.setDate(end.getDate() - 1);

    return {
      months,
      workoutsPerMonth,
      workoutsPerWeek,
      totalWorkouts,
      endDate: Number.isNaN(end.getTime()) ? null : end,
    };
  }, [durationMonths, selectedPlan, startDate]);

  const contracts = data?.contracts || [];

  const filteredContracts = useMemo(() => {
    const now = new Date();
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);

    if (filter === "TODOS") return contracts;

    if (filter === "ATIVOS") {
      return contracts.filter((contract) => contract.status === "ACTIVE");
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
      return contracts.filter((contract) => contract.type === "TRIAL" && contract.status === "ACTIVE");
    }

    if (filter === "PAGAMENTO") {
      return contracts.filter((contract) => contract.status === "AWAITING_PAYMENT" || contract.status === "SUSPENDED");
    }

    return contracts;
  }, [contracts, filter]);

  async function createContract() {
    if (!studentId || !selectedPlan) {
      setMessage({ type: "error", text: "Selecione aluno e plano antes de criar o contrato." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const priceCents =
        priceReais.trim() === ""
          ? selectedPlan.priceCents
          : Math.round(Number(priceReais.replace(",", ".")) * 100);

      const res = await fetch("/api/student-contracts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId,
          planId,
          type,
          durationMonths: Number(durationMonths || 1),
          startDate,
          priceCents,
          activate: activateNow,
          status: activateNow ? "ACTIVE" : "DRAFT",
          source: "MANUAL",
          notes,
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({ type: "success", text: "Contrato criado com sucesso." });
        setStudentId("");
        setNotes("");
        await loadData();
      } else {
        setMessage({ type: "error", text: json?.error || "Erro ao criar contrato." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao criar contrato." });
    }

    setSaving(false);
  }

  async function updateContractStatus(contract: ContractItem, status: string) {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/student-contracts", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: contract.id,
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

    setSaving(false);
  }

  const metrics = data?.metrics;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <p className="text-xs text-[#D4A373] uppercase tracking-[0.3em] mb-2">
          Contratos e ciclos
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-[#D4A373]">
          Financeiro
        </h1>
        <p className="text-sm text-[#a1a1a1] mt-2 max-w-5xl">
          Controle o ciclo comercial do aluno: experiência, contrato ativo, vencimento,
          pausa, suspensão por pagamento e reativação. Os treinos e contadores operacionais
          devem olhar o contrato atual, não o histórico antigo.
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

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-[10px] text-[#6b6b6b] uppercase">Contratos ativos</p>
          <p className="text-2xl font-bold text-green-400">{metrics?.activeContracts || 0}</p>
        </div>

        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-[10px] text-[#6b6b6b] uppercase">Vencendo</p>
          <p className="text-2xl font-bold text-yellow-400">{metrics?.endingSoonContracts || 0}</p>
        </div>

        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-[10px] text-[#6b6b6b] uppercase">Vencidos</p>
          <p className="text-2xl font-bold text-red-400">{metrics?.expiredContracts || 0}</p>
        </div>

        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-[10px] text-[#6b6b6b] uppercase">Experiência</p>
          <p className="text-2xl font-bold text-blue-400">{metrics?.trialContracts || 0}</p>
        </div>

        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-[10px] text-[#6b6b6b] uppercase">Sem contrato</p>
          <p className="text-2xl font-bold text-[#f5f5f5]">{metrics?.noContractStudents || 0}</p>
        </div>

        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4">
          <p className="text-[10px] text-[#6b6b6b] uppercase">Previsto</p>
          <p className="text-xl font-bold text-[#D4A373]">{formatMoney(metrics?.expectedRevenueCents || 0)}</p>
        </div>
      </div>

      <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[#D4A373]">
            Criar contrato / ciclo
          </h2>
          <p className="text-xs text-[#a1a1a1] mt-1">
            Selecione o aluno, escolha o plano e a duração. O sistema calcula automaticamente
            o total de treinos do contrato.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[#a1a1a1] block mb-1">Aluno</label>
            <select
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
            >
              <option value="">Selecione...</option>
              {(data?.students || []).map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} · {commercialStatusLabel(student.commercialStatus)}
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
              {(data?.plans || []).map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · {plan.workoutsPerMonth} treinos/mês
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-[#a1a1a1] block mb-1">Tipo</label>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
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
              <option value="1">1 mês</option>
              <option value="2">2 meses</option>
              <option value="3">3 meses</option>
              <option value="6">6 meses</option>
              <option value="12">12 meses</option>
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
              className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
            />
          </div>
        </div>

        {selectedPlan && (
          <div className="bg-[#0a0a0a] border border-[#D4A373]/20 rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <p className="text-[10px] text-[#6b6b6b] uppercase">Treinos/semana</p>
              <p className="text-lg font-semibold text-[#f5f5f5]">{calculatedPreview.workoutsPerWeek}</p>
            </div>

            <div>
              <p className="text-[10px] text-[#6b6b6b] uppercase">Treinos/mês</p>
              <p className="text-lg font-semibold text-[#f5f5f5]">{calculatedPreview.workoutsPerMonth}</p>
            </div>

            <div>
              <p className="text-[10px] text-[#6b6b6b] uppercase">Duração</p>
              <p className="text-lg font-semibold text-[#f5f5f5]">{calculatedPreview.months} mês(es)</p>
            </div>

            <div>
              <p className="text-[10px] text-[#6b6b6b] uppercase">Total contrato</p>
              <p className="text-lg font-semibold text-[#D4A373]">{calculatedPreview.totalWorkouts} treinos</p>
            </div>

            <div>
              <p className="text-[10px] text-[#6b6b6b] uppercase">Fim previsto</p>
              <p className="text-lg font-semibold text-[#f5f5f5]">
                {calculatedPreview.endDate ? formatDate(calculatedPreview.endDate.toISOString()) : "-"}
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-[#a1a1a1] block mb-1">Observações internas</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Ex.: aluno veio do Instagram, fechou pelo WhatsApp, aguardando comprovante..."
            className="w-full min-h-[80px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-[#a1a1a1]">
          <input
            type="checkbox"
            checked={activateNow}
            onChange={(event) => setActivateNow(event.target.checked)}
          />
          Ativar contrato agora. Se desmarcar, ficará como rascunho.
        </label>

        <button
          type="button"
          onClick={createContract}
          disabled={saving || loading}
          className="w-full md:w-auto px-5 py-3 rounded-xl bg-[#D4A373] text-[#0a0a0a] font-semibold text-sm hover:bg-[#c8945f] disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Criar contrato"}
        </button>
      </div>

      <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#D4A373]">
              Listas para tomada de decisão
            </h2>
            <p className="text-xs text-[#a1a1a1] mt-1">
              Use os filtros para acompanhar contratos vencendo, experiência grátis,
              pagamentos pendentes e alunos sem contrato.
            </p>
          </div>

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
          >
            <option value="VENCENDO">Contratos vencendo em 7 dias</option>
            <option value="VENCIDOS">Contratos vencidos</option>
            <option value="ATIVOS">Contratos ativos</option>
            <option value="EXPERIENCIA">Experiência grátis</option>
            <option value="PAGAMENTO">Aguardando/suspenso por pagamento</option>
            <option value="TODOS">Todos os contratos</option>
          </select>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-[#a1a1a1]">
            Carregando contratos...
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#a1a1a1]">
            Nenhum contrato nesta lista.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredContracts.map((contract) => {
              const days = daysUntil(contract.endDate);

              return (
                <div
                  key={contract.id}
                  className="bg-[#0a0a0a] border border-[#ffffff10] rounded-xl p-4 space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`text-[10px] px-2 py-1 rounded-full border ${statusStyle(contract.status)}`}>
                          {statusLabel(contract.status)}
                        </span>

                        <span className="text-[10px] px-2 py-1 rounded-full bg-[#D4A373]/10 text-[#D4A373]">
                          {contract.type === "TRIAL" ? "Experiência" : "Pago"}
                        </span>

                        {contract.status === "ACTIVE" && days >= 0 && days <= 7 && (
                          <span className="text-[10px] px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400">
                            vence em {days} dia(s)
                          </span>
                        )}

                        {contract.status === "ACTIVE" && days < 0 && (
                          <span className="text-[10px] px-2 py-1 rounded-full bg-red-500/10 text-red-400">
                            vencido há {Math.abs(days)} dia(s)
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-semibold text-[#f5f5f5]">
                        {contract.studentName}
                      </h3>

                      <p className="text-xs text-[#a1a1a1] mt-1">
                        {contract.planName} · {contract.workoutsPerMonth} treinos/mês · {contract.durationMonths} mês(es) · {contract.totalContractedWorkouts} treinos no ciclo
                      </p>

                      <p className="text-xs text-[#6b6b6b] mt-1">
                        Período: {formatDate(contract.startDate)} a {formatDate(contract.endDate)} · Professor: {contract.professorName || "Não informado"} · Valor: {formatMoney(contract.priceCents)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {contract.status !== "ACTIVE" && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => updateContractStatus(contract, "ACTIVE")}
                          className="text-xs px-3 py-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20"
                        >
                          Ativar
                        </button>
                      )}

                      {contract.status !== "SUSPENDED" && contract.status !== "FINALIZED" && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => updateContractStatus(contract, "SUSPENDED")}
                          className="text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        >
                          Suspender
                        </button>
                      )}

                      {contract.status !== "FINALIZED" && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => updateContractStatus(contract, "FINALIZED")}
                          className="text-xs px-3 py-2 rounded-lg bg-[#1a1a1a] text-[#a1a1a1] hover:text-white border border-[#ffffff10]"
                        >
                          Finalizar
                        </button>
                      )}
                    </div>
                  </div>

                  {contract.notes && (
                    <div className="bg-[#111] rounded-lg p-3 border border-[#ffffff08]">
                      <p className="text-[10px] text-[#6b6b6b] uppercase mb-1">
                        Observação
                      </p>
                      <p className="text-xs text-[#e5e5e5] whitespace-pre-wrap">
                        {contract.notes}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-3">
        <h2 className="text-lg font-semibold text-[#D4A373]">
          Alunos sem contrato ativo
        </h2>
        <p className="text-xs text-[#a1a1a1]">
          Esses alunos mantêm histórico, mas não devem receber treino novo, cobrança de treino perdido
          nem contador de evolução do ciclo atual.
        </p>

        {(data?.noContractStudents || []).length === 0 ? (
          <p className="text-sm text-[#a1a1a1]">Nenhum aluno sem contrato ativo.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(data?.noContractStudents || []).slice(0, 30).map((student) => (
              <div
                key={student.id}
                className="bg-[#0a0a0a] border border-[#ffffff10] rounded-xl p-4"
              >
                <p className="text-sm font-semibold text-[#f5f5f5]">{student.name}</p>
                <p className="text-xs text-[#a1a1a1] mt-1">{student.email || "sem e-mail"}</p>
                <p className="text-[10px] text-[#D4A373] mt-2">
                  {commercialStatusLabel(student.commercialStatus)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

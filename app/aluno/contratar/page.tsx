"use client";

import { useEffect, useMemo, useState } from "react";

type BillingOption = {
  id: string;
  billingCycle: string;
  amountCents: number;
  recommended: boolean;
};

type Plan = {
  id: string;
  name: string;
  description: string | null;
  workoutsPerWeek: number;
  workoutsPerMonth: number;
  billingOptions: BillingOption[];
};

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function billingCycleLabel(cycle: string): string {
  return cycle === "ANNUAL" ? "Anual" : "Mensal";
}

function normalizeCpfCnpjInput(value: string): string {
  return value.replace(/\D/g, "");
}

export default function ContratarPlanoPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedBillingOptionId, setSelectedBillingOptionId] = useState<string | null>(null);
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadBillingOptions() {
      try {
        const response = await fetch("/api/aluno/billing-options", { cache: "no-store" });
        const data = await response.json().catch(() => null);

        if (!active) return;

        if (!response.ok || !data?.ok) {
          setLoadError(data?.error || "Não foi possível carregar os planos disponíveis.");
          return;
        }

        const loadedPlans: Plan[] = data.plans || [];
        setPlans(loadedPlans);

        const allOptions = loadedPlans.flatMap((plan) => plan.billingOptions);
        const preselected = allOptions.find((option) => option.recommended) || allOptions[0] || null;
        setSelectedBillingOptionId(preselected?.id || null);
      } catch {
        if (active) setLoadError("Não foi possível carregar os planos disponíveis.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBillingOptions();

    return () => {
      active = false;
    };
  }, []);

  const allOptions = useMemo(
    () =>
      plans.flatMap((plan) =>
        plan.billingOptions.map((option) => ({ ...option, planName: plan.name }))
      ),
    [plans]
  );

  async function handleSubmit() {
    setSubmitAttempted(true);
    setSubmitError(null);

    if (!selectedBillingOptionId) {
      setSubmitError("Selecione uma opção de cobrança.");
      return;
    }

    const cleanCpfCnpj = normalizeCpfCnpjInput(cpfCnpj);
    if (!cleanCpfCnpj) {
      setSubmitError("Informe seu CPF ou CNPJ para gerar a cobrança.");
      return;
    }

    if (!acceptedTerms) {
      setSubmitError('Marque "Li e concordo com os termos e condições" para continuar.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/aluno/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingOptionId: selectedBillingOptionId,
          acceptedTerms: true,
          cpfCnpj: cleanCpfCnpj,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível iniciar o checkout agora.");
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      setSubmitError(
        "Checkout criado, mas o link de pagamento ainda não está disponível. Atualize esta página em instantes."
      );
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível iniciar o checkout agora.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-[#ffffff10] bg-[#111] p-4 text-sm text-[#a1a1a1]">
        Carregando planos disponíveis...
      </div>
    );
  }

  if (loadError || allOptions.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
        <p className="text-sm font-semibold text-amber-300">Checkout indisponível</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
          {loadError || "Nenhum plano disponível para contratação no momento. Fale com a equipe."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-[#f5f5f5]">Contratar plano</h1>
        <p className="text-xs text-[#a1a1a1]">Escolha a forma de pagamento e continue seu acompanhamento sem interrupção.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {allOptions.map((option) => {
          const selected = option.id === selectedBillingOptionId;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedBillingOptionId(option.id)}
              className={`relative rounded-xl border p-4 text-left transition ${
                selected
                  ? "border-[#00A19C] bg-[#00A19C]/10"
                  : "border-[#ffffff10] bg-[#111] hover:border-[#ffffff20]"
              }`}
            >
              {option.recommended && (
                <span className="absolute -top-2 right-3 rounded-full bg-[#00A19C] px-2 py-0.5 text-[9px] font-semibold text-[#0a0a0a]">
                  Recomendado
                </span>
              )}
              <p className="text-xs font-semibold text-[#e5e5e5]">{billingCycleLabel(option.billingCycle)}</p>
              <p className="mt-1 text-xl font-bold text-[#f5f5f5]">
                {formatMoney(option.amountCents)}
                <span className="text-xs font-normal text-[#a1a1a1]">
                  /{option.billingCycle === "ANNUAL" ? "ano" : "mês"}
                </span>
              </p>
              <p className="mt-1 text-[10px] text-[#a1a1a1]">{option.planName}</p>
            </button>
          );
        })}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[#d6d6d6]">CPF ou CNPJ</label>
        <input
          type="text"
          inputMode="numeric"
          value={cpfCnpj}
          onChange={(event) => setCpfCnpj(event.target.value)}
          placeholder="Necessário para gerar a cobrança"
          className="w-full rounded-xl border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
        />
      </div>

      <label
        className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 ${
          submitAttempted && !acceptedTerms ? "border-red-500/40 bg-red-500/10" : "border-[#ffffff10] bg-[#1a1a1a]"
        }`}
      >
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(event) => setAcceptedTerms(event.target.checked)}
          className="mt-1 h-4 w-4 accent-[#00A19C]"
        />
        <span className="text-xs leading-relaxed text-[#d6d6d6]">
          Li e concordo com os <strong className="text-[#00A19C]">Termos e Condições de Contratação</strong>.
          Entendo que o pagamento é processado pela Asaas e que meu plano é ativado automaticamente assim que o
          pagamento for confirmado.
        </span>
      </label>

      {submitError && <p className="text-xs text-red-300">{submitError}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-xl bg-[#00A19C] px-4 py-3 text-sm font-semibold text-[#0a0a0a] disabled:opacity-60"
      >
        {submitting ? "Gerando checkout..." : "Continuar para pagamento"}
      </button>
    </div>
  );
}

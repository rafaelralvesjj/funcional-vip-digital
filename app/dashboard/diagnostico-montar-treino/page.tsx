"use client";

import { useState } from "react";

export default function DiagnosticoMontarTreinoPage() {
  const [clicks, setClicks] = useState(0);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-xl border border-[#ffffff10] bg-[#111111] p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-[#D4A373]">
          Diagnóstico técnico
        </p>

        <h1 className="mt-2 text-2xl font-bold text-[#f5f5f5]">
          Teste mínimo da área de montar treino
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-[#a1a1a1]">
          Esta página usa o mesmo layout do dashboard, mas não carrega alunos,
          contratos, biblioteca, IA, localStorage nem APIs.
        </p>

        <div className="mt-5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-300">
            A página mínima abriu corretamente.
          </p>
          <p className="mt-1 text-xs text-emerald-100/80">
            Isso confirma que o dashboard e a hidratação básica do navegador
            estão funcionando.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setClicks((current) => current + 1)}
          className="mt-5 rounded-lg bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a]"
        >
          Testar interação ({clicks})
        </button>
      </div>
    </div>
  );
}

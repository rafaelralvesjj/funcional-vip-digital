import Link from "next/link";

export default function TrialContinuationDashboardShortcut() {
  return (
    <section className="rounded-2xl border border-[#00A19C]/20 bg-[#111111] p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#00A19C]">
            Conversão da experiência
          </p>

          <h2 className="mt-2 text-lg font-semibold text-[#f5f5f5]">
            Alunos interessados em continuar
          </h2>

          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#a1a1a1]">
            Acompanhe os alunos que clicaram em “Quero continuar” no painel do aluno
            e siga para a conversão da experiência no Financeiro.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link
            href="/dashboard/gestor/interesses-experiencia"
            className="inline-flex items-center justify-center rounded-lg bg-[#00A19C] px-4 py-2 text-xs font-semibold text-[#0a0a0a] transition hover:bg-[#008B87]"
          >
            Ver interessados
          </Link>

          <Link
            href="/dashboard/financeiro"
            className="inline-flex items-center justify-center rounded-lg border border-[#ffffff15] px-4 py-2 text-xs font-semibold text-[#a1a1a1] transition hover:border-[#00A19C]/50 hover:text-[#00A19C]"
          >
            Abrir Financeiro
          </Link>
        </div>
      </div>
    </section>
  );
}

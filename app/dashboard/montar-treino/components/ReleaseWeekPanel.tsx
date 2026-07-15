"use client";

import { ReleaseReviewContext } from "../lib/types";

interface Props {
  visible: boolean;
  loading: boolean;
  message: { type: "success" | "error" | "warning"; text: string } | null;
  reviewContext: ReleaseReviewContext | null;
  onRelease: (force: boolean) => void;
}

export default function ReleaseWeekPanel({
  visible,
  loading,
  message,
  reviewContext,
  onRelease,
}: Props) {
  if (!visible) return null;

  return (
    <section className="rounded-xl border border-[#D4A373]/20 bg-[#D4A373]/10 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#D4A373]">Revisão final da semana</h2>
          <p className="mt-1 text-xs text-[#a1a1a1]">
            Confira execução anterior, dúvidas, dor, eventos de cuidado e alterações cadastrais antes de liberar.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onRelease(false)}
          disabled={loading}
          className="rounded-lg bg-[#D4A373] px-4 py-2 text-xs font-semibold text-[#0a0a0a] disabled:opacity-50"
        >
          {loading ? "Verificando..." : "Revisar e liberar semana"}
        </button>
      </div>

      {message && (
        <div className="mt-3 rounded-lg border border-[#ffffff10] bg-[#0a0a0a] p-3 text-xs text-[#d4d4d4]">
          {message.text}
        </div>
      )}

      {reviewContext?.reviewAlerts?.length ? (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
          <p className="font-semibold">Pontos para revisar:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {reviewContext.reviewAlerts.map((alert, index) => (
              <li key={index}>{alert}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {reviewContext?.requiresReviewBeforeRelease && (
        <button
          type="button"
          onClick={() => onRelease(true)}
          disabled={loading}
          className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#0a0a0a]"
        >
          Confirmo que revisei e quero liberar
        </button>
      )}
    </section>
  );
}

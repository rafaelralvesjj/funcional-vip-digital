"use client";

import { StudentCareEventSummary } from "../lib/types";

interface Props {
  loading: boolean;
  events: StudentCareEventSummary[];
}

export default function CareStatusPanel({ loading, events }: Props) {
  if (loading) {
    return <section className="rounded-xl border border-[#ffffff10] bg-[#111111] p-4 text-xs text-[#a1a1a1]">Verificando alertas de cuidado do aluno...</section>;
  }

  const openEvents = events.filter((event) => String(event.status).toUpperCase() !== "RESOLVIDO");
  if (openEvents.length === 0) return null;

  const pause = openEvents.find((event) => String(event.eventType).toUpperCase() === "PAUSA_POR_CUIDADO");
  const returnRequested = Boolean(
    pause && (
      String(pause.status).toUpperCase() === "EM_REVISAO" ||
      String(pause.resolutionNotes || "").toLowerCase().includes("aptidão de retomada")
    )
  );

  return (
    <section className={"rounded-xl border p-4 " + (pause ? "border-red-500/30 bg-red-500/10" : "border-amber-500/20 bg-amber-500/10")}>
      <h2 className={"text-sm font-semibold " + (pause ? "text-red-300" : "text-amber-300")}>
        {pause ? "Bloqueio de segurança: pausa por cuidado" : "Alertas de cuidado em aberto"}
      </h2>
      {pause && (
        <p className="mt-2 text-xs leading-relaxed text-red-100/80">
          Enquanto a pausa permanecer aberta, não é permitido importar, salvar ou liberar treino normal.
          {returnRequested
            ? " O aluno já informou que se sente apto a voltar; a retomada ainda depende da revisão e resolução pelo professor."
            : " Aguarde o aluno sinalizar aptidão para retornar e faça a revisão antes de resolver o evento."}
        </p>
      )}
      <div className="mt-3 space-y-2">
        {openEvents.slice(0, 5).map((event) => (
          <div key={event.id} className="rounded-lg border border-[#ffffff10] bg-[#0a0a0a] p-3">
            <p className="text-xs font-semibold text-[#f5f5f5]">{event.title || event.eventType}</p>
            <p className="mt-1 text-[11px] text-[#a1a1a1]">Status: {event.status} · Gravidade: {event.severity}</p>
            {(event.professorMessage || event.description) && <p className="mt-2 text-[11px] leading-relaxed text-[#d4d4d4]">{event.professorMessage || event.description}</p>}
          </div>
        ))}
      </div>
      <a href="/dashboard/cuidado-aluno" className="mt-3 inline-flex rounded-lg bg-[#D4A373] px-4 py-2 text-xs font-semibold text-[#0a0a0a]">
        Revisar cuidado e retomada
      </a>
    </section>
  );
}

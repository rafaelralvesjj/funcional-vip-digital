"use client";

import { ReleaseReviewContext } from "../lib/types";

interface Props {
  visible: boolean;
  loading: boolean;
  message: { type: "success" | "error" | "warning"; text: string } | null;
  reviewContext: ReleaseReviewContext | null;
  onRelease: (force: boolean) => void;
  studentId: string;
  date: string;
  expectedWorkoutDates: string[];
}

export default function ReleaseWeekPanel({ visible, loading, message, reviewContext, onRelease, studentId, date, expectedWorkoutDates }: Props) {
  if (!visible) return null;
  const blocked = Boolean(reviewContext?.blocksRelease || reviewContext?.hasTrainingPauseCareEvent);

  return (
    <section className="rounded-xl border border-[#D4A373]/20 bg-[#D4A373]/10 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#D4A373]">Revisão final da semana</h2>
          <p className="mt-1 text-xs text-[#a1a1a1]">Confira execução anterior, dúvidas, dor, eventos de cuidado, pedido de retomada e alterações cadastrais antes de liberar.</p>
        </div>
        <button type="button" onClick={() => onRelease(false)} disabled={loading} className="rounded-lg bg-[#D4A373] px-4 py-2 text-xs font-semibold text-[#0a0a0a] disabled:opacity-50">{loading ? "Verificando..." : "Revisar e liberar semana"}</button>
      </div>

      {message && <div className="mt-3 rounded-lg border border-[#ffffff10] bg-[#0a0a0a] p-3 text-xs text-[#d4d4d4]">{message.text}</div>}

      {reviewContext && (
        <div className="mt-3 rounded-lg border border-[#ffffff10] bg-[#0a0a0a] p-3 text-xs text-[#a1a1a1]">
          <p className="font-semibold text-[#f5f5f5]">Dados considerados na revisão</p>
          {reviewContext.previousWeek?.label && <p className="mt-2">Semana anterior: <span className="text-[#f5f5f5]">{reviewContext.previousWeek.label}</span></p>}
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="rounded-lg bg-[#111111] p-2">Treinos anteriores: <strong>{reviewContext.previousWeekWorkouts ?? 0}</strong></div>
            <div className="rounded-lg bg-[#111111] p-2">Concluídos: <strong className="text-emerald-400">{reviewContext.completedPreviousWeek ?? 0}</strong></div>
            <div className="rounded-lg bg-[#111111] p-2">Pendentes: <strong className="text-amber-400">{reviewContext.pendingPreviousWeek ?? 0}</strong></div>
          </div>
          {reviewContext.stalePrescriptionBecauseOfNewContext && (
            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-red-200">
              <p className="font-semibold">Contexto novo depois do planejamento</p>
              <p className="mt-1">Novos eventos: {reviewContext.newCareEventsAfterPlanning ?? 0} · Novas dúvidas: {reviewContext.newStudentQuestionsAfterPlanning ?? 0} · Dor/desconforto: {reviewContext.newPainQuestionsAfterPlanning ?? 0}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`/dashboard/resumo-aluno?studentId=${encodeURIComponent(studentId)}&date=${encodeURIComponent(date)}&expectedWorkoutDates=${encodeURIComponent(expectedWorkoutDates.join(","))}`} className="rounded-lg bg-[#D4A373] px-3 py-2 font-semibold text-[#0a0a0a]">Gerar novo resumo IA atualizado</a>
                <a href="/dashboard/cuidado-aluno" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200">Revisar cuidado</a>
              </div>
            </div>
          )}
          {reviewContext.reviewAlerts?.length ? (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-amber-200">
              <p className="font-semibold">Pontos para revisar:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">{reviewContext.reviewAlerts.map((alert, index) => <li key={index}>{alert}</li>)}</ul>
            </div>
          ) : <p className="mt-3 text-emerald-400">Nenhum alerta crítico encontrado.</p>}
        </div>
      )}

      {blocked && <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs font-semibold text-red-300">Liberação bloqueada enquanto a pausa por cuidado estiver aberta. O pedido de retomada do aluno não libera automaticamente.</p>}

      {reviewContext?.requiresReviewBeforeRelease && !blocked && (
        <button type="button" onClick={() => onRelease(true)} disabled={loading} className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#0a0a0a]">Confirmo que revisei/ajustei e quero liberar</button>
      )}
    </section>
  );
}

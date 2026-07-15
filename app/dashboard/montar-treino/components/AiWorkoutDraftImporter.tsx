"use client";

import { useCallback, useEffect, useState } from "react";
import { AiWorkoutDraftBatch } from "../lib/types";

interface Props {
  onImport: (batch: AiWorkoutDraftBatch, index: number) => void;
  onClear: () => void;
  selectedStudentId: string;
  selectedDate: string;
  expectedWorkoutDates: string[];
  hasBlockingCarePause: boolean;
}

function validateDraft(
  parsed: AiWorkoutDraftBatch,
  selectedStudentId: string,
  expectedWorkoutDates: string[]
): string | null {
  if (!parsed?.studentId || !Array.isArray(parsed.workouts) || parsed.workouts.length === 0) {
    return "O rascunho salvo está incompleto.";
  }
  if (selectedStudentId && parsed.studentId !== selectedStudentId) {
    return "Este JSON pertence a outro aluno. Gere o resumo novamente a partir do aluno correto.";
  }
  if (parsed.aiValidation?.studentId && parsed.aiValidation.studentId !== parsed.studentId) {
    return "A validação de segurança do JSON não pertence ao aluno informado.";
  }
  if (expectedWorkoutDates.length > 0) {
    const validationDates = Array.isArray(parsed.aiValidation?.expectedWorkoutDates)
      ? parsed.aiValidation!.expectedWorkoutDates.map(String)
      : parsed.workouts.map((workout) => String(workout.date || ""));
    if (validationDates.join("|") !== expectedWorkoutDates.join("|")) {
      return "As datas do JSON não conferem com as datas esperadas desta semana.";
    }
    if (parsed.workouts.length !== expectedWorkoutDates.length) {
      return `Esta semana espera ${expectedWorkoutDates.length} treino(s), mas o JSON trouxe ${parsed.workouts.length}.`;
    }
    const invalidWorkout = parsed.workouts.find((workout, index) => String(workout.date || "") !== expectedWorkoutDates[index]);
    if (invalidWorkout) {
      return "Uma ou mais datas dos treinos não conferem com a semana selecionada.";
    }
  }
  return null;
}

export default function AiWorkoutDraftImporter({
  onImport,
  onClear,
  selectedStudentId,
  selectedDate,
  expectedWorkoutDates,
  hasBlockingCarePause,
}: Props) {
  const [batch, setBatch] = useState<AiWorkoutDraftBatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoImported, setAutoImported] = useState(false);

  const readDraft = useCallback((autoImport = false) => {
    setError(null);
    if (hasBlockingCarePause) {
      setBatch(null);
      setError("Importação bloqueada: o aluno está em pausa por cuidado.");
      return;
    }
    try {
      const raw = window.localStorage.getItem("aiWorkoutDraftBatch");
      if (!raw) {
        setBatch(null);
        setError("Nenhum rascunho da IA foi encontrado neste navegador.");
        return;
      }
      const parsed = JSON.parse(raw) as AiWorkoutDraftBatch;
      const validationError = validateDraft(parsed, selectedStudentId, expectedWorkoutDates);
      if (validationError) throw new Error(validationError);
      setBatch(parsed);
      if (autoImport && !autoImported) {
        const currentIndex = Math.min(Math.max(Number(parsed.currentIndex || 0), 0), parsed.workouts.length - 1);
        onImport(parsed, currentIndex);
        setAutoImported(true);
      }
    } catch (cause) {
      setBatch(null);
      setError(cause instanceof Error ? cause.message : "Rascunho inválido.");
    }
  }, [autoImported, expectedWorkoutDates, hasBlockingCarePause, onImport, selectedStudentId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") === "ai-json" && selectedStudentId && expectedWorkoutDates.length > 0) {
      readDraft(true);
    }
  }, [expectedWorkoutDates.length, readDraft, selectedStudentId]);

  const currentIndex = Math.min(
    Math.max(Number(batch?.currentIndex || 0), 0),
    Math.max((batch?.workouts.length || 1) - 1, 0)
  );

  const generationHref = selectedStudentId
    ? `/dashboard/resumo-aluno?studentId=${encodeURIComponent(selectedStudentId)}${selectedDate ? `&date=${encodeURIComponent(selectedDate)}` : ""}${expectedWorkoutDates.length ? `&expectedWorkoutDates=${encodeURIComponent(expectedWorkoutDates.join(","))}` : ""}`
    : "#";

  return (
    <section className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-blue-300">Montagem com apoio da IA</h2>
          <p className="mt-2 text-xs text-[#a1a1a1]">
            O aluno e a semana vêm do dashboard. O JSON é validado contra o aluno, a semana e as datas esperadas antes de ser importado.
          </p>
        </div>
        {selectedStudentId && !hasBlockingCarePause ? (
          <a href={generationHref} className="rounded-lg bg-[#D4A373] px-4 py-2 text-xs font-semibold text-[#0a0a0a]">Gerar resumo para IA</a>
        ) : (
          <button type="button" disabled className="rounded-lg bg-[#D4A373]/30 px-4 py-2 text-xs font-semibold text-[#737373]">Gerar resumo para IA</button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => readDraft(false)} disabled={hasBlockingCarePause} className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-200 disabled:opacity-40">
          Recuperar rascunho da IA
        </button>
        {batch && (
          <>
            <button type="button" onClick={() => onImport(batch, currentIndex)} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#0a0a0a]">Importar treino {currentIndex + 1} de {batch.workouts.length}</button>
            <button type="button" onClick={() => { window.localStorage.removeItem("aiWorkoutDraftBatch"); setBatch(null); setError(null); onClear(); }} className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300">Limpar rascunho</button>
          </>
        )}
      </div>

      {batch && (
        <div className="mt-4 rounded-lg border border-blue-500/20 bg-[#0a0a0a] p-3">
          <p className="text-sm font-semibold text-blue-200">{batch.studentName || "Aluno"} · {batch.workouts.length} treino(s)</p>
          {batch.scheduleDescription && <p className="mt-1 text-xs text-[#a1a1a1]">{batch.scheduleDescription}</p>}
          {batch.scheduleWarning && <p className="mt-1 text-xs text-amber-300">{batch.scheduleWarning}</p>}
        </div>
      )}
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </section>
  );
}

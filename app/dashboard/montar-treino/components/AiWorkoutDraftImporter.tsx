"use client";

import { useEffect, useState } from "react";
import { AiWorkoutDraftBatch } from "../lib/types";

interface Props {
  onImport: (batch: AiWorkoutDraftBatch, index: number) => void;
  onClear: () => void;
  selectedStudentId: string;
  selectedDate: string;
  expectedWorkoutDates: string[];
}

export default function AiWorkoutDraftImporter({
  onImport,
  onClear,
  selectedStudentId,
  selectedDate,
  expectedWorkoutDates,
}: Props) {
  const [batch, setBatch] = useState<AiWorkoutDraftBatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  function readDraft() {
    setError(null);

    try {
      const raw = window.localStorage.getItem("aiWorkoutDraftBatch");
      if (!raw) {
        setBatch(null);
        setError("Nenhum rascunho da IA foi encontrado neste navegador.");
        return;
      }

      const parsed = JSON.parse(raw) as AiWorkoutDraftBatch;

      if (!parsed?.studentId || !Array.isArray(parsed.workouts) || parsed.workouts.length === 0) {
        throw new Error("O rascunho salvo está incompleto.");
      }

      setBatch(parsed);
    } catch (cause) {
      setBatch(null);
      setError(cause instanceof Error ? cause.message : "Rascunho inválido.");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") === "ai-json") {
      readDraft();
    }
  }, []);

  const currentIndex = Math.min(
    Math.max(Number(batch?.currentIndex || 0), 0),
    Math.max((batch?.workouts.length || 1) - 1, 0)
  );

  return (
    <section className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-blue-300">Montagem com apoio da IA</h2>
          <p className="mt-2 text-xs text-[#a1a1a1]">
            O aluno já vem do dashboard. A IA define as datas dos treinos no JSON.
          </p>
        </div>

        {selectedStudentId ? (
          <a
            href={`/dashboard/resumo-aluno?studentId=${encodeURIComponent(
              selectedStudentId
            )}${selectedDate ? `&date=${encodeURIComponent(selectedDate)}` : ""}${
              expectedWorkoutDates.length
                ? `&expectedWorkoutDates=${encodeURIComponent(expectedWorkoutDates.join(","))}`
                : ""
            }`}
            className="rounded-lg bg-[#D4A373] px-4 py-2 text-xs font-semibold text-[#0a0a0a]"
          >
            Gerar resumo para IA
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="rounded-lg bg-[#D4A373]/30 px-4 py-2 text-xs font-semibold text-[#737373]"
          >
            Gerar resumo para IA
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={readDraft}
          className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-200"
        >
          Verificar rascunho salvo
        </button>

        {batch && (
          <>
            <button
              type="button"
              onClick={() => onImport(batch, currentIndex)}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#0a0a0a]"
            >
              Importar treino {currentIndex + 1} de {batch.workouts.length}
            </button>

            <button
              type="button"
              onClick={() => {
                window.localStorage.removeItem("aiWorkoutDraftBatch");
                setBatch(null);
                setError(null);
                onClear();
              }}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300"
            >
              Limpar rascunho
            </button>
          </>
        )}
      </div>

      {batch && (
        <div className="mt-4 rounded-lg border border-blue-500/20 bg-[#0a0a0a] p-3">
          <p className="text-sm font-semibold text-blue-200">
            {batch.studentName || "Aluno"} · {batch.workouts.length} treino(s)
          </p>
          {batch.scheduleDescription && (
            <p className="mt-1 text-xs text-[#a1a1a1]">{batch.scheduleDescription}</p>
          )}
          {batch.scheduleWarning && (
            <p className="mt-1 text-xs text-amber-300">{batch.scheduleWarning}</p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </section>
  );
}

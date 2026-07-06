"use client";

import { useEffect, useMemo, useState } from "react";

type StudentOption = {
  id: string;
  name: string;
  email?: string | null;
  professorName?: string | null;
  contractedTrainingDaysPerMonth?: number | null;
};

type SummaryResponse = {
  ok: boolean;
  generatedAt: string;
  student: {
    id: string;
    name: string;
    professorName?: string | null;
    weeklyLimit?: number | null;
  };
  metrics: Record<string, number>;
  summaryText: string;
  aiPrompt: string;
};

export default function ResumoAlunoPage() {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [viewMode, setViewMode] = useState<"prompt" | "summary">("prompt");

  async function loadStudents(preselectId?: string | null) {
    setLoadingStudents(true);

    try {
      const res = await fetch("/api/students/ai-summary", {
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.students) ? data.students : [];
        setStudents(list);

        const idFromUrl = preselectId || "";
        const exists = list.some((student: StudentOption) => student.id === idFromUrl);

        if (exists) {
          setSelectedStudentId(idFromUrl);
        } else if (list.length > 0) {
          setSelectedStudentId(list[0].id);
        }
      } else {
        setMessage({ type: "error", text: "Erro ao carregar alunos." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar alunos." });
    }

    setLoadingStudents(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    loadStudents(params.get("studentId"));
  }, []);

  const selectedStudent = useMemo(() => {
    return students.find((student) => student.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  async function generateSummary() {
    if (!selectedStudentId) {
      setMessage({ type: "error", text: "Selecione um aluno." });
      return;
    }

    setLoadingSummary(true);
    setMessage(null);
    setSummary(null);

    try {
      const res = await fetch(`/api/students/${selectedStudentId}/ai-summary`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.ok) {
        setSummary(data);
        setViewMode("prompt");
        setMessage({ type: "success", text: "Resumo gerado com sucesso." });
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao gerar resumo." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao gerar resumo." });
    }

    setLoadingSummary(false);
  }

  async function copyText(text: string, successText: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ type: "success", text: successText });
    } catch {
      setMessage({ type: "error", text: "Não foi possível copiar. Selecione o texto manualmente." });
    }
  }

  function downloadText() {
    if (!summary) return;

    const content = viewMode === "prompt" ? summary.aiPrompt : summary.summaryText;
    const filename = `resumo-aluno-${summary.student.name.replaceAll(" ", "-").toLowerCase()}.txt`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }

  const textToShow = summary
    ? viewMode === "prompt"
      ? summary.aiPrompt
      : summary.summaryText
    : "";

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <p className="text-xs text-[#D4A373] uppercase tracking-[0.3em] mb-2">
          Apoio inteligente
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-[#f5f5f5]">
          Resumo do aluno para IA
        </h1>
        <p className="text-sm text-[#a1a1a1] mt-2 max-w-3xl">
          Gere um resumo completo do aluno com avaliações, treinos, adesão, dúvidas, avisos e feedbacks.
          Use o texto para pedir uma sugestão de treino para a IA. A IA apoia, mas o professor revisa e valida antes de cadastrar.
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

      <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 md:items-end">
          <div>
            <label className="block text-xs text-[#a1a1a1] mb-2">
              Selecione o aluno
            </label>

            <select
              value={selectedStudentId}
              onChange={(event) => {
                setSelectedStudentId(event.target.value);
                setSummary(null);
              }}
              disabled={loadingStudents}
              className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373] disabled:opacity-60"
            >
              {students.length === 0 ? (
                <option value="">Nenhum aluno encontrado</option>
              ) : (
                students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} · Professor: {student.professorName || "Não vinculado"}
                  </option>
                ))
              )}
            </select>

            {selectedStudent && (
              <p className="text-xs text-[#6b6b6b] mt-2">
                {selectedStudent.email || "Sem e-mail"} · {selectedStudent.contractedTrainingDaysPerMonth || "-"} treino(s)/mês
              </p>
            )}
          </div>

          <button
            onClick={generateSummary}
            disabled={loadingStudents || loadingSummary || !selectedStudentId}
            className="bg-[#D4A373] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#c49563] transition disabled:opacity-50"
          >
            {loadingSummary ? "Gerando..." : "Gerar resumo"}
          </button>
        </div>

        <div className="rounded-xl bg-[#D4A373]/10 border border-[#D4A373]/20 p-4">
          <p className="text-sm text-[#D4A373] font-semibold mb-1">
            Fluxo recomendado
          </p>
          <p className="text-xs text-[#a1a1a1] leading-relaxed">
            1. Gere o resumo. 2. Copie o prompt para IA. 3. Peça uma sugestão estruturada de treino.
            4. O professor revisa. 5. O professor cadastra o treino no sistema.
            Evite rodar SQL direto no banco para não cadastrar treino no aluno errado ou quebrar histórico.
          </p>
        </div>
      </div>

      {summary && (
        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#f5f5f5]">
                {summary.student.name}
              </h2>
              <p className="text-xs text-[#a1a1a1]">
                Professor: {summary.student.professorName || "Não vinculado"} · Meta semanal: {summary.student.weeklyLimit || "-"}
              </p>
              <p className="text-xs text-[#6b6b6b] mt-1">
                Gerado em {new Date(summary.generatedAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setViewMode("prompt")}
                className={
                  "px-3 py-2 rounded-lg text-xs transition " +
                  (viewMode === "prompt"
                    ? "bg-[#D4A373] text-[#0a0a0a] font-semibold"
                    : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
                }
              >
                Prompt para IA
              </button>

              <button
                onClick={() => setViewMode("summary")}
                className={
                  "px-3 py-2 rounded-lg text-xs transition " +
                  (viewMode === "summary"
                    ? "bg-[#D4A373] text-[#0a0a0a] font-semibold"
                    : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
                }
              >
                Só resumo
              </button>

              <button
                onClick={() => copyText(textToShow, "Texto copiado.")}
                className="px-3 py-2 rounded-lg text-xs bg-[#1a1a1a] text-[#a1a1a1] hover:text-white transition"
              >
                Copiar
              </button>

              <button
                onClick={downloadText}
                className="px-3 py-2 rounded-lg text-xs bg-[#1a1a1a] text-[#a1a1a1] hover:text-white transition"
              >
                Baixar .txt
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Treinos</p>
              <p className="text-xl text-[#D4A373] font-bold">{summary.metrics.workouts || 0}</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Concluídos</p>
              <p className="text-xl text-green-400 font-bold">{summary.metrics.completedWorkouts || 0}</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Vencidos</p>
              <p className="text-xl text-red-400 font-bold">{summary.metrics.overdueWorkouts || 0}</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Avaliações</p>
              <p className="text-xl text-[#f5f5f5] font-bold">{summary.metrics.avaliacoes || 0}</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Feedbacks</p>
              <p className="text-xl text-blue-400 font-bold">{summary.metrics.feedbacks || 0}</p>
            </div>
          </div>

          <textarea
            value={textToShow}
            readOnly
            className="w-full min-h-[560px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-xs md:text-sm text-[#e5e5e5] font-mono leading-relaxed outline-none"
          />
        </div>
      )}
    </div>
  );
}

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

function getNextMonday(referenceDate = new Date()): Date {
  const date = new Date(referenceDate);
  date.setHours(12, 0, 0, 0);

  const day = date.getDay();
  const daysUntilNextMonday = day === 0 ? 1 : 8 - day;

  date.setDate(date.getDate() + daysUntilNextMonday);
  return date;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getTrainingWeekdayOffsets(contractedTrainingDaysPerMonth?: number | null): number[] {
  const contracted = Number(contractedTrainingDaysPerMonth || 0);

  if (!Number.isFinite(contracted) || contracted <= 0) return [];

  if (contracted <= 4) return [0]; // segunda
  if (contracted <= 8) return [0, 2]; // segunda e quarta
  if (contracted <= 12) return [0, 2, 4]; // segunda, quarta e sexta
  if (contracted <= 16) return [0, 1, 3, 4]; // segunda, terça, quinta e sexta; quarta livre

  return [0, 1, 2, 3, 4]; // segunda a sexta
}

function getWeekdayName(offset: number): string {
  const names: Record<number, string> = {
    0: "segunda-feira",
    1: "terça-feira",
    2: "quarta-feira",
    3: "quinta-feira",
    4: "sexta-feira",
  };

  return names[offset] || "dia útil";
}

function getTrainingSchedule(contractedTrainingDaysPerMonth?: number | null) {
  const nextMonday = getNextMonday();
  const offsets = getTrainingWeekdayOffsets(contractedTrainingDaysPerMonth);

  return offsets.map((offset) => ({
    offset,
    weekday: getWeekdayName(offset),
    date: formatIsoDate(addDays(nextMonday, offset)),
  }));
}

function getTrainingScheduleDescription(contractedTrainingDaysPerMonth?: number | null): string {
  const contracted = Number(contractedTrainingDaysPerMonth || 0);

  if (!Number.isFinite(contracted) || contracted <= 0) {
    return "Quantidade contratada não configurada. Confirmar antes de montar treino.";
  }

  const schedule = getTrainingSchedule(contractedTrainingDaysPerMonth);

  if (contracted <= 4) {
    return `Contrato de ${contracted} dia(s)/mês: gerar 1 treino por semana, preferencialmente na segunda-feira.`;
  }

  if (contracted <= 8) {
    return `Contrato de ${contracted} dias/mês: gerar 2 treinos por semana, intercalados em segunda-feira e quarta-feira.`;
  }

  if (contracted <= 12) {
    return `Contrato de ${contracted} dias/mês: gerar 3 treinos por semana, em segunda-feira, quarta-feira e sexta-feira.`;
  }

  if (contracted <= 16) {
    return `Contrato de ${contracted} dias/mês: gerar 4 treinos por semana, em segunda-feira, terça-feira, quinta-feira e sexta-feira. Quarta-feira fica sem treino.`;
  }

  return `Contrato de ${contracted} dias/mês: gerar 5 treinos por semana, de segunda-feira a sexta-feira, sem folga em dia útil.`;
}

function applyContractScheduleToWorkouts(workouts: any[], contractedTrainingDaysPerMonth?: number | null): {
  workouts: any[];
  scheduleDescription: string;
  scheduleWarning?: string;
} {
  const schedule = getTrainingSchedule(contractedTrainingDaysPerMonth);
  const scheduleDescription = getTrainingScheduleDescription(contractedTrainingDaysPerMonth);

  if (schedule.length === 0) {
    return {
      workouts,
      scheduleDescription,
      scheduleWarning: "Não foi possível aplicar calendário automático porque a quantidade contratada não está configurada.",
    };
  }

  const originalCount = workouts.length;
  const limitedWorkouts = workouts.slice(0, schedule.length);

  const scheduledWorkouts = limitedWorkouts.map((workout, index) => {
    const scheduledDay = schedule[index];

    return {
      ...workout,
      date: scheduledDay?.date || workout.date || "",
      notes: [
        workout.notes,
        scheduledDay
          ? `Calendário automático aplicado: ${scheduledDay.weekday}, ${scheduledDay.date}.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

  let scheduleWarning: string | undefined;

  if (originalCount > schedule.length) {
    scheduleWarning = `A IA gerou ${originalCount} treinos, mas o contrato permite ${schedule.length} treino(s) na semana. O sistema importou apenas os ${schedule.length} primeiros.`;
  }

  if (originalCount < schedule.length) {
    scheduleWarning = `A IA gerou ${originalCount} treino(s), mas o contrato sugere ${schedule.length} treino(s) na semana. Gere novamente ou complemente manualmente.`;
  }

  return {
    workouts: scheduledWorkouts,
    scheduleDescription,
    scheduleWarning,
  };
}

export default function ResumoAlunoPage() {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [viewMode, setViewMode] = useState<"prompt" | "summary" | "jsonPrompt">("jsonPrompt");
  const [aiJsonText, setAiJsonText] = useState("");

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

  function getJsonPrompt(summaryData: SummaryResponse): string {
    const contractedDays = selectedStudent?.contractedTrainingDaysPerMonth || null;
    const schedule = getTrainingSchedule(contractedDays);
    const scheduleDescription = getTrainingScheduleDescription(contractedDays);
    const expectedWorkoutCount = schedule.length || summaryData.student.weeklyLimit || 1;
    const scheduleLines = schedule.length
      ? schedule.map((item, index) => `- Treino ${index + 1}: ${item.weekday}, ${item.date}`)
      : ["- Sem calendário automático porque a quantidade contratada não está configurada."];

    return [
      "Você é um professor de educação física apoiando a montagem de treino.",
      "",
      "Com base no resumo do aluno abaixo, gere uma sugestão de treinos em JSON válido.",
      "",
      "ENTREGA OBRIGATÓRIA:",
      "- Gere um arquivo .txt para download contendo somente o JSON válido.",
      "- Nome sugerido do arquivo: treino_" + summaryData.student.name.replaceAll(" ", "_").toLowerCase() + ".txt",
      "- Não renderize o JSON longo diretamente na tela se conseguir entregar o arquivo .txt.",
      "- O conteúdo do arquivo .txt deve começar com { e terminar com }.",
      "- O arquivo .txt não pode ter markdown, comentários, explicações ou texto antes/depois do JSON.",
      "- Se você não conseguir gerar arquivo .txt, responda somente com o JSON puro, sem markdown.",
      "",
      "REGRAS IMPORTANTES:",
      "- Não gere SQL.",
      "- Não use markdown.",
      "- Não coloque comentários no JSON.",
      "- O professor vai revisar tudo antes de salvar.",
      "- Se a adesão estiver baixa, priorize retomada, simplicidade, segurança e consistência.",
      "- Se faltarem dados, use observações para o professor confirmar antes de aplicar.",
      "- Gere um resumo humanizado para o aluno entender o objetivo da sessão.",
      "- O gasto calórico deve ser sempre uma faixa estimada, nunca uma promessa exata.",
      "- A estimativa de calorias deve ser conservadora e compatível com duração, intensidade e objetivo do aluno.",
      "- Se o aluno tiver baixa adesão, dor/desconforto ou retomada, evite estimativas agressivas e priorize segurança.",
      "- Para objetivo de emagrecimento, fale em contribuição para gasto energético e consistência, não em promessa de perda de peso.",
      "- Para hipertrofia/força, priorize estímulo muscular, técnica e progressão, não calorias.",
      "",
      "REGRA DE CALENDÁRIO DO CONTRATO:",
      scheduleDescription,
      `Quantidade exata esperada no JSON: ${expectedWorkoutCount} treino(s).`,
      "Datas obrigatórias para a próxima semana:",
      ...scheduleLines,
      "",
      "FORMATO OBRIGATÓRIO DO JSON:",
      "{",
      '  "studentId": "' + summaryData.student.id + '",',
      '  "studentName": "' + summaryData.student.name.replaceAll('"', "'") + '",',
      '  "workouts": [',
      "    {",
      '      "name": "Treino A - nome do treino",',
      '      "date": "' + (schedule[0]?.date || "AAAA-MM-DD") + '",',
      '      "description": "descrição técnica curta do treino",',
      '      "objective": "objetivo principal da sessão, em linguagem simples para o aluno",',
      '      "focusAreas": "grupos musculares ou capacidades trabalhadas, ex: pernas, glúteos, core e condicionamento",',
      '      "intensity": "leve, moderada ou alta",',
      '      "estimatedDurationMinutes": 40,',
      '      "estimatedCaloriesMin": 180,',
      '      "estimatedCaloriesMax": 300,',
      '      "studentSummary": "resumo humanizado para o aluno entender o porquê do treino",',
      '      "safetyNote": "observação de segurança, deixando claro que gasto calórico é estimativa e que dor não deve ser ignorada",',
      '      "notes": "observações para o professor revisar",',
      '      "exercises": [',
      "        {",
      '          "name": "Nome do exercício",',
      '          "description": "como executar ou foco técnico",',
      '          "series": 3,',
      '          "reps": "10-12",',
      '          "weight": "carga leve/moderada ou a definir",',
      '          "restTime": "60s",',
      '          "notes": "observações de segurança/progressão",',
      '          "order": 0',
      "        }",
      "      ]",
      "    }",
      "  ]",
      "}",
      "",
      "RESUMO DO ALUNO:",
      summaryData.summaryText,
    ].join("\\n");
  }

  function extractJsonFromText(rawText: string): any {
    const raw = rawText.trim();

    if (!raw) {
      throw new Error("Cole o JSON gerado pela IA.");
    }

    const codeBlockMatch = raw.match(/```(?:json)?\\s*([\\s\\S]*?)```/i);
    const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : raw;

    return JSON.parse(candidate);
  }

  function normalizeAiWorkoutPayload(payload: any): any {
    const workouts = Array.isArray(payload?.workouts)
      ? payload.workouts
      : Array.isArray(payload?.treinos)
        ? payload.treinos
        : [];

    if (!payload?.studentId && !selectedStudentId) {
      throw new Error("O JSON precisa ter studentId.");
    }

    if (workouts.length === 0) {
      throw new Error("O JSON precisa ter pelo menos um treino em workouts.");
    }

    const normalizedWorkouts = workouts.map((workout: any, workoutIndex: number) => ({
      name: String(workout?.name || workout?.nome || `Treino ${workoutIndex + 1}`),
      date: String(workout?.date || workout?.data || ""),
      description: String(workout?.description || workout?.descricao || ""),
      objective: String(workout?.objective || workout?.objetivo || ""),
      focusAreas: String(workout?.focusAreas || workout?.focus_areas || workout?.focos || workout?.foco || ""),
      intensity: String(workout?.intensity || workout?.intensidade || ""),
      estimatedDurationMinutes:
        Number(workout?.estimatedDurationMinutes || workout?.estimated_duration_minutes || workout?.duracaoEstimadaMinutos || 0) || null,
      estimatedCaloriesMin:
        Number(workout?.estimatedCaloriesMin || workout?.estimated_calories_min || workout?.caloriasMin || 0) || null,
      estimatedCaloriesMax:
        Number(workout?.estimatedCaloriesMax || workout?.estimated_calories_max || workout?.caloriasMax || 0) || null,
      studentSummary: String(workout?.studentSummary || workout?.student_summary || workout?.resumoAluno || workout?.resumo || ""),
      safetyNote: String(workout?.safetyNote || workout?.safety_note || workout?.observacaoSeguranca || ""),
      notes: String(workout?.notes || workout?.observacoes || ""),
      exercises: (Array.isArray(workout?.exercises) ? workout.exercises : workout?.exercicios || []).map((exercise: any, index: number) => ({
        name: String(exercise?.name || exercise?.nome || `Exercício ${index + 1}`),
        description: String(exercise?.description || exercise?.descricao || ""),
        series: Number(exercise?.series || exercise?.serie || exercise?.sets || 3),
        reps: String(exercise?.reps || exercise?.repeticoes || exercise?.repetições || "10"),
        weight: String(exercise?.weight || exercise?.carga || ""),
        restTime: String(exercise?.restTime || exercise?.descanso || "60s"),
        notes: String(exercise?.notes || exercise?.observacoes || ""),
        order: Number.isFinite(Number(exercise?.order)) ? Number(exercise.order) : index,
      })),
    }));

    const scheduled = applyContractScheduleToWorkouts(
      normalizedWorkouts,
      selectedStudent?.contractedTrainingDaysPerMonth || null
    );

    return {
      source: "ai-summary",
      createdAt: new Date().toISOString(),
      studentId: String(payload?.studentId || selectedStudentId),
      studentName: payload?.studentName || selectedStudent?.name || "",
      currentIndex: 0,
      scheduleDescription: scheduled.scheduleDescription,
      scheduleWarning: scheduled.scheduleWarning,
      workouts: scheduled.workouts,
    };
  }

  function openJsonInWorkoutBuilder() {
    try {
      const parsed = extractJsonFromText(aiJsonText);
      const normalized = normalizeAiWorkoutPayload(parsed);

      localStorage.setItem("aiWorkoutDraftBatch", JSON.stringify(normalized));
      setMessage({ type: "success", text: "JSON validado. Abrindo tela de montar treino com os dados preenchidos." });

      window.location.href = `/dashboard/montar-treino?studentId=${encodeURIComponent(normalized.studentId)}&source=ai-json`;
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error?.message || "JSON inválido. Copie novamente a resposta da IA.",
      });
    }
  }

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
        setViewMode("jsonPrompt");
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
    ? viewMode === "jsonPrompt"
      ? getJsonPrompt(summary)
      : viewMode === "prompt"
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
            4. O sistema aplica automaticamente os dias da semana conforme o contrato.
            5. O professor revisa e cadastra o treino no sistema.
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
                onClick={() => setViewMode("jsonPrompt")}
                className={
                  "px-3 py-2 rounded-lg text-xs transition " +
                  (viewMode === "jsonPrompt"
                    ? "bg-[#D4A373] text-[#0a0a0a] font-semibold"
                    : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
                }
              >
                Prompt JSON
              </button>

              <button
                onClick={() => setViewMode("prompt")}
                className={
                  "px-3 py-2 rounded-lg text-xs transition " +
                  (viewMode === "prompt"
                    ? "bg-[#D4A373] text-[#0a0a0a] font-semibold"
                    : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
                }
              >
                Prompt texto
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

          <div className="bg-[#0a0a0a] border border-[#ffffff10] rounded-xl p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-[#D4A373]">
                Importar JSON do arquivo .txt gerado pela IA
              </h3>
              <p className="text-xs text-[#a1a1a1] mt-1">
                Depois de copiar o Prompt JSON e pedir a sugestão para a IA, cole aqui o JSON retornado.
                O sistema vai validar e abrir a tela de montar treino já preenchida para o professor revisar.
              </p>
            </div>

            <textarea
              value={aiJsonText}
              onChange={(event) => setAiJsonText(event.target.value)}
              placeholder='Cole aqui o JSON gerado pela IA, começando com {"studentId": "...", "workouts": [...]}'
              className="w-full min-h-[220px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-xs md:text-sm text-[#e5e5e5] font-mono leading-relaxed outline-none focus:border-[#D4A373]"
            />

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-xs text-[#6b6b6b]">
                Segurança: o JSON não grava nada sozinho. Ele apenas pré-preenche a tela. O professor revisa e salva.
              </p>

              <button
                type="button"
                onClick={openJsonInWorkoutBuilder}
                disabled={!aiJsonText.trim()}
                className="bg-[#D4A373] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#c49563] transition disabled:opacity-50"
              >
                Abrir em Montar Treino
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

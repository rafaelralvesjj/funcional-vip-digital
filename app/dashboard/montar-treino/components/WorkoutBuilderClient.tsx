"use client";

import { useEffect, useMemo, useState } from "react";
import AiWorkoutDraftImporter from "./AiWorkoutDraftImporter";
import ExerciseLibraryPanel from "./ExerciseLibraryPanel";
import ReleaseWeekPanel from "./ReleaseWeekPanel";
import SmartWorkoutSummary from "./SmartWorkoutSummary";
import CareStatusPanel from "./CareStatusPanel";
import WorkoutExercisesEditor from "./WorkoutExercisesEditor";
import {
  ActiveWorkoutContract,
  AiWorkoutDraftBatch,
  ExerciseItem,
  LibraryExercise,
  ReleaseReviewContext,
  Student,
  StudentCareEventSummary,
  WorkoutPlanSummary,
  WorkoutWeekSummary,
} from "../lib/types";
import {
  buildExerciseInstructions,
  buildExercisePurpose,
  buildExerciseSafetyGuidance,
  formatDateInput,
  formatDatePtBr,
  getExpectedWorkoutDatesForWeek,
  getFirstMissingExpectedDate,
  getNextSafePlanningDateInput,
  getPlanDateInput,
  getWeekRange,
  isUnsafeCurrentWeekPlanningDate,
  openWorkoutPrintPreview,
  parseDateInput,
} from "../lib/workout-utils";

function readDashboardParams() {
  if (typeof window === "undefined") {
    return { studentId: "", date: "", week: "" };
  }

  const params = new URLSearchParams(window.location.search);
  const fromUrl = {
    studentId: params.get("studentId") || "",
    date: params.get("date") || "",
    week: params.get("week") || "",
  };

  if (fromUrl.studentId) return fromUrl;

  try {
    const raw = window.sessionStorage.getItem("pendingWorkoutContext");
    if (!raw) return fromUrl;
    const saved = JSON.parse(raw);
    return {
      studentId: String(saved?.studentId || ""),
      date: String(saved?.date || ""),
      week: String(saved?.week || ""),
    };
  } catch {
    return fromUrl;
  }
}

export default function WorkoutBuilderClient() {
  const params = useMemo(readDashboardParams, []);

  const initialSafeDate = getNextSafePlanningDateInput(params.date);

  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState(params.studentId);
  const [date, setDate] = useState(initialSafeDate.dateInput || "");
  const [planName, setPlanName] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("");
  const [focusAreas, setFocusAreas] = useState("");
  const [intensity, setIntensity] = useState("");
  const [duration, setDuration] = useState("");
  const [caloriesMin, setCaloriesMin] = useState("");
  const [caloriesMax, setCaloriesMax] = useState("");
  const [studentSummary, setStudentSummary] = useState("");
  const [safetyNote, setSafetyNote] = useState("");
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [activeContract, setActiveContract] = useState<ActiveWorkoutContract | null>(null);
  const [weeklyPlans, setWeeklyPlans] = useState<WorkoutPlanSummary[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBatch, setAiBatch] = useState<AiWorkoutDraftBatch | null>(null);
  const [aiIndex, setAiIndex] = useState(0);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseContext, setReleaseContext] = useState<ReleaseReviewContext | null>(null);
  const [releaseMessage, setReleaseMessage] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);
  const [careEvents, setCareEvents] = useState<StudentCareEventSummary[]>([]);
  const [careLoading, setCareLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    initialSafeDate.redirected && initialSafeDate.message
      ? { type: "success", text: initialSafeDate.message }
      : null
  );

  const selectedStudentInfo = students.find((student) => student.id === selectedStudent);
  const referenceDate = parseDateInput(date) || new Date();
  const { startOfWeek, endOfWeek } = getWeekRange(referenceDate);
  const weeklyLimit = activeContract?.workoutsPerWeek || 0;
  const weeklyCount = weeklyPlans.length;
  const expectedWorkoutDates = getExpectedWorkoutDatesForWeek(
    startOfWeek,
    weeklyLimit,
    activeContract
  );
  const firstMissingExpectedDate = getFirstMissingExpectedDate(
    expectedWorkoutDates,
    weeklyPlans
  );
  const weeklyLimitReached = weeklyLimit > 0 && weeklyCount >= weeklyLimit;
  const willCompleteWeekOnSave =
    weeklyLimit > 0 && weeklyCount < weeklyLimit && weeklyCount + 1 >= weeklyLimit;
  const openCareEvents = careEvents.filter((event) => String(event.status).toUpperCase() !== "RESOLVIDO");
  const blockingCarePause = openCareEvents.some((event) => String(event.eventType).toUpperCase() === "PAUSA_POR_CUIDADO");

  useEffect(() => {
    let cancelled = false;

    async function loadStudents() {
      setLoadingStudents(true);

      try {
        const response = await fetch("/api/students", { cache: "no-store" });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error || "Não foi possível carregar os alunos.");
        }

        const raw = Array.isArray(data)
          ? data
          : Array.isArray(data?.students)
            ? data.students
            : [];

        if (!cancelled) {
          setStudents(
            raw.map((student: any) => ({
              id: String(student.id),
              name: String(student.name || "Aluno sem nome"),
              ageYears:
                student.ageYears === null || student.ageYears === undefined
                  ? null
                  : Number(student.ageYears),
              isMinor: Boolean(student.isMinor),
              hasBirthDate: Boolean(student.hasBirthDate || student.birthDate),
            }))
          );
        }
      } catch (cause) {
        if (!cancelled) {
          setMessage({
            type: "error",
            text: cause instanceof Error ? cause.message : "Erro ao carregar alunos.",
          });
        }
      } finally {
        if (!cancelled) setLoadingStudents(false);
      }
    }

    loadStudents();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedStudent) {
      setActiveContract(null);
      setWeeklyPlans([]);
      return;
    }

    let cancelled = false;

    async function loadWeek() {
      setLoadingWeek(true);

      try {
        const query = new URLSearchParams({
          studentId: selectedStudent,
          summary: "1",
        });
        if (date) query.set("date", date);

        const response = await fetch(`/api/workout-plan?${query.toString()}`, {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as WorkoutWeekSummary | null;

        if (!response.ok) {
          throw new Error(data?.message || "Não foi possível consultar a semana.");
        }

        if (!cancelled) {
          setActiveContract(data?.activeContract || null);
          setWeeklyPlans(Array.isArray(data?.plans) ? data.plans : []);
        }
      } catch (cause) {
        if (!cancelled) {
          setActiveContract(null);
          setWeeklyPlans([]);
          setMessage({
            type: "error",
            text: cause instanceof Error ? cause.message : "Erro ao consultar semana.",
          });
        }
      } finally {
        if (!cancelled) setLoadingWeek(false);
      }
    }

    loadWeek();
    return () => {
      cancelled = true;
    };
  }, [selectedStudent, date]);

  useEffect(() => {
    if (!selectedStudent) {
      setCareEvents([]);
      setCareLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function loadCareEventsSummary() {
      setCareLoading(true);

      try {
        const response = await fetch(
          `/api/student-care-events/workout-builder-summary?studentId=${encodeURIComponent(
            selectedStudent
          )}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.error ||
              "Não foi possível consultar os alertas de cuidado."
          );
        }

        if (!cancelled) {
          setCareEvents(
            Array.isArray(data?.events) ? data.events : []
          );
        }
      } catch (cause) {
        if (
          !cancelled &&
          !(cause instanceof DOMException && cause.name === "AbortError")
        ) {
          setMessage({
            type: "error",
            text:
              cause instanceof Error
                ? cause.message
                : "Erro ao consultar cuidado.",
          });
        }
      } finally {
        if (!cancelled) {
          setCareLoading(false);
        }
      }
    }

    void loadCareEventsSummary();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedStudent]);

  useEffect(() => {
    if (!selectedStudent || aiBatch) return;
    if (!weeklyLimit || loadingWeek) return;
    if (date) return;
    if (firstMissingExpectedDate) {
      setDate(firstMissingExpectedDate);
    }
  }, [params.studentId, aiBatch, weeklyLimit, loadingWeek, date, firstMissingExpectedDate]);

  function normalizeExercise(
    exercise: any,
    index: number
  ): ExerciseItem {
    return {
      libraryExerciseId: String(
        exercise?.libraryExerciseId ||
          exercise?.exerciseId ||
          exercise?.exerciseLibraryId ||
          ""
      ),
      name: String(exercise?.name || `Exercício ${index + 1}`),
      description: String(exercise?.description || ""),
      series: Number(exercise?.series || 3),
      reps: String(exercise?.reps || "10"),
      weight: String(exercise?.weight || ""),
      restTime: String(exercise?.restTime || "60s"),
      notes: String(exercise?.notes || ""),
      order: index,
      imageUrl: exercise?.imageUrl || null,
      videoUrl: exercise?.videoUrl || null,
      sequenceImageUrl: exercise?.sequenceImageUrl || null,
      sequenceImageLabel: exercise?.sequenceImageLabel || null,
      sequenceImageNotes: exercise?.sequenceImageNotes || null,
      sequenceFramesCount: Number(exercise?.sequenceFramesCount || 0) || null,
      sequenceGeneratedByAi: Boolean(exercise?.sequenceGeneratedByAi),
      purpose: exercise?.purpose || exercise?.description || null,
      instructions: exercise?.instructions || exercise?.description || null,
      safetyGuidance: exercise?.safetyGuidance || null,
      commonMistakes: exercise?.commonMistakes || null,
      contraindications: exercise?.contraindications || null,
    };
  }

  function importAiDraft(batch: AiWorkoutDraftBatch, index: number) {
    const workout = batch.workouts[index];
    if (!workout) return;

    if (blockingCarePause) {
      setMessage({ type: "error", text: "Importação bloqueada: o aluno está em pausa por cuidado." });
      return;
    }

    if (selectedStudent && batch.studentId !== selectedStudent) {
      setMessage({ type: "error", text: "Este JSON pertence a outro aluno. Gere o resumo novamente pelo card correto." });
      return;
    }

    const batchDates = Array.isArray(batch.aiValidation?.expectedWorkoutDates)
      ? batch.aiValidation!.expectedWorkoutDates.map(String)
      : batch.workouts.map((item) => String(item.date || ""));
    if (expectedWorkoutDates.length > 0 && batchDates.join("|") !== expectedWorkoutDates.join("|")) {
      setMessage({ type: "error", text: "As datas do JSON não conferem com a semana selecionada." });
      return;
    }

    setAiBatch(batch);
    setAiIndex(index);
    setPlanName(workout.name || "");
    setDate(workout.date || expectedWorkoutDates[index] || firstMissingExpectedDate || "");
    setDescription(workout.description || "");
    setObjective(workout.objective || "");
    setFocusAreas(workout.focusAreas || "");
    setIntensity(workout.intensity || "");
    setDuration(
      workout.estimatedDurationMinutes === null ||
      workout.estimatedDurationMinutes === undefined
        ? ""
        : String(workout.estimatedDurationMinutes)
    );
    setCaloriesMin(
      workout.estimatedCaloriesMin === null ||
      workout.estimatedCaloriesMin === undefined
        ? ""
        : String(workout.estimatedCaloriesMin)
    );
    setCaloriesMax(
      workout.estimatedCaloriesMax === null ||
      workout.estimatedCaloriesMax === undefined
        ? ""
        : String(workout.estimatedCaloriesMax)
    );
    setStudentSummary(workout.studentSummary || "");
    setSafetyNote(workout.safetyNote || "");
    setNotes(workout.notes || "");
    setExercises(
      Array.isArray(workout.exercises)
        ? workout.exercises.map(normalizeExercise)
        : []
    );
    setMessage({
      type: "success",
      text: `Treino ${index + 1} de ${batch.workouts.length} importado da IA. Revise antes de salvar.`,
    });
  }

  function addExercise(exercise: LibraryExercise) {
    setExercises((current) => [
      ...current,
      {
        libraryExerciseId: exercise.id,
        name: exercise.name,
        description: exercise.description || "",
        series: 3,
        reps: "10",
        weight: "",
        restTime: "60s",
        notes: "",
        order: current.length,
        imageUrl: exercise.imageUrl || null,
        videoUrl: exercise.videoUrl || null,
        sequenceImageUrl: exercise.sequenceImageUrl || null,
        sequenceImageLabel: exercise.sequenceImageLabel || null,
        sequenceImageNotes: exercise.sequenceImageNotes || null,
        sequenceFramesCount: exercise.sequenceFramesCount || null,
        sequenceGeneratedByAi: Boolean(exercise.sequenceGeneratedByAi),
        purpose: buildExercisePurpose(exercise),
        instructions: buildExerciseInstructions(exercise),
        safetyGuidance: buildExerciseSafetyGuidance(exercise),
        commonMistakes: exercise.commonMistakes || null,
        contraindications: exercise.contraindications || null,
      },
    ]);
  }

  async function releaseWeek(forceRelease: boolean) {
    if (!selectedStudent || !date) return;
    if (blockingCarePause) {
      setReleaseMessage({ type: "error", text: "Liberação bloqueada enquanto a pausa por cuidado estiver aberta. O pedido de retomada exige revisão e resolução pelo professor." });
      return;
    }

    setReleaseLoading(true);
    setReleaseMessage(null);

    try {
      const response = await fetch("/api/workout-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RELEASE_WEEK",
          studentId: selectedStudent,
          date,
          forceRelease,
        }),
      });
      const data = await response.json().catch(() => null);

      if (response.ok) {
        setReleaseContext(data?.reviewContext || null);
        setReleaseMessage({
          type: "success",
          text: data?.message || "Semana liberada.",
        });
      } else if (response.status === 409 && data?.reviewRequired) {
        setReleaseContext(data?.reviewContext || null);
        setReleaseMessage({
          type: "warning",
          text: data?.error || "Revisão obrigatória antes de liberar.",
        });
      } else {
        setReleaseMessage({
          type: "error",
          text: data?.error || "Não foi possível liberar a semana.",
        });
      }
    } finally {
      setReleaseLoading(false);
    }
  }

  async function saveWorkout(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (!selectedStudent || !date || !planName.trim() || exercises.length === 0) {
      setMessage({
        type: "error",
        text: "Preencha aluno, data, nome do treino e exercícios.",
      });
      return;
    }

    if (selectedStudentInfo && (selectedStudentInfo.ageYears === null || selectedStudentInfo.ageYears === undefined)) {
      setMessage({ type: "error", text: "Data de nascimento não informada. A gestão precisa completar o cadastro antes de montar o treino." });
      return;
    }

    if (blockingCarePause) {
      setMessage({ type: "error", text: "Treino normal bloqueado enquanto houver pausa por cuidado aberta. Revise a retomada do aluno." });
      return;
    }

    if (exercises.some((exercise) => !exercise.libraryExerciseId)) {
      setMessage({ type: "error", text: "Todos os exercícios precisam vir da Biblioteca de Exercícios." });
      return;
    }

    if (expectedWorkoutDates.length > 0 && !expectedWorkoutDates.includes(date)) {
      setMessage({ type: "error", text: "A data selecionada não está entre as datas válidas desta semana." });
      return;
    }

    if (!activeContract || !weeklyLimit) {
      setMessage({
        type: "error",
        text: "O aluno não possui contrato ativo para esta data.",
      });
      return;
    }

    if (isUnsafeCurrentWeekPlanningDate(date)) {
      setMessage({
        type: "error",
        text: "Esta semana já não possui janela segura de execução.",
      });
      return;
    }

    if (weeklyLimitReached) {
      setMessage({
        type: "error",
        text: "O limite semanal já foi atingido.",
      });
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/workout-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudent,
          name: planName.trim(),
          description: description || null,
          date,
          objective: objective || null,
          focusAreas: focusAreas || null,
          intensity: intensity || null,
          estimatedDurationMinutes: duration ? Number(duration) : null,
          estimatedCaloriesMin: caloriesMin ? Number(caloriesMin) : null,
          estimatedCaloriesMax: caloriesMax ? Number(caloriesMax) : null,
          studentSummary: studentSummary || null,
          safetyNote: safetyNote || null,
          notes: notes || null,
          exercises: exercises.map((exercise, order) => ({
            libraryExerciseId: exercise.libraryExerciseId,
            exerciseId: exercise.libraryExerciseId,
            name: exercise.name,
            description: exercise.description,
            series: exercise.series,
            reps: exercise.reps || null,
            weight: exercise.weight || null,
            restTime: exercise.restTime || null,
            notes: exercise.notes || null,
            order,
            imageUrl: exercise.imageUrl || null,
            videoUrl: exercise.videoUrl || null,
            purpose: exercise.purpose || null,
            instructions: exercise.instructions || null,
            safetyGuidance: exercise.safetyGuidance || null,
            commonMistakes: exercise.commonMistakes || null,
            contraindications: exercise.contraindications || null,
          })),
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível salvar o treino.");
      }

      const savedPlanId =
        data?.workoutPlan?.id || data?.plan?.id || `saved-${Date.now()}`;

      setWeeklyPlans((current) => [...current, { id: savedPlanId, date }]);

      const hasNextAiWorkout =
        aiBatch && aiIndex + 1 < aiBatch.workouts.length;

      if (hasNextAiWorkout && aiBatch) {
        const nextIndex = aiIndex + 1;
        const updatedBatch = { ...aiBatch, currentIndex: nextIndex };
        window.localStorage.setItem("aiWorkoutDraftBatch", JSON.stringify(updatedBatch));
        importAiDraft(updatedBatch, nextIndex);
      } else {
        window.localStorage.removeItem("aiWorkoutDraftBatch");
        setAiBatch(null);
        setAiIndex(0);
        setPlanName("");
        setDescription("");
        setObjective("");
        setFocusAreas("");
        setIntensity("");
        setDuration("");
        setCaloriesMin("");
        setCaloriesMax("");
        setStudentSummary("");
        setSafetyNote("");
        setNotes("");
        setExercises([]);
      }

      setMessage({
        type: "success",
        text:
          data?.weeklyNotification?.message ||
          (willCompleteWeekOnSave
            ? "Treino salvo e semana concluída."
            : "Treino salvo com sucesso."),
      });

      if (!hasNextAiWorkout && willCompleteWeekOnSave) {
        window.setTimeout(() => {
          window.location.replace("/dashboard");
        }, 1000);
      }
    } catch (cause) {
      setMessage({
        type: "error",
        text: cause instanceof Error ? cause.message : "Erro ao salvar treino.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.25em] text-[#D4A373]">Montagem semanal</p>
        <h1 className="mt-2 text-2xl font-bold text-[#f5f5f5]">Montar treino</h1>
        <p className="mt-2 text-sm text-[#a1a1a1]">
          Aluno e semana vêm do dashboard. A IA preenche as datas e os treinos.
        </p>
      </div>

      {message && (
        <div
          className={
            "mb-5 rounded-lg border p-4 text-sm " +
            (message.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/20 bg-red-500/10 text-red-300")
          }
        >
          {message.text}
        </div>
      )}

      <form onSubmit={saveWorkout} className="space-y-5">
        <section className="rounded-xl border border-[#ffffff10] bg-[#111111] p-5">
          <h2 className="text-lg font-semibold text-[#D4A373]">Aluno e semana</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <select
              value={selectedStudent}
              onChange={(event) => setSelectedStudent(event.target.value)}
              disabled={loadingStudents || Boolean(params.studentId)}
              className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
            >
              <option value="">
                {loadingStudents ? "Carregando alunos..." : "Selecione um aluno"}
              </option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                  {student.ageYears !== null && student.ageYears !== undefined
                    ? ` · ${student.ageYears} ano(s)`
                    : ""}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] [color-scheme:dark]"
            />
          </div>

          {selectedStudent && (
            <div className="mt-4 rounded-lg border border-[#ffffff10] bg-[#0a0a0a] p-4">
              <p className="text-sm text-[#f5f5f5]">
                Aluno: <strong>{selectedStudentInfo?.name || "Carregando..."}</strong>
              </p>
              <p className="mt-1 text-xs text-[#a1a1a1]">
                Semana de {formatDatePtBr(startOfWeek)} a{" "}
                {formatDatePtBr(new Date(endOfWeek.getTime() - 1))}
              </p>
              <p className="mt-1 text-xs text-[#a1a1a1]">
                {loadingWeek
                  ? "Consultando contrato..."
                  : activeContract
                    ? `Contrato: ${activeContract.planName || activeContract.type} · ${weeklyCount}/${weeklyLimit} treino(s)`
                    : "Nenhum contrato ativo para a data."}
              </p>
            </div>
          )}
        </section>

        <CareStatusPanel loading={careLoading} events={careEvents} />

        <AiWorkoutDraftImporter
          selectedStudentId={selectedStudent}
          selectedDate={date}
          expectedWorkoutDates={expectedWorkoutDates}
          hasBlockingCarePause={blockingCarePause}
          onImport={importAiDraft}
          onClear={() => {
            setAiBatch(null);
            setAiIndex(0);
          }}
        />

        <section className="rounded-xl border border-[#ffffff10] bg-[#111111] p-5">
          <h2 className="text-lg font-semibold text-[#D4A373]">Identificação do treino</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <input value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="Nome do treino" className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]" />
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descrição técnica" className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]" />
          </div>
        </section>

        <SmartWorkoutSummary
          objective={objective}
          focusAreas={focusAreas}
          intensity={intensity}
          duration={duration}
          caloriesMin={caloriesMin}
          caloriesMax={caloriesMax}
          studentSummary={studentSummary}
          safetyNote={safetyNote}
          onObjectiveChange={setObjective}
          onFocusAreasChange={setFocusAreas}
          onIntensityChange={setIntensity}
          onDurationChange={setDuration}
          onCaloriesMinChange={setCaloriesMin}
          onCaloriesMaxChange={setCaloriesMax}
          onStudentSummaryChange={setStudentSummary}
          onSafetyNoteChange={setSafetyNote}
        />

        <section className="rounded-xl border border-[#ffffff10] bg-[#111111] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#D4A373]">Exercícios</h2>
            <ExerciseLibraryPanel onSelect={addExercise} />
          </div>
          <WorkoutExercisesEditor exercises={exercises} onChange={setExercises} />
        </section>

        <section className="rounded-xl border border-[#ffffff10] bg-[#111111] p-5">
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observações gerais do plano" rows={3} className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]" />
        </section>

        <ReleaseWeekPanel
          visible={weeklyLimitReached}
          loading={releaseLoading}
          message={releaseMessage}
          reviewContext={releaseContext}
          onRelease={releaseWeek}
          studentId={selectedStudent}
          date={date}
          expectedWorkoutDates={expectedWorkoutDates}
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              if (!selectedStudent || !date || !planName.trim() || exercises.length === 0) {
                setMessage({
                  type: "error",
                  text: "Preencha aluno, data, nome e exercícios antes da prévia.",
                });
                return;
              }

              openWorkoutPrintPreview({
                studentName: selectedStudentInfo?.name || "Aluno",
                studentAge: selectedStudentInfo?.ageYears,
                planName,
                date,
                startOfWeek,
                endOfWeek,
                objective,
                description,
                focusAreas,
                intensity,
                estimatedDurationMinutes: duration,
                estimatedCaloriesMin: caloriesMin,
                estimatedCaloriesMax: caloriesMax,
                studentSummary,
                safetyNote,
                notes,
                exercises,
              });
            }}
            className="rounded-xl border border-[#D4A373]/30 bg-[#1a1a1a] py-4 font-bold text-[#D4A373]"
          >
            Pré-visualizar treino em PDF
          </button>

          <button
            type="submit"
            disabled={
              saving ||
              !selectedStudent ||
              !date ||
              !planName.trim() ||
              exercises.length === 0 ||
              !activeContract ||
              blockingCarePause ||
              (selectedStudentInfo?.ageYears === null || selectedStudentInfo?.ageYears === undefined) ||
              weeklyLimitReached
            }
            className="rounded-xl bg-[#D4A373] py-4 font-bold text-[#0a0a0a] disabled:opacity-50"
          >
            {saving
              ? "Salvando treino..."
              : willCompleteWeekOnSave
                ? "Salvar treino e concluir semana"
                : `Salvar treino ${weeklyCount + 1}/${weeklyLimit || "-"}`}
          </button>
        </div>
      </form>
    </div>
  );
}

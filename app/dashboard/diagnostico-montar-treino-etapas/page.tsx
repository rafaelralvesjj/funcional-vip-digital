"use client";

import { useMemo, useState } from "react";

type Student = {
  id: string;
  name: string;
  email?: string;
};

type LibraryExercise = {
  id: string;
  name: string;
  muscleGroup?: string;
  description?: string;
};

type TestStatus = "idle" | "loading" | "success" | "error";

export default function DiagnosticoMontarTreinoEtapasPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [studentStatus, setStudentStatus] = useState<TestStatus>("idle");
  const [workoutStatus, setWorkoutStatus] = useState<TestStatus>("idle");
  const [libraryStatus, setLibraryStatus] = useState<TestStatus>("idle");
  const [renderLibrary, setRenderLibrary] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  const selectedStudentName = useMemo(
    () => students.find((student) => student.id === selectedStudent)?.name || "",
    [students, selectedStudent]
  );

  function addMessage(message: string) {
    setMessages((current) => [
      `${new Date().toLocaleTimeString("pt-BR")} — ${message}`,
      ...current,
    ]);
  }

  async function testStudents() {
    setStudentStatus("loading");
    addMessage("Iniciando chamada /api/students.");

    try {
      const response = await fetch("/api/students", {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || `Resposta HTTP ${response.status}`);
      }

      const rawStudents = Array.isArray(data)
        ? data
        : Array.isArray(data?.students)
          ? data.students
          : [];

      const normalizedStudents = rawStudents
        .map((student: any) => ({
          id: String(student?.id || ""),
          name: String(student?.name || "Aluno sem nome"),
          email: student?.email ? String(student.email) : undefined,
        }))
        .filter((student: Student) => Boolean(student.id));

      setStudents(normalizedStudents);

      if (normalizedStudents.length > 0) {
        setSelectedStudent(normalizedStudents[0].id);
      }

      setStudentStatus("success");
      addMessage(
        `/api/students respondeu corretamente com ${normalizedStudents.length} aluno(s).`
      );
    } catch (error) {
      console.error(error);
      setStudentStatus("error");
      addMessage(
        `Falha em /api/students: ${
          error instanceof Error ? error.message : "erro desconhecido"
        }`
      );
    }
  }

  async function testWorkoutPlan() {
    if (!selectedStudent) {
      addMessage("Selecione um aluno antes de testar /api/workout-plan.");
      return;
    }

    setWorkoutStatus("loading");
    addMessage(
      `Iniciando /api/workout-plan para ${selectedStudentName || selectedStudent}.`
    );

    try {
      const query = new URLSearchParams({
        studentId: selectedStudent,
        summary: "1",
      });

      const response = await fetch(`/api/workout-plan?${query.toString()}`, {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || `Resposta HTTP ${response.status}`);
      }

      const weeklyPlansCount = Number(data?.weeklyPlansCount || 0);
      const weeklyLimit =
        data?.weeklyLimit ??
        data?.activeContract?.workoutsPerWeek ??
        "não informado";

      setWorkoutStatus("success");
      addMessage(
        `/api/workout-plan respondeu corretamente. Criados: ${weeklyPlansCount}. Limite: ${weeklyLimit}.`
      );
    } catch (error) {
      console.error(error);
      setWorkoutStatus("error");
      addMessage(
        `Falha em /api/workout-plan: ${
          error instanceof Error ? error.message : "erro desconhecido"
        }`
      );
    }
  }

  async function testLibrary() {
    setLibraryStatus("loading");
    setRenderLibrary(false);
    addMessage("Iniciando chamada /api/exercise-library?active=1.");

    try {
      const response = await fetch("/api/exercise-library?active=1", {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || `Resposta HTTP ${response.status}`);
      }

      const rawExercises = Array.isArray(data?.exercises)
        ? data.exercises
        : Array.isArray(data)
          ? data
          : [];

      const normalizedExercises = rawExercises.map((exercise: any) => ({
        id: String(exercise?.id || ""),
        name: String(exercise?.name || "Exercício sem nome"),
        muscleGroup: exercise?.muscleGroup
          ? String(exercise.muscleGroup)
          : undefined,
        description: exercise?.description
          ? String(exercise.description)
          : undefined,
      }));

      setLibrary(normalizedExercises);
      setLibraryStatus("success");
      addMessage(
        `/api/exercise-library respondeu corretamente com ${normalizedExercises.length} exercício(s).`
      );
    } catch (error) {
      console.error(error);
      setLibraryStatus("error");
      addMessage(
        `Falha em /api/exercise-library: ${
          error instanceof Error ? error.message : "erro desconhecido"
        }`
      );
    }
  }

  function statusLabel(status: TestStatus) {
    if (status === "loading") return "Testando...";
    if (status === "success") return "Funcionou";
    if (status === "error") return "Falhou";
    return "Ainda não testado";
  }

  function statusClass(status: TestStatus) {
    if (status === "success") return "text-emerald-400";
    if (status === "error") return "text-red-400";
    if (status === "loading") return "text-amber-400";
    return "text-[#737373]";
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="rounded-xl border border-[#ffffff10] bg-[#111111] p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-[#D4A373]">
          Diagnóstico por etapas
        </p>

        <h1 className="mt-2 text-2xl font-bold text-[#f5f5f5]">
          Localizar a quebra da página Montar treino
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-[#a1a1a1]">
          Execute um teste por vez, na ordem. Esta página não altera dados.
          Ela apenas consulta as mesmas APIs utilizadas pela montagem de treino.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-4">
            <p className="text-xs uppercase tracking-wide text-[#D4A373]">
              Etapa 1
            </p>
            <h2 className="mt-1 font-semibold text-[#f5f5f5]">
              Estrutura visual e React
            </h2>
            <p className="mt-2 text-xs text-[#a1a1a1]">
              Esta etapa já passou porque esta tela abriu e os botões respondem.
            </p>
            <p className="mt-3 text-sm font-semibold text-emerald-400">
              Funcionou
            </p>
          </section>

          <section className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-4">
            <p className="text-xs uppercase tracking-wide text-[#D4A373]">
              Etapa 2
            </p>
            <h2 className="mt-1 font-semibold text-[#f5f5f5]">
              Carregar alunos
            </h2>
            <p className="mt-2 text-xs text-[#a1a1a1]">
              Testa somente a chamada <code>/api/students</code>.
            </p>
            <button
              type="button"
              onClick={testStudents}
              disabled={studentStatus === "loading"}
              className="mt-3 rounded-lg bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a] disabled:opacity-50"
            >
              Testar alunos
            </button>
            <p className={`mt-3 text-sm font-semibold ${statusClass(studentStatus)}`}>
              {statusLabel(studentStatus)}
            </p>
          </section>

          <section className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-4">
            <p className="text-xs uppercase tracking-wide text-[#D4A373]">
              Etapa 3
            </p>
            <h2 className="mt-1 font-semibold text-[#f5f5f5]">
              Consultar contrato e semana
            </h2>

            <select
              value={selectedStudent}
              onChange={(event) => setSelectedStudent(event.target.value)}
              className="mt-3 w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]"
            >
              <option value="">Selecione um aluno</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={testWorkoutPlan}
              disabled={!selectedStudent || workoutStatus === "loading"}
              className="mt-3 rounded-lg bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a] disabled:opacity-50"
            >
              Testar contrato e semana
            </button>
            <p className={`mt-3 text-sm font-semibold ${statusClass(workoutStatus)}`}>
              {statusLabel(workoutStatus)}
            </p>
          </section>

          <section className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-4">
            <p className="text-xs uppercase tracking-wide text-[#D4A373]">
              Etapa 4
            </p>
            <h2 className="mt-1 font-semibold text-[#f5f5f5]">
              Carregar biblioteca
            </h2>
            <p className="mt-2 text-xs text-[#a1a1a1]">
              Busca a biblioteca, mas ainda não renderiza os exercícios.
            </p>
            <button
              type="button"
              onClick={testLibrary}
              disabled={libraryStatus === "loading"}
              className="mt-3 rounded-lg bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a] disabled:opacity-50"
            >
              Testar biblioteca
            </button>
            <p className={`mt-3 text-sm font-semibold ${statusClass(libraryStatus)}`}>
              {statusLabel(libraryStatus)}
            </p>
          </section>
        </div>

        {libraryStatus === "success" && (
          <section className="mt-4 rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-4">
            <p className="text-xs uppercase tracking-wide text-[#D4A373]">
              Etapa 5
            </p>
            <h2 className="mt-1 font-semibold text-[#f5f5f5]">
              Renderizar 60 exercícios
            </h2>
            <p className="mt-2 text-xs text-[#a1a1a1]">
              Esta etapa testa o volume visual usado na biblioteca.
            </p>

            <button
              type="button"
              onClick={() => {
                setRenderLibrary((current) => !current);
                addMessage(
                  renderLibrary
                    ? "Lista de exercícios ocultada."
                    : "Renderização dos primeiros 60 exercícios ativada."
                );
              }}
              className="mt-3 rounded-lg bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a]"
            >
              {renderLibrary ? "Ocultar exercícios" : "Renderizar exercícios"}
            </button>

            {renderLibrary && (
              <div className="mt-4 grid max-h-80 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-3">
                {library.slice(0, 60).map((exercise) => (
                  <div
                    key={exercise.id}
                    className="rounded-lg border border-[#ffffff10] bg-[#111111] p-3"
                  >
                    <p className="text-sm font-medium text-[#f5f5f5]">
                      {exercise.name}
                    </p>
                    <p className="mt-1 text-xs text-[#a1a1a1]">
                      {exercise.muscleGroup || "Grupo não informado"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="mt-6 rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-4">
          <h2 className="font-semibold text-[#f5f5f5]">
            Registro dos testes
          </h2>

          {messages.length === 0 ? (
            <p className="mt-2 text-xs text-[#737373]">
              Nenhum teste executado.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {messages.map((message, index) => (
                <p
                  key={`${message}-${index}`}
                  className="rounded-lg border border-[#ffffff10] bg-[#111111] p-2 text-xs text-[#d4d4d4]"
                >
                  {message}
                </p>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

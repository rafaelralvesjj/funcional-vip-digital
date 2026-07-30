"use client";
import { useEffect, useState } from "react";
interface Student {
  id: string;
  name: string;
  email?: string;
  image?: string;
  
}
interface LibraryExercise {
  id: string;
  name: string;
  description: string;
  muscleGroup: string;
  imageUrl?: string;
}
interface ExerciseItem {
  name: string;
  description: string;
  series: number;
  reps: string;
  weight: string;
  restTime: string;
  notes: string;
  order: number;
  imageUrl?: string;
  videoUrl?: string;
}
export default function MontarTreinoPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [filteredLibrary, setFilteredLibrary] = useState<LibraryExercise[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [planName, setPlanName] = useState("");
  const [weekDay, setWeekDay] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  useEffect(() => {
    fetchStudents();
    fetchLibrary();
  }, []);
  useEffect(() => {
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      setFilteredLibrary(
        library.filter(
          (ex) =>
            ex.name.toLowerCase().includes(term) ||
            ex.muscleGroup.toLowerCase().includes(term)
        )
      );
    } else {
      setFilteredLibrary(library);
    }
  }, [searchTerm, library]);
  async function fetchStudents() {
    try {
      const res = await fetch("/api/student");
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || data || []);
      }
    } catch {}
  }
  async function fetchLibrary() {
    try {
      const res = await fetch("/api/exercise-library");
      if (res.ok) {
        const data = await res.json();
        setLibrary(data.exercises || []);
        setFilteredLibrary(data.exercises || []);
      }
    } catch {}
  }
  function addExercise(ex: LibraryExercise) {
    const newExercise: ExerciseItem = {
      name: ex.name,
      description: ex.description,
      series: 3,
      reps: "10",
      weight: "",
      restTime: "60s",
      notes: "",
      order: exercises.length,
      imageUrl: ex.imageUrl,
      videoUrl: (ex as any).videoUrl,
    };
    setExercises([...exercises, newExercise]);
    setShowLibrary(false);
  }
  function removeExercise(index: number) {
    const updated = exercises.filter((_, i) => i !== index);
    setExercises(updated.map((ex, i) => ({ ...ex, order: i })));
  }
  function moveExercise(fromIndex: number, direction: "up" | "down") {
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= exercises.length) return;
    const updated = [...exercises];
    [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
    setExercises(updated.map((ex, i) => ({ ...ex, order: i })));
  }
  function updateExercise(index: number, field: keyof ExerciseItem, value: any) {
    const updated = [...exercises];
    (updated[index] as any)[field] = value;
    setExercises(updated);
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent || !planName.trim() || exercises.length === 0) return;
    setSaving(true);
    setSuccess(false);
    try {
      const res = await fetch("/api/workout-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudent,
          name: planName.trim(),
          description: description || null,
          weekDay: weekDay || null,
          notes: notes || null,
          exercises: exercises.map((ex) => ({
            name: ex.name,
            description: ex.description,
            series: ex.series,
            reps: ex.reps || null,
            weight: ex.weight || null,
            restTime: ex.restTime || null,
            notes: ex.notes || null,
            order: ex.order,
            imageUrl: ex.imageUrl || null,
            videoUrl: ex.videoUrl || null,
          })),
        }),
      });
      if (res.ok) {
        setSuccess(true);
        setPlanName("");
        setWeekDay("");
        setDescription("");
        setNotes("");
        setExercises([]);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const err = await res.json();
        alert("Erro ao salvar: " + (err.error || "erro desconhecido"));
      }
    } catch {
      alert("Erro de conexao ao salvar treino");
    }
    setSaving(false);
  }
  const diasSemana = [
    { value: "segunda", label: "Segunda-feira" },
    { value: "terca", label: "Terca-feira" },
    { value: "quarta", label: "Quarta-feira" },
    { value: "quinta", label: "Quinta-feira" },
    { value: "sexta", label: "Sexta-feira" },
    { value: "sabado", label: "Sabado" },
    { value: "domingo", label: "Domingo" },
  ];
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <h1 className="text-xl font-bold text-[#22D3EE]">Montar Treino</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5 space-y-4">
            <h2 className="text-lg font-semibold text-[#22D3EE]">Informacoes do Treino</h2>
            <div>
              <label className="text-sm text-[#a1a1a1] block mb-1">Aluno *</label>
              <select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#22D3EE]"
              >
                <option value="">Selecione um aluno...</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-[#a1a1a1] block mb-1">Nome do treino *</label>
              <input
                type="text"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="Ex: Treino A - Segunda"
                required
                className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE]"
              />
            </div>
            <div>
              <label className="text-sm text-[#a1a1a1] block mb-1">Dia da semana</label>
              <select
                value={weekDay}
                onChange={(e) => setWeekDay(e.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#22D3EE]"
              >
                <option value="">Selecione...</option>
                {diasSemana.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-[#a1a1a1] block mb-1">Descricao do treino</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Ex: Treino focado em membros inferiores..."
                className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE]"
              />
            </div>
          </div>
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#22D3EE]">Exercicios</h2>
              <button
                type="button"
                onClick={() => setShowLibrary(!showLibrary)}
                className="bg-[#22D3EE] text-[#0a0a0a] text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#06B6D4] transition"
              >
                {showLibrary ? "Fechar biblioteca" : "+ Adicionar exercicio"}
              </button>
            </div>
            {showLibrary && (
              <div className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4 mb-4">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar exercicio por nome ou grupo muscular..."
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#111] px-4 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE] mb-3"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {filteredLibrary.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => addExercise(ex)}
                      className="text-left bg-[#111] hover:bg-[#1a1a1a] border border-[#ffffff10] rounded-lg p-3 transition"
                    >
                      <p className="text-sm font-medium text-[#f5f5f5]">{ex.name}</p>
                      <p className="text-xs text-[#6b6b6b]">{ex.muscleGroup}</p>
                    </button>
                  ))}
                  {filteredLibrary.length === 0 && (
                    <p className="text-[#525252] text-sm col-span-full text-center py-4">Nenhum exercicio encontrado</p>
                  )}
                </div>
              </div>
            )}
            {exercises.length === 0 ? (
              <p className="text-[#525252] text-sm text-center py-8">
                Nenhum exercicio adicionado. Clique em &quot;+ Adicionar exercicio&quot; para comecar.
              </p>
            ) : (
              <div className="space-y-3">
                {exercises.map((ex, index) => (
                  <div key={index} className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="bg-[#22D3EE]/20 text-[#22D3EE] text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">{index + 1}</span>
                        <span className="text-[#f5f5f5] font-medium">{ex.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => moveExercise(index, "up")} disabled={index === 0}
                          className="text-[#6b6b6b] hover:text-white text-xs px-1 disabled:opacity-30">▲</button>
                        <button type="button" onClick={() => moveExercise(index, "down")} disabled={index === exercises.length - 1}
                          className="text-[#6b6b6b] hover:text-white text-xs px-1 disabled:opacity-30">▼</button>
                        <button type="button" onClick={() => removeExercise(index)}
                          className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-[#6b6b6b] block mb-1">Series</label>
                        <input type="number" value={ex.series} onChange={(e) => updateExercise(index, "series", Number(e.target.value))}
                          className="w-full rounded border border-[#ffffff10] bg-[#111] px-2 py-1.5 text-xs text-[#f5f5f5] outline-none focus:border-[#22D3EE]" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#6b6b6b] block mb-1">Repeticoes</label>
                        <input type="text" value={ex.reps} onChange={(e) => updateExercise(index, "reps", e.target.value)}
                          className="w-full rounded border border-[#ffffff10] bg-[#111] px-2 py-1.5 text-xs text-[#f5f5f5] outline-none focus:border-[#22D3EE]" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#6b6b6b] block mb-1">Carga (kg)</label>
                        <input type="text" value={ex.weight} onChange={(e) => updateExercise(index, "weight", e.target.value)}
                          className="w-full rounded border border-[#ffffff10] bg-[#111] px-2 py-1.5 text-xs text-[#f5f5f5] outline-none focus:border-[#22D3EE]" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#6b6b6b] block mb-1">Descanso</label>
                        <input type="text" value={ex.restTime} onChange={(e) => updateExercise(index, "restTime", e.target.value)}
                          className="w-full rounded border border-[#ffffff10] bg-[#111] px-2 py-1.5 text-xs text-[#f5f5f5] outline-none focus:border-[#22D3EE]" />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="text-[10px] text-[#6b6b6b] block mb-1">Observacoes do exercicio</label>
                      <input type="text" value={ex.notes} onChange={(e) => updateExercise(index, "notes", e.target.value)}
                        placeholder="Ex: Fazer lento..."
                        className="w-full rounded border border-[#ffffff10] bg-[#111] px-2 py-1.5 text-xs text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="text-lg font-semibold text-[#22D3EE] mb-4">Observacoes do Plano</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Observacoes gerais para o aluno sobre este treino..."
              className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE]"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !selectedStudent || !planName.trim() || exercises.length === 0}
            className="w-full bg-[#22D3EE] text-[#0a0a0a] font-bold rounded-xl py-4 text-base transition hover:bg-[#0891B2] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Salvando treino..." : "Salvar e enviar treino para o aluno"}
          </button>
          <p className="text-xs text-[#525252] text-center">
            {exercises.length} exercicio{exercises.length !== 1 ? "s" : ""}
            {selectedStudent && ` • Aluno: ${students.find((s) => s.id === selectedStudent)?.name || ""}`}
          </p>
        </form>
      </div>
    </div>
  );
}

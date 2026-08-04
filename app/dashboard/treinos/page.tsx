"use client";

import { useEffect, useMemo, useState } from "react";

type Exercise = { id?: string; libraryExerciseId?: string | null; name: string; series?: number | null; reps?: string | null; weight?: string | null; restTime?: string | null; notes?: string | null; order?: number };
type Plan = { id: string; active?: boolean; name: string; description?: string | null; objective?: string | null; focusAreas?: string | null; intensity?: string | null; estimatedDurationMinutes?: number | null; estimatedCaloriesMin?: number | null; estimatedCaloriesMax?: number | null; studentSummary?: string | null; safetyNote?: string | null; notes?: string | null; date?: string | null; exercises: Exercise[]; workouts: { id: string; date: string; status: string }[] };
type Student = { id: string; name: string; email?: string | null; workoutPlans: Plan[] };
type LibraryExercise = { id: string; name: string; muscleGroup?: string | null };

function statusLabel(status?: string) {
  const value = String(status || "").toUpperCase();
  if (value === "CONCLUIDO") return "Concluído";
  if (value === "PRE_PLANEJADO") return "Pré-planejado";
  if (value === "PRECISA_REVISAO") return "Precisa de revisão";
  return "Pendente";
}

export default function TreinosPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ student: Student; plan: Plan; readOnly: boolean } | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const [plansRes, libraryRes] = await Promise.all([
        fetch("/api/workouts/manage", { cache: "no-store" }),
        fetch("/api/exercise-library", { cache: "no-store" }),
      ]);
      const plansData = await plansRes.json();
      const libraryData = await libraryRes.json();
      if (!plansRes.ok) throw new Error(plansData?.error || "Erro ao carregar treinos");
      setStudents(Array.isArray(plansData?.students) ? plansData.students : []);
      const list = Array.isArray(libraryData?.exercises) ? libraryData.exercises : Array.isArray(libraryData) ? libraryData : [];
      setLibrary(list);
    } catch (e: any) { setError(e?.message || "Erro ao carregar treinos"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const selectedStudent = useMemo(() => {
    if (!selectedStudentId) return null;
    return students.find((student) => student.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  const visibleWorkoutPlans = useMemo(() => {
    if (!selectedStudent) return [];
    return selectedStudent.workoutPlans.filter(
      (plan) => plan.active !== false && plan.workouts.length > 0
    );
  }, [selectedStudent]);

  const filteredLibrary = useMemo(() => {
    const term = librarySearch.trim().toLowerCase();
    return library.filter((item) => !term || `${item.name} ${item.muscleGroup || ""}`.toLowerCase().includes(term)).slice(0, 30);
  }, [library, librarySearch]);

  function openEditor(student: Student, plan: Plan, readOnly: boolean) {
    setEditing({ student, plan, readOnly });
    setDraft({ ...plan, exercises: plan.exercises.map((item) => ({ ...item })) });
  }

  function updateExercise(index: number, field: string, value: any) {
    setDraft((current: any) => ({ ...current, exercises: current.exercises.map((item: any, i: number) => i === index ? { ...item, [field]: value } : item) }));
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...draft.exercises];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, exercises: next });
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/workouts/manage", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, workoutPlanId: draft.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao salvar treino");
      setEditing(null); setDraft(null); await load();
    } catch (e: any) { setError(e?.message || "Erro ao salvar treino"); }
    finally { setSaving(false); }
  }

  return <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-6 text-[#f5f5f5]">
    <div className="max-w-6xl mx-auto space-y-6">
      <div><p className="text-xs uppercase tracking-[0.3em] text-[#00A19C] mb-2">Controle do professor</p><h1 className="text-2xl font-bold text-[#00A19C]">Treinos dos alunos</h1><p className="text-sm text-[#a1a1a1] mt-2">Visualize todos os treinos e edite manualmente os que ainda não foram concluídos.</p></div>
      <label className="block text-sm text-[#b5b5b5]">Selecione o aluno
        <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)} className="mt-2 w-full bg-[#111] border border-[#ffffff10] rounded-xl px-4 py-3 outline-none focus:border-[#00A19C] text-white">
          <option value="">Escolha um aluno</option>
          {students.map((student) => <option key={student.id} value={student.id}>{student.name}{student.email ? ` - ${student.email}` : ""}</option>)}
        </select>
      </label>
      {error && <div className="border border-red-500/20 bg-red-500/10 text-red-300 rounded-xl p-3 text-sm">{error}</div>}
      {loading ? <div className="bg-[#111] rounded-2xl p-6 text-[#a1a1a1]">Carregando...</div> : !selectedStudent ? <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-6 text-[#a1a1a1]">Selecione um aluno para visualizar os treinos.</div> : <section key={selectedStudent.id} className="bg-[#111] border border-[#ffffff10] rounded-2xl p-4 md:p-5">
        <div className="mb-4"><h2 className="font-bold text-lg">{selectedStudent.name}</h2><p className="text-xs text-[#777]">{selectedStudent.email || "Sem e-mail"}</p></div>
        {visibleWorkoutPlans.length === 0 ? <p className="text-sm text-[#777]">Nenhum treino ativo gerado.</p> : <div className="grid gap-3">{visibleWorkoutPlans.map((plan) => {
          const completed = plan.workouts.some((w) => String(w.status).toUpperCase() === "CONCLUIDO");
          const status = plan.workouts[0]?.status;
          const date = plan.date || plan.workouts[0]?.date;
          return <div key={plan.id} className="bg-[#181818] border border-[#ffffff10] rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1"><div className="flex flex-wrap gap-2 items-center"><h3 className="font-semibold">{plan.name}</h3><span className="text-[11px] border border-[#00A19C]/30 text-[#00A19C] rounded-full px-2 py-1">{statusLabel(status)}</span></div><p className="text-xs text-[#888] mt-2">{date ? new Date(date).toLocaleDateString("pt-BR") : "Sem data"} · {plan.exercises.length} exercício(s)</p></div>
            <button onClick={() => openEditor(selectedStudent, plan, completed)} className="px-4 py-2 rounded-lg bg-[#00A19C] text-black font-semibold">{completed ? "Visualizar treino" : "Editar manualmente"}</button>
          </div>})}</div>}
      </section>}
    </div>

    {editing && draft && <div className="fixed inset-0 z-50 bg-black/80 overflow-y-auto p-3 md:p-6"><div className="max-w-5xl mx-auto bg-[#111] border border-[#ffffff15] rounded-2xl p-4 md:p-6 space-y-5">
      <div className="flex justify-between gap-4"><div><p className="text-xs text-[#00A19C]">{editing.student.name}</p><h2 className="text-xl font-bold">{editing.readOnly ? "Visualizar treino" : "Editar treino manualmente"}</h2></div><button onClick={() => { setEditing(null); setDraft(null); }} className="text-[#aaa]">Fechar</button></div>
      <div className="grid md:grid-cols-2 gap-3">{[
        ["name","Nome do treino"],["objective","Objetivo"],["focusAreas","Áreas de foco"],["intensity","Intensidade"],["estimatedDurationMinutes","Duração em minutos"],["estimatedCaloriesMin","Calorias mínimas"],["estimatedCaloriesMax","Calorias máximas"]
      ].map(([field,label]) => <label key={field} className="text-xs text-[#aaa]">{label}<input disabled={editing.readOnly} value={draft[field] ?? ""} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} className="mt-1 w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-lg px-3 py-2 text-white disabled:opacity-70 disabled:cursor-not-allowed" /></label>)}</div>
      {[["description","Descrição"],["studentSummary","Resumo para o aluno"],["safetyNote","Orientação de segurança"],["notes","Observações do professor"]].map(([field,label]) => <label key={field} className="block text-xs text-[#aaa]">{label}<textarea disabled={editing.readOnly} value={draft[field] ?? ""} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} rows={2} className="mt-1 w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-lg px-3 py-2 text-white disabled:opacity-70 disabled:cursor-not-allowed" /></label>)}
      <div><h3 className="font-semibold mb-3">Exercícios</h3><div className="space-y-3">{draft.exercises.map((exercise: any, index: number) => <div key={`${exercise.id || exercise.libraryExerciseId}-${index}`} className="bg-[#181818] border border-[#ffffff10] rounded-xl p-3"><div className="flex justify-between gap-2 mb-3"><strong>{index + 1}. {exercise.name}</strong>{!editing.readOnly && <div className="flex gap-2"><button onClick={() => move(index,-1)}>↑</button><button onClick={() => move(index,1)}>↓</button><button onClick={() => setDraft({ ...draft, exercises: draft.exercises.filter((_: any, i: number) => i !== index) })} className="text-red-400">Excluir</button></div>}</div><div className="grid grid-cols-2 md:grid-cols-5 gap-2">{[["series","Séries"],["reps","Repetições"],["weight","Carga"],["restTime","Descanso"],["notes","Observação"]].map(([field,label]) => <label key={field} className="text-[11px] text-[#888]">{label}<input disabled={editing.readOnly} value={exercise[field] ?? ""} onChange={(e) => updateExercise(index,field,e.target.value)} className="mt-1 w-full bg-[#222] border border-[#ffffff10] rounded px-2 py-2 text-white disabled:opacity-70 disabled:cursor-not-allowed" /></label>)}</div></div>)}</div></div>
      {!editing.readOnly && <div className="bg-[#181818] rounded-xl p-3"><p className="text-sm font-semibold mb-2">Adicionar exercício da biblioteca</p><input value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} placeholder="Pesquisar exercício..." className="w-full bg-[#222] border border-[#ffffff10] rounded-lg px-3 py-2 mb-2" /><div className="max-h-48 overflow-y-auto grid md:grid-cols-2 gap-2">{filteredLibrary.map((item) => <button key={item.id} onClick={() => setDraft({ ...draft, exercises: [...draft.exercises, { libraryExerciseId: item.id, name: item.name, series: 3, reps: "10", weight: "", restTime: "60s", notes: "" }] })} className="text-left bg-[#222] hover:border-[#00A19C] border border-[#ffffff10] rounded-lg p-2 text-sm">+ {item.name}<span className="block text-[10px] text-[#777]">{item.muscleGroup || ""}</span></button>)}</div></div>}
      <div className="flex justify-end gap-3"><button onClick={() => { setEditing(null); setDraft(null); }} className="px-4 py-3 rounded-lg bg-[#222]">{editing.readOnly ? "Fechar" : "Cancelar"}</button>{!editing.readOnly && <button disabled={saving || draft.exercises.length === 0} onClick={save} className="px-5 py-3 rounded-lg bg-[#00A19C] text-black font-bold disabled:opacity-50">{saving ? "Salvando..." : "Salvar alterações"}</button>}</div>
    </div></div>}
  </div>;
}

"use client";

import { useState } from "react";

type Exercise = {
  id: string;
  name: string;
  description: string;
  muscleGroup: string;
  imageUrl: string | null;
};

export default function ExerciseGrid({
  exercises: initialExercises,
}: {
  exercises: Exercise[];
}) {
  const [exercises, setExercises] = useState<Exercise[]>(initialExercises);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    muscleGroup: "",
    imageUrl: "",
  });
  const [saving, setSaving] = useState(false);

  const version = Date.now();

  function resetForm() {
    setForm({ name: "", description: "", muscleGroup: "", imageUrl: "" });
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(ex: Exercise) {
    setForm({
      name: ex.name,
      description: ex.description,
      muscleGroup: ex.muscleGroup,
      imageUrl: ex.imageUrl || "",
    });
    setEditingId(ex.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    if (editingId) {
      const res = await fetch("/api/exercise-library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...form }),
      });

      if (res.ok) {
        const updated = await res.json();
        setExercises((prev) =>
          prev.map((ex) => (ex.id === editingId ? updated : ex))
        );
        resetForm();
      }
    } else {
      const res = await fetch("/api/exercise-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        const newExercise = await res.json();
        setExercises((prev) => [...prev, newExercise]);
        resetForm();
      }
    }

    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este exercício?")) return;
    await fetch("/api/exercise-library", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setExercises((prev) => prev.filter((ex) => ex.id !== id));
  }

  const groups = exercises.reduce((acc, ex) => {
    if (!acc[ex.muscleGroup]) acc[ex.muscleGroup] = [];
    acc[ex.muscleGroup].push(ex);
    return acc;
  }, {} as Record<string, Exercise[]>);

  return (
    <div>
      <button
        onClick={() => {
          resetForm();
          setShowForm(!showForm);
        }}
        className="mb-6 bg-[#D4A373] text-[#0a0a0a] font-semibold rounded-lg px-5 py-3 text-sm transition hover:bg-[#b88a5e]"
      >
        {showForm ? "Cancelar" : "+ Novo Exercício"}
      </button>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 bg-[#111111] border border-[#ffffff10] rounded-xl p-5 space-y-4"
        >
          {editingId && (
            <p className="text-sm text-[#D4A373] font-medium">
              ✏️ Editando: {form.name}
            </p>
          )}

          <div>
            <label className="text-sm text-[#e5e5e5] block mb-1">Nome</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
              placeholder="Ex: Agachamento"
            />
          </div>
          <div>
            <label className="text-sm text-[#e5e5e5] block mb-1">
              Descrição / Para que serve
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
              rows={3}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
              placeholder="Ex: Fortalece quadríceps, glúteos e core..."
            />
          </div>
          <div>
            <label className="text-sm text-[#e5e5e5] block mb-1">
              Grupo Muscular
            </label>
            <select
              value={form.muscleGroup}
              onChange={(e) => setForm({ ...form, muscleGroup: e.target.value })}
              required
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
            >
              <option value="">Selecione...</option>
              <option value="Pernas">Pernas</option>
              <option value="Glúteos">Glúteos</option>
              <option value="Core">Core / Abdômen</option>
              <option value="Peito">Peito</option>
              <option value="Costas">Costas</option>
              <option value="Ombros">Ombros</option>
              <option value="Braços">Braços</option>
              <option value="Corpo Inteiro">Corpo Inteiro</option>
              <option value="Cardio">Cardio / Condicionamento</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-[#e5e5e5] block mb-1">
              URL da Imagem <span className="text-[#525252]">(opcional)</span>
            </label>
            <input
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
              placeholder="https://  ou  /images/exercises/..."
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-[#D4A373] text-[#0a0a0a] font-semibold rounded-lg px-5 py-3 text-sm transition hover:bg-[#b88a5e] disabled:opacity-70"
          >
            {saving ? "Salvando..." : editingId ? "Salvar Alterações" : "Salvar Exercício"}
          </button>
        </form>
      )}

      {Object.entries(groups).map(([group, exs]) => (
        <div key={group} className="mb-8">
          <h2 className="text-lg font-semibold text-[#D4A373] mb-3">
            {group}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {exs.map((ex) => (
              <div
                key={ex.id}
                className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden group"
              >
                {ex.imageUrl ? (
                  <img
                    src={`${ex.imageUrl}?v=${version}`}
                    alt={ex.name}
                    className="w-full h-48 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : null}
                <div className={`${ex.imageUrl ? "hidden" : "flex"} w-full h-48 bg-[#1a1a1a] items-center justify-center text-[#525252]`}>
                  🏋️ Sem imagem
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <h3 className="text-base font-semibold text-[#f5f5f5]">
                      {ex.name}
                    </h3>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => startEdit(ex)}
                        className="text-xs text-[#D4A373] hover:text-[#b88a5e]"
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(ex.id)}
                        className="text-xs text-[#525252] hover:text-red-400"
                        title="Remover"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-[#a1a1a1] mt-2">
                    {ex.description}
                  </p>
                  <span className="inline-block mt-2 text-xs bg-[#D4A373]/10 text-[#D4A373] px-2 py-0.5 rounded-full">
                    {ex.muscleGroup}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

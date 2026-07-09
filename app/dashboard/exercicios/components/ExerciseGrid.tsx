"use client";

import { useRef, useState } from "react";

type Exercise = {
  id: string;
  name: string;
  description: string;
  muscleGroup: string;
  imageUrl: string | null;
  videoUrl?: string | null;
  sequenceImageUrl?: string | null;
  sequenceImageLabel?: string | null;
  sequenceImageNotes?: string | null;
  sequenceFramesCount?: number | null;
  sequenceGeneratedByAi?: boolean | null;
  sequencePrompt?: string | null;
  active?: boolean;
  objectiveTags?: string | null;
  locationTags?: string | null;
  equipmentTags?: string | null;
  restrictionTags?: string | null;
  levelTags?: string | null;
  intensity?: string | null;
  instructions?: string | null;
  commonMistakes?: string | null;
  substitutions?: string | null;
  safetyNotes?: string | null;
  contraindications?: string | null;
};

type ExerciseForm = {
  name: string;
  description: string;
  muscleGroup: string;
  imageUrl: string;
  videoUrl: string;
  sequenceImageUrl: string;
  sequenceImageLabel: string;
  sequenceImageNotes: string;
  sequenceFramesCount: string;
  sequenceGeneratedByAi: boolean;
  sequencePrompt: string;
  objectiveTags: string;
  locationTags: string;
  equipmentTags: string;
  restrictionTags: string;
  levelTags: string;
  intensity: string;
  instructions: string;
  commonMistakes: string;
  substitutions: string;
  safetyNotes: string;
  contraindications: string;
  active: boolean;
};

const emptyForm: ExerciseForm = {
  name: "",
  description: "",
  muscleGroup: "",
  imageUrl: "",
  videoUrl: "",
  sequenceImageUrl: "",
  sequenceImageLabel: "",
  sequenceImageNotes: "",
  sequenceFramesCount: "6",
  sequenceGeneratedByAi: false,
  sequencePrompt: "",
  objectiveTags: "",
  locationTags: "",
  equipmentTags: "",
  restrictionTags: "",
  levelTags: "",
  intensity: "",
  instructions: "",
  commonMistakes: "",
  substitutions: "",
  safetyNotes: "",
  contraindications: "",
  active: true,
};

function compactText(value?: string | null): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shortText(value?: string | null, maxLength = 130): string {
  const text = compactText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function toExerciseFromApi(payload: any): Exercise | null {
  const exercise = payload?.exercise || payload;

  if (!exercise?.id) return null;

  return exercise as Exercise;
}

export default function ExerciseGrid({
  exercises: initialExercises,
}: {
  exercises: Exercise[];
}) {
  const [exercises, setExercises] = useState<Exercise[]>(initialExercises);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExerciseForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sequenceFileInputRef = useRef<HTMLInputElement>(null);

  function updateForm<K extends keyof ExerciseForm>(field: K, value: ExerciseForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(exercise: Exercise) {
    setForm({
      name: exercise.name || "",
      description: exercise.description || "",
      muscleGroup: exercise.muscleGroup || "",
      imageUrl: exercise.imageUrl || "",
      videoUrl: exercise.videoUrl || "",
      sequenceImageUrl: exercise.sequenceImageUrl || "",
      sequenceImageLabel: exercise.sequenceImageLabel || "",
      sequenceImageNotes: exercise.sequenceImageNotes || "",
      sequenceFramesCount: exercise.sequenceFramesCount ? String(exercise.sequenceFramesCount) : "6",
      sequenceGeneratedByAi: Boolean(exercise.sequenceGeneratedByAi),
      sequencePrompt: exercise.sequencePrompt || "",
      objectiveTags: exercise.objectiveTags || "",
      locationTags: exercise.locationTags || "",
      equipmentTags: exercise.equipmentTags || "",
      restrictionTags: exercise.restrictionTags || "",
      levelTags: exercise.levelTags || "",
      intensity: exercise.intensity || "",
      instructions: exercise.instructions || "",
      commonMistakes: exercise.commonMistakes || "",
      substitutions: exercise.substitutions || "",
      safetyNotes: exercise.safetyNotes || "",
      contraindications: exercise.contraindications || "",
      active: exercise.active !== false,
    });
    setEditingId(exercise.id);
    setShowForm(true);
  }

  async function uploadFileToField(
    event: React.ChangeEvent<HTMLInputElement>,
    field: "imageUrl" | "sequenceImageUrl",
    folder: "biblioteca" | "sequencias"
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    try {
      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.url) {
        updateForm(field, data.url);
      } else {
        alert(`Erro ao enviar arquivo: ${data?.error || "tente novamente"}`);
      }
    } catch {
      alert("Erro ao conectar com o servidor.");
    } finally {
      setUploading(false);
      if (field === "imageUrl" && fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (field === "sequenceImageUrl" && sequenceFileInputRef.current) {
        sequenceFileInputRef.current.value = "";
      }
    }
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    return uploadFileToField(event, "imageUrl", "biblioteca");
  }

  async function handleSequenceImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    return uploadFileToField(event, "sequenceImageUrl", "sequencias");
  }

  function buildSequenceImagePromptFromForm(): string {
    const framesCount = Math.max(Number(form.sequenceFramesCount || 6), 3);

    return [
      `Crie uma imagem sequencial didática com ${framesCount} quadros para demonstrar o exercício "${form.name || "nome do exercício"}".`,
      "A imagem deve mostrar a mesma pessoa executando o movimento do início ao fim, em quadros numerados, com fundo limpo, estilo realista e instrutivo, sem texto pequeno demais.",
      form.description ? `Finalidade do exercício: ${form.description}.` : "",
      form.muscleGroup ? `Grupo muscular principal: ${form.muscleGroup}.` : "",
      form.instructions ? `Como executar: ${form.instructions}.` : "",
      form.safetyNotes ? `Cuidados de segurança: ${form.safetyNotes}.` : "",
      form.commonMistakes ? `Evite representar estes erros: ${form.commonMistakes}.` : "",
      form.contraindications ? `Atenções/contraindicações: ${form.contraindications}.` : "",
      "Priorize alinhamento corporal, postura neutra, execução controlada e progressão clara do movimento. Não criar posições perigosas, amplitude exagerada ou articulações desalinhadas.",
      "Formato sugerido: imagem horizontal 16:9, com quadros lado a lado ou em grade, boa iluminação e foco total na execução do exercício.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function handleBuildSequencePrompt() {
    const prompt = buildSequenceImagePromptFromForm();
    updateForm("sequencePrompt", prompt);
    updateForm("sequenceGeneratedByAi", true);

    try {
      await navigator.clipboard?.writeText(prompt);
      alert("Prompt da imagem sequencial copiado. Gere a imagem na IA, revise e depois suba o arquivo no campo de imagem sequencial.");
    } catch {
      alert("Prompt gerado. Copie o texto do campo de prompt para usar na IA.");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        muscleGroup: form.muscleGroup.trim(),
        imageUrl: form.imageUrl.trim() || null,
        videoUrl: form.videoUrl.trim() || null,
        sequenceImageUrl: form.sequenceImageUrl.trim() || null,
        sequenceImageLabel: form.sequenceImageLabel.trim() || null,
        sequenceImageNotes: form.sequenceImageNotes.trim() || null,
        sequenceFramesCount: form.sequenceFramesCount ? Math.max(Number(form.sequenceFramesCount), 0) : 0,
        sequenceGeneratedByAi: form.sequenceGeneratedByAi,
        sequencePrompt: form.sequencePrompt.trim() || null,
        objectiveTags: form.objectiveTags.trim() || null,
        locationTags: form.locationTags.trim() || null,
        equipmentTags: form.equipmentTags.trim() || null,
        restrictionTags: form.restrictionTags.trim() || null,
        levelTags: form.levelTags.trim() || null,
        intensity: form.intensity.trim() || null,
        instructions: form.instructions.trim() || null,
        commonMistakes: form.commonMistakes.trim() || null,
        substitutions: form.substitutions.trim() || null,
        safetyNotes: form.safetyNotes.trim() || null,
        contraindications: form.contraindications.trim() || null,
      };

      const res = await fetch("/api/exercise-library", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.error || "Não foi possível salvar o exercício.");
        return;
      }

      const savedExercise = toExerciseFromApi(data);

      if (!savedExercise) {
        alert("Exercício salvo, mas a resposta da API veio em formato inesperado. Atualize a página para conferir.");
        resetForm();
        return;
      }

      if (editingId) {
        setExercises((current) =>
          current.map((exercise) => (exercise.id === editingId ? savedExercise : exercise))
        );
      } else {
        setExercises((current) => [...current, savedExercise].sort((a, b) => a.name.localeCompare(b.name)));
      }

      resetForm();
    } catch {
      alert("Erro ao salvar exercício.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Desativar este exercício da biblioteca?")) return;

    try {
      const res = await fetch(`/api/exercise-library?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Não foi possível desativar o exercício.");
        return;
      }

      setExercises((current) => current.filter((exercise) => exercise.id !== id));
    } catch {
      alert("Erro ao desativar exercício.");
    }
  }

  const groups = exercises.reduce((acc, exercise) => {
    const group = exercise.muscleGroup || "Sem grupo muscular";
    if (!acc[group]) acc[group] = [];
    acc[group].push(exercise);
    return acc;
  }, {} as Record<string, Exercise[]>);

  return (
    <div>
      <button
        onClick={() => {
          if (showForm) {
            resetForm();
          } else {
            setForm(emptyForm);
            setEditingId(null);
            setShowForm(true);
          }
        }}
        className="mb-6 bg-[#D4A373] text-[#0a0a0a] font-semibold rounded-lg px-5 py-3 text-sm transition hover:bg-[#b88a5e]"
      >
        {showForm ? "Cancelar" : "+ Novo Exercício"}
      </button>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 bg-[#111111] border border-[#ffffff10] rounded-xl p-5 space-y-5"
        >
          {editingId && (
            <p className="text-sm text-[#D4A373] font-medium">
              ✏️ Editando: {form.name}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Nome *</label>
              <input
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                required
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Ex: Agachamento na cadeira"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Grupo muscular *</label>
              <select
                value={form.muscleGroup}
                onChange={(event) => updateForm("muscleGroup", event.target.value)}
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
                <option value="Mobilidade">Mobilidade</option>
                <option value="Recuperação">Recuperação</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-[#e5e5e5] block mb-1">
              Pra que serve este exercício? *
            </label>
            <textarea
              value={form.description}
              onChange={(event) => updateForm("description", event.target.value)}
              required
              rows={3}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
              placeholder="Ex: Fortalece pernas e glúteos, melhora o padrão de sentar e levantar e ajuda na base para corrida."
            />
            <p className="text-[10px] text-[#6b6b6b] mt-1">
              Este texto aparece para o aluno como finalidade do exercício.
            </p>
          </div>

          <div>
            <label className="text-sm text-[#e5e5e5] block mb-1">
              Como executar
            </label>
            <textarea
              value={form.instructions}
              onChange={(event) => updateForm("instructions", event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
              placeholder="Ex: Apoie os pés no chão, sente e levante controlando o movimento, mantendo joelhos alinhados."
            />
          </div>

          <div>
            <label className="text-sm text-[#e5e5e5] block mb-1">
              Cuidados para executar com segurança
            </label>
            <textarea
              value={form.safetyNotes}
              onChange={(event) => updateForm("safetyNotes", event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
              placeholder="Ex: Não deixe o joelho cair para dentro. Pare se sentir dor fora do esperado e avise o professor."
            />
            <p className="text-[10px] text-[#6b6b6b] mt-1">
              Este texto aparece para o aluno no detalhe do exercício.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Erros comuns</label>
              <textarea
                value={form.commonMistakes}
                onChange={(event) => updateForm("commonMistakes", event.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Ex: Arredondar a coluna, acelerar demais, prender a respiração."
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Contraindicações / atenção</label>
              <textarea
                value={form.contraindications}
                onChange={(event) => updateForm("contraindications", event.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Ex: Evitar em caso de dor aguda no joelho sem liberação do professor/profissional responsável."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Objetivos / tags</label>
              <input
                value={form.objectiveTags}
                onChange={(event) => updateForm("objectiveTags", event.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Ex: força, corrida, funcional, emagrecimento"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Cuidados / restrições</label>
              <input
                value={form.restrictionTags}
                onChange={(event) => updateForm("restrictionTags", event.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Ex: joelho atenção, lombar atenção, baixo impacto"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Locais</label>
              <input
                value={form.locationTags}
                onChange={(event) => updateForm("locationTags", event.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Ex: casa, academia, condomínio"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Equipamentos</label>
              <input
                value={form.equipmentTags}
                onChange={(event) => updateForm("equipmentTags", event.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Ex: sem equipamento, cadeira, halter"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Níveis</label>
              <input
                value={form.levelTags}
                onChange={(event) => updateForm("levelTags", event.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Ex: iniciante, intermediário"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Intensidade</label>
              <select
                value={form.intensity}
                onChange={(event) => updateForm("intensity", event.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              >
                <option value="">Selecione...</option>
                <option value="leve">Leve</option>
                <option value="moderada">Moderada</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-[#e5e5e5] block mb-1">Substituições possíveis</label>
            <input
              value={form.substitutions}
              onChange={(event) => updateForm("substitutions", event.target.value)}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
              placeholder="Ex: agachamento na cadeira, leg press, ponte de glúteos"
            />
          </div>

          <div>
            <label className="text-sm text-[#e5e5e5] block mb-1">
              Imagem <span className="text-[#525252]">(opcional)</span>
            </label>
            <div className="flex flex-col gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImageUpload}
                className="w-full text-sm text-[#e5e5e5] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#D4A373] file:text-[#0a0a0a] file:font-semibold file:text-sm hover:file:bg-[#b88a5e]"
              />
              {uploading && <p className="text-xs text-[#D4A373]">Enviando imagem...</p>}
              {form.imageUrl && !uploading && (
                <div className="flex items-center gap-2">
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    className="w-16 h-16 bg-[#1a1a1a] rounded-lg border border-[#ffffff10] object-cover"
                    onError={(event) => {
                      (event.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <span className="text-xs text-[#a1a1a1] truncate flex-1">
                    {form.imageUrl}
                  </span>
                </div>
              )}
              <input
                value={form.imageUrl}
                onChange={(event) => updateForm("imageUrl", event.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Ou cole a URL manualmente..."
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#D4A373]/20 bg-[#D4A373]/5 p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-[#D4A373]">
                Imagem sequencial da execução
              </p>
              <p className="text-xs text-[#a1a1a1] mt-1 leading-relaxed">
                Use uma imagem única com 3 a 6 quadros mostrando o movimento do início ao fim. Ela aparecerá no detalhe do exercício para o aluno.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Quantidade de quadros</label>
                <input
                  type="number"
                  min="3"
                  max="8"
                  value={form.sequenceFramesCount}
                  onChange={(event) => updateForm("sequenceFramesCount", event.target.value)}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm text-[#e5e5e5] block mb-1">Título da sequência</label>
                <input
                  value={form.sequenceImageLabel}
                  onChange={(event) => updateForm("sequenceImageLabel", event.target.value)}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                  placeholder="Ex: Execução do agachamento em 6 etapas"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Observação para acompanhar a sequência</label>
              <textarea
                value={form.sequenceImageNotes}
                onChange={(event) => updateForm("sequenceImageNotes", event.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Ex: Observe o alinhamento dos joelhos, coluna neutra e controle na descida e subida."
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-[#e5e5e5] block">Arquivo da imagem sequencial</label>
              <input
                type="file"
                ref={sequenceFileInputRef}
                accept="image/png,image/jpeg,image/webp"
                onChange={handleSequenceImageUpload}
                className="w-full text-sm text-[#e5e5e5] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#D4A373] file:text-[#0a0a0a] file:font-semibold file:text-sm hover:file:bg-[#b88a5e]"
              />
              {uploading && <p className="text-xs text-[#D4A373]">Enviando arquivo...</p>}
              {form.sequenceImageUrl && !uploading && (
                <div className="flex items-center gap-3 rounded-lg border border-[#ffffff10] bg-[#1a1a1a] p-2">
                  <img
                    src={form.sequenceImageUrl}
                    alt="Preview da sequência"
                    className="h-20 w-28 rounded-lg border border-[#ffffff10] bg-[#0a0a0a] object-cover"
                    onError={(event) => {
                      (event.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <span className="text-xs text-[#a1a1a1] truncate flex-1">
                    {form.sequenceImageUrl}
                  </span>
                </div>
              )}
              <input
                value={form.sequenceImageUrl}
                onChange={(event) => updateForm("sequenceImageUrl", event.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Ou cole a URL da imagem sequencial..."
              />
            </div>

            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-blue-300">Apoio de IA</p>
                  <p className="text-xs text-blue-100/70 mt-1">
                    Gere um prompt para criar a imagem sequencial em uma IA de imagem. Depois revise a execução e suba a imagem aprovada.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleBuildSequencePrompt}
                  className="rounded-lg bg-blue-400 px-4 py-2 text-xs font-semibold text-[#0a0a0a] hover:bg-blue-300 transition"
                >
                  Gerar prompt IA
                </button>
              </div>

              {form.sequencePrompt && (
                <textarea
                  value={form.sequencePrompt}
                  onChange={(event) => updateForm("sequencePrompt", event.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-blue-500/20 bg-[#0a0a0a] px-3 py-2 text-xs text-blue-100 placeholder-blue-100/40 outline-none focus:border-blue-300"
                />
              )}

              <label className="flex items-center gap-2 text-xs text-blue-100/80">
                <input
                  type="checkbox"
                  checked={form.sequenceGeneratedByAi}
                  onChange={(event) => updateForm("sequenceGeneratedByAi", event.target.checked)}
                  className="accent-blue-400"
                />
                Imagem sequencial criada com apoio de IA e revisada pelo professor
              </label>
            </div>
          </div>

          <div>
            <label className="text-sm text-[#e5e5e5] block mb-1">Vídeo demonstrativo</label>
            <input
              value={form.videoUrl}
              onChange={(event) => updateForm("videoUrl", event.target.value)}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
              placeholder="Cole a URL do vídeo, se houver..."
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[#e5e5e5]">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => updateForm("active", event.target.checked)}
              className="accent-[#D4A373]"
            />
            Exercício ativo na biblioteca
          </label>

          <button
            type="submit"
            disabled={saving || uploading}
            className="bg-[#D4A373] text-[#0a0a0a] font-semibold rounded-lg px-5 py-3 text-sm transition hover:bg-[#b88a5e] disabled:opacity-70"
          >
            {saving ? "Salvando..." : editingId ? "Salvar Alterações" : "Salvar Exercício"}
          </button>
        </form>
      )}

      {Object.entries(groups).map(([group, groupedExercises]) => (
        <div key={group} className="mb-8">
          <h2 className="text-lg font-semibold text-[#D4A373] mb-3">
            {group}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupedExercises.map((exercise) => (
              <div
                key={exercise.id}
                className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden group"
              >
                {exercise.imageUrl ? (
                  <img
                    src={exercise.imageUrl}
                    alt={exercise.name}
                    className="w-full h-48 object-cover"
                    onError={(event) => {
                      (event.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : null}

                <div className={`${exercise.imageUrl ? "hidden" : "flex"} w-full h-48 bg-[#1a1a1a] items-center justify-center text-[#525252]`}>
                  🏋️ Sem imagem
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-[#f5f5f5]">
                        {exercise.name}
                      </h3>
                      <span className="inline-block mt-2 text-xs bg-[#D4A373]/10 text-[#D4A373] px-2 py-0.5 rounded-full">
                        {exercise.muscleGroup}
                      </span>
                      {exercise.sequenceImageUrl && (
                        <span className="inline-block mt-2 ml-1 text-xs bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-full">
                          sequência visual
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition shrink-0">
                      <button
                        onClick={() => startEdit(exercise)}
                        className="text-xs text-[#D4A373] hover:text-[#b88a5e]"
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(exercise.id)}
                        className="text-xs text-[#525252] hover:text-red-400"
                        title="Desativar"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#1a1a1a] border border-[#ffffff08] p-3">
                    <p className="text-[10px] uppercase tracking-wide text-[#D4A373] font-semibold">
                      Pra que serve
                    </p>
                    <p className="text-sm text-[#a1a1a1] mt-1">
                      {shortText(exercise.description) || "Não informado."}
                    </p>
                  </div>

                  {exercise.sequenceImageUrl && (
                    <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-blue-300 font-semibold">
                        Sequência de execução
                      </p>
                      <p className="text-xs text-blue-100/80 mt-1">
                        {exercise.sequenceImageLabel || `Imagem sequencial com ${exercise.sequenceFramesCount || 0} quadro(s)`}
                        {exercise.sequenceGeneratedByAi ? " · apoio de IA" : ""}
                      </p>
                    </div>
                  )}

                  {(exercise.safetyNotes || exercise.restrictionTags || exercise.commonMistakes || exercise.contraindications) && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-amber-300 font-semibold">
                        Cuidados
                      </p>
                      <p className="text-xs text-amber-100/80 mt-1 leading-relaxed">
                        {shortText(
                          [
                            exercise.safetyNotes,
                            exercise.restrictionTags ? `Atenção: ${exercise.restrictionTags}.` : null,
                            exercise.commonMistakes ? `Evitar: ${exercise.commonMistakes}.` : null,
                            exercise.contraindications ? `Contraindicação/atenção: ${exercise.contraindications}.` : null,
                          ]
                            .filter(Boolean)
                            .join(" "),
                          170
                        )}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {exercise.intensity && (
                      <span className="text-[10px] bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-full">
                        {exercise.intensity}
                      </span>
                    )}
                    {exercise.levelTags && (
                      <span className="text-[10px] bg-green-500/10 text-green-300 px-2 py-0.5 rounded-full">
                        {exercise.levelTags}
                      </span>
                    )}
                    {exercise.equipmentTags && (
                      <span className="text-[10px] bg-[#ffffff08] text-[#a1a1a1] px-2 py-0.5 rounded-full">
                        {exercise.equipmentTags}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

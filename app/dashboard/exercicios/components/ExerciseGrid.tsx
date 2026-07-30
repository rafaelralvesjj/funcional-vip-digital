"use client";

import { useMemo, useRef, useState } from "react";

type Exercise = {
  id: string;
  name: string;
  description: string;
  muscleGroup: string;
  imageUrl: string | null;
  videoUrl?: string | null;
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
  sequenceImageUrl?: string | null;
  sequenceImageLabel?: string | null;
  sequenceImageNotes?: string | null;
  executionFramesCount?: number | null;
  sequenceGeneratedByAi?: boolean | null;
};

type ExerciseForm = {
  name: string;
  description: string;
  muscleGroup: string;
  imageUrl: string;
  videoUrl: string;
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
  sequenceImageUrl: string;
  sequenceImageLabel: string;
  sequenceImageNotes: string;
  executionFramesCount: number;
  sequenceGeneratedByAi: boolean;
  active: boolean;
};

const emptyForm: ExerciseForm = {
  name: "",
  description: "",
  muscleGroup: "",
  imageUrl: "",
  videoUrl: "",
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
  sequenceImageUrl: "",
  sequenceImageLabel: "",
  sequenceImageNotes: "",
  executionFramesCount: 6,
  sequenceGeneratedByAi: false,
  active: true,
};

const ALLOWED_EXERCISE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_EXERCISE_IMAGE_SIZE = 4 * 1024 * 1024;
const ALLOWED_EXERCISE_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_EXERCISE_VIDEO_SIZE = 4 * 1024 * 1024;

const MUSCLE_GROUP_OPTIONS = [
  { value: "Pernas", label: "Pernas" },
  { value: "Glúteos", label: "Glúteos" },
  { value: "Core / Abdômen", label: "Core / Abdômen" },
  { value: "Peito", label: "Peito" },
  { value: "Costas", label: "Costas" },
  { value: "Ombros", label: "Ombros" },
  { value: "Braços", label: "Braços" },
  { value: "Corpo Inteiro", label: "Corpo Inteiro" },
  { value: "Cardio / Condicionamento", label: "Cardio / Condicionamento" },
  { value: "Mobilidade", label: "Mobilidade" },
  { value: "Recuperação", label: "Recuperação" },
] as const;

function compactText(value?: string | null): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeMuscleGroupValue(value?: string | null): string {
  const current = compactText(value);
  if (!current) return "";

  const normalized = current
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const aliases: Record<string, string> = {
    core: "Core / Abdômen",
    abdomen: "Core / Abdômen",
    "core / abdomen": "Core / Abdômen",
    "core/abdomen": "Core / Abdômen",
    cardio: "Cardio / Condicionamento",
    condicionamento: "Cardio / Condicionamento",
    "cardio / condicionamento": "Cardio / Condicionamento",
    "cardio/condicionamento": "Cardio / Condicionamento",
  };

  return aliases[normalized] || current;
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

function slugify(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function firstSentence(value?: string | null): string {
  const text = compactText(value);
  if (!text) return "";
  return text.split(/[.!?]/)[0]?.trim() || text;
}

function limitWords(value: string, maxWords: number): string {
  return compactText(value).split(" ").filter(Boolean).slice(0, maxWords).join(" ");
}

function ensureFinalPeriod(value: string): string {
  const text = compactText(value).replace(/[.,;:!?]+$/g, "");
  return text ? `${text}.` : "";
}

function buildShortNarration(exercise: Exercise): string {
  const source =
    firstSentence(exercise.instructions) ||
    firstSentence(exercise.safetyNotes) ||
    firstSentence(exercise.description);

  if (!source) {
    return "Execute com controle e mantenha o corpo bem alinhado.";
  }

  return ensureFinalPeriod(limitWords(source, 10));
}

function buildMovementGuidance(exercise: Exercise): string {
  const parts = [
    exercise.instructions
      ? `Movement instructions: ${compactText(exercise.instructions)}`
      : null,
    exercise.safetyNotes
      ? `Safety and posture: ${compactText(exercise.safetyNotes)}`
      : null,
    exercise.commonMistakes
      ? `Avoid these mistakes: ${compactText(exercise.commonMistakes)}`
      : null,
  ].filter(Boolean);

  if (parts.length > 0) return parts.join(" ");

  return `Perform one technically correct and controlled repetition of ${compactText(
    exercise.name
  )}.`;
}

function buildVideoPrompt(exercise: Exercise): string {
  const exerciseName = compactText(exercise.name) || "the exercise";
  const movementGuidance = buildMovementGuidance(exercise);

  return `Use the uploaded image as the exact reference. Preserve the same person, face, body, clothing, equipment, lighting and background. Create a realistic 6-second 16:9 video. Keep the camera completely fixed in a full-body shot during the entire video, with the complete body and all equipment always visible. The person performs one complete repetition of ${exerciseName}. ${movementGuidance} Start from the position shown in the reference image, execute the movement slowly and naturally, then return smoothly to the starting position. Keep the posture stable and the movement controlled, safe and technically correct. Do not change the person, environment, equipment or camera framing. Do not zoom, crop, pan or move the camera.`;
}

function buildAudioPrompt(exercise: Exercise): string {
  const narration = buildShortNarration(exercise);

  return `Voiceover in Brazilian Portuguese, confident male voice:\n\n"${narration}"\n\nNatural breathing.\nSoft movement sounds appropriate for the exercise.\nQuiet indoor gym ambience.\nNo background music.`;
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
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
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingSequence, setUploadingSequence] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [downloadingImageId, setDownloadingImageId] = useState<string | null>(null);
  const [copiedPromptKey, setCopiedPromptKey] = useState<string | null>(null);

  const mainFileInputRef = useRef<HTMLInputElement>(null);
  const sequenceFileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  function updateForm<K extends keyof ExerciseForm>(
    field: K,
    value: ExerciseForm[K]
  ) {
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
      muscleGroup: normalizeMuscleGroupValue(exercise.muscleGroup),
      imageUrl: exercise.imageUrl || "",
      videoUrl: exercise.videoUrl || "",
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
      sequenceImageUrl: exercise.sequenceImageUrl || "",
      sequenceImageLabel:
        exercise.sequenceImageLabel ||
        `Sequência de execução do exercício ${exercise.name}`,
      sequenceImageNotes: exercise.sequenceImageNotes || "",
      executionFramesCount: Number(exercise.executionFramesCount) || 6,
      sequenceGeneratedByAi: Boolean(exercise.sequenceGeneratedByAi),
      active: exercise.active !== false,
    });

    setEditingId(exercise.id);
    setShowForm(true);
  }

  async function handleImageUpload(
    event: React.ChangeEvent<HTMLInputElement>,
    target: "imageUrl" | "sequenceImageUrl"
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_EXERCISE_IMAGE_TYPES.includes(file.type)) {
      alert("Tipo não permitido. Use PNG, JPG ou WebP.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_EXERCISE_IMAGE_SIZE) {
      alert(
        `A imagem possui ${(file.size / 1024 / 1024).toFixed(
          1
        )} MB. O limite seguro para este envio é 4 MB.`
      );
      event.target.value = "";
      return;
    }

    if (target === "imageUrl") setUploadingMain(true);
    if (target === "sequenceImageUrl") setUploadingSequence(true);

    const body = new FormData();
    body.append("file", file);
    body.append("kind", target === "sequenceImageUrl" ? "SEQUENCE" : "MAIN");
    body.append("exerciseName", form.name.trim());

    try {
      const response = await fetch("/api/exercise-library/upload-image", {
        method: "POST",
        body,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.url) {
        alert(
          `Erro ao enviar imagem: ${
            data?.error || data?.message || "tente novamente"
          }`
        );
        return;
      }

      updateForm(target, data.url as any);
    } catch {
      alert("Erro ao conectar com o Vercel Blob.");
    } finally {
      if (target === "imageUrl") {
        setUploadingMain(false);
        if (mainFileInputRef.current) mainFileInputRef.current.value = "";
      }

      if (target === "sequenceImageUrl") {
        setUploadingSequence(false);
        if (sequenceFileInputRef.current) sequenceFileInputRef.current.value = "";
      }
    }
  }

  async function handleVideoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_EXERCISE_VIDEO_TYPES.includes(file.type)) {
      alert("Tipo não permitido. Use MP4, WebM ou MOV.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_EXERCISE_VIDEO_SIZE) {
      alert(`O vídeo possui ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite seguro para este envio é 4 MB.`);
      event.target.value = "";
      return;
    }

    setUploadingVideo(true);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("exerciseName", form.name.trim());

      const response = await fetch("/api/exercise-library/upload-video", {
        method: "POST",
        body,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.url) {
        alert(
          `Erro ao enviar vídeo: ${
            data?.error || data?.message || "tente novamente"
          }`
        );
        return;
      }

      updateForm("videoUrl", data.url as string);
    } catch (error) {
      console.error("Erro no upload do vídeo:", error);
      alert("Erro ao conectar com o Vercel Blob.");
    } finally {
      setUploadingVideo(false);
      if (videoFileInputRef.current) videoFileInputRef.current.value = "";
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        muscleGroup: normalizeMuscleGroupValue(form.muscleGroup),
        imageUrl: form.imageUrl.trim() || null,
        videoUrl: form.videoUrl.trim() || null,
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
        sequenceImageUrl: form.sequenceImageUrl.trim() || null,
        sequenceImageLabel: form.sequenceImageLabel.trim() || null,
        sequenceImageNotes: form.sequenceImageNotes.trim() || null,
        executionFramesCount: Number(form.executionFramesCount) || 6,
        sequenceGeneratedByAi: Boolean(form.sequenceGeneratedByAi),
        active: Boolean(form.active),
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
        alert(
          "Exercício salvo, mas a resposta da API veio em formato inesperado. Atualize a página para conferir."
        );
        resetForm();
        return;
      }

      if (editingId) {
        setExercises((current) =>
          current.map((exercise) =>
            exercise.id === editingId ? savedExercise : exercise
          )
        );
      } else {
        setExercises((current) =>
          [...current, savedExercise].sort((a, b) => a.name.localeCompare(b.name))
        );
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

      setExercises((current) =>
        current.filter((exercise) => exercise.id !== id)
      );
    } catch {
      alert("Erro ao desativar exercício.");
    }
  }

  async function handleDownloadImage(exercise: Exercise) {
    if (!exercise.imageUrl || downloadingImageId) return;

    setDownloadingImageId(exercise.id);

    try {
      const response = await fetch(exercise.imageUrl);

      if (!response.ok) {
        throw new Error("Não foi possível carregar a imagem.");
      }

      const blob = await response.blob();
      const contentType = blob.type.toLowerCase();

      const extension = contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = `${slugify(exercise.name) || "exercicio"}__principal.${extension}`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      const link = document.createElement("a");

      link.href = exercise.imageUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      setDownloadingImageId(null);
    }
  }

  async function handleCopyPrompt(
    exercise: Exercise,
    type: "video" | "audio"
  ) {
    const key = `${exercise.id}-${type}`;

    try {
      const text =
        type === "video"
          ? buildVideoPrompt(exercise)
          : buildAudioPrompt(exercise);

      await copyTextToClipboard(text);
      setCopiedPromptKey(key);

      window.setTimeout(() => {
        setCopiedPromptKey((current) => (current === key ? null : current));
      }, 1800);
    } catch {
      alert("Não foi possível copiar o texto. Tente novamente.");
    }
  }

  const groups = useMemo(() => {
    return exercises.reduce(
      (acc, exercise) => {
        const group = exercise.muscleGroup || "Sem grupo muscular";
        if (!acc[group]) acc[group] = [];
        acc[group].push(exercise);
        return acc;
      },
      {} as Record<string, Exercise[]>
    );
  }, [exercises]);

  return (
    <div>
      <div className="mb-6">
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
          className="bg-[#00A19C] text-[#0a0a0a] font-semibold rounded-lg px-5 py-3 text-sm transition hover:bg-[#007D79]"
        >
          {showForm ? "Cancelar" : "+ Novo Exercício"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 bg-[#111111] border border-[#ffffff10] rounded-xl p-5 space-y-5"
        >
          {editingId && (
            <p className="text-sm text-[#00A19C] font-medium">
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
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                placeholder="Ex: Agachamento na cadeira"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">
                Grupo muscular *
              </label>
              <select
                value={form.muscleGroup}
                onChange={(event) =>
                  updateForm("muscleGroup", event.target.value)
                }
                required
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
              >
                <option value="">Selecione...</option>

                {form.muscleGroup &&
                  !MUSCLE_GROUP_OPTIONS.some(
                    (option) => option.value === form.muscleGroup
                  ) && (
                    <option value={form.muscleGroup}>{form.muscleGroup}</option>
                  )}

                {MUSCLE_GROUP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-[#e5e5e5] block mb-1">
              Pra que serve este exercício? *
            </label>
            <textarea
              value={form.description}
              onChange={(event) =>
                updateForm("description", event.target.value)
              }
              required
              rows={3}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
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
              onChange={(event) =>
                updateForm("instructions", event.target.value)
              }
              rows={3}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
              placeholder="Ex: apoiar antebraços e pés, manter cabeça, tronco, quadris e pernas alinhados, ativando abdômen e glúteos."
            />
          </div>

          <div>
            <label className="text-sm text-[#e5e5e5] block mb-1">
              Cuidados para executar com segurança
            </label>
            <textarea
              value={form.safetyNotes}
              onChange={(event) =>
                updateForm("safetyNotes", event.target.value)
              }
              rows={3}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
              placeholder="Ex: manter coluna neutra, joelhos alinhados, abdômen ativo e amplitude segura."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">
                Erros comuns
              </label>
              <textarea
                value={form.commonMistakes}
                onChange={(event) =>
                  updateForm("commonMistakes", event.target.value)
                }
                rows={2}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                placeholder="Ex: Arredondar a coluna, acelerar demais, prender a respiração."
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">
                Contraindicações / atenção
              </label>
              <textarea
                value={form.contraindications}
                onChange={(event) =>
                  updateForm("contraindications", event.target.value)
                }
                rows={2}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                placeholder="Ex: Evitar em caso de dor aguda sem liberação."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">
                Objetivos / tags
              </label>
              <input
                value={form.objectiveTags}
                onChange={(event) =>
                  updateForm("objectiveTags", event.target.value)
                }
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                placeholder="Ex: força, corrida, funcional, emagrecimento"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">
                Cuidados / restrições
              </label>
              <input
                value={form.restrictionTags}
                onChange={(event) =>
                  updateForm("restrictionTags", event.target.value)
                }
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                placeholder="Ex: joelho atenção, lombar atenção, baixo impacto"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Locais</label>
              <input
                value={form.locationTags}
                onChange={(event) =>
                  updateForm("locationTags", event.target.value)
                }
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                placeholder="Ex: casa, academia, condomínio"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">
                Equipamentos
              </label>
              <input
                value={form.equipmentTags}
                onChange={(event) =>
                  updateForm("equipmentTags", event.target.value)
                }
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                placeholder="Ex: sem equipamento, cadeira, halter"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Níveis</label>
              <input
                value={form.levelTags}
                onChange={(event) =>
                  updateForm("levelTags", event.target.value)
                }
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                placeholder="Ex: iniciante, intermediário"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">
                Intensidade
              </label>
              <select
                value={form.intensity}
                onChange={(event) =>
                  updateForm("intensity", event.target.value)
                }
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
              >
                <option value="">Selecione...</option>
                <option value="leve">Leve</option>
                <option value="moderada">Moderada</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-[#e5e5e5] block mb-1">
              Substituições possíveis
            </label>
            <input
              value={form.substitutions}
              onChange={(event) =>
                updateForm("substitutions", event.target.value)
              }
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
              placeholder="Ex: agachamento na cadeira, leg press, ponte de glúteos"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="rounded-xl border border-[#ffffff10] bg-[#0d0d0d] p-4 space-y-3">
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">
                  Imagem principal{" "}
                  <span className="text-[#525252]">(opcional)</span>
                </label>
                <p className="text-[10px] text-[#6b6b6b] mb-2">
                  PNG, JPG ou WebP de até 4 MB, enviada ao Vercel Blob.
                </p>
                <input
                  type="file"
                  ref={mainFileInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) =>
                    handleImageUpload(event, "imageUrl")
                  }
                  className="w-full text-sm text-[#e5e5e5] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#00A19C] file:text-[#0a0a0a] file:font-semibold file:text-sm hover:file:bg-[#007D79]"
                />
              </div>

              {uploadingMain && (
                <p className="text-xs text-[#00A19C]">
                  Enviando imagem principal...
                </p>
              )}

              {form.imageUrl && !uploadingMain && (
                <div className="flex items-center gap-2 rounded-lg border border-[#ffffff10] bg-[#111111] p-2">
                  <img
                    src={form.imageUrl}
                    alt="Preview imagem principal"
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
                onChange={(event) =>
                  updateForm("imageUrl", event.target.value)
                }
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                placeholder="Ou cole a URL da imagem principal..."
              />
            </div>

            <div className="rounded-xl border border-[#ffffff10] bg-[#0d0d0d] p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-[#e5e5e5] block mb-1">
                    Quadros da sequência
                  </label>
                  <select
                    value={String(form.executionFramesCount)}
                    onChange={(event) =>
                      updateForm(
                        "executionFramesCount",
                        Number(event.target.value)
                      )
                    }
                    className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
                  >
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm text-[#e5e5e5] block mb-1">
                    Título da sequência
                  </label>
                  <input
                    value={form.sequenceImageLabel}
                    onChange={(event) =>
                      updateForm("sequenceImageLabel", event.target.value)
                    }
                    className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                    placeholder="Ex: Sequência de execução do agachamento"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">
                  Observação da sequência
                </label>
                <textarea
                  value={form.sequenceImageNotes}
                  onChange={(event) =>
                    updateForm("sequenceImageNotes", event.target.value)
                  }
                  rows={3}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                  placeholder="Ex: Mostrar joelhos alinhados e progressão clara."
                />
              </div>

              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">
                  Imagem sequencial
                </label>
                <p className="text-[10px] text-[#6b6b6b] mb-2">
                  Imagem em etapas de até 4 MB, enviada ao Vercel Blob.
                </p>
                <input
                  type="file"
                  ref={sequenceFileInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) =>
                    handleImageUpload(event, "sequenceImageUrl")
                  }
                  className="w-full text-sm text-[#e5e5e5] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#00A19C] file:text-[#0a0a0a] file:font-semibold file:text-sm hover:file:bg-[#007D79]"
                />
              </div>

              {uploadingSequence && (
                <p className="text-xs text-[#00A19C]">
                  Enviando imagem sequencial...
                </p>
              )}

              {form.sequenceImageUrl && !uploadingSequence && (
                <div className="flex items-center gap-2 rounded-lg border border-[#ffffff10] bg-[#111111] p-2">
                  <img
                    src={form.sequenceImageUrl}
                    alt="Preview imagem sequencial"
                    className="w-24 h-16 bg-[#1a1a1a] rounded-lg border border-[#ffffff10] object-cover"
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
                onChange={(event) =>
                  updateForm("sequenceImageUrl", event.target.value)
                }
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                placeholder="Ou cole a URL da imagem sequencial..."
              />

              <label className="flex items-center gap-2 text-sm text-[#e5e5e5]">
                <input
                  type="checkbox"
                  checked={form.sequenceGeneratedByAi}
                  onChange={(event) =>
                    updateForm("sequenceGeneratedByAi", event.target.checked)
                  }
                  className="accent-[#00A19C]"
                />
                Sequência criada com apoio de IA
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-[#00A19C]/20 bg-[#0d0d0d] p-4 space-y-3">
            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">
                Vídeo com orientação narrada
              </label>
              <p className="text-[10px] text-[#6b6b6b] mb-2">
                MP4, WebM ou MOV de até 4 MB, enviado ao Vercel Blob já conectado ao projeto.
              </p>
              <input
                type="file"
                ref={videoFileInputRef}
                accept="video/mp4,video/webm,video/quicktime"
                onChange={handleVideoUpload}
                className="w-full text-sm text-[#e5e5e5] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#00A19C] file:text-[#0a0a0a] file:font-semibold file:text-sm hover:file:bg-[#007D79]"
              />
            </div>

            {uploadingVideo && (
              <p className="text-xs text-[#00A19C]">Enviando vídeo...</p>
            )}

            {form.videoUrl && !uploadingVideo && (
              <video
                src={form.videoUrl}
                controls
                preload="metadata"
                className="max-h-72 w-full rounded-xl border border-[#ffffff10] bg-black"
              />
            )}

            <input
              value={form.videoUrl}
              onChange={(event) => updateForm("videoUrl", event.target.value)}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
              placeholder="Ou cole a URL do vídeo..."
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[#e5e5e5]">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                updateForm("active", event.target.checked)
              }
              className="accent-[#00A19C]"
            />
            Exercício ativo na biblioteca
          </label>

          <button
            type="submit"
            disabled={saving || uploadingMain || uploadingSequence || uploadingVideo}
            className="bg-[#00A19C] text-[#0a0a0a] font-semibold rounded-lg px-5 py-3 text-sm transition hover:bg-[#007D79] disabled:opacity-70"
          >
            {saving
              ? "Salvando..."
              : editingId
                ? "Salvar Alterações"
                : "Salvar Exercício"}
          </button>
        </form>
      )}

      {Object.entries(groups).map(([group, groupedExercises]) => (
        <div key={group} className="mb-8">
          <h2 className="text-lg font-semibold text-[#00A19C] mb-3">
            {group}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupedExercises.map((exercise) => (
              <div
                key={exercise.id}
                className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden group"
              >
                {exercise.imageUrl ? (
                  <div className="relative">
                    <img
                      src={exercise.imageUrl}
                      alt={exercise.name}
                      className="w-full h-48 object-cover"
                      onError={(event) => {
                        (event.target as HTMLImageElement).style.display = "none";
                      }}
                    />

                    <div className="absolute bottom-3 right-3 flex flex-col items-stretch gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownloadImage(exercise)}
                        disabled={downloadingImageId === exercise.id}
                        className="rounded-lg border border-[#ffffff20] bg-[#0a0a0a]/90 px-3 py-2 text-xs font-semibold text-[#f5f5f5] shadow-lg backdrop-blur transition hover:border-[#00A19C] hover:text-[#00A19C] disabled:cursor-wait disabled:opacity-70"
                        title="Baixar imagem principal"
                      >
                        {downloadingImageId === exercise.id
                          ? "Baixando..."
                          : "⬇ Baixar imagem"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyPrompt(exercise, "video")}
                        className="rounded-lg border border-[#00A19C]/40 bg-[#0a0a0a]/90 px-3 py-2 text-xs font-semibold text-[#00A19C] shadow-lg backdrop-blur transition hover:border-[#00A19C] hover:bg-[#00A19C] hover:text-[#0a0a0a]"
                        title="Copiar comando do vídeo"
                      >
                        {copiedPromptKey === `${exercise.id}-video`
                          ? "✓ Comando copiado"
                          : "📋 Copiar comando"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyPrompt(exercise, "audio")}
                        className="rounded-lg border border-[#ffffff20] bg-[#0a0a0a]/90 px-3 py-2 text-xs font-semibold text-[#f5f5f5] shadow-lg backdrop-blur transition hover:border-[#00A19C] hover:text-[#00A19C]"
                        title="Copiar texto de som e narração"
                      >
                        {copiedPromptKey === `${exercise.id}-audio`
                          ? "✓ Som copiado"
                          : "🔊 Copiar som"}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div
                  className={`${
                    exercise.imageUrl ? "hidden" : "flex"
                  } w-full h-48 bg-[#1a1a1a] items-center justify-center text-[#525252]`}
                >
                  🏋️ Sem imagem principal
                </div>

                <div className="p-4 space-y-3">
                  {!exercise.imageUrl && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => handleCopyPrompt(exercise, "video")}
                        className="w-full rounded-lg border border-[#00A19C]/40 bg-[#0a0a0a] px-3 py-2 text-xs font-semibold text-[#00A19C] transition hover:border-[#00A19C] hover:bg-[#00A19C] hover:text-[#0a0a0a]"
                      >
                        {copiedPromptKey === `${exercise.id}-video`
                          ? "✓ Comando copiado"
                          : "📋 Copiar comando"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyPrompt(exercise, "audio")}
                        className="w-full rounded-lg border border-[#ffffff20] bg-[#0a0a0a] px-3 py-2 text-xs font-semibold text-[#f5f5f5] transition hover:border-[#00A19C] hover:text-[#00A19C]"
                      >
                        {copiedPromptKey === `${exercise.id}-audio`
                          ? "✓ Som copiado"
                          : "🔊 Copiar som"}
                      </button>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-[#f5f5f5]">
                        {exercise.name}
                      </h3>

                      <span className="inline-block mt-2 text-xs bg-[#00A19C]/10 text-[#00A19C] px-2 py-0.5 rounded-full">
                        {exercise.muscleGroup}
                      </span>
                    </div>

                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition shrink-0">
                      <button
                        onClick={() => startEdit(exercise)}
                        className="text-xs text-[#00A19C] hover:text-[#007D79]"
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
                    <p className="text-[10px] uppercase tracking-wide text-[#00A19C] font-semibold">
                      Pra que serve
                    </p>

                    <p className="text-sm text-[#a1a1a1] mt-1">
                      {shortText(exercise.description) || "Não informado."}
                    </p>
                  </div>

                  {(exercise.safetyNotes ||
                    exercise.restrictionTags ||
                    exercise.commonMistakes ||
                    exercise.contraindications) && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-amber-300 font-semibold">
                        Cuidados
                      </p>

                      <p className="text-xs text-amber-100/80 mt-1 leading-relaxed">
                        {shortText(
                          [
                            exercise.safetyNotes,
                            exercise.restrictionTags
                              ? `Atenção: ${exercise.restrictionTags}.`
                              : null,
                            exercise.commonMistakes
                              ? `Evitar: ${exercise.commonMistakes}.`
                              : null,
                            exercise.contraindications
                              ? `Contraindicação/atenção: ${exercise.contraindications}.`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" "),
                          170
                        )}
                      </p>
                    </div>
                  )}

                  {exercise.videoUrl && (
                    <div className="rounded-lg border border-[#00A19C]/20 bg-[#00A19C]/10 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#00A19C]">
                        Orientação narrada disponível
                      </p>
                      <video
                        src={exercise.videoUrl}
                        controls
                        preload="metadata"
                        className="mt-2 max-h-56 w-full rounded-lg bg-black"
                      />
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

                    {exercise.sequenceImageUrl && (
                      <span className="text-[10px] bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded-full">
                        Sequência cadastrada
                      </span>
                    )}

                    {exercise.sequenceGeneratedByAi && (
                      <span className="text-[10px] bg-[#00A19C]/10 text-[#00A19C] px-2 py-0.5 rounded-full">
                        IA
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

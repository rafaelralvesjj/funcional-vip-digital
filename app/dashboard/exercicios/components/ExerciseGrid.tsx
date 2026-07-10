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

function slugify(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function safeSentence(value?: string | null, fallback = "Não informado."): string {
  const text = compactText(value);
  if (!text) return fallback;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function exerciseExecutionHint(name: string, muscleGroup: string): string {
  const text = `${name} ${muscleGroup}`.toLowerCase();

  if (text.includes("abdominal curto")) {
    return "O exercício deve mostrar pessoa deitada de barriga para cima sobre colchonete, joelhos flexionados, pés apoiados no chão, mãos levemente apoiadas nas laterais da cabeça ou cruzadas sobre o peito, realizando pequena flexão de tronco, elevando levemente as escápulas, sem sentar completamente.";
  }

  if (text.includes("prancha")) {
    return "O exercício deve mostrar alinhamento corporal neutro, apoio estável e postura firme, sem queda de quadril e sem elevação exagerada.";
  }

  if (text.includes("agach")) {
    return "O exercício deve mostrar base estável, tronco controlado, joelhos alinhados e amplitude segura, sem colapso de joelhos e sem arredondar excessivamente a coluna.";
  }

  if (text.includes("corrida") || text.includes("skip") || text.includes("polichinelo") || text.includes("burpee")) {
    return "O exercício deve mostrar movimento dinâmico com postura segura, aterrissagem/control de impacto e sequência clara do gesto motor.";
  }

  return "O exercício deve mostrar uma execução tecnicamente segura, coerente com o nome do exercício, com postura estável, alinhamento corporal e amplitude controlada.";
}

function buildPackagePrompt(form: ExerciseForm): string {
  const slug = slugify(form.name || "exercicio");
  const mainFile = `${slug}__principal.png`;
  const sequenceFile = `${slug}__sequencia.png`;
  const frames = Number(form.executionFramesCount) > 0 ? Number(form.executionFramesCount) : 6;
  const purpose = safeSentence(form.description, "Descreva a finalidade do exercício.");
  const instructions = safeSentence(form.instructions, "Descreva como executar o exercício.");
  const safety = safeSentence(form.safetyNotes, "Descreva os principais cuidados de segurança.");
  const mistakes = safeSentence(form.commonMistakes, "Não representar erros técnicos comuns.");
  const contraindications = safeSentence(
    form.contraindications,
    "Adaptar em caso de limitação, dor aguda ou orientação médica/profissional específica."
  );
  const sequenceLabel = compactText(form.sequenceImageLabel) || `Sequência de execução do exercício ${form.name}`;
  const sequenceNotes = safeSentence(
    form.sequenceImageNotes,
    "A sequência deve mostrar início, meio e final do movimento, com progressão clara e visual didático."
  );
  const extraHint = exerciseExecutionHint(form.name, form.muscleGroup);

  return [
    "PACOTE DE IMAGENS PARA BIBLIOTECA DE EXERCÍCIOS — FUNCIONAL VIP DIGITAL",
    "",
    "Gere 2 imagens separadas para o mesmo exercício, mantendo exatamente o mesmo padrão visual entre elas.",
    "Não coloque textos, números, legendas, setas, logotipos, marcas d’água ou qualquer elemento gráfico sobreposto dentro das imagens.",
    "Use visual didático, limpo, profissional e seguro para orientação de exercício físico.",
    "Após gerar, salve ou renomeie os arquivos exatamente com os nomes indicados abaixo para importação automática no sistema.",
    "",
    `EXERCÍCIO: ${form.name || "Não informado"}`,
    `GRUPO MUSCULAR: ${form.muscleGroup || "Não informado"}`,
    `QUADROS DA SEQUÊNCIA: ${frames}`,
    "",
    "ARQUIVOS ESPERADOS PARA IMPORTAÇÃO EM LOTE:",
    `1. ${mainFile}`,
    `2. ${sequenceFile}`,
    "",
    "IMAGEM 1 — PRINCIPAL / CAPA DO EXERCÍCIO",
    `Nome do arquivo: ${mainFile}`,
    `Crie uma imagem principal didática e padronizada para o exercício \"${form.name}\".`,
    "Objetivo da imagem: servir como capa visual do exercício na biblioteca e no treino do aluno.",
    "Estilo visual obrigatório: ilustração 3D realista, limpa, profissional, fundo neutro claro, boa iluminação, corpo inteiro visível, roupa esportiva neutra, sem logos, sem marcas d’água e sem texto dentro da imagem.",
    `${extraHint}`,
    `Finalidade do exercício: ${purpose}`,
    `Grupo muscular principal: ${safeSentence(form.muscleGroup, "Não informado.")}`,
    `Como executar: ${instructions}`,
    `Cuidados de segurança: ${safety}`,
    `Não representar estes erros: ${mistakes}`,
    `Atenções/contraindicações: ${contraindications}`,
    "A imagem deve mostrar uma posição tecnicamente segura e representativa do exercício, sem exagero de amplitude e sem postura perigosa.",
    "Formato: imagem quadrada 1:1, alta qualidade, adequada para capa do exercício.",
    "",
    "IMAGEM 2 — SEQUÊNCIA DE EXECUÇÃO",
    `Nome do arquivo: ${sequenceFile}`,
    `Crie uma imagem sequencial didática com ${frames} quadros para demonstrar o exercício \"${form.name}\" do início ao fim.`,
    "Objetivo da imagem: ensinar visualmente a execução do exercício para o aluno, em etapas claras.",
    "Estilo visual obrigatório: usar a mesma pessoa e a mesma identidade visual da imagem principal; ilustração 3D realista, limpa, profissional, fundo neutro claro, boa iluminação, corpo inteiro visível, roupa esportiva neutra, sem logos, sem marcas d’água e sem texto dentro da imagem.",
    `${extraHint}`,
    `Título da sequência: ${sequenceLabel}.`,
    `Finalidade do exercício: ${purpose}`,
    `Grupo muscular principal: ${safeSentence(form.muscleGroup, "Não informado.")}`,
    `Como executar: ${instructions}`,
    `Cuidados de segurança: ${safety}`,
    `Evite representar estes erros: ${mistakes}`,
    `Atenções/contraindicações: ${contraindications}`,
    `Observação adicional da sequência: ${sequenceNotes}`,
    "A sequência deve mostrar progressão clara do movimento, alinhamento corporal, postura neutra, controle, início, meio e final. Não criar posições perigosas, amplitude exagerada ou articulações desalinhadas.",
    `Formato: imagem horizontal 16:9, com ${frames} quadros organizados de forma limpa e legível, alta qualidade, adequada para visualização completa no celular.`,
    "",
    "CHECKLIST DE QUALIDADE ANTES DE SALVAR:",
    "- corpo inteiro visível;",
    "- postura segura;",
    "- execução coerente com o exercício;",
    "- sem texto dentro da imagem;",
    "- sem marcas/logos;",
    "- imagem principal em 1:1;",
    "- imagem sequencial em 16:9;",
    "- mesma identidade visual nas duas imagens.",
  ].join("\n");
}

async function copyToClipboard(text: string) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
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
  const [packagePrompt, setPackagePrompt] = useState("");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchImportResult, setBatchImportResult] = useState<string | null>(null);
  const mainFileInputRef = useRef<HTMLInputElement>(null);
  const sequenceFileInputRef = useRef<HTMLInputElement>(null);
  const importAiImagesRef = useRef<HTMLInputElement>(null);

  function updateForm<K extends keyof ExerciseForm>(field: K, value: ExerciseForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    if (copiedPrompt) setCopiedPrompt(false);
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setPackagePrompt("");
    setCopiedPrompt(false);
  }

  function startEdit(exercise: Exercise) {
    setForm({
      name: exercise.name || "",
      description: exercise.description || "",
      muscleGroup: exercise.muscleGroup || "",
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
      sequenceImageLabel: exercise.sequenceImageLabel || `Sequência de execução do exercício ${exercise.name}`,
      sequenceImageNotes: exercise.sequenceImageNotes || "",
      executionFramesCount: Number(exercise.executionFramesCount) || 6,
      sequenceGeneratedByAi: Boolean(exercise.sequenceGeneratedByAi),
      active: exercise.active !== false,
    });
    setEditingId(exercise.id);
    setPackagePrompt("");
    setCopiedPrompt(false);
    setShowForm(true);
  }

  async function handleImageUpload(
    event: React.ChangeEvent<HTMLInputElement>,
    target: "imageUrl" | "sequenceImageUrl"
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (target === "imageUrl") setUploadingMain(true);
    if (target === "sequenceImageUrl") setUploadingSequence(true);

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch("/api/upload-image", {
        method: "POST",
        body,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.url) {
        alert(`Erro ao enviar imagem: ${data?.error || "tente novamente"}`);
        return;
      }

      updateForm(target, data.url as any);
    } catch {
      alert("Erro ao conectar com o servidor.");
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

  function handleGeneratePackagePrompt() {
    if (!compactText(form.name) || !compactText(form.description) || !compactText(form.muscleGroup)) {
      alert("Preencha pelo menos nome, grupo muscular e pra que serve antes de gerar o pacote IA.");
      return;
    }

    const generated = buildPackagePrompt(form);
    setPackagePrompt(generated);
    setCopiedPrompt(false);
  }

  async function handleCopyPrompt() {
    if (!packagePrompt) return;

    try {
      await copyToClipboard(packagePrompt);
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 2500);
    } catch {
      alert("Não foi possível copiar automaticamente. Tente novamente.");
    }
  }

  async function handleBatchImport(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files?.length) return;

    setBatchImporting(true);
    setBatchImportResult(null);

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));

      const response = await fetch("/api/exercise-library/import-ai-images", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        alert(data?.error || "Não foi possível importar as imagens IA.");
        return;
      }

      if (Array.isArray(data?.exercises) && data.exercises.length) {
        setExercises((current) => {
          const map = new Map(current.map((exercise) => [exercise.id, exercise]));
          data.exercises.forEach((exercise: Exercise) => map.set(exercise.id, exercise));
          return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
        });
      }

      const importedCount = Number(data?.importedCount || 0);
      const ignoredCount = Number(data?.ignoredCount || 0);
      const message = data?.message || `Importação concluída. ${importedCount} arquivo(s) aproveitado(s) e ${ignoredCount} ignorado(s).`;
      const details = Array.isArray(data?.ignored)
        ? data.ignored.map((item: any) => `- ${item.fileName}: ${item.reason}`).join("\n")
        : "";

      setBatchImportResult(details ? `${message}\n\nIgnorados:\n${details}` : message);
    } catch {
      alert("Erro ao importar imagens em lote.");
    } finally {
      setBatchImporting(false);
      if (importAiImagesRef.current) importAiImagesRef.current.value = "";
    }
  }

  const groups = useMemo(() => {
    return exercises.reduce((acc, exercise) => {
      const group = exercise.muscleGroup || "Sem grupo muscular";
      if (!acc[group]) acc[group] = [];
      acc[group].push(exercise);
      return acc;
    }, {} as Record<string, Exercise[]>);
  }, [exercises]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <button
          onClick={() => {
            if (showForm) {
              resetForm();
            } else {
              setForm(emptyForm);
              setEditingId(null);
              setPackagePrompt("");
              setCopiedPrompt(false);
              setShowForm(true);
            }
          }}
          className="bg-[#D4A373] text-[#0a0a0a] font-semibold rounded-lg px-5 py-3 text-sm transition hover:bg-[#b88a5e]"
        >
          {showForm ? "Cancelar" : "+ Novo Exercício"}
        </button>

        <div className="rounded-xl border border-[#ffffff10] bg-[#111111] p-3 flex flex-col gap-2 md:min-w-[360px]">
          <div>
            <p className="text-xs font-semibold text-[#f5f5f5]">Importar imagens IA em lote</p>
            <p className="text-[11px] text-[#a1a1a1] mt-1">
              Selecione várias imagens geradas com os nomes esperados, como <span className="text-[#D4A373]">agachamento__principal.png</span> e <span className="text-[#D4A373]">agachamento__sequencia.png</span>.
            </p>
          </div>
          <input
            ref={importAiImagesRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={handleBatchImport}
            className="w-full text-sm text-[#e5e5e5] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#D4A373] file:text-[#0a0a0a] file:font-semibold file:text-sm hover:file:bg-[#b88a5e]"
          />
          {batchImporting && <p className="text-xs text-[#D4A373]">Importando imagens...</p>}
          {batchImportResult && (
            <pre className="whitespace-pre-wrap rounded-lg bg-[#0a0a0a] border border-[#ffffff08] p-3 text-[11px] text-[#a1a1a1] overflow-x-auto">
              {batchImportResult}
            </pre>
          )}
        </div>
      </div>

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
            <label className="text-sm text-[#e5e5e5] block mb-1">Como executar</label>
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
                placeholder="Ex: Evitar em caso de dor aguda sem liberação do professor/profissional responsável."
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

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="rounded-xl border border-[#ffffff10] bg-[#0d0d0d] p-4 space-y-3">
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">
                  Imagem principal <span className="text-[#525252]">(opcional)</span>
                </label>
                <p className="text-[10px] text-[#6b6b6b] mb-2">
                  Capa visual do exercício na biblioteca e no treino do aluno.
                </p>
                <input
                  type="file"
                  ref={mainFileInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => handleImageUpload(event, "imageUrl")}
                  className="w-full text-sm text-[#e5e5e5] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#D4A373] file:text-[#0a0a0a] file:font-semibold file:text-sm hover:file:bg-[#b88a5e]"
                />
              </div>

              {uploadingMain && <p className="text-xs text-[#D4A373]">Enviando imagem principal...</p>}

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
                  <span className="text-xs text-[#a1a1a1] truncate flex-1">{form.imageUrl}</span>
                </div>
              )}

              <input
                value={form.imageUrl}
                onChange={(event) => updateForm("imageUrl", event.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Ou cole a URL da imagem principal..."
              />
            </div>

            <div className="rounded-xl border border-[#ffffff10] bg-[#0d0d0d] p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-[#e5e5e5] block mb-1">Quadros da sequência</label>
                  <select
                    value={String(form.executionFramesCount)}
                    onChange={(event) => updateForm("executionFramesCount", Number(event.target.value))}
                    className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                  >
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm text-[#e5e5e5] block mb-1">Título da sequência</label>
                  <input
                    value={form.sequenceImageLabel}
                    onChange={(event) => updateForm("sequenceImageLabel", event.target.value)}
                    className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                    placeholder="Ex: Sequência de execução do agachamento"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Observação da sequência</label>
                <textarea
                  value={form.sequenceImageNotes}
                  onChange={(event) => updateForm("sequenceImageNotes", event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                  placeholder="Ex: Mostrar joelhos alinhados, tronco firme e progressão clara do movimento."
                />
              </div>

              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Imagem sequencial</label>
                <p className="text-[10px] text-[#6b6b6b] mb-2">
                  Imagem em etapas para o aluno entender a execução completa.
                </p>
                <input
                  type="file"
                  ref={sequenceFileInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => handleImageUpload(event, "sequenceImageUrl")}
                  className="w-full text-sm text-[#e5e5e5] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#D4A373] file:text-[#0a0a0a] file:font-semibold file:text-sm hover:file:bg-[#b88a5e]"
                />
              </div>

              {uploadingSequence && <p className="text-xs text-[#D4A373]">Enviando imagem sequencial...</p>}

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
                  <span className="text-xs text-[#a1a1a1] truncate flex-1">{form.sequenceImageUrl}</span>
                </div>
              )}

              <input
                value={form.sequenceImageUrl}
                onChange={(event) => updateForm("sequenceImageUrl", event.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Ou cole a URL da imagem sequencial..."
              />

              <label className="flex items-center gap-2 text-sm text-[#e5e5e5]">
                <input
                  type="checkbox"
                  checked={form.sequenceGeneratedByAi}
                  onChange={(event) => updateForm("sequenceGeneratedByAi", event.target.checked)}
                  className="accent-[#D4A373]"
                />
                Sequência criada com apoio de IA
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

          <div className="rounded-xl border border-[#D4A373]/20 bg-[#D4A373]/5 p-4 space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#f5f5f5]">Pacote IA das imagens</p>
                <p className="text-[11px] text-[#c9c9c9] mt-1">
                  Gere um prompt mais completo e padronizado para criar a imagem principal e a imagem sequencial no ChatGPT. Depois salve as imagens com os nomes sugeridos para importar em lote.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleGeneratePackagePrompt}
                  className="rounded-lg bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a] hover:bg-[#b88a5e]"
                >
                  Gerar pacote IA das imagens
                </button>

                {packagePrompt && (
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="rounded-lg border border-[#ffffff20] bg-[#1a1a1a] px-4 py-2 text-sm font-semibold text-[#f5f5f5] hover:border-[#D4A373]"
                  >
                    {copiedPrompt ? "Prompt copiado" : "Copiar prompt"}
                  </button>
                )}
              </div>
            </div>

            {packagePrompt ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-[#D4A373] font-semibold">
                    Prompt gerado com nomes esperados para importação automática.
                  </p>
                  <span className="text-[10px] text-[#8f8f8f]">
                    Dica: clique em “Copiar prompt”.
                  </span>
                </div>
                <textarea
                  readOnly
                  value={packagePrompt}
                  rows={20}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-xs leading-5 text-[#f5f5f5] outline-none"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[#ffffff12] bg-[#0a0a0a] p-4 text-[11px] text-[#8f8f8f]">
                Preencha os dados do exercício e clique em <span className="text-[#D4A373]">Gerar pacote IA das imagens</span>. O sistema vai montar um prompt mais completo para as duas imagens e você poderá copiar com um clique.
              </div>
            )}
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
            disabled={saving || uploadingMain || uploadingSequence}
            className="bg-[#D4A373] text-[#0a0a0a] font-semibold rounded-lg px-5 py-3 text-sm transition hover:bg-[#b88a5e] disabled:opacity-70"
          >
            {saving ? "Salvando..." : editingId ? "Salvar Alterações" : "Salvar Exercício"}
          </button>
        </form>
      )}

      {Object.entries(groups).map(([group, groupedExercises]) => (
        <div key={group} className="mb-8">
          <h2 className="text-lg font-semibold text-[#D4A373] mb-3">{group}</h2>

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
                  🏋️ Sem imagem principal
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-[#f5f5f5]">{exercise.name}</h3>
                      <span className="inline-block mt-2 text-xs bg-[#D4A373]/10 text-[#D4A373] px-2 py-0.5 rounded-full">
                        {exercise.muscleGroup}
                      </span>
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
                    <p className="text-[10px] uppercase tracking-wide text-[#D4A373] font-semibold">Pra que serve</p>
                    <p className="text-sm text-[#a1a1a1] mt-1">{shortText(exercise.description) || "Não informado."}</p>
                  </div>

                  {(exercise.safetyNotes || exercise.restrictionTags || exercise.commonMistakes || exercise.contraindications) && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-amber-300 font-semibold">Cuidados</p>
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
                      <span className="text-[10px] bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-full">{exercise.intensity}</span>
                    )}
                    {exercise.levelTags && (
                      <span className="text-[10px] bg-green-500/10 text-green-300 px-2 py-0.5 rounded-full">{exercise.levelTags}</span>
                    )}
                    {exercise.equipmentTags && (
                      <span className="text-[10px] bg-[#ffffff08] text-[#a1a1a1] px-2 py-0.5 rounded-full">{exercise.equipmentTags}</span>
                    )}
                    {exercise.sequenceImageUrl && (
                      <span className="text-[10px] bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded-full">Sequência cadastrada</span>
                    )}
                    {exercise.sequenceGeneratedByAi && (
                      <span className="text-[10px] bg-[#D4A373]/10 text-[#D4A373] px-2 py-0.5 rounded-full">IA</span>
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

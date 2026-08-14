"use client";

import { upload } from "@vercel/blob/client";
import type { Asset, Brand, Subtask, Task } from "@prisma/client";
import { CheckCircle2, Film, ImagePlus, Scissors, Sparkles, UploadCloud, Video, WandSparkles } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { readAssetMetadata } from "@/lib/asset-metadata";
import { ManualVideoProductionGuide } from "@/components/ManualVideoProductionGuide";
import { VideoCaptureGuide } from "@/components/VideoCaptureGuide";
import { buildManualVideoGuide, defaultManualHashtags } from "@/lib/manual-video-guide";
import { isExternalAiVideoMode, isManualCapCutVideoMode, readSmartPlanData, type VideoProductionMode } from "@/lib/task-plan";

type TaskWithSubtasks = Task & { subtasks: Subtask[] };
type MediaInfo = {
  kind: "VIDEO" | "PHOTO";
  durationSeconds: number;
  width: number;
  height: number;
  orientation: "vertical" | "horizontal" | "square";
};

type ManualChecklist = {
  format: boolean;
  audio: boolean;
  text: boolean;
  brand: boolean;
  cta: boolean;
  cuts: boolean;
};

const MODE_COPY: Record<VideoProductionMode, { title: string; description: string; icon: typeof Video; group: "AI" | "MANUAL" }> = {
  AI: {
    title: "IA cria o vídeo",
    description: "Você não precisa gravar nada novo. O sistema envia roteiro, identidade, direção de edição e canais; a IA externa devolve o vídeo final no ZIP.",
    icon: WandSparkles,
    group: "AI",
  },
  RECORDED: {
    title: "Minhas gravações → IA edita",
    description: "Você envia os clipes reais e a IA externa transforma esse material no vídeo final, com cortes, transições, textos, áudio e identidade do projeto.",
    icon: Video,
    group: "AI",
  },
  MIXED: {
    title: "Minhas gravações + IA",
    description: "Você pode usar vídeos e fotos reais. A IA externa complementa o que faltar e faz a montagem final sem descaracterizar pessoas, Greg, produto ou marca.",
    icon: Sparkles,
    group: "AI",
  },
  ZSKY_CAPCUT: {
    title: "ZSky.ai cria os takes → eu edito no CapCut",
    description: "O sistema entrega, cena por cena, o prompt visual, o prompt de som/música e quando usar imagem de referência no ZSky. Depois mostra exatamente como montar tudo no CapCut.",
    icon: Film,
    group: "MANUAL",
  },
  RECORDED_CAPCUT: {
    title: "Eu gravo → eu edito no CapCut",
    description: "O sistema diz exatamente o que filmar e depois vira seu guia de edição: ordem, cortes, transições, textos, logo, áudio, música e exportação no CapCut.",
    icon: Scissors,
    group: "MANUAL",
  },
};

function safePathPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "arquivo";
}

function extension(file: File): string {
  const value = file.name.split(".").pop()?.toLowerCase();
  return value && /^[a-z0-9]+$/.test(value) ? value : file.type.startsWith("image/") ? "jpg" : "mp4";
}

function mediaPath(taskId: string, file: File, role: "raw" | "final" = "raw"): string {
  return `meu-dia-ia/videos/${taskId}/${role}/${safePathPart(file.name.replace(/\.[^.]+$/, ""))}-${Date.now()}.${extension(file)}`;
}

function orientation(width: number, height: number): "vertical" | "horizontal" | "square" {
  if (width === height) return "square";
  return height > width ? "vertical" : "horizontal";
}

function inspectVideo(file: File): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    const element = document.createElement("video");
    const url = URL.createObjectURL(file);
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const width = element.videoWidth;
      const height = element.videoHeight;
      const durationSeconds = Number.isFinite(element.duration) ? Math.round(element.duration * 10) / 10 : 0;
      URL.revokeObjectURL(url);
      if (!width || !height) return reject(new Error("Não foi possível identificar as dimensões do vídeo."));
      resolve({ kind: "VIDEO", durationSeconds, width, height, orientation: orientation(width, height) });
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler o vídeo selecionado."));
    };
    element.src = url;
  });
}

function inspectImage(file: File): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    const element = new Image();
    const url = URL.createObjectURL(file);
    element.onload = () => {
      const width = element.naturalWidth;
      const height = element.naturalHeight;
      URL.revokeObjectURL(url);
      if (!width || !height) return reject(new Error("Não foi possível identificar as dimensões da foto."));
      resolve({ kind: "PHOTO", durationSeconds: 0, width, height, orientation: orientation(width, height) });
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a foto selecionada."));
    };
    element.src = url;
  });
}

async function inspectMedia(file: File): Promise<MediaInfo> {
  if (file.type.startsWith("image/")) return inspectImage(file);
  return inspectVideo(file);
}

function modeLabel(mode?: VideoProductionMode): string {
  return mode ? MODE_COPY[mode]?.title || "Modo de vídeo" : "Não definido";
}

export function VideoWorkflowModal({
  task,
  onClose,
  onOpenAi,
  onTaskUpdate,
}: {
  task: TaskWithSubtasks;
  onClose: () => void;
  onOpenAi: () => void;
  onTaskUpdate: (task: TaskWithSubtasks) => void;
}) {
  const plan = readSmartPlanData(task.planData);
  const [mode, setMode] = useState<VideoProductionMode | "">(plan?.videoWorkflow?.productionMode || "");
  const [savedMode, setSavedMode] = useState<VideoProductionMode | undefined>(plan?.videoWorkflow?.productionMode);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [finalFile, setFinalFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<"mode" | "raw" | "final" | null>(null);
  const [message, setMessage] = useState("");
  const [caption, setCaption] = useState(task.contentPromise || task.contentAngle || task.title.replace("Preparar com IA: ", ""));
  const [cta, setCta] = useState(task.contentCta || "");
  const [hashtags, setHashtags] = useState("");
  const [checklist, setChecklist] = useState<ManualChecklist>({ format: false, audio: false, text: false, brand: false, cta: false, cuts: false });

  const realMediaAssets = useMemo(
    () => assets.filter((asset) => {
      const metadata = readAssetMetadata(asset.tags);
      return asset.mimeType.startsWith("image/") || (asset.mimeType.startsWith("video/") && metadata.videoRole !== "FINAL");
    }),
    [assets],
  );
  const rawVideoAssets = useMemo(() => realMediaAssets.filter((asset) => asset.mimeType.startsWith("video/")), [realMediaAssets]);
  const rawPhotoAssets = useMemo(() => realMediaAssets.filter((asset) => asset.mimeType.startsWith("image/")), [realMediaAssets]);
  const recordedRequiredCount = Math.max(1, plan?.capture?.quantity || 1);
  const requiredCount = savedMode === "MIXED" ? 1 : recordedRequiredCount;
  const readyCount = savedMode === "MIXED" ? realMediaAssets.length : rawVideoAssets.length;
  const rawReady = savedMode === "AI" || readyCount >= requiredCount;
  const manualMode = isManualCapCutVideoMode(savedMode) ? savedMode : undefined;
  const externalAiMode = isExternalAiVideoMode(savedMode);
  const allChecked = Object.values(checklist).every(Boolean);

  useEffect(() => {
    Promise.all([
      fetch(`/api/assets?taskId=${task.id}`).then((response) => response.json()),
      fetch("/api/brands").then((response) => response.json()),
    ])
      .then(([assetData, brandData]) => {
        setAssets(Array.isArray(assetData) ? assetData : []);
        const list = Array.isArray(brandData) ? brandData as Brand[] : [];
        setBrand(list.find((item) => item.key === task.brandKey) || null);
      })
      .catch(() => {
        setAssets([]);
        setBrand(null);
      });
  }, [task.brandKey, task.id]);

  useEffect(() => {
    if (!manualMode || hashtags) return;
    const guide = buildManualVideoGuide({
      mode: manualMode,
      brand: brand ? { key: brand.key, name: brand.name, primaryColor: brand.primaryColor, secondaryColor: brand.secondaryColor, backgroundColor: brand.backgroundColor, textColor: brand.textColor, accentColor: brand.accentColor, visualDirection: brand.visualDirection } : null,
      brandKey: task.brandKey,
      capture: plan?.capture,
      destinations: plan?.destinations,
      title: task.title.replace("Preparar com IA: ", ""),
      angle: task.contentAngle,
      promise: task.contentPromise,
      cta: task.contentCta,
      shopEnabled: Boolean(plan?.shop?.enabled),
    });
    setHashtags(defaultManualHashtags(guide.scope));
  }, [brand, hashtags, manualMode, plan, task]);

  async function saveMode(nextMode: VideoProductionMode) {
    if (loading !== null || savedMode === nextMode) return;
    const previousMode = savedMode || "";
    setMode(nextMode);
    setLoading("mode");
    setMessage("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateVideoWorkflow", productionMode: nextMode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMode(previousMode);
        setMessage(data.error || "Não foi possível salvar o modo de produção.");
        return;
      }
      setSavedMode(nextMode);
      setMode(nextMode);
      setFinalFile(null);
      setChecklist({ format: false, audio: false, text: false, brand: false, cta: false, cuts: false });
      onTaskUpdate(data as TaskWithSubtasks);
      setMessage(`Modo salvo: ${modeLabel(nextMode)}.`);
    } catch {
      setMode(previousMode);
      setMessage("Não foi possível salvar o modo de produção. Tente novamente.");
    } finally {
      setLoading(null);
    }
  }

  async function registerUploadedMedia(file: File, blob: { url: string; downloadUrl?: string }, info: MediaInfo, role: "RAW" | "FINAL" = "RAW") {
    const response = await fetch("/api/video-assets/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: task.id,
        role,
        mediaKind: info.kind,
        productionMode: savedMode || mode,
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        fileName: file.name,
        mimeType: file.type || (info.kind === "PHOTO" ? "image/jpeg" : "video/mp4"),
        size: file.size,
        ...info,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Não foi possível vincular o arquivo à tarefa.");
    return data as Asset;
  }

  async function uploadRawMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode || mode === "AI" || manualMode) return;
    if (!rawFiles.length) {
      setMessage(savedMode === "MIXED" ? "Selecione pelo menos uma foto ou vídeo real." : "Selecione pelo menos um vídeo bruto.");
      return;
    }
    if (savedMode === "RECORDED" && rawFiles.some((file) => file.type.startsWith("image/"))) {
      setMessage("No modo ‘Minhas gravações → IA edita’, envie somente vídeos. Para combinar fotos e vídeos, escolha ‘Minhas gravações + IA’. ");
      return;
    }
    setLoading("raw");
    setMessage("");
    try {
      const created: Asset[] = [];
      for (const file of rawFiles) {
        if (file.size > 500 * 1024 * 1024) throw new Error(`${file.name} ultrapassa o limite de 500 MB.`);
        const info = await inspectMedia(file);
        const blob = await upload(mediaPath(task.id, file), file, {
          access: "public",
          contentType: file.type || (info.kind === "PHOTO" ? "image/jpeg" : "video/mp4"),
          handleUploadUrl: "/api/video-assets/upload",
        });
        created.push(await registerUploadedMedia(file, blob, info));
      }
      setAssets((current) => [...created, ...current]);
      setRawFiles([]);
      setMessage(`${created.length} arquivo(s) real(is) enviado(s). Eles serão levados automaticamente no ZIP de produção.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar os arquivos.");
    } finally {
      setLoading(null);
    }
  }

  async function importManualFinal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualMode || !finalFile) return;
    if (!allChecked) {
      setMessage("Marque a conferência final antes de importar o vídeo editado.");
      return;
    }
    setLoading("final");
    setMessage("");
    try {
      if (!finalFile.type.startsWith("video/")) throw new Error("Selecione o MP4 final exportado pelo CapCut.");
      if (finalFile.size > 500 * 1024 * 1024) throw new Error("O vídeo final ultrapassa o limite de 500 MB.");
      const info = await inspectVideo(finalFile);
      const blob = await upload(mediaPath(task.id, finalFile, "final"), finalFile, {
        access: "public",
        contentType: finalFile.type || "video/mp4",
        handleUploadUrl: "/api/video-assets/upload",
      });
      const asset = await registerUploadedMedia(finalFile, blob, info, "FINAL");
      const response = await fetch("/api/video-workflows/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          assetId: asset.id,
          productionMode: manualMode,
          checklist,
          caption,
          hashtags,
          cta,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível importar o vídeo final.");
      setMessage("Vídeo final importado. Abrindo a conferência das postagens...");
      if (data.id) window.location.assign(`/pacotes/${data.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível importar o vídeo final.");
    } finally {
      setLoading(null);
    }
  }

  function toggleChecklist(key: keyof ManualChecklist) {
    setChecklist((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal video-workflow-modal">
        <div className="row space-between">
          <div><p className="eyebrow">Fluxo universal de vídeo</p><h2>{task.title.replace("Preparar com IA: ", "")}</h2></div>
          <button className="button secondary" onClick={onClose} disabled={loading !== null}>Fechar</button>
        </div>
        <p className="muted">A estrutura é a mesma para Corrida de Carreira, Greg, TikTok Shop e Funcional UP. O sistema muda automaticamente marca, ritmo, transições, CTA, canais e agora também o caminho de produção.</p>

        <section className="video-workflow-section">
          <div className="video-step-title"><span>1</span><div><strong>Como este vídeo será produzido?</strong><small>A escolha fica salva somente nesta tarefa. Agora existem cinco caminhos.</small></div></div>
          <div className="video-mode-group-label">Produção com IA externa</div>
          <div className="video-mode-grid">
            {(Object.keys(MODE_COPY) as VideoProductionMode[]).filter((value) => MODE_COPY[value].group === "AI").map((value) => {
              const Icon = MODE_COPY[value].icon;
              const isSaved = savedMode === value;
              const isSaving = loading === "mode" && mode === value;
              return (
                <button type="button" key={value} className={`video-mode-card ${mode === value ? "selected" : ""}`} onClick={() => void saveMode(value)} disabled={loading !== null} aria-pressed={isSaved}>
                  <Icon size={22} /><strong>{MODE_COPY[value].title}</strong><span>{MODE_COPY[value].description}</span>
                  <small className="video-mode-status">{isSaving ? "Salvando..." : isSaved ? "✓ Selecionado e salvo" : "Clique para escolher"}</small>
                </button>
              );
            })}
          </div>
          <div className="video-mode-group-label manual">Produção guiada por você no CapCut</div>
          <div className="video-mode-grid manual-video-mode-grid">
            {(Object.keys(MODE_COPY) as VideoProductionMode[]).filter((value) => MODE_COPY[value].group === "MANUAL").map((value) => {
              const Icon = MODE_COPY[value].icon;
              const isSaved = savedMode === value;
              const isSaving = loading === "mode" && mode === value;
              return (
                <button type="button" key={value} className={`video-mode-card manual ${mode === value ? "selected" : ""}`} onClick={() => void saveMode(value)} disabled={loading !== null} aria-pressed={isSaved}>
                  <Icon size={22} /><strong>{MODE_COPY[value].title}</strong><span>{MODE_COPY[value].description}</span>
                  <small className="video-mode-status">{isSaving ? "Salvando..." : isSaved ? "✓ Selecionado e salvo" : "Clique para escolher"}</small>
                </button>
              );
            })}
          </div>
          {savedMode ? <div className="notice success"><CheckCircle2 size={18} /> Modo atual: <strong>{modeLabel(savedMode)}</strong>. Para trocar, basta clicar em outra opção acima.</div> : <div className="notice">Escolha uma das cinco opções acima. O sistema salva automaticamente.</div>}
        </section>

        {externalAiMode && savedMode !== "AI" ? (
          <section className="video-workflow-section">
            <div className="video-step-title"><span>2</span><div><strong>{savedMode === "MIXED" ? "Enviar fotos e vídeos reais" : "Enviar vídeos brutos"}</strong><small>{savedMode === "MIXED" ? "Use o material que você já tem. A IA complementará o que faltar." : "Arquivos originais, sem corte, texto, música ou edição."}</small></div></div>
            <div className={rawReady ? "notice success" : "notice warning"}>
              {savedMode === "MIXED" ? <ImagePlus size={18} /> : <Film size={18} />}
              {savedMode === "MIXED" ? `${realMediaAssets.length} material(is) real(is) vinculado(s): ${rawVideoAssets.length} vídeo(s) e ${rawPhotoAssets.length} foto(s).` : `${rawVideoAssets.length} de ${recordedRequiredCount} clipe(s) bruto(s) necessário(s) já vinculado(s).`}
            </div>
            {plan?.capture?.videoSegments?.length ? <VideoCaptureGuide segments={plan.capture.videoSegments} scope={plan.contentStrategy?.scopeKey} angle={plan.contentStrategy?.angle} promise={plan.contentStrategy?.promise} cta={plan.contentStrategy?.cta} /> : null}
            <form className="form compact-form" onSubmit={uploadRawMedia}>
              <div className="field">
                <label>{savedMode === "MIXED" ? "Fotos e vídeos reais" : "Vídeos brutos"}</label>
                <input type="file" accept={savedMode === "MIXED" ? "video/*,image/*" : "video/*"} multiple onChange={(event) => setRawFiles(Array.from(event.target.files || []))} />
                <small>{savedMode === "MIXED" ? "Pode misturar fotos e vídeos de um mesmo momento, inclusive material já gravado anteriormente." : `O planejamento pede ${recordedRequiredCount} clipe(s).`} Limite de 500 MB por arquivo.</small>
              </div>
              <button className="button secondary" disabled={loading !== null || !rawFiles.length}><UploadCloud size={16} /> {loading === "raw" ? "Enviando..." : "Enviar material real"}</button>
            </form>
          </section>
        ) : savedMode === "AI" ? (
          <section className="video-workflow-section">
            <div className="video-step-title"><span>2</span><div><strong>Nenhuma gravação nova é obrigatória</strong><small>O sistema ainda pode aproveitar fotos e vídeos reais já aprovados da biblioteca quando isso proteger a identidade da pessoa, do Greg ou do produto.</small></div></div>
            <div className="notice"><WandSparkles size={18} /> O ZIP levará roteiro, identidade da marca, direção de edição, ritmo, transições perceptíveis, movimento para fotos, direção de trilha, canais e critérios de qualidade.</div>
          </section>
        ) : null}

        {manualMode ? (
          <section className="video-workflow-section manual-production-section">
            <div className="video-step-title"><span>2</span><div><strong>{manualMode === "ZSKY_CAPCUT" ? "Produzir no ZSky.ai e finalizar no CapCut" : "Gravar e finalizar no CapCut"}</strong><small>O sistema vira seu diretor de gravação e seu roteiro de edição. Você não precisa mandar ZIP para outra IA neste caminho.</small></div></div>
            {manualMode === "RECORDED_CAPCUT" && plan?.capture?.videoSegments?.length ? <VideoCaptureGuide segments={plan.capture.videoSegments} scope={plan.contentStrategy?.scopeKey} angle={plan.contentStrategy?.angle} promise={plan.contentStrategy?.promise} cta={plan.contentStrategy?.cta} /> : null}
            <ManualVideoProductionGuide mode={manualMode} taskId={task.id} taskTitle={task.title} brand={brand} brandKey={task.brandKey} plan={plan} angle={task.contentAngle} promise={task.contentPromise} cta={task.contentCta} />
          </section>
        ) : null}

        {externalAiMode ? (
          <>
            <section className="video-workflow-section">
              <div className="video-step-title"><span>3</span><div><strong>Gerar o pacote PARA A IA</strong><small>{rawReady ? "O sistema já tem o necessário para montar o ZIP." : "Falta material real para este modo."}</small></div></div>
              <button className="button primary" disabled={!rawReady || loading !== null} onClick={() => { onClose(); onOpenAi(); }}><Sparkles size={17} /> Abrir “Quero ajuda da IA”</button>
            </section>
            <section className="video-workflow-section">
              <div className="video-step-title"><span>4</span><div><strong>Retorno pelo ZIP</strong><small>Este caminho continua exatamente como já funciona hoje.</small></div></div>
              <div className="notice success"><CheckCircle2 size={18} /> Depois de enviar o pacote à IA externa, importe no Meu Dia IA o ZIP que ela devolver. O sistema separará o vídeo final, capa, legenda, hashtags, CTA, música sugerida e instruções de cada postagem.</div>
            </section>
          </>
        ) : null}

        {manualMode ? (
          <section className="video-workflow-section manual-final-import-section">
            <div className="video-step-title"><span>3</span><div><strong>Trazer o vídeo final do CapCut de volta</strong><small>Depois de terminar a edição, importe o MP4 aqui. O sistema transforma esse master nas postagens planejadas da agenda.</small></div></div>
            <form className="form" onSubmit={importManualFinal}>
              <div className="field"><label>MP4 final exportado pelo CapCut</label><input type="file" accept="video/mp4,video/*" onChange={(event) => setFinalFile(event.target.files?.[0] || null)} /><small>Use o master vertical sem watermark de outra plataforma. Limite de 500 MB.</small></div>
              <div className="grid two-col manual-post-copy-grid">
                <div className="field"><label>Legenda base</label><textarea value={caption} onChange={(event) => setCaption(event.target.value)} /></div>
                <div className="field"><label>CTA</label><textarea value={cta} onChange={(event) => setCta(event.target.value)} /></div>
              </div>
              <div className="field"><label>Hashtags base</label><input value={hashtags} onChange={(event) => setHashtags(event.target.value)} /><small>O sistema usa esta base nas postagens; a orientação de música continua aparecendo por canal.</small></div>
              <div className="manual-import-checklist">
                <strong>Conferência rápida do vídeo final</strong>
                {([
                  ["format", "Formato vertical e enquadramento conferidos"],
                  ["cuts", "Cortes, transições e movimento de fotos conferidos"],
                  ["text", "Textos/legendas legíveis e sem cobrir o assunto principal"],
                  ["brand", "Cores e logo correspondem ao projeto correto"],
                  ["audio", "Fala, som ambiente e estratégia de música conferidos"],
                  ["cta", "Fechamento e CTA conferidos"],
                ] as Array<[keyof ManualChecklist, string]>).map(([key, label]) => (
                  <label key={key} className="checkline"><input type="checkbox" checked={checklist[key]} onChange={() => toggleChecklist(key)} /><span>{label}</span></label>
                ))}
              </div>
              <button className="button primary" disabled={loading !== null || !finalFile || !allChecked}><UploadCloud size={16} /> {loading === "final" ? "Importando vídeo final..." : "Importar vídeo final e preparar postagens"}</button>
            </form>
          </section>
        ) : null}

        {message ? <div className={/não|falta|selecione|ultrapassa|marque/i.test(message) ? "notice danger" : "notice"}>{message}</div> : null}
      </div>
    </div>
  );
}

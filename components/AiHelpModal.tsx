"use client";

import type { Asset, Brand, Subtask, Task } from "@prisma/client";
import { Download, ImagePlus, ShoppingBag, Sparkles, UploadCloud, Video } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PackageReturnModal } from "@/components/PackageReturnModal";
import { AiWorkflowSteps } from "@/components/AiWorkflowSteps";
import { VideoCaptureGuide } from "@/components/VideoCaptureGuide";
import { readAssetMetadata } from "@/lib/asset-metadata";
import { assetSubjectLabel, assetTypeLabel, brandKeyLabel } from "@/lib/labels";
import { isExternalAiVideoMode, isManualCapCutVideoMode, readSmartPlanData } from "@/lib/task-plan";

type TaskWithSubtasks = Task & { subtasks: Subtask[] };

function uniqueAssets(items: Array<Asset | undefined>): Asset[] {
  const seen = new Set<string>();
  const result: Asset[] = [];
  for (const item of items) {
    if (!item) continue;
    const metadata = readAssetMetadata(item.tags);
    const key = metadata.sha256 || `${item.size}|${item.mimeType}|${item.subject}|${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function AiHelpModal({ task, onClose }: { task: TaskWithSubtasks; onClose: () => void }) {
  const plan = readSmartPlanData(task.planData);
  const isVideoTask = plan?.capture?.kind === "VIDEO" || String(task.contentType || "").toLowerCase().includes("video");
  const videoProductionMode = plan?.videoWorkflow?.productionMode;
  const manualVideoMode = isManualCapCutVideoMode(videoProductionMode);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [preparedJob, setPreparedJob] = useState<{ id: string; packageUrl: string } | null>(null);
  const [showReturnImport, setShowReturnImport] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/brands").then((response) => response.json()),
      fetch("/api/assets").then((response) => response.json()),
    ])
      .then(([brandData, assetData]) => {
        setBrands(Array.isArray(brandData) ? brandData : []);
        setAssets(Array.isArray(assetData) ? assetData : []);
      })
      .catch(() => setMessage("Não foi possível carregar a marca e os arquivos da biblioteca."));
  }, []);

  const brand = useMemo(() => brands.find((item) => item.key === task.brandKey), [brands, task.brandKey]);

  const relevantAssets = useMemo(() => {
    const officialLogo = assets.find((asset) => asset.approved && asset.assetType === "LOGO" && asset.brandKey === task.brandKey);
    const taskAssets = assets.filter((asset) => {
      const metadata = readAssetMetadata(asset.tags);
      if (!asset.approved || !metadata.taskIds.includes(task.id)) return false;
      if (!isVideoTask) return true;
      return asset.assetType !== "VIDEO" || metadata.videoRole !== "FINAL";
    });
    const purposeAssets = plan?.capture?.required && !taskAssets.length
      ? uniqueAssets(assets.filter((asset) => {
          const metadata = readAssetMetadata(asset.tags);
          const samePurpose = Boolean(task.planKey && metadata.purposeKey === task.planKey);
          const sameCapture = Boolean(metadata.captureTitle && metadata.captureTitle === plan.capture?.title);
          const compatibleKind = plan.capture?.kind === "VIDEO"
            ? videoProductionMode === "MIXED"
              ? asset.mimeType.startsWith("video/") || asset.mimeType.startsWith("image/")
              : asset.mimeType.startsWith("video/")
            : asset.mimeType.startsWith("image/");
          const roleCompatible = plan.capture?.kind !== "VIDEO" || readAssetMetadata(asset.tags).videoRole !== "FINAL";
          return asset.approved && compatibleKind && roleCompatible && asset.subject === plan.capture?.subject && (samePurpose || sameCapture);
        })).slice(0, Math.max(plan.capture.quantity, 3))
      : [];
    const brandPremiumReferences = assets
      .filter((asset) => asset.approved && asset.brandKey === task.brandKey && (asset.assetType === "REFERENCE" || asset.assetType === "FINAL_IMAGE"))
      .slice(0, 4);
    const sharedDenizeAssets = isVideoTask && plan?.capture?.subject === "DENIZE" && !taskAssets.length
      ? assets
          .filter((asset) => {
            if (!asset.approved || asset.subject !== "DENIZE") return false;
            if (!(asset.mimeType.startsWith("video/") || asset.mimeType.startsWith("image/"))) return false;
            if (readAssetMetadata(asset.tags).videoRole === "FINAL") return false;
            return asset.brandKey === "CORRIDA_CARREIRA" || asset.brandKey === "FUNCIONAL_UP" || asset.brandKey === null;
          })
          .slice(0, 6)
      : [];
    const productAssets = plan?.shop?.enabled
      ? uniqueAssets(assets.filter((asset) => asset.approved && (asset.assetType === "PRODUCT" || asset.subject === "PRODUCT"))).slice(0, 3)
      : [];

    return uniqueAssets([officialLogo, ...taskAssets, ...brandPremiumReferences, ...purposeAssets, ...sharedDenizeAssets, ...productAssets]);
  }, [assets, isVideoTask, plan, task.brandKey, task.id, task.planKey, videoProductionMode]);

  const captureAssetCount = useMemo(() => {
    if (!plan?.capture?.required || plan.capture.kind === "NONE") return 0;
    return relevantAssets.filter((asset) => {
      const compatibleKind = plan.capture?.kind === "VIDEO"
        ? videoProductionMode === "MIXED"
          ? asset.mimeType.startsWith("video/") || asset.mimeType.startsWith("image/")
          : asset.mimeType.startsWith("video/")
        : asset.mimeType.startsWith("image/");
      const roleCompatible = plan.capture?.kind !== "VIDEO" || readAssetMetadata(asset.tags).videoRole !== "FINAL";
      return compatibleKind && roleCompatible && asset.subject === plan.capture?.subject;
    }).length;
  }, [plan, relevantAssets, videoProductionMode]);

  useEffect(() => {
    if (initialized || !assets.length) return;
    setSelectedAssets(relevantAssets.map((item) => item.id));
    setInitialized(true);
  }, [assets.length, initialized, relevantAssets]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan || plan.stage !== "PRODUCTION") {
      setMessage("Esta tarefa não possui um planejamento automático de criação.");
      return;
    }
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/ai-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: task.id,
        userIdea: form.get("userIdea"),
        productName: form.get("productName"),
        selectedAssetIds: selectedAssets,
        videoProductionMode,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage(data.error || "Não foi possível preparar o pacote.");
      return;
    }

    setPreparedJob({ id: data.id, packageUrl: data.packageUrl });
    const anchor = document.createElement("a");
    anchor.href = data.packageUrl;
    anchor.download = "";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setMessage(isVideoTask
      ? "ZIP baixado. Envie esse arquivo inteiro para a IA externa. Quando ela devolver o ZIP com o vídeo final, clique em Importar retorno DA IA."
      : "ZIP baixado. Envie esse arquivo inteiro para a IA externa. Quando ela devolver outro ZIP, clique em Importar retorno DA IA.");
  }

  const rawRequired = Boolean(isVideoTask && videoProductionMode && isExternalAiVideoMode(videoProductionMode) && videoProductionMode !== "AI");
  const requiredRawCount = videoProductionMode === "MIXED" ? 1 : Math.max(1, plan?.capture?.quantity || 1);
  const rawReady = !rawRequired || captureAssetCount >= requiredRawCount;
  const videoModeMissing = Boolean(isVideoTask && !videoProductionMode);

  if (!plan || plan.stage !== "PRODUCTION") {
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="modal small-modal">
          <div className="row space-between"><div><p className="eyebrow">Amigo IA</p><h2>Tarefa sem plano automático</h2></div><button className="button secondary" onClick={onClose}>Fechar</button></div>
          <div className="notice warning">Atualize o planejamento automático para esta tarefa chegar preenchida com tema, marca, canal, formato e horário.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="modal">
          <div className="row space-between">
            <div><p className="eyebrow">Etapa 1 de 5 · preparar para a IA</p><h2>Preparar pacote PARA A IA</h2></div>
            <button className="button secondary" onClick={onClose}>Fechar</button>
          </div>
          <AiWorkflowSteps currentStep={preparedJob ? 2 : 1} />
          <p className="ai-flow-explainer">{preparedJob ? "O pacote já está pronto. Agora envie esse ZIP inteiro para a IA externa; quando ela devolver outro ZIP, importe o retorno no sistema." : "O sistema prepara tudo dentro do ZIP. Você baixa um único arquivo e envia esse mesmo ZIP para a IA externa."}</p>
          <p className="muted">O sistema já fechou planejamento e direção criativa. Tema, estilo, público, imagem principal, mensagem, CTA, formatos e critérios premium entram automaticamente no ZIP. Você só acrescenta uma ideia se quiser mudar algo.</p>

          {task.brandKey === "FUNCIONAL_UP" ? (
            <div className="notice premium-reference-notice">
              <Sparkles size={17} /> O pacote leva automaticamente a referência premium oficial, a logo, até quatro peças aprovadas e um briefing criativo fechado. A IA recebe inclusive o que deve evitar para não cair em cards, ícones ou template genérico.
            </div>
          ) : null}

          {isVideoTask ? (
            videoModeMissing ? (
              <div className="notice warning"><Video size={17} /> Antes de gerar o pacote, feche esta janela e abra <strong>Organizar produção do vídeo</strong> para escolher se ele será gerado por IA, gravado ou misto.</div>
            ) : (
              manualVideoMode ? (
                <div className="notice warning"><Video size={17} /> Este vídeo está no modo <strong>{videoProductionMode === "ZSKY_CAPCUT" ? "ZSky.ai → CapCut" : "Eu gravo → CapCut"}</strong>. Volte para “Organizar produção do vídeo”: neste caminho o sistema mostra o passo a passo e recebe o MP4 final, sem gerar ZIP para IA externa.</div>
              ) : (
                <div className="notice"><Video size={17} /> Modo do vídeo: <strong>{videoProductionMode === "AI" ? "IA cria o vídeo" : videoProductionMode === "RECORDED" ? "minhas gravações → IA edita" : "minhas gravações + IA"}</strong>. {videoProductionMode === "AI" ? "Nenhuma gravação nova será exigida; ativos reais aprovados podem entrar automaticamente." : videoProductionMode === "MIXED" ? `O pacote usará ${captureAssetCount} foto(s)/vídeo(s) real(is) vinculados e a IA poderá complementar.` : `O pacote usará os ${captureAssetCount} clipe(s) bruto(s) vinculados.`}</div>
              )
            )
          ) : null}

          <div className="auto-plan-review">
            <div><span>Conteúdo</span><strong>{task.title.replace("Preparar com IA: ", "")}</strong></div>
            <div><span>Marca</span><strong>{brand?.name || brandKeyLabel(task.brandKey)}</strong></div>
            <div><span>Formato</span><strong>{task.contentType || "Definido pelo planejamento"}</strong></div>
            <div><span>Objetivo</span><strong>{task.objective || "Conteúdo útil e coerente com a estratégia"}</strong></div>
          </div>

          {task.strategyReason ? <div className="reason-box large"><strong>Por que foi planejado assim?</strong><span>{task.strategyReason}</span></div> : null}

          <section className="card inset-card">
            <h3>Onde e quando será publicado</h3>
            <div className="destination-summary">
              {plan.destinations?.map((item, index) => (
                <div key={`${item.platform}-${item.placement}-${index}`}>
                  <span>{item.platform} · {item.accountName} · {item.placement}</span>
                  <small>{item.format} · {item.width}×{item.height} · {new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(item.scheduledAt))}</small>
                </div>
              ))}
            </div>
          </section>

          {plan.capture?.required ? (
            <section className="capture-box">
              <div className="row">
                {plan.capture.kind === "VIDEO" ? <Video size={20} /> : <ImagePlus size={20} />}
                <strong>{plan.capture.kind === "VIDEO" ? videoProductionMode === "AI" ? "Vídeo criado pela IA" : videoProductionMode === "MIXED" ? "Fotos e vídeos reais para a montagem" : "Vídeos brutos para edição" : "Fotos necessárias"}</strong>
              </div>
              <p>{plan.capture.kind === "VIDEO" && videoProductionMode === "AI" ? "Nenhuma gravação nova é exigida. O sistema gera direção completa e pode aproveitar ativos reais já aprovados da biblioteca quando fizer sentido." : `${plan.capture.title}. ${videoProductionMode === "MIXED" ? "A agenda aceita fotos e vídeos reais ligados à tarefa e orienta a IA a complementar somente o que faltar." : "A agenda busca primeiro os arquivos ligados exatamente a esta tarefa e não seleciona materiais aleatórios."}`}</p>
              {plan.capture.kind === "VIDEO" && videoProductionMode === "AI" ? (
                <div className="capture-linked-status success"><Sparkles size={15} /> Nenhum vídeo bruto é necessário neste modo.</div>
              ) : captureAssetCount >= requiredRawCount ? (
                <div className="capture-linked-status success"><ImagePlus size={15} /> {captureAssetCount} arquivo(s) correto(s) já encontrados e selecionados.</div>
              ) : (
                <div className="notice warning">Ainda faltam {Math.max(requiredRawCount - captureAssetCount, 0)} arquivo(s) real(is) específico(s) desta tarefa. Envie pelo fluxo do vídeo antes de gerar o ZIP.</div>
              )}
              {plan.capture.videoSegments?.length ? <VideoCaptureGuide segments={plan.capture.videoSegments} label="Clipe" scope={plan.contentStrategy?.scopeKey} angle={plan.contentStrategy?.angle} promise={plan.contentStrategy?.promise} cta={plan.contentStrategy?.cta} /> : null}
            </section>
          ) : (
            <div className="notice"><Sparkles size={16} /> A IA externa criará as imagens premium sem exigir uma nova foto nesta tarefa.</div>
          )}

          <form className="form" onSubmit={submit}>
            {plan.shop?.enabled ? (
              <div className="field">
                <label><ShoppingBag size={15} /> Produto da sua vitrine — opcional</label>
                <input name="productName" placeholder={`Ex.: nome exato do ${plan.shop.productCategory} escolhido`} />
                <span className="muted">Categoria recomendada: {plan.shop.productCategory}. Caso deixe em branco, o prompt trabalhará com a categoria.</span>
              </div>
            ) : null}

            <div className="field optional-idea">
              <label>Sua ideia adicional — opcional (não precisa preencher)</label>
              <textarea name="userIdea" placeholder="Escreva somente quando quiser acrescentar algo ou mudar um detalhe. Ex.: quero uma mensagem mais emocional ou quero usar a foto em que a Denize está sorrindo." />
            </div>

            <div className="field">
              <label>Arquivos desta tarefa que irão no ZIP</label>
              {relevantAssets.length ? (
                <div className="asset-select">
                  {relevantAssets.map((asset) => (
                    <label key={asset.id} className={selectedAssets.includes(asset.id) ? "selected" : ""}>
                      {asset.mimeType.startsWith("video/") ? <video src={asset.url} muted /> : <img src={asset.url} alt={asset.title} />}
                      <span>
                        <input
                          type="checkbox"
                          checked={selectedAssets.includes(asset.id)}
                          onChange={(event) => setSelectedAssets((items) => event.target.checked ? [...items, asset.id] : items.filter((id) => id !== asset.id))}
                        /> {asset.title}<br />
                        <span className="muted">{assetSubjectLabel(asset.subject)} · {assetTypeLabel(asset.assetType)}{readAssetMetadata(asset.tags).purposeLabel ? ` · ${readAssetMetadata(asset.tags).purposeLabel}` : ""}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : <div className="notice warning">Nenhum arquivo específico desta tarefa foi encontrado. Envie-o em Fotos da semana ou pelo botão da própria tarefa; depois ele será buscado automaticamente.</div>}
              <span className="muted">Arquivos repetidos são agrupados. Referências premium aprovadas entram automaticamente e os vídeos finais nunca são confundidos com clipes brutos.</span>
            </div>

            {message ? <div className={message.includes("Não") ? "notice danger" : "notice"}>{message}</div> : null}
            <button className="button primary" disabled={loading || videoModeMissing || manualVideoMode || !rawReady || Boolean(!isVideoTask && plan.capture?.required && captureAssetCount === 0)}>
              <Download size={17} /> {loading
                ? "Preparando ZIP..."
                : videoModeMissing
                  ? "Escolha primeiro como o vídeo será produzido"
                  : !rawReady
                    ? videoProductionMode === "MIXED" ? `Envie ${Math.max(requiredRawCount - captureAssetCount, 0)} arquivo(s) real(is) antes de gerar` : `Envie ${Math.max(requiredRawCount - captureAssetCount, 0)} vídeo(s) bruto(s) antes de gerar`
                    : !isVideoTask && plan.capture?.required && captureAssetCount === 0
                      ? "Envie as fotos antes de gerar o ZIP"
                      : "Baixar pacote PARA A IA"}
            </button>

            {preparedJob ? (
              <div className="grid two ai-next-steps">
                <a className="button secondary" href={preparedJob.packageUrl}>
                  <Download size={17} /> Baixar novamente pacote PARA A IA
                </a>
                <button className="button primary" type="button" onClick={() => setShowReturnImport(true)}>
                  <UploadCloud size={17} /> Importar retorno DA IA
                </button>
              </div>
            ) : null}
          </form>
        </div>
      </div>
      {showReturnImport ? <PackageReturnModal taskTitle={task.title} onClose={() => setShowReturnImport(false)} /> : null}
    </>
  );
}

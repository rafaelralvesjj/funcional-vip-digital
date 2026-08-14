"use client";

import type { AiJobStatus, PackageStatus, Subtask, Task, TaskStatus } from "@prisma/client";
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  ImagePlus,
  PackageOpen,
  ShoppingBag,
  Sparkles,
  UploadCloud,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AiHelpModal } from "@/components/AiHelpModal";
import { PackageReturnModal } from "@/components/PackageReturnModal";
import { PublicationScheduleModal } from "@/components/PublicationScheduleModal";
import { QuickAssetUploadModal } from "@/components/QuickAssetUploadModal";
import { VideoWorkflowModal } from "@/components/VideoWorkflowModal";
import { VideoCaptureGuide } from "@/components/VideoCaptureGuide";
import { aiJobStatusLabel, brandKeyLabel, packageStatusLabel, taskTypeLabel } from "@/lib/labels";
import { readAssetMetadata } from "@/lib/asset-metadata";
import { isManualCapCutVideoMode, readSmartPlanData } from "@/lib/task-plan";

type TaskWithSubtasks = Task & { subtasks: Subtask[] };
type RelatedAiJob = { id: string; status: AiJobStatus; packages: Array<{ id: string; status: PackageStatus }> };

function formatSchedule(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function nextDayYmd(value: Date | string | null): string {
  const current = value instanceof Date ? new Date(value.getTime()) : value ? new Date(value) : new Date();
  if (Number.isNaN(current.getTime())) return new Date().toISOString().slice(0, 10);
  current.setUTCDate(current.getUTCDate() + 1);
  return current.toISOString().slice(0, 10);
}

export function TaskCard({
  task,
  relatedAiJobs = [],
  sourceTask = null,
  focused = false,
  readOnly = false,
  onStatusChange,
}: {
  task: TaskWithSubtasks;
  relatedAiJobs?: RelatedAiJob[];
  sourceTask?: TaskWithSubtasks | null;
  focused?: boolean;
  readOnly?: boolean;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
}) {
  const [current, setCurrent] = useState(task);
  const [showAi, setShowAi] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showReturnImport, setShowReturnImport] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showVideoWorkflow, setShowVideoWorkflow] = useState(false);
  const [modalTask, setModalTask] = useState<TaskWithSubtasks | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [markingPublished, setMarkingPublished] = useState(false);
  const [publicationActionMessage, setPublicationActionMessage] = useState("");
  const [linkedAssetCount, setLinkedAssetCount] = useState(0);
  const done = current.status === "DONE";
  const readyToPublish = current.status === "READY_TO_PUBLISH";
  const plan = readSmartPlanData(current.planData);
  const captureKind = plan?.capture?.kind || "NONE";
  const isVideoTask = captureKind === "VIDEO" || String(current.contentType || "").toLowerCase().includes("video");
  const videoMode = plan?.videoWorkflow?.productionMode;
  const manualCapCutMode = isManualCapCutVideoMode(videoMode);
  const manualFinalImported = Boolean(manualCapCutMode && plan?.videoWorkflow?.finalAssetId);
  // Ao trocar de um fluxo antigo de IA para CapCut, não deixa o card continuar mostrando
  // um ZIP antigo como se ainda fosse o próximo passo. Depois que o MP4 manual é importado,
  // o novo job criado por esse fluxo volta a ser a referência normal do card.
  const latestJob = manualCapCutMode && !manualFinalImported ? undefined : relatedAiJobs[0];
  const latestVersion = Math.max(relatedAiJobs.length + (manualCapCutMode && !manualFinalImported ? 1 : 0), 1);
  const latestPackage = latestJob?.packages?.[0];
  const packageWasPrepared = Boolean(latestJob && !latestPackage && ["PACKAGE_READY", "SENT_TO_EXTERNAL_AI", "RETURNED"].includes(latestJob.status));
  const packageWasImported = Boolean(latestPackage);
  const packageNeedsReview = Boolean(packageWasImported && latestPackage?.status === "NEEDS_REVIEW");
  const packageRejected = Boolean(packageWasImported && latestPackage?.status === "REJECTED");
  const packageApproved = Boolean(packageWasImported && latestPackage?.status === "APPROVED");
  const packagePublished = Boolean(packageWasImported && latestPackage?.status === "PUBLISHED");
  const canToggleDirectly = !plan || ["RELATIONSHIP", "ANALYSIS", "PERSONAL", "FARM"].includes(plan.stage);

  const captureRequired = Boolean(plan?.capture?.required && captureKind !== "NONE");
  const captureDisplayRequired = manualCapCutMode ? 0 : captureKind === "VIDEO" && videoMode === "MIXED" ? 1 : Math.max(1, plan?.capture?.quantity || 1);

  function openAiForTask(target: TaskWithSubtasks) {
    setModalTask(target);
    setShowAi(true);
  }

  function openVideoForTask(target: TaskWithSubtasks) {
    setModalTask(target);
    setShowVideoWorkflow(true);
  }

  function openSourcePreparation() {
    if (!sourceTask) return;
    const sourcePlan = readSmartPlanData(sourceTask.planData);
    const sourceCaptureKind = sourcePlan?.capture?.kind || "NONE";
    const sourceIsVideo = sourceCaptureKind === "VIDEO" || String(sourceTask.contentType || "").toLowerCase().includes("video");
    if (sourceIsVideo) openVideoForTask(sourceTask);
    else openAiForTask(sourceTask);
  }

  useEffect(() => {
    if (!captureRequired) {
      setLinkedAssetCount(0);
      return;
    }
    fetch(`/api/assets?taskId=${current.id}`)
      .then((response) => response.json())
      .then((items) => {
        if (!Array.isArray(items)) return setLinkedAssetCount(0);
        const count = items.filter((item) => {
          if (captureKind !== "VIDEO") return String(item.mimeType || "").startsWith("image/");
          if (manualCapCutMode) return false;
          if (videoMode === "MIXED") {
            return String(item.mimeType || "").startsWith("image/")
              || (String(item.mimeType || "").startsWith("video/") && readAssetMetadata(item.tags).videoRole !== "FINAL");
          }
          return String(item.mimeType || "").startsWith("video/") && readAssetMetadata(item.tags).videoRole !== "FINAL";
        }).length;
        setLinkedAssetCount(count);
      })
      .catch(() => setLinkedAssetCount(0));
  }, [captureKind, captureRequired, current.id, manualCapCutMode, videoMode]);

  async function toggleTask() {
    if (readOnly) return;
    const nextStatus = done ? "PENDING" : "DONE";
    const response = await fetch(`/api/tasks/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (response.ok) {
      const updated = await response.json();
      setCurrent(updated);
      onStatusChange?.(current.id, updated.status);
    }
  }

  async function toggleSubtask(id: string, completed: boolean) {
    if (readOnly) return;
    const response = await fetch(`/api/subtasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    if (response.ok) {
      setCurrent((value) => ({
        ...value,
        subtasks: value.subtasks.map((item) => item.id === id ? { ...item, completed } : item),
      }));
    }
  }

  async function postponePublication() {
    if (readOnly) return;
    setRescheduling(true);
    try {
      const response = await fetch(`/api/tasks/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedulePublication",
          plannedDate: nextDayYmd(current.plannedDate),
          startTime: current.startTime,
        }),
      });
      if (response.ok) window.location.reload();
    } finally {
      setRescheduling(false);
    }
  }

  async function markPublicationAsPublished() {
    if (readOnly) return;
    setMarkingPublished(true);
    setPublicationActionMessage("");
    try {
      const response = await fetch(`/api/tasks/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markPublicationPublished" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPublicationActionMessage(data.error || "Não foi possível marcar a publicação como concluída.");
        return;
      }
      const updated = data.task || data;
      setCurrent(updated);
      onStatusChange?.(current.id, updated.status);
      setPublicationActionMessage("Publicação marcada como concluída e registrada no histórico.");
    } catch {
      setPublicationActionMessage("Não foi possível marcar a publicação como concluída.");
    } finally {
      setMarkingPublished(false);
    }
  }

  return (
    <>
      <article
        id={`task-${current.id}`}
        className={`task ${current.isAutoPlanned ? "smart-task" : ""} ${done ? "done-task" : ""} ${readyToPublish ? "ready-task" : ""} ${focused ? "focused-task" : ""}`}
      >
        <div className="task-time">{current.startTime}<br /><span className="muted">até {current.endTime}</span></div>
        <div>
          <div className="row">
            <span className="badge">{taskTypeLabel(current.taskType)}</span>
            {current.isAutoPlanned ? <span className="badge green"><Sparkles size={12} /> Planejada automaticamente</span> : null}
            {current.brandKey ? <span className="badge">{brandKeyLabel(current.brandKey)}</span> : null}
            {plan?.stage === "PERSONAL" ? <span className="badge personal-badge">Vida pessoal</span> : null}
            {plan?.stage === "FARM" ? <span className="badge farm-badge">Chácara</span> : null}
            {current.isCommitment ? <span className="badge">Compromisso</span> : null}
            {current.urgent ? <span className="badge warning"><BellRing size={12} /> Urgente</span> : null}
            {plan?.shop?.enabled ? <span className="badge warning"><ShoppingBag size={12} /> TikTok Shop</span> : null}
            {readOnly ? <span className="badge warning"><CalendarClock size={13} /> Prévia — libera segunda</span> : null}
            {done ? (
              <span className="badge completed"><CheckCircle2 size={13} /> Concluída</span>
            ) : readyToPublish ? (
              <span className="badge ready"><BellRing size={13} /> Pronta — aguardando publicação</span>
            ) : (
              <span className="badge">Pendente</span>
            )}
          </div>
          <h3 style={{ marginTop: 9 }}>{current.title}</h3>
          {current.description ? <p>{current.description}</p> : null}

          {readOnly ? (
            <div className="notice warning">
              Próxima semana disponível somente para consulta. A execução e os botões desta tarefa serão liberados automaticamente na segunda-feira.
            </div>
          ) : null}

          {readyToPublish ? (
            <div className="publication-ready-notice">
              <BellRing size={20} />
              <div>
                <strong>O conteúdo já está pronto.</strong>
                <span>Você será lembrado na agenda e por e-mail. Depois de publicar, abra o pacote e marque como publicada.</span>
              </div>
            </div>
          ) : null}

          {current.strategyReason ? (
            <div className="reason-box"><strong>{plan?.activity ? "Como entrou na agenda" : "Por que o sistema escolheu isso?"}</strong><span>{current.strategyReason}</span></div>
          ) : null}

          {plan?.contentStrategy ? (
            <div className="content-strategy-box">
              <strong>Abordagem diferente desta semana</strong>
              <span>{plan.contentStrategy.angle}</span>
              <small><b>Promessa:</b> {plan.contentStrategy.promise}</small>
              <small><b>Chamada:</b> {plan.contentStrategy.cta}</small>
              <small><b>Histórico:</b> {plan.contentStrategy.comparedItems} conteúdo(s) comparado(s) · sobreposição estimada de {Math.round(plan.contentStrategy.similarity * 100)}%</small>
            </div>
          ) : null}

          {plan?.destinations?.length ? (
            <div className="destination-summary">
              <strong>{plan.stage === "PUBLICATION" ? "Onde postar" : "Publicações que serão preparadas"}</strong>
              {plan.destinations.map((item, index) => (
                <div key={`${item.platform}-${item.placement}-${index}`}>
                  <span>{item.platform} · {item.accountName} · {item.placement}</span>
                  <small>{item.format} · {item.width}×{item.height} · {formatSchedule(item.scheduledAt)}</small>
                </div>
              ))}
            </div>
          ) : null}

          {plan?.stage === "PRODUCTION" && current.brandKey === "FUNCIONAL_UP" && !isVideoTask && !captureRequired ? (
            <div className="capture-box">
              <div className="row space-between">
                <div>
                  <strong>Imagens premium serão criadas pela IA</strong>
                  <p>Você não precisa enviar fotos para esta campanha. O pacote leva o Briefing Criativo 2.1, a identidade do Funcional UP, referências e os formatos; a IA externa cria as imagens e devolve o ZIP final.</p>
                </div>
                <Sparkles size={22} />
              </div>
              <div className="capture-linked-status success"><CheckCircle2 size={15} /> Próximo passo: {manualCapCutMode ? "abra “Organizar produção do vídeo” e siga o guia do CapCut." : "clique em “Quero ajuda da IA” e gere o pacote PARA A IA."}</div>
            </div>
          ) : null}

          {plan?.capture?.required ? (
            <div className="capture-box">
              <div className="row space-between">
                <div>
                  <strong>{plan.capture.kind === "VIDEO" ? "Fluxo de produção do vídeo" : "Fotos que você precisa tirar"}</strong>
                  <p>{plan.capture.kind === "VIDEO"
                    ? `${videoMode === "AI" ? "Gerado por IA — não exige bruto" : videoMode === "RECORDED" ? "Minhas gravações → IA edita" : videoMode === "MIXED" ? "Gravação real + IA" : videoMode === "ZSKY_CAPCUT" ? "ZSky.ai cria os takes → CapCut" : videoMode === "RECORDED_CAPCUT" ? "Eu gravo → CapCut" : "Escolha como o vídeo será produzido"} · ${plan.capture.orientation}`
                    : `${plan.capture.title} · ${plan.capture.quantity} arquivo(s) · ${plan.capture.orientation}`}</p>
                </div>
                {plan.capture.kind === "VIDEO" ? <Video size={22} /> : <ImagePlus size={22} />}
              </div>
              {plan.capture.kind === "VIDEO" && (videoMode === "AI" || videoMode === "ZSKY_CAPCUT") ? null : <ul>{plan.capture.instructions.map((item) => <li key={item}>{item}</li>)}</ul>}
              {plan.capture.kind === "VIDEO" && videoMode === "AI" ? (
                <div className="capture-linked-status success"><CheckCircle2 size={15} /> Nenhum vídeo bruto é necessário. Depois da geração externa, importe o ZIP final devolvido pela IA.</div>
              ) : plan.capture.kind === "VIDEO" && manualCapCutMode ? (
                <div className="capture-linked-status success"><CheckCircle2 size={15} /> Este modo é guiado no próprio sistema. Abra “Organizar produção do vídeo” para ver ZSky/CapCut, fazer a edição e importar o MP4 final.</div>
              ) : linkedAssetCount >= captureDisplayRequired ? (
                <div className="capture-linked-status success"><CheckCircle2 size={15} /> {linkedAssetCount} arquivo(s) bruto(s) já vinculados. A IA buscará automaticamente.</div>
              ) : linkedAssetCount > 0 ? (
                <div className="capture-linked-status"><ImagePlus size={15} /> {linkedAssetCount} de {captureDisplayRequired} arquivo(s) necessários enviados. Faltam {Math.max(0, captureDisplayRequired - linkedAssetCount)}.</div>
              ) : (
                <div className="capture-linked-status"><ImagePlus size={15} /> {plan.capture.kind === "VIDEO" ? "Abra o fluxo do vídeo para escolher o modo e enviar os brutos quando necessário." : "Você pode enviar aqui ou pela tela Fotos da semana."}</div>
              )}
              {plan.capture.videoSegments?.length && videoMode !== "AI" && videoMode !== "ZSKY_CAPCUT" ? (
                <VideoCaptureGuide segments={plan.capture.videoSegments} scope={plan.contentStrategy?.scopeKey} angle={plan.contentStrategy?.angle} promise={plan.contentStrategy?.promise} cta={plan.contentStrategy?.cta} />
              ) : null}
            </div>
          ) : null}

          {plan?.shop?.enabled ? (
            <div className="notice warning shop-plan">
              <strong>Produto recomendado:</strong> {plan.shop.productCategory}.<br />
              <strong>Abordagem:</strong> {plan.shop.angle}.
            </div>
          ) : null}

          {readyToPublish ? (
            <div className="ai-progress">
              <CheckCircle2 size={15} />
              <span>Conteúdo aprovado e pronto para publicação.</span>
              <small>Depois de postar, use o botão “Marcar como publicada” nesta própria tarefa.</small>
            </div>
          ) : latestJob ? (
            <div className="ai-progress">
              <Sparkles size={15} />
              <span>{manualCapCutMode ? `Versão ${latestVersion} · vídeo final do CapCut: ${aiJobStatusLabel(latestJob.status)}` : `Versão ${latestVersion} · pacote para IA: ${aiJobStatusLabel(latestJob.status)}`}</span>
              {latestPackage ? <span>· conteúdo: {packageStatusLabel(latestPackage.status)}</span> : null}
              {packageWasPrepared ? <small>Próximo passo: envie o ZIP para a IA externa e importe aqui o ZIP que ela devolver.</small> : null}
              {packageWasImported ? <small>{manualCapCutMode ? "O MP4 final já foi importado. Abra a conferência das postagens, música e instruções por canal." : "O retorno já foi importado. Abra as instruções para baixar os arquivos e publicar."}</small> : null}
            </div>
          ) : null}

          {!readOnly && plan?.stage === "PUBLICATION" ? (
            <div className={`notice ${packageApproved || packagePublished || readyToPublish ? "" : "warning"}`}>
              {readyToPublish
                ? "O conteúdo está pronto. Publique no canal indicado e depois marque esta tarefa como publicada."
                : !latestJob
                  ? "O conteúdo desta postagem ainda não foi preparado. Abra a tarefa de produção e gere o pacote com a IA antes de publicar."
                  : packageWasPrepared
                  ? "O pacote de envio já foi criado. Agora falta importar o retorno da IA externa antes de validar e publicar."
                  : packageRejected
                    ? "O retorno foi reprovado. Revise o pacote e gere uma nova versão antes de publicar."
                    : packageNeedsReview
                      ? "O retorno já foi importado. Agora falta validar todas as peças e marcar o conteúdo como pronto."
                      : packageApproved || readyToPublish
                        ? "O conteúdo está aprovado. Abra o pacote específico desta postagem para baixar e publicar."
                        : packagePublished
                          ? "Esta publicação já foi concluída e registrada no histórico."
                          : "Continue o fluxo pela tarefa de preparação deste conteúdo."}
            </div>
          ) : null}

          {current.subtasks.length ? (
            <div className="subtasks">
              {current.subtasks.map((item) => (
                <label className="checkline" key={item.id}>
                  <input type="checkbox" checked={item.completed} disabled={readOnly} onChange={(event) => toggleSubtask(item.id, event.target.checked)} />
                  <span>{item.title}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <div className="grid task-actions">
          {readOnly ? (
            <div className="notice">Consulta liberada. Os controles de execução ficam disponíveis a partir de segunda-feira.</div>
          ) : null}
          {!readOnly && canToggleDirectly ? (
            <button className={done ? "button secondary" : "button primary"} onClick={toggleTask}>
              {done ? <Circle size={16} /> : <CheckCircle2 size={16} />} {done ? "Reabrir" : "Concluir"}
            </button>
          ) : null}
          {!readOnly && plan?.stage === "PRODUCTION" ? (
            <>
              {isVideoTask ? (
                <button className="button secondary" onClick={() => openVideoForTask(current)}>
                  <Video size={16} /> Organizar produção do vídeo
                </button>
              ) : plan.capture?.required ? (
                <button className="button secondary" onClick={() => setShowUpload(true)}>
                  <ImagePlus size={16} /> {linkedAssetCount ? "Adicionar ou trocar" : "Enviar"} fotos
                </button>
              ) : null}
              {!packageWasPrepared && !packageWasImported && (!isVideoTask || !manualCapCutMode) ? (
                <button className="button secondary" onClick={() => openAiForTask(current)}><Sparkles size={16} /> Quero ajuda da IA</button>
              ) : null}
              {packageWasPrepared && latestJob ? (
                <>
                  <a className="button secondary" href={`/api/ai-jobs/${latestJob.id}/package`}>
                    <Download size={16} /> Baixar pacote PARA A IA — V{latestVersion}
                  </a>
                  <button className="button primary" onClick={() => setShowReturnImport(true)}>
                    <UploadCloud size={16} /> Importar retorno DA IA — V{latestVersion}
                  </button>
                  <button className="button secondary" onClick={() => openAiForTask(current)}>
                    <Sparkles size={16} /> Alterar ideia manualmente
                  </button>
                </>
              ) : null}
              {packageWasImported && latestPackage ? (
                <Link className="button primary" href={`/pacotes/${latestPackage.id}`}>
                  <PackageOpen size={16} /> {manualCapCutMode ? "Validar vídeo final e postagens" : "Validar retorno DA IA"}
                </Link>
              ) : null}
            </>
          ) : null}
          {!readOnly && plan?.stage === "PUBLICATION" ? (
            <>
              {readyToPublish ? (
                <>
                  {latestPackage ? (
                    <Link className="button secondary" href={`/pacotes/${latestPackage.id}`}>
                      <ExternalLink size={16} /> Abrir conteúdo para publicar
                    </Link>
                  ) : null}
                  <button className="button primary" type="button" onClick={markPublicationAsPublished} disabled={markingPublished}>
                    <CheckCircle2 size={16} /> {markingPublished ? "Registrando..." : "Marcar como publicada"}
                  </button>
                </>
              ) : !latestJob ? (
                sourceTask ? (
                  <button className="button primary" type="button" onClick={openSourcePreparation}>
                    <Sparkles size={16} /> Preparar pacote PARA A IA
                  </button>
                ) : (
                  <Link className="button secondary" href="/planejamento">
                    <Sparkles size={16} /> Localizar tarefa de preparação
                  </Link>
                )
              ) : packageWasPrepared ? (
                <button className="button primary" onClick={() => setShowReturnImport(true)}>
                  <UploadCloud size={16} /> Importar retorno DA IA — V{latestVersion}
                </button>
              ) : packageNeedsReview && latestPackage ? (
                <Link className="button primary" href={`/pacotes/${latestPackage.id}`}>
                  <CheckCircle2 size={16} /> Validar conteúdo
                </Link>
              ) : packageRejected && latestPackage ? (
                <Link className="button warning" href={`/pacotes/${latestPackage.id}`}>
                  <Sparkles size={16} /> Revisar e pedir nova versão
                </Link>
              ) : packagePublished && latestPackage ? (
                <Link className="button secondary" href={`/pacotes/${latestPackage.id}`}>
                  <ExternalLink size={16} /> Ver publicação concluída
                </Link>
              ) : latestPackage ? (
                <Link className="button primary" href={`/pacotes/${latestPackage.id}`}>
                  <ExternalLink size={16} /> Abrir conteúdo para publicar
                </Link>
              ) : sourceTask ? (
                <button className="button primary" type="button" onClick={openSourcePreparation}>
                  <Sparkles size={16} /> Continuar preparação do conteúdo
                </button>
              ) : (
                <Link className="button secondary" href="/planejamento">
                  <Sparkles size={16} /> Localizar tarefa de preparação
                </Link>
              )}
              {readyToPublish ? (
                <>
                  <button className="button secondary" onClick={postponePublication} disabled={rescheduling}>
                    <CalendarClock size={16} /> {rescheduling ? "Adiando..." : "Adiar para o próximo dia útil"}
                  </button>
                  <button className="button secondary" onClick={() => setShowSchedule(true)}>
                    <CalendarClock size={16} /> Reagendar
                  </button>
                </>
              ) : null}
            </>
          ) : null}
          {publicationActionMessage ? (
            <div className={publicationActionMessage.startsWith("Publicação marcada") ? "notice" : "notice danger"}>
              {publicationActionMessage}
            </div>
          ) : null}
          {!readOnly && !plan && (current.taskType === "CONTENT" || current.taskType === "PHOTO" || current.taskType === "STUDY") ? (
            <button className="button secondary" onClick={() => openAiForTask(current)}><Sparkles size={16} /> Quero ajuda da IA</button>
          ) : null}
        </div>
      </article>
      {showAi ? <AiHelpModal task={modalTask || current} onClose={() => setShowAi(false)} /> : null}
      {showVideoWorkflow ? <VideoWorkflowModal task={modalTask || current} onClose={() => setShowVideoWorkflow(false)} onOpenAi={() => openAiForTask(modalTask || current)} onTaskUpdate={(updated) => { setModalTask(updated); if (updated.id === current.id) setCurrent(updated); }} /> : null}
      {showUpload && plan?.capture ? <QuickAssetUploadModal taskId={current.id} taskTitle={current.title} capture={plan.capture} brandKey={current.brandKey} purposeKey={current.planKey} purposeLabel={current.contentTheme || current.title} weekKey={current.planKey?.split(":")[0] || null} scope={plan.contentStrategy?.scopeKey} angle={plan.contentStrategy?.angle} promise={plan.contentStrategy?.promise} cta={plan.contentStrategy?.cta} onClose={() => setShowUpload(false)} /> : null}
      {showReturnImport ? <PackageReturnModal taskTitle={current.title} onClose={() => setShowReturnImport(false)} /> : null}
      {showSchedule ? (
        <PublicationScheduleModal
          taskId={current.id}
          title={current.title}
          plannedDate={current.plannedDate}
          startTime={current.startTime}
          onClose={() => setShowSchedule(false)}
        />
      ) : null}
    </>
  );
}

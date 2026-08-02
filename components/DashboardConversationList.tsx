"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

type ConversationRole = "GESTOR" | "ADMIN" | "TEACHER" | "PROFESSOR";

type ConversationAttachment = {
  id: string;
  kind: string;
  url: string;
  name?: string | null;
  mimeType?: string | null;
  purpose?: string | null;
  videoReviewSummary?: string | null;
  videoReviewedAt?: string | null;
};

type ConversationReply = {
  id: string;
  studentId?: string | null;
  teacherId?: string | null;
  content: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  documentUrl?: string | null;
  documentName?: string | null;
  documentMimeType?: string | null;
  attachments?: ConversationAttachment[];
  senderRole: string;
  createdAt: string;
  resolvedAt?: string | null;
  authorName: string;
  answeredById?: string | null;
  authorId?: string | null;
};


type PendingAdjustmentWorkout = {
  workoutId: string;
  workoutPlanId: string | null;
  name: string;
  date: string;
  status: string;
};

type ConversationAdjustmentRequest = {
  preferenceId: string;
  category: string;
  summary: string;
  originalMessage: string;
  pendingWorkouts: PendingAdjustmentWorkout[];
};

type AdjustmentProposalExercise = {
  exerciseId: string;
  exerciseName?: string;
  series: number;
  reps: string;
  weight: string;
  restTime: string;
  notes: string;
  order: number;
};

type AdjustmentProposal = {
  name: string;
  description: string;
  objective: string;
  focusAreas: string;
  intensity: string;
  estimatedDurationMinutes: number;
  estimatedCaloriesMin: number;
  estimatedCaloriesMax: number;
  studentSummary: string;
  safetyNote: string;
  notes: string;
  rationale: string;
  studentMessage: string;
  exercises: AdjustmentProposalExercise[];
};

type AdjustmentDraftState = {
  workoutId: string;
  proposal?: AdjustmentProposal;
  manualPrompt?: string;
  manualResponse?: string;
};

type ConversationItem = {
  id: string;
  studentId?: string | null;
  teacherId?: string | null;
  content: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  documentUrl?: string | null;
  documentName?: string | null;
  documentMimeType?: string | null;
  attachments?: ConversationAttachment[];
  senderRole: string;
  createdAt: string;
  resolvedAt?: string | null;
  authorName: string;
  targetLabel: string;
  children: ConversationReply[];

  // Campos opcionais para conseguir identificar exatamente quem abriu a conversa.
  // Se a página que monta a lista enviar algum deles, o botão de encerrar fica mais preciso.
  answeredById?: string | null;
  authorId?: string | null;
  openedById?: string | null;
  adjustmentRequest?: ConversationAdjustmentRequest | null;
};

type Props = {
  conversations: ConversationItem[];
  currentUserId: string;
  currentRole: ConversationRole;
  emptyMessage?: string;
  allowReply?: boolean;
  initialExpandedConversationId?: string | null;
};

function formatDateTime(dateStr: string): string {
  if (!dateStr) return "--/--/--";

  try {
    return new Date(dateStr).toLocaleString("pt-BR");
  } catch {
    return dateStr;
  }
}

function normalizeRole(role: string): string {
  const roleValue = String(role || "").toUpperCase();

  if (roleValue === "PROFESSOR") return "TEACHER";
  if (roleValue === "ALUNO") return "STUDENT";

  return roleValue;
}

function isManagerRole(role: string): boolean {
  const normalized = normalizeRole(role);
  return normalized === "GESTOR" || normalized === "ADMIN";
}

function getRoleLabel(role: string): string {
  const normalized = normalizeRole(role);

  if (normalized === "GESTOR") return "GESTOR";
  if (normalized === "ADMIN") return "ADMIN";
  if (normalized === "STUDENT") return "ALUNO";
  if (normalized === "TEACHER") return "PROFESSOR";

  return normalized || "USUÁRIO";
}

function getRoleBadgeClass(role: string): string {
  const normalized = normalizeRole(role);

  switch (normalized) {
    case "GESTOR":
    case "ADMIN":
      return "bg-amber-900/30 text-amber-400 border border-amber-500/20";
    case "STUDENT":
      return "bg-blue-900/30 text-blue-400 border border-blue-500/20";
    case "TEACHER":
      return "bg-emerald-900/30 text-emerald-400 border border-emerald-500/20";
    default:
      return "bg-zinc-800 text-zinc-400 border border-zinc-700";
  }
}

function getThreadStatus(conversation: ConversationItem): string {
  if (conversation.resolvedAt) return "Encerrada";

  return conversation.children.length > 0 ? "Respondido" : "Aguardando resposta";
}

function getThreadStatusClass(conversation: ConversationItem): string {
  if (conversation.resolvedAt) return "text-zinc-400";

  return conversation.children.length > 0 ? "text-emerald-400" : "text-amber-400";
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: unknown }).error;

    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function getOpenerUserId(conversation: ConversationItem): string {
  return String(
    conversation.openedById ||
      conversation.answeredById ||
      conversation.authorId ||
      ""
  );
}

function canCurrentUserCloseConversation(
  conversation: ConversationItem,
  currentUserId: string,
  currentRole: ConversationRole
): boolean {
  if (conversation.resolvedAt) return false;

  const openerRole = normalizeRole(conversation.senderRole);
  const userRole = normalizeRole(currentRole);
  const openerUserId = getOpenerUserId(conversation);

  // Aluno abriu a dúvida. No dashboard, professor/gestão não encerram.
  // O encerramento do aluno deve ficar no painel do aluno.
  if (openerRole === "STUDENT") {
    return false;
  }

  // Professor abriu a conversa. Só o próprio professor vinculado na raiz pode encerrar.
  if (openerRole === "TEACHER") {
    return userRole === "TEACHER" && conversation.teacherId === currentUserId;
  }

  // Gestão abriu a conversa. Só o gestor/admin que abriu deve encerrar.
  // Se a lista ainda não trouxer answeredById/authorId/openedById, deixamos o botão
  // visível para gestor/admin e a API faz o bloqueio real de segurança.
  if (isManagerRole(openerRole)) {
    if (!isManagerRole(userRole)) return false;

    if (openerUserId) {
      return openerUserId === currentUserId;
    }

    return true;
  }

  return false;
}


function hasChatAttachment(item: {
  imageUrl?: string | null;
  videoUrl?: string | null;
  documentUrl?: string | null;
  attachments?: ConversationAttachment[];
}): boolean {
  return Boolean(
    item.imageUrl ||
      item.videoUrl ||
      item.documentUrl ||
      item.attachments?.length
  );
}

function renderAttachmentIndicator(item: {
  imageUrl?: string | null;
  videoUrl?: string | null;
  documentUrl?: string | null;
  documentName?: string | null;
  attachments?: ConversationAttachment[];
}) {
  if (!hasChatAttachment(item)) return null;

  return (
    <p className="mt-2 text-[10px] text-[#00A19C]">
      📎 Anexo enviado. Abra a conversa para visualizar.
    </p>
  );
}



export default function DashboardConversationList({
  conversations,
  currentUserId,
  currentRole,
  emptyMessage = "Nenhuma conversa encontrada.",
  allowReply = true,
  initialExpandedConversationId = null,
}: Props) {
  const router = useRouter();

  const [expandedConversationId, setExpandedConversationId] = useState<string | null>(
    initialExpandedConversationId
  );
  const [replyContentById, setReplyContentById] = useState<Record<string, string>>({});
  const [replyFileById, setReplyFileById] = useState<Record<string, File | null>>({});
  const [sendingConversationId, setSendingConversationId] = useState<string | null>(null);
  const [closingConversationId, setClosingConversationId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [successById, setSuccessById] = useState<Record<string, string>>({});
  const [openAttachmentKey, setOpenAttachmentKey] = useState<string | null>(null);
  const [adjustmentLoadingKey, setAdjustmentLoadingKey] = useState<string | null>(null);
  const [documentPromptById, setDocumentPromptById] = useState<Record<string, string>>({});
  const [documentResponseById, setDocumentResponseById] = useState<Record<string, string>>({});
  const [documentLoadingId, setDocumentLoadingId] = useState<string | null>(null);
  const [videoReviewByAttachmentId, setVideoReviewByAttachmentId] = useState<Record<string, string>>({});
  const [adjustmentDraftByConversationId, setAdjustmentDraftByConversationId] = useState<
    Record<string, AdjustmentDraftState | null>
  >({});

  useEffect(() => {
    if (!initialExpandedConversationId) return;

    setExpandedConversationId(initialExpandedConversationId);

    const timer = window.setTimeout(() => {
      document
        .getElementById(`conversation-${initialExpandedConversationId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [initialExpandedConversationId]);

  function renderChatAttachmentViewer(
    item: { id?: string | null; imageUrl?: string | null; videoUrl?: string | null; documentUrl?: string | null; documentName?: string | null; attachments?: ConversationAttachment[] },
    fallbackKey: string
  ) {
    if (!hasChatAttachment(item)) return null;

    const itemId = String(item.id || fallbackKey);
    const imageKey = `${itemId}:image`;
    const videoKey = `${itemId}:video`;
    const isImageOpen = openAttachmentKey === imageKey;
    const isVideoOpen = openAttachmentKey === videoKey;

    return (
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          {item.imageUrl && (
            <button
              type="button"
              onClick={() => setOpenAttachmentKey(isImageOpen ? null : imageKey)}
              className="inline-flex items-center rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-[11px] font-semibold text-blue-300 hover:border-blue-400/40 hover:text-blue-200"
            >
              {isImageOpen ? "Ocultar imagem" : "Ver imagem enviada"}
            </button>
          )}

          {item.documentUrl && (
            <a
              href={item.documentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-300 hover:border-amber-400/40"
            >
              Abrir {item.documentName || "documento"}
            </a>
          )}


          {(item.attachments || []).map((attachment) => {
            if (attachment.kind === "DOCUMENT") {
              return <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-300">Abrir {attachment.name || "documento"}</a>;
            }
            if (attachment.kind === "IMAGE") {
              return <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-[11px] font-semibold text-blue-300">Ver {attachment.name || "imagem"}</a>;
            }
            return <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-[11px] font-semibold text-violet-300">Ver {attachment.name || "vídeo"}</a>;
          })}
          {item.videoUrl && (
            <button
              type="button"
              onClick={() => setOpenAttachmentKey(isVideoOpen ? null : videoKey)}
              className="inline-flex items-center rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-[11px] font-semibold text-blue-300 hover:border-blue-400/40 hover:text-blue-200"
            >
              {isVideoOpen ? "Ocultar vídeo" : "Ver vídeo enviado"}
            </button>
          )}
        </div>

        {item.imageUrl && isImageOpen && (
          <div className="rounded-xl border border-[#ffffff10] bg-black/30 p-2">
            <img
              src={item.imageUrl}
              alt="Imagem enviada na conversa"
              className="max-h-72 w-auto max-w-full rounded-lg object-contain"
            />
          </div>
        )}

        {item.videoUrl && isVideoOpen && (
          <div className="rounded-xl border border-[#ffffff10] bg-black/30 p-2">
            <video
              src={item.videoUrl}
              controls
              preload="metadata"
              className="max-h-72 w-full rounded-lg bg-black object-contain"
            >
              Seu navegador não conseguiu reproduzir este vídeo.
            </video>
          </div>
        )}
      </div>
    );
  }


  async function handlePrepareDocumentPrompt(conversation: ConversationItem) {
    setDocumentLoadingId(conversation.id);
    setErrorById((current) => ({ ...current, [conversation.id]: "" }));
    try {
      const response = await fetch("/api/student-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PREPARE_PROMPT", questionId: conversation.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível preparar o prompt.");
      setDocumentPromptById((current) => ({ ...current, [conversation.id]: data.manualPrompt }));
      const pending = Array.isArray(data?.videosWithoutReview) ? data.videosWithoutReview : [];
      setSuccessById((current) => ({ ...current, [conversation.id]: pending.length ? `Prompt preparado, mas ainda falta resumir: ${pending.join(", ")}.` : "Prompt preparado. Você já pode gerar o pacote ZIP para a IA externa." }));
    } catch (error: any) {
      setErrorById((current) => ({ ...current, [conversation.id]: error?.message || "Erro ao preparar o prompt." }));
    } finally {
      setDocumentLoadingId(null);
    }
  }

  async function handleSaveVideoReview(conversation: ConversationItem, attachment: ConversationAttachment) {
    const summary = (videoReviewByAttachmentId[attachment.id] ?? attachment.videoReviewSummary ?? "").trim();
    if (!summary) {
      setErrorById((current) => ({ ...current, [conversation.id]: "Escreva o resumo técnico do vídeo antes de salvar." }));
      return;
    }
    setDocumentLoadingId(conversation.id);
    setErrorById((current) => ({ ...current, [conversation.id]: "" }));
    try {
      const response = await fetch("/api/student-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SAVE_VIDEO_REVIEW", questionId: conversation.id, attachmentId: attachment.id, summary }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível salvar o resumo do vídeo.");
      setVideoReviewByAttachmentId((current) => ({ ...current, [attachment.id]: summary }));
      attachment.videoReviewSummary = summary;
      setSuccessById((current) => ({ ...current, [conversation.id]: data.message || "Resumo técnico do vídeo salvo." }));
    } catch (error: any) {
      setErrorById((current) => ({ ...current, [conversation.id]: error?.message || "Erro ao salvar o resumo do vídeo." }));
    } finally {
      setDocumentLoadingId(null);
    }
  }

  async function handleDownloadAiPackage(conversation: ConversationItem) {
    setDocumentLoadingId(conversation.id);
    setErrorById((current) => ({ ...current, [conversation.id]: "" }));
    try {
      const response = await fetch("/api/student-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DOWNLOAD_PACKAGE", questionId: conversation.id }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Não foi possível gerar o pacote ZIP.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const fileName = match?.[1] || `pacote-ia-${conversation.id}.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSuccessById((current) => ({ ...current, [conversation.id]: "Pacote ZIP gerado. Envie o ZIP completo para a IA externa e depois cole o JSON retornado abaixo." }));
    } catch (error: any) {
      setErrorById((current) => ({ ...current, [conversation.id]: error?.message || "Erro ao gerar o pacote ZIP." }));
    } finally {
      setDocumentLoadingId(null);
    }
  }

  async function handleSaveDocumentAnalysis(conversation: ConversationItem) {
    setDocumentLoadingId(conversation.id);
    try {
      const response = await fetch("/api/student-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SAVE_ANALYSIS", questionId: conversation.id, manualResponse: documentResponseById[conversation.id] || "" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível salvar a análise.");
      setSuccessById((current) => ({ ...current, [conversation.id]: data.message }));
      setDocumentResponseById((current) => ({ ...current, [conversation.id]: "" }));
    } catch (error: any) {
      setErrorById((current) => ({ ...current, [conversation.id]: error?.message || "Erro ao salvar a análise." }));
    } finally {
      setDocumentLoadingId(null);
    }
  }

  async function handleReply(event: FormEvent<HTMLFormElement>, conversation: ConversationItem) {
    event.preventDefault();

    if (!allowReply || conversation.resolvedAt) return;

    const selectedFile = replyFileById[conversation.id] || null;
    const rawContent = (replyContentById[conversation.id] || "").trim();
    const content = rawContent || (selectedFile ? "Anexo enviado na resposta." : "");

    if (!content) {
      setErrorById((current) => ({
        ...current,
        [conversation.id]: "Escreva uma resposta ou anexe uma foto/vídeo antes de enviar.",
      }));
      return;
    }

    setSendingConversationId(conversation.id);
    setErrorById((current) => ({ ...current, [conversation.id]: "" }));
    setSuccessById((current) => ({ ...current, [conversation.id]: "" }));

    try {
      const form = new FormData();
      form.append("content", content);
      form.append("parentId", conversation.id);
      form.append("senderRole", currentRole);
      form.append("answeredById", currentUserId);

      if (conversation.studentId) form.append("studentId", conversation.studentId);
      if (conversation.teacherId) form.append("teacherId", conversation.teacherId);
      if (selectedFile) form.append("file", selectedFile);

      const response = await fetch("/api/questions", {
        method: "POST",
        body: form,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorById((current) => ({
          ...current,
          [conversation.id]: getErrorMessage(data, "Erro ao enviar resposta."),
        }));
        return;
      }

      setReplyContentById((current) => ({
        ...current,
        [conversation.id]: "",
      }));
      setReplyFileById((current) => ({
        ...current,
        [conversation.id]: null,
      }));

      setSuccessById((current) => ({
        ...current,
        [conversation.id]: "Resposta enviada.",
      }));

      router.refresh();
    } catch (error) {
      console.error("DashboardConversationList reply error:", error);

      setErrorById((current) => ({
        ...current,
        [conversation.id]: "Erro ao enviar resposta.",
      }));
    } finally {
      setSendingConversationId(null);
    }
  }

  async function handleCloseConversation(conversation: ConversationItem) {
    if (!allowReply || conversation.resolvedAt || closingConversationId) return;

    const confirmClose = window.confirm(
      "Deseja encerrar esta conversa? Depois de encerrada, ela ficará apenas para consulta."
    );

    if (!confirmClose) return;

    setClosingConversationId(conversation.id);
    setErrorById((current) => ({ ...current, [conversation.id]: "" }));
    setSuccessById((current) => ({ ...current, [conversation.id]: "" }));

    try {
      const response = await fetch("/api/questions/close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionId: conversation.id,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorById((current) => ({
          ...current,
          [conversation.id]: getErrorMessage(data, "Erro ao encerrar conversa."),
        }));
        return;
      }

      setSuccessById((current) => ({
        ...current,
        [conversation.id]: "Conversa encerrada.",
      }));

      router.refresh();
    } catch (error) {
      console.error("DashboardConversationList close error:", error);

      setErrorById((current) => ({
        ...current,
        [conversation.id]: "Erro ao encerrar conversa.",
      }));
    } finally {
      setClosingConversationId(null);
    }
  }


  async function handlePrepareAdjustmentPrompt(
    conversation: ConversationItem,
    workoutId: string
  ) {
    const request = conversation.adjustmentRequest;

    if (!request) return;

    const loadingKey = `${conversation.id}:${workoutId}:prepare`;
    setAdjustmentLoadingKey(loadingKey);
    setErrorById((current) => ({ ...current, [conversation.id]: "" }));
    setSuccessById((current) => ({ ...current, [conversation.id]: "" }));

    try {
      const response = await fetch("/api/workout-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "PREPARE_PROMPT",
          preferenceId: request.preferenceId,
          workoutId,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorById((current) => ({
          ...current,
          [conversation.id]: getErrorMessage(
            data,
            "Não foi possível preparar o prompt de adaptação."
          ),
        }));
        return;
      }

      setAdjustmentDraftByConversationId((current) => ({
        ...current,
        [conversation.id]: {
          workoutId,
          manualPrompt: data?.manualPrompt || "",
          manualResponse: "",
          proposal: undefined,
        },
      }));

      setSuccessById((current) => ({
        ...current,
        [conversation.id]:
          data?.message ||
          "Prompt preparado. Copie para a IA e cole a resposta JSON de volta no sistema.",
      }));
    } catch (error) {
      console.error("Prepare workout adjustment prompt error:", error);
      setErrorById((current) => ({
        ...current,
        [conversation.id]: "Erro ao preparar o prompt de adaptação.",
      }));
    } finally {
      setAdjustmentLoadingKey(null);
    }
  }

  function handleManualResponseChange(
    conversationId: string,
    value: string
  ) {
    setAdjustmentDraftByConversationId((current) => {
      const currentDraft = current[conversationId];

      if (!currentDraft) return current;

      return {
        ...current,
        [conversationId]: {
          ...currentDraft,
          manualResponse: value,
          proposal: undefined,
        },
      };
    });

    setErrorById((current) => ({ ...current, [conversationId]: "" }));
    setSuccessById((current) => ({ ...current, [conversationId]: "" }));
  }

  async function handleValidateManualAdjustment(conversation: ConversationItem) {
    const request = conversation.adjustmentRequest;
    const draft = adjustmentDraftByConversationId[conversation.id];
    const manualResponse = (draft?.manualResponse || "").trim();

    if (!request || !draft) return;

    if (!manualResponse) {
      setErrorById((current) => ({
        ...current,
        [conversation.id]: "Cole a resposta da IA antes de validar.",
      }));
      return;
    }

    const loadingKey = `${conversation.id}:${draft.workoutId}:validate`;
    setAdjustmentLoadingKey(loadingKey);
    setErrorById((current) => ({ ...current, [conversation.id]: "" }));

    try {
      const response = await fetch("/api/workout-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "VALIDATE_MANUAL",
          preferenceId: request.preferenceId,
          workoutId: draft.workoutId,
          manualResponse,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorById((current) => ({
          ...current,
          [conversation.id]: getErrorMessage(
            data,
            "Não foi possível validar a resposta da IA."
          ),
        }));
        return;
      }

      setAdjustmentDraftByConversationId((current) => ({
        ...current,
        [conversation.id]: {
          ...draft,
          proposal: data?.proposal || undefined,
        },
      }));

      setSuccessById((current) => ({
        ...current,
        [conversation.id]:
          data?.message ||
          "Resposta validada. Revise a proposta antes de aplicar.",
      }));
    } catch (error) {
      console.error("Validate manual workout adjustment error:", error);
      setErrorById((current) => ({
        ...current,
        [conversation.id]: "Erro ao validar a resposta da IA.",
      }));
    } finally {
      setAdjustmentLoadingKey(null);
    }
  }

  async function handleApplyAdjustment(conversation: ConversationItem) {
    const request = conversation.adjustmentRequest;
    const draft = adjustmentDraftByConversationId[conversation.id];

    if (!request || !draft?.proposal) return;

    const confirmed = window.confirm(
      "Confirmar a substituição do treino pendente por esta versão? O treino já concluído não será alterado."
    );

    if (!confirmed) return;

    const loadingKey = `${conversation.id}:${draft.workoutId}:apply`;
    setAdjustmentLoadingKey(loadingKey);
    setErrorById((current) => ({ ...current, [conversation.id]: "" }));

    try {
      const response = await fetch("/api/workout-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPLY",
          preferenceId: request.preferenceId,
          workoutId: draft.workoutId,
          proposal: draft.proposal,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorById((current) => ({
          ...current,
          [conversation.id]: getErrorMessage(
            data,
            "Não foi possível aplicar a adaptação."
          ),
        }));
        return;
      }

      setSuccessById((current) => ({
        ...current,
        [conversation.id]: data?.message || "Treino pendente ajustado.",
      }));
      setAdjustmentDraftByConversationId((current) => ({
        ...current,
        [conversation.id]: null,
      }));
      router.refresh();
    } catch (error) {
      console.error("Apply workout adjustment error:", error);
      setErrorById((current) => ({
        ...current,
        [conversation.id]: "Erro ao aplicar a adaptação do treino.",
      }));
    } finally {
      setAdjustmentLoadingKey(null);
    }
  }

  async function handleFutureOnly(conversation: ConversationItem) {
    const request = conversation.adjustmentRequest;

    if (!request) return;

    const confirmed = window.confirm(
      "Manter o treino atual e aplicar esta preferência somente nos próximos treinos?"
    );

    if (!confirmed) return;

    const loadingKey = `${conversation.id}:future-only`;
    setAdjustmentLoadingKey(loadingKey);
    setErrorById((current) => ({ ...current, [conversation.id]: "" }));

    try {
      const response = await fetch("/api/workout-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "FUTURE_ONLY",
          preferenceId: request.preferenceId,
          workoutId: request.pendingWorkouts[0]?.workoutId || null,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorById((current) => ({
          ...current,
          [conversation.id]: getErrorMessage(
            data,
            "Não foi possível concluir a decisão."
          ),
        }));
        return;
      }

      setSuccessById((current) => ({
        ...current,
        [conversation.id]:
          data?.message || "Preferência aplicada aos próximos treinos.",
      }));
      router.refresh();
    } catch (error) {
      console.error("Future-only workout adjustment error:", error);
      setErrorById((current) => ({
        ...current,
        [conversation.id]: "Erro ao registrar a decisão.",
      }));
    } finally {
      setAdjustmentLoadingKey(null);
    }
  }

  function handleDownloadManualPrompt(conversationId: string) {
    const prompt = adjustmentDraftByConversationId[conversationId]?.manualPrompt;

    if (!prompt) return;

    const blob = new Blob([prompt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prompt-adaptacao-treino-${conversationId}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleCopyManualPrompt(conversationId: string) {
    const prompt = adjustmentDraftByConversationId[conversationId]?.manualPrompt;

    if (!prompt) return;

    try {
      await navigator.clipboard.writeText(prompt);
      setSuccessById((current) => ({
        ...current,
        [conversationId]: "Prompt copiado. Cole na IA que você já utiliza.",
      }));
    } catch {
      setErrorById((current) => ({
        ...current,
        [conversationId]: "Não foi possível copiar o prompt automaticamente.",
      }));
    }
  }

  if (conversations.length === 0) {
    return <p className="text-[#a1a1a1]">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
      {conversations.map((conversation) => {
        const isExpanded = expandedConversationId === conversation.id;
        const isClosed = Boolean(conversation.resolvedAt);
        const replyValue = replyContentById[conversation.id] || "";
        const error = errorById[conversation.id];
        const success = successById[conversation.id];
        const canCloseConversation = canCurrentUserCloseConversation(
          conversation,
          currentUserId,
          currentRole
        );
        const adjustmentRequest = conversation.adjustmentRequest || null;
        const adjustmentDraft = adjustmentDraftByConversationId[conversation.id] || null;
        const canManageAdjustment =
          normalizeRole(currentRole) === "TEACHER" && Boolean(adjustmentRequest);

        return (
          <div
            key={conversation.id}
            id={`conversation-${conversation.id}`}
            className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden"
          >
            <div className="p-4">
              <div className="flex justify-between items-start gap-4 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getRoleBadgeClass(conversation.senderRole)}`}>
                    {getRoleLabel(conversation.senderRole)}
                  </span>

                  <span className="text-sm font-bold text-[#f5f5f5] truncate">
                    {conversation.authorName || "Usuário"}
                  </span>
                </div>

                <span className="text-[10px] text-[#a1a1a1] shrink-0">
                  {formatDateTime(conversation.createdAt)}
                </span>
              </div>

              <p className="text-sm text-[#f5f5f5] mb-3 whitespace-pre-wrap">
                {conversation.content}
              </p>

              {!isExpanded && renderAttachmentIndicator(conversation)}
              {isExpanded && renderChatAttachmentViewer(conversation, `conversation-${conversation.id}`)}

              {isExpanded && hasChatAttachment(conversation) && normalizeRole(currentRole) === "TEACHER" && (
                <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 space-y-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Pacote de anexos para análise por IA</p>
                    <p className="mt-1 text-xs text-[#d4d4d4]">O ZIP levará o prompt, imagens e documentos. Vídeos entram por meio do resumo técnico escrito pelo professor.</p>
                  </div>

                  {(conversation.attachments || []).filter((attachment) => attachment.kind === "VIDEO").map((attachment) => (
                    <div key={attachment.id} className="rounded-lg border border-violet-400/20 bg-black/25 p-3 space-y-2">
                      <p className="text-[11px] font-semibold text-violet-200">Resumo técnico do vídeo: {attachment.name || "vídeo enviado"}</p>
                      <textarea
                        rows={4}
                        value={videoReviewByAttachmentId[attachment.id] ?? attachment.videoReviewSummary ?? ""}
                        onChange={(event) => setVideoReviewByAttachmentId((current) => ({ ...current, [attachment.id]: event.target.value }))}
                        placeholder="Descreva o exercício, qualidade da execução, dificuldades, compensações percebidas, dor relatada e orientação sugerida. Não faça diagnóstico."
                        className="w-full rounded-lg border border-violet-400/20 bg-black/30 px-3 py-2 text-xs text-[#f5f5f5] outline-none"
                      />
                      <button type="button" onClick={() => handleSaveVideoReview(conversation, attachment)} disabled={documentLoadingId === conversation.id} className="w-full rounded-lg border border-violet-400/30 px-3 py-2 text-[11px] font-semibold text-violet-200 disabled:opacity-50">Salvar resumo do vídeo</button>
                    </div>
                  ))}

                  <button type="button" onClick={() => handlePrepareDocumentPrompt(conversation)} disabled={documentLoadingId === conversation.id} className="w-full rounded-lg border border-amber-400/30 px-3 py-2 text-[11px] font-semibold text-amber-200 disabled:opacity-50">
                    {documentLoadingId === conversation.id ? "Preparando..." : "Visualizar prompt do pacote"}
                  </button>
                  <button type="button" onClick={() => handleDownloadAiPackage(conversation)} disabled={documentLoadingId === conversation.id} className="w-full rounded-lg bg-[#00A19C] px-3 py-2 text-[11px] font-bold text-black disabled:opacity-50">
                    {documentLoadingId === conversation.id ? "Gerando..." : "Gerar e baixar pacote ZIP para IA"}
                  </button>

                  {documentPromptById[conversation.id] && (
                    <>
                      <textarea readOnly rows={7} value={documentPromptById[conversation.id]} className="w-full rounded-lg border border-amber-400/20 bg-black/30 px-3 py-3 font-mono text-[10px] text-[#d4d4d4] outline-none" />
                      <button type="button" onClick={() => navigator.clipboard.writeText(documentPromptById[conversation.id])} className="w-full rounded-lg border border-amber-400/30 px-3 py-2 text-[11px] font-semibold text-amber-200">Copiar prompt</button>
                    </>
                  )}

                  <textarea rows={9} value={documentResponseById[conversation.id] || ""} onChange={(event) => setDocumentResponseById((current) => ({ ...current, [conversation.id]: event.target.value }))} placeholder="Cole aqui o JSON ou o conteúdo do TXT devolvido pela IA" className="w-full rounded-lg border border-amber-400/20 bg-black/30 px-3 py-3 font-mono text-[11px] text-[#f5f5f5] outline-none" />
                  <button type="button" onClick={() => handleSaveDocumentAnalysis(conversation)} disabled={documentLoadingId === conversation.id || !(documentResponseById[conversation.id] || "").trim()} className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-[11px] font-bold text-black disabled:opacity-50">Salvar análise aprovada na memória técnica</button>
                </div>
              )}

              <p className="text-xs text-[#a1a1a1] mb-3 mt-3">
                Para: <span className="text-[#00A19C]">{conversation.targetLabel}</span>
              </p>

              <div className="flex justify-between items-center gap-4">
                <span className={`text-[10px] ${getThreadStatusClass(conversation)}`}>
                  {getThreadStatus(conversation)}
                </span>

                <button
                  type="button"
                  onClick={() => setExpandedConversationId(isExpanded ? null : conversation.id)}
                  className="text-xs text-[#00A19C] hover:underline"
                >
                  {isExpanded ? "Recolher conversa" : "Abrir conversa"}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="bg-[#0a0a0a] border-t border-[#ffffff10] p-4 space-y-4">
                {canManageAdjustment && adjustmentRequest && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                          Preferência de treino
                        </span>
                        <span className="text-[10px] text-amber-200/70">
                          Não é evento de cuidado
                        </span>
                      </div>

                      <h3 className="mt-3 text-sm font-semibold text-[#f5f5f5]">
                        Nova preferência identificada no chat
                      </h3>

                      <p className="mt-2 text-xs leading-relaxed text-[#d4d4d4]">
                        {adjustmentRequest.summary}
                      </p>

                      <p className="mt-2 rounded-lg border border-[#ffffff10] bg-black/20 p-3 text-[11px] italic text-[#a1a1a1]">
                        “{adjustmentRequest.originalMessage}”
                      </p>
                    </div>

                    {adjustmentRequest.pendingWorkouts.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold text-[#f5f5f5]">
                          Treino(s) pendente(s) desta semana
                        </p>

                        {adjustmentRequest.pendingWorkouts.map((workout) => {
                          const prepareKey = `${conversation.id}:${workout.workoutId}:prepare`;
                          const isPreparing = adjustmentLoadingKey === prepareKey;

                          return (
                            <div
                              key={workout.workoutId}
                              className="flex flex-col gap-3 rounded-lg border border-[#ffffff10] bg-[#111111] p-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <p className="text-xs font-semibold text-[#f5f5f5]">
                                  {workout.name || "Treino pendente"}
                                </p>
                                <p className="mt-1 text-[10px] text-[#a1a1a1]">
                                  {formatDateTime(workout.date)} · {workout.status}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handlePrepareAdjustmentPrompt(
                                    conversation,
                                    workout.workoutId
                                  )
                                }
                                disabled={Boolean(adjustmentLoadingKey)}
                                className="rounded-lg bg-[#00A19C] px-3 py-2 text-[11px] font-bold text-black transition hover:bg-[#007D79] disabled:opacity-50"
                              >
                                {isPreparing
                                  ? "Preparando prompt..."
                                  : "Preparar prompt de adaptação"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-[#ffffff10] bg-black/20 p-3 text-xs text-[#a1a1a1]">
                        Não há treino pendente desta semana para adaptar. A preferência continuará ativa para os próximos treinos.
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => handleFutureOnly(conversation)}
                      disabled={Boolean(adjustmentLoadingKey)}
                      className="w-full rounded-lg border border-[#ffffff20] px-3 py-2 text-[11px] font-semibold text-[#f5f5f5] transition hover:border-[#00A19C] hover:text-[#00A19C] disabled:opacity-50"
                    >
                      {adjustmentLoadingKey === `${conversation.id}:future-only`
                        ? "Registrando decisão..."
                        : "Manter treino atual e aplicar nos próximos"}
                    </button>

                    {adjustmentDraft?.proposal && (
                      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 space-y-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                            Sugestão pronta para revisão
                          </p>
                          <h4 className="mt-1 text-sm font-semibold text-[#f5f5f5]">
                            {adjustmentDraft.proposal.name}
                          </h4>
                          <p className="mt-2 text-xs leading-relaxed text-[#d4d4d4]">
                            {adjustmentDraft.proposal.rationale}
                          </p>
                        </div>

                        <div className="space-y-2">
                          {adjustmentDraft.proposal.exercises.map((exercise, index) => (
                            <div
                              key={`${exercise.exerciseId}-${index}`}
                              className="rounded-lg border border-[#ffffff10] bg-black/20 p-3"
                            >
                              <p className="text-xs font-semibold text-[#f5f5f5]">
                                {index + 1}. {exercise.exerciseName || "Exercício da biblioteca"}
                              </p>
                              <p className="mt-1 break-all text-[10px] text-[#a1a1a1]">
                                ID: {exercise.exerciseId}
                              </p>
                              <p className="mt-1 text-[11px] text-[#d4d4d4]">
                                {exercise.series} série(s) · {exercise.reps}
                                {exercise.restTime ? ` · descanso ${exercise.restTime}` : ""}
                              </p>
                              {exercise.notes && (
                                <p className="mt-1 text-[10px] text-[#a1a1a1]">
                                  {exercise.notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>

                        <p className="text-[10px] text-emerald-200/80">
                          O treino só será substituído depois da sua confirmação. Treinos concluídos permanecem intactos.
                        </p>

                        <button
                          type="button"
                          onClick={() => handleApplyAdjustment(conversation)}
                          disabled={Boolean(adjustmentLoadingKey)}
                          className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-[11px] font-bold text-black transition hover:bg-emerald-400 disabled:opacity-50"
                        >
                          {adjustmentLoadingKey === `${conversation.id}:${adjustmentDraft.workoutId}:apply`
                            ? "Aplicando adaptação..."
                            : "Confirmar e substituir treino pendente"}
                        </button>
                      </div>
                    )}

                    {adjustmentDraft?.manualPrompt && (
                      <div className="space-y-4 rounded-xl border border-blue-500/25 bg-blue-500/10 p-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-200">
                            Fluxo manual sem custo de API
                          </p>
                          <p className="mt-2 text-xs leading-relaxed text-blue-100">
                            1. Copie o prompt. 2. Cole na IA que você já usa. 3. Copie somente o JSON da resposta. 4. Cole abaixo e valide.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyManualPrompt(conversation.id)}
                            className="rounded-lg border border-blue-400/30 px-3 py-2 text-[11px] font-semibold text-blue-200 hover:bg-blue-500/10"
                          >
                            Copiar prompt de adaptação
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadManualPrompt(conversation.id)}
                            className="rounded-lg border border-blue-400/30 px-3 py-2 text-[11px] font-semibold text-blue-200 hover:bg-blue-500/10"
                          >
                            Baixar prompt em TXT
                          </button>
                        </div>

                        <div>
                          <label
                            htmlFor={`manual-adjustment-${conversation.id}`}
                            className="text-[11px] font-semibold text-[#f5f5f5]"
                          >
                            Cole aqui a resposta JSON da IA
                          </label>
                          <textarea
                            id={`manual-adjustment-${conversation.id}`}
                            value={adjustmentDraft.manualResponse || ""}
                            onChange={(event) =>
                              handleManualResponseChange(
                                conversation.id,
                                event.target.value
                              )
                            }
                            rows={10}
                            placeholder='Cole somente o JSON que começa com { e termina com }'
                            className="mt-2 w-full rounded-lg border border-blue-400/20 bg-black/30 px-3 py-3 font-mono text-[11px] leading-relaxed text-[#f5f5f5] outline-none transition focus:border-blue-400/50"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleValidateManualAdjustment(conversation)
                          }
                          disabled={Boolean(adjustmentLoadingKey)}
                          className="w-full rounded-lg bg-blue-500 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-blue-400 disabled:opacity-50"
                        >
                          {adjustmentLoadingKey ===
                          `${conversation.id}:${adjustmentDraft.workoutId}:validate`
                            ? "Validando resposta..."
                            : "Validar resposta e revisar treino"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {conversation.children.length > 0 ? (
                  <div className="space-y-4">
                    {conversation.children.map((reply) => (
                      <div key={reply.id} className="pl-4 border-l border-[#ffffff10]">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${getRoleBadgeClass(reply.senderRole)}`}>
                            {getRoleLabel(reply.senderRole)}
                          </span>

                          <span className="text-xs font-semibold text-[#f5f5f5]">
                            {reply.authorName || "Usuário"}
                          </span>

                          <span className="text-[9px] text-[#a1a1a1]">
                            {formatDateTime(reply.createdAt)}
                          </span>
                        </div>

                        <p className="text-xs text-[#a1a1a1] whitespace-pre-wrap">
                          {reply.content}
                        </p>

                        {renderChatAttachmentViewer(reply, `reply-${reply.id}`)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#a1a1a1]">
                    Nenhuma resposta nesta conversa ainda.
                  </p>
                )}

                {error && (
                  <p className="text-xs text-red-400">
                    {error}
                  </p>
                )}

                {success && (
                  <p className="text-xs text-emerald-400">
                    {success}
                  </p>
                )}

                {isClosed ? (
                  <div className="pt-2">
                    <p className="text-xs text-zinc-400">
                      Conversa encerrada em {formatDateTime(conversation.resolvedAt || "")}. Ela fica disponível apenas para consulta.
                    </p>
                  </div>
                ) : !allowReply ? (
                  <div className="pt-2">
                    <p className="text-xs text-zinc-400">
                      Visualização apenas para consulta. Somente o professor pode responder esta dúvida.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={(event) => handleReply(event, conversation)} className="pt-2 space-y-2">
                    <textarea
                      value={replyValue}
                      onChange={(event) =>
                        setReplyContentById((current) => ({
                          ...current,
                          [conversation.id]: event.target.value,
                        }))
                      }
                      className="w-full bg-[#111111] border border-[#ffffff10] rounded-lg p-2 text-xs text-[#f5f5f5] focus:outline-none focus:border-[#00A19C] h-20 resize-none"
                      placeholder="Escreva sua resposta..."
                    />

                    <div className="space-y-1">
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          setReplyFileById((current) => ({
                            ...current,
                            [conversation.id]: event.target.files?.[0] || null,
                          }))
                        }
                        className="block w-full text-[10px] text-[#a1a1a1] file:mr-2 file:rounded file:border-0 file:bg-[#00A19C] file:px-2 file:py-1 file:text-[10px] file:font-semibold file:text-[#0a0a0a]"
                      />
                      {replyFileById[conversation.id] && (
                        <p className="text-[10px] text-[#00A19C]">
                          Anexo selecionado: {replyFileById[conversation.id]?.name}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={sendingConversationId === conversation.id}
                        className="bg-[#00A19C] text-black text-xs font-bold px-4 py-1.5 rounded hover:bg-[#007D79] transition-colors disabled:opacity-50"
                      >
                        {sendingConversationId === conversation.id ? "Enviando..." : "Responder"}
                      </button>

                      {canCloseConversation && (
                        <button
                          type="button"
                          onClick={() => handleCloseConversation(conversation)}
                          disabled={closingConversationId === conversation.id}
                          className="border border-red-500/30 text-red-400 text-xs font-bold px-4 py-1.5 rounded hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                          {closingConversationId === conversation.id ? "Encerrando..." : "Encerrar conversa"}
                        </button>
                      )}
                    </div>

                    {!canCloseConversation && (
                      <p className="text-[10px] text-zinc-500">
                        Apenas quem abriu esta conversa pode encerrá-la.
                      </p>
                    )}
                  </form>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

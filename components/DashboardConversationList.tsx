"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

type ConversationRole = "GESTOR" | "ADMIN" | "TEACHER" | "PROFESSOR";

type ConversationReply = {
  id: string;
  studentId?: string | null;
  teacherId?: string | null;
  content: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  senderRole: string;
  createdAt: string;
  resolvedAt?: string | null;
  authorName: string;
  answeredById?: string | null;
  authorId?: string | null;
};

type ConversationItem = {
  id: string;
  studentId?: string | null;
  teacherId?: string | null;
  content: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
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
};

type Props = {
  conversations: ConversationItem[];
  currentUserId: string;
  currentRole: ConversationRole;
  emptyMessage?: string;
  allowReply?: boolean;
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


function renderChatAttachment(item: { imageUrl?: string | null; videoUrl?: string | null }) {
  if (!item.imageUrl && !item.videoUrl) return null;

  return (
    <div className="mt-3 space-y-2">
      {item.imageUrl && (
        <a href={item.imageUrl} target="_blank" rel="noreferrer" className="block group">
          <img
            src={item.imageUrl}
            alt="Imagem enviada na conversa"
            className="max-h-52 max-w-full rounded-xl border border-[#ffffff10] object-contain bg-[#0a0a0a] group-hover:border-[#D4A373]/40"
          />
          <span className="mt-1 block text-[10px] text-[#D4A373]">Abrir imagem</span>
        </a>
      )}

      {item.videoUrl && (
        <div className="space-y-1">
          <video
            src={item.videoUrl}
            controls
            className="max-h-52 w-full rounded-xl border border-[#ffffff10] bg-black"
          />
          <a href={item.videoUrl} target="_blank" rel="noreferrer" className="text-[10px] text-[#D4A373] hover:underline">
            Abrir vídeo em nova aba
          </a>
        </div>
      )}
    </div>
  );
}

export default function DashboardConversationList({
  conversations,
  currentUserId,
  currentRole,
  emptyMessage = "Nenhuma conversa encontrada.",
  allowReply = true,
}: Props) {
  const router = useRouter();

  const [expandedConversationId, setExpandedConversationId] = useState<string | null>(null);
  const [replyContentById, setReplyContentById] = useState<Record<string, string>>({});
  const [replyFileById, setReplyFileById] = useState<Record<string, File | null>>({});
  const [sendingConversationId, setSendingConversationId] = useState<string | null>(null);
  const [closingConversationId, setClosingConversationId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [successById, setSuccessById] = useState<Record<string, string>>({});

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

        return (
          <div
            key={conversation.id}
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

              {renderChatAttachment(conversation)}

              <p className="text-xs text-[#a1a1a1] mb-3 mt-3">
                Para: <span className="text-[#D4A373]">{conversation.targetLabel}</span>
              </p>

              <div className="flex justify-between items-center gap-4">
                <span className={`text-[10px] ${getThreadStatusClass(conversation)}`}>
                  {getThreadStatus(conversation)}
                </span>

                <button
                  type="button"
                  onClick={() => setExpandedConversationId(isExpanded ? null : conversation.id)}
                  className="text-xs text-[#D4A373] hover:underline"
                >
                  {isExpanded ? "Recolher conversa" : "Abrir conversa"}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="bg-[#0a0a0a] border-t border-[#ffffff10] p-4 space-y-4">
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

                        {renderChatAttachment(reply)}
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
                      className="w-full bg-[#111111] border border-[#ffffff10] rounded-lg p-2 text-xs text-[#f5f5f5] focus:outline-none focus:border-[#D4A373] h-20 resize-none"
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
                        className="block w-full text-[10px] text-[#a1a1a1] file:mr-2 file:rounded file:border-0 file:bg-[#D4A373] file:px-2 file:py-1 file:text-[10px] file:font-semibold file:text-[#0a0a0a]"
                      />
                      {replyFileById[conversation.id] && (
                        <p className="text-[10px] text-[#D4A373]">
                          Anexo selecionado: {replyFileById[conversation.id]?.name}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={sendingConversationId === conversation.id}
                        className="bg-[#D4A373] text-black text-xs font-bold px-4 py-1.5 rounded hover:bg-[#b88b5d] transition-colors disabled:opacity-50"
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

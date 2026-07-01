"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type ConversationRole = "GESTOR" | "TEACHER";

type ConversationReply = {
  id: string;
  studentId?: string | null;
  teacherId?: string | null;
  content: string;
  senderRole: string;
  createdAt: string;
  resolvedAt?: string | null;
  authorName: string;
};

type ConversationItem = {
  id: string;
  studentId?: string | null;
  teacherId?: string | null;
  content: string;
  senderRole: string;
  createdAt: string;
  resolvedAt?: string | null;
  authorName: string;
  targetLabel: string;
  children: ConversationReply[];
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

function getRoleLabel(role: string): string {
  const normalized = normalizeRole(role);

  if (normalized === "GESTOR") return "GESTOR";
  if (normalized === "STUDENT") return "STUDENT";
  if (normalized === "TEACHER") return "TEACHER";

  return normalized || "USUÁRIO";
}

function getRoleBadgeClass(role: string): string {
  const normalized = normalizeRole(role);

  switch (normalized) {
    case "GESTOR":
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
  const [sendingConversationId, setSendingConversationId] = useState<string | null>(null);
  const [closingConversationId, setClosingConversationId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [successById, setSuccessById] = useState<Record<string, string>>({});

  async function handleReply(event: FormEvent<HTMLFormElement>, conversation: ConversationItem) {
    event.preventDefault();

    if (!allowReply || conversation.resolvedAt) return;

    const content = (replyContentById[conversation.id] || "").trim();

    if (!content) {
      setErrorById((current) => ({
        ...current,
        [conversation.id]: "Escreva uma resposta antes de enviar.",
      }));
      return;
    }

    setSendingConversationId(conversation.id);
    setErrorById((current) => ({ ...current, [conversation.id]: "" }));
    setSuccessById((current) => ({ ...current, [conversation.id]: "" }));

    try {
      const response = await fetch("/api/questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          parentId: conversation.id,
          studentId: conversation.studentId || null,
          teacherId: conversation.teacherId || null,
          senderRole: currentRole,
          answeredById: currentUserId,
        }),
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
    <div className="space-y-4 max-h-[620px] overflow-y-auto pr-2">
      {conversations.map((conversation) => {
        const isExpanded = expandedConversationId === conversation.id;
        const isClosed = Boolean(conversation.resolvedAt);
        const replyValue = replyContentById[conversation.id] || "";
        const error = errorById[conversation.id];
        const success = successById[conversation.id];

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

              <p className="text-xs text-[#a1a1a1] mb-3">
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

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={sendingConversationId === conversation.id}
                        className="bg-[#D4A373] text-black text-xs font-bold px-4 py-1.5 rounded hover:bg-[#b88b5d] transition-colors disabled:opacity-50"
                      >
                        {sendingConversationId === conversation.id ? "Enviando..." : "Responder"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCloseConversation(conversation)}
                        disabled={closingConversationId === conversation.id}
                        className="border border-red-500/30 text-red-400 text-xs font-bold px-4 py-1.5 rounded hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        {closingConversationId === conversation.id ? "Encerrando..." : "Encerrar conversa"}
                      </button>
                    </div>
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

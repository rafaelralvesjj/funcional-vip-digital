"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Teacher {
  id: string;
  name: string | null;
  image: string | null;
}

interface Student {
  id: string;
  name: string | null;
  image: string | null;
}

interface AnsweredBy {
  id: string;
  name: string | null;
  image: string | null;
}

interface MessageChild {
  id: string;
  content: string;
  senderRole: string;
  createdAt: string;
  answeredById: string | null;
  answeredBy: AnsweredBy | null;
}

interface QuestionThread {
  id: string;
  content: string;
  senderRole: string;
  createdAt: string;
  studentId: string;
  teacherId: string;
  student: Student | null;
  teacher: Teacher | null;
  children: MessageChild[];
}

export default function ManagementDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [threads, setThreads] = useState<QuestionThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;

    const fetchThreads = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/questions?direction=sent");
        if (!res.ok) {
          throw new Error("Falha ao carregar conversas");
        }
        const data = await res.json();
        setThreads(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido");
      } finally {
        setLoading(false);
      }
    };

    fetchThreads();
  }, [status]);

  const handleSendReply = async (thread: QuestionThread) => {
    const content = (replyContent[thread.id] || "").trim();
    if (!content) return;
    if (!session?.user?.id) return;

    setSending((prev) => ({ ...prev, [thread.id]: true }));

    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          studentId: thread.studentId,
          teacherId: thread.teacherId,
          parentId: thread.id,
          senderRole: "GESTOR",
          answeredById: session.user.id,
        }),
      });

      if (!res.ok) {
        throw new Error("Falha ao enviar mensagem");
      }

      setReplyContent((prev) => ({ ...prev, [thread.id]: "" }));
      setReplyingTo(null);

      const refresh = await fetch("/api/questions?direction=sent");
      if (refresh.ok) {
        const data = await refresh.json();
        setThreads(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSending((prev) => ({ ...prev, [thread.id]: false }));
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-[#a1a1a1]">Carregando...</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-[#f5f5f5] mb-6">
          Gestão: Conversas com Professores
        </h1>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-900/20 border border-red-500/30 text-red-200">
            {error}
          </div>
        )}

        {threads.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#111111] border border-[#ffffff10] text-center">
            <p className="text-[#a1a1a1]">
              Nenhuma conversa iniciada com professores.
            </p>
            <p className="text-sm text-[#a1a1a1] mt-2">
              Quando a gestão enviar uma mensagem para um professor, ela aparecerá aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {threads.map((thread) => {
              const teacherReplies = (thread.children || []).filter(
                (c) => c.senderRole === "TEACHER"
              );
              const allMessages = [
                {
                  id: thread.id,
                  content: thread.content,
                  senderRole: thread.senderRole,
                  createdAt: thread.createdAt,
                  authorName: "Gestão",
                },
                ...(thread.children || []).map((child) => ({
                  id: child.id,
                  content: child.content,
                  senderRole: child.senderRole,
                  createdAt: child.createdAt,
                  authorName:
                    child.senderRole === "TEACHER"
                      ? child.answeredBy?.name || "Professor"
                      : "Gestão",
                })),
              ].sort(
                (a, b) =>
                  new Date(a.createdAt).getTime() -
                  new Date(b.createdAt).getTime()
              );

              return (
                <div
                  key={thread.id}
                  className="rounded-xl bg-[#111111] border border-[#ffffff10] p-5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-[#f5f5f5] font-medium">
                        Para: {thread.teacher?.name || "Professor"}
                      </p>
                      <p className="text-sm text-[#a1a1a1]">
                        Aluno: {thread.student?.name || "Aluno"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[#a1a1a1]">
                        {formatDate(thread.createdAt)}
                      </p>
                      {teacherReplies.length > 0 && (
                        <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-[#D4A373]/20 text-[#D4A373]">
                          Respondido pelo professor
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 mb-4">
                    {allMessages.map((msg) => {
                      const isGestor = msg.senderRole === "GESTOR";
                      return (
                        <div
                          key={msg.id}
                          className={`p-3 rounded-lg border ${
                            isGestor
                              ? "bg-[#D4A373]/10 border-[#D4A373]/30 ml-8"
                              : "bg-[#1a1a1a] border-[#ffffff10] mr-8"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span
                              className={`text-xs font-semibold uppercase ${
                                isGestor
                                  ? "text-[#D4A373]"
                                  : "text-[#a1a1a1]"
                              }`}
                            >
                              {isGestor ? "GESTOR" : "TEACHER"} — {" "}
                              {msg.authorName}
                            </span>
                            <span className="text-xs text-[#a1a1a1]">
                              {formatDate(msg.createdAt)}
                            </span>
                          </div>
                          <p className="text-[#f5f5f5] whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {replyingTo === thread.id ? (
                    <div className="mt-4 pt-4 border-t border-[#ffffff10]">
                      <textarea
                        value={replyContent[thread.id] || ""}
                        onChange={(e) =>
                          setReplyContent((prev) => ({
                            ...prev,
                            [thread.id]: e.target.value,
                          }))
                        }
                        placeholder="Digite sua resposta..."
                        rows={3}
                        className="w-full rounded-lg bg-[#0a0a0a] border border-[#ffffff10] text-[#f5f5f5] placeholder-[#a1a1a1] p-3 focus:outline-none focus:border-[#D4A373] resize-none"
                      />
                      <div className="flex items-center justify-end gap-3 mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingTo(null);
                            setReplyContent((prev) => ({
                              ...prev,
                              [thread.id]: "",
                            }));
                          }}
                          className="px-4 py-2 rounded-lg text-sm text-[#a1a1a1] hover:text-[#f5f5f5] transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={
                            sending[thread.id] ||
                            !(replyContent[thread.id] || "").trim()
                          }
                          onClick={() => handleSendReply(thread)}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-[#D4A373] text-[#0a0a0a] hover:bg-[#c29465] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {sending[thread.id] ? "Enviando..." : "Responder"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReplyingTo(thread.id)}
                      className="mt-2 px-4 py-2 rounded-lg text-sm font-medium border border-[#D4A373] text-[#D4A373] hover:bg-[#D4A373]/10 transition-colors"
                    >
                      Continuar conversa
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

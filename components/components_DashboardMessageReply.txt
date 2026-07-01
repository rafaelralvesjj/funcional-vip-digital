"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type SenderRole = "GESTOR" | "TEACHER";

type Props = {
  questionId: string;
  studentId?: string;
  teacherId?: string;
  currentUserId: string;
  senderRole: SenderRole;
};

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

export default function DashboardMessageReply({
  questionId,
  studentId,
  teacherId,
  currentUserId,
  senderRole,
}: Props) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedContent = content.trim();

    if (!trimmedContent) {
      setError("Escreva uma resposta antes de enviar.");
      return;
    }

    setSending(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: trimmedContent,
          parentId: questionId,
          studentId: studentId || null,
          teacherId: teacherId || null,
          senderRole,
          answeredById: currentUserId,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(getErrorMessage(data, "Erro ao enviar resposta."));
        return;
      }

      setContent("");
      setSuccess("Resposta enviada.");
      router.refresh();
    } catch (err) {
      console.error("DashboardMessageReply error:", err);
      setError("Erro ao enviar resposta.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#D4A373] h-24 resize-none"
        placeholder="Escreva sua resposta..."
      />

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

      <button
        type="submit"
        disabled={sending}
        className="bg-[#D4A373] text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-[#b88b5d] transition-colors disabled:opacity-50"
      >
        {sending ? "Enviando..." : "Responder"}
      </button>
    </form>
  );
}

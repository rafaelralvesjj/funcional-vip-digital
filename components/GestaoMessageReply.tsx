"use client";
import { useState } from "react";

interface Props {
  questionId: string;
  studentId: string;
  teacherId: string;
  currentUserId: string;
}

export default function GestaoMessageReply({ questionId, studentId, teacherId, currentUserId }: Props) {
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim()) return;

    setSending(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyText.trim(),
          studentId,
          teacherId,
          parentId: questionId,
          senderRole: "TEACHER",
          answeredById: currentUserId,
        }),
      });

      if (res.ok) {
        setSuccess(true);
        setReplyText("");
        setTimeout(() => window.location.reload(), 800);
      } else {
        const err = await res.json();
        setError(err.error || "Erro ao enviar resposta");
      }
    } catch {
      setError("Erro de conexão");
    }
    setSending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Digite sua resposta..."
          className="flex-1 rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-3 py-1.5 text-xs text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={sending || !replyText.trim()}
          className="text-xs bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-500/30 transition disabled:opacity-50 whitespace-nowrap"
        >
          {sending ? "Enviando..." : "Responder"}
        </button>
      </div>
      {error && <p className="text-[9px] text-red-400 mt-1">{error}</p>}
      {success && <p className="text-[9px] text-green-400 mt-1">Resposta enviada! Atualizando...</p>}
    </form>
  );
}

"use client";

import { useState } from "react";

interface Question {
  id: string;
  content: string;
  answer: string | null;
  answeredAt: string | null;
  answeredBy: { name: string } | null;
  createdAt: string;
}

interface QuestionFormProps {
  studentId: string;
  initialQuestions: Question[];
}

function timeAgo(dateStr: string) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`;
  if (s < 604800) return `há ${Math.floor(s / 86400)}d`;
  return `há ${Math.floor(s / 604800)}sem`;
}

export default function QuestionForm({ studentId, initialQuestions }: QuestionFormProps) {
  const [questions, setQuestions] = useState<<Question[]>(initialQuestions);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/aluno/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, content: content.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao enviar dúvida.");
        return;
      }

      // Adicionar nova pergunta no topo
      setQuestions([data.question, ...questions]);
      setContent("");
    } catch {
      setError("Erro ao enviar dúvida. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const pendingQuestions = questions.filter((q) => !q.answer);
  const answeredQuestions = questions.filter((q) => q.answer);

  return (
    <div className="space-y-4">
      {/* Formulário */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex gap-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Tem alguma dúvida? Pergunte aqui..."
            rows={3}
            className="flex-1 bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2.5 text-sm text-[#f5f5f5] placeholder:text-[#525252] focus:outline-none focus:border-[#D4A373] transition resize-none"
          />
          <button
            type="submit"
            disabled={loading || !content.trim()}
            className="self-end bg-[#D4A373] text-[#0a0a0a] font-medium text-sm rounded-lg px-4 py-2.5 hover:bg-[#c49463] transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {loading ? "Enviando..." : "Enviar dúvida"}
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </form>

      {/* Dúvidas pendentes */}
      {pendingQuestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-[#D4A373] font-medium">
            ⏳ Aguardando resposta ({pendingQuestions.length})
          </p>
          {pendingQuestions.map((q) => (
            <div key={q.id} className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3">
              <p className="text-sm text-[#f5f5f5]">{q.content}</p>
              <p className="text-xs text-[#525252] mt-1">{timeAgo(q.createdAt)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Dúvidas respondidas */}
      {answeredQuestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-green-400 font-medium">
            ✅ Respondidas ({answeredQuestions.length})
          </p>
          {answeredQuestions.map((q) => (
            <div key={q.id} className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3">
              <p className="text-sm text-[#f5f5f5]">❓ {q.content}</p>
              {q.answer && (
                <p className="text-sm text-green-400 mt-1">💬 {q.answer}</p>
              )}
              <p className="text-xs text-[#525252] mt-1">
                {q.answeredBy?.name && `Respondido por ${q.answeredBy.name}`}
                {q.answeredAt && ` • ${timeAgo(q.answeredAt)}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Estado vazio */}
      {questions.length === 0 && (
        <p className="text-sm text-[#525252] text-center py-4">
          Nenhuma dúvida enviada ainda. Use o campo acima para perguntar algo.
        </p>
      )}
    </div>
  );
}

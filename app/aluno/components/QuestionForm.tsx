"use client";
import { useState } from "react";
interface Question {
  id: string;
  content: string;
  videoUrl?: string | null;
  imageUrl?: string | null;
  answer: string | null;
  answeredAt: string | null;
  answeredBy: { name: string | null } | null;
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
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [content, setContent] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setImageUrl(data.url);
      } else {
        const err = await res.json();
        alert(`Erro ao enviar imagem: ${err.error}`);
      }
    } catch {
      alert("Erro ao conectar com o servidor");
    } finally {
      setUploading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/aluno/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          content: content.trim(),
          videoUrl: videoUrl.trim() || null,
          imageUrl: imageUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao enviar dúvida.");
        return;
      }
      setQuestions([data.question, ...questions]);
      setContent("");
      setVideoUrl("");
      setImageUrl("");
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
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Tem alguma dúvida? Pergunte aqui..."
          rows={3}
          className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2.5 text-sm text-[#f5f5f5] placeholder:text-[#525252] focus:outline-none focus:border-[#D4A373] transition resize-none"
        />

        {/* 🔥 Link de vídeo */}
        <div>
          <label className="block text-xs text-[#a1a1a1] mb-1">
            🎥 Link do vídeo (YouTube) <span className="text-[#525252]">(opcional)</span>
          </label>
          <input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 text-sm text-[#f5f5f5] placeholder:text-[#525252] focus:outline-none focus:border-[#D4A373] transition"
          />
        </div>

        {/* 🔥 Upload de imagem */}
        <div>
          <label className="block text-xs text-[#a1a1a1] mb-1">
            📸 Imagem <span className="text-[#525252]">(opcional)</span>
          </label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleImageUpload}
            className="w-full text-xs text-[#e5e5e5] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#D4A373] file:text-[#0a0a0a] file:font-semibold file:text-xs hover:file:bg-[#b88a5e]"
          />
          {uploading && <p className="text-xs text-[#D4A373] mt-1">Enviando imagem...</p>}
          {imageUrl && !uploading && <p className="text-xs text-green-500 mt-1">✅ Imagem anexada!</p>}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading || uploading || !content.trim()}
          className="w-full bg-[#D4A373] text-[#0a0a0a] font-medium text-sm rounded-lg px-4 py-2.5 hover:bg-[#c49463] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Enviando..." : "Enviar dúvida"}
        </button>
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
              {q.videoUrl && (
                <a href={q.videoUrl} target="_blank" className="text-xs text-[#D4A373] hover:underline mt-1 inline-block">
                  🎥 Ver vídeo
                </a>
              )}
              {q.imageUrl && (
                <a href={q.imageUrl} target="_blank" className="text-xs text-[#D4A373] hover:underline mt-1 inline-block ml-3">
                  📸 Ver imagem
                </a>
              )}
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
              {q.videoUrl && (
                <a href={q.videoUrl} target="_blank" className="text-xs text-[#D4A373] hover:underline mt-1 inline-block">
                  🎥 Ver vídeo
                </a>
              )}
              {q.imageUrl && (
                <a href={q.imageUrl} target="_blank" className="text-xs text-[#D4A373] hover:underline mt-1 inline-block ml-3">
                  📸 Ver imagem
                </a>
              )}
              {q.answer && <p className="text-sm text-green-400 mt-1">💬 {q.answer}</p>}
              <p className="text-xs text-[#525252] mt-1">
                {q.answeredBy?.name && `Respondido por ${q.answeredBy.name}`}
                {q.answeredAt && ` • ${timeAgo(q.answeredAt)}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {questions.length === 0 && (
        <p className="text-sm text-[#525252] text-center py-4">
          Nenhuma dúvida enviada ainda. Use o campo acima para perguntar algo.
        </p>
      )}
    </div>
  );
}

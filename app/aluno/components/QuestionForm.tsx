"use client";
import { useState } from "react";

interface Question {
  id: string;
  content: string;
  videoUrl?: string | null;
  imageUrl?: string | null;
  documentUrl?: string | null;
  documentName?: string | null;
  documentMimeType?: string | null;
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
  const [fileUrl, setFileUrl] = useState("");
  const [fileType, setFileType] = useState<"image" | "video" | "document" | "">("");
  const [fileName, setFileName] = useState("");
  const [fileMimeType, setFileMimeType] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFileName(file.name);
    setFileMimeType(file.type || "application/octet-stream");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", file.type.startsWith("image/") || file.type.startsWith("video/") ? "chat" : "documentos");
    try {
      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setFileUrl(data.url);
        setFileType(file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "document");
      } else {
        const err = await res.json();
        alert(`Erro ao enviar arquivo: ${err.error}`);
      }
    } catch {
      alert("Erro ao conectar com o servidor");
    } finally {
      setUploading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !fileUrl) return;
    setLoading(true);
    setError("");
    try {
      const body: any = { studentId, content: content.trim() };
      if (fileUrl) {
        if (fileType === "video") {
          body.videoUrl = fileUrl;
        } else if (fileType === "image") {
          body.imageUrl = fileUrl;
        } else {
          body.documentUrl = fileUrl;
          body.documentName = fileName;
          body.documentMimeType = fileMimeType || "application/octet-stream";
        }
      }
      const res = await fetch("/api/aluno/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao enviar dúvida.");
        return;
      }
      setQuestions([data.question, ...questions]);
      setContent("");
      setFileUrl("");
      setFileType("");
      setFileName("");
      setFileMimeType("");
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
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Tem alguma dúvida? Pergunte aqui..."
          rows={3}
          className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2.5 text-sm text-[#f5f5f5] placeholder:text-[#525252] focus:outline-none focus:border-[#22D3EE] transition resize-none"
        />
        <div>
          <label className="block text-xs text-[#a1a1a1] mb-1">
            📎 Anexar foto, vídeo ou documento <span className="text-[#525252]">(opcional)</span>
          </label>
          <input
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx,.txt"
            onChange={handleFileUpload}
            className="w-full text-xs text-[#e5e5e5] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#22D3EE] file:text-[#0a0a0a] file:font-semibold file:text-xs hover:file:bg-[#0891B2]"
          />
          {uploading && <p className="text-xs text-[#22D3EE] mt-1">Enviando arquivo...</p>}
          {fileUrl && !uploading && (
            <p className="text-xs text-green-500 mt-1">
              ✅ {fileType === "video" ? "📹 Vídeo" : fileType === "image" ? "📸 Foto" : "📄 Documento"} anexado: {fileName}
            </p>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || uploading || (!content.trim() && !fileUrl)}
          className="w-full bg-[#22D3EE] text-[#0a0a0a] font-medium text-sm rounded-lg px-4 py-2.5 hover:bg-[#06B6D4] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Enviando..." : "Enviar dúvida"}
        </button>
      </form>

      {pendingQuestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-[#22D3EE] font-medium">
            ⏳ Aguardando resposta ({pendingQuestions.length})
          </p>
          {pendingQuestions.map((q) => (
            <div key={q.id} className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3">
              <p className="text-sm text-[#f5f5f5]">{q.content}</p>
              <div className="flex gap-2 mt-1">
                {q.videoUrl && (
                  <a href={q.videoUrl} target="_blank" className="text-xs text-[#22D3EE] hover:underline">
                    📹 Ver vídeo
                  </a>
                )}
                {q.documentUrl && (
                  <a href={q.documentUrl} target="_blank" className="text-xs text-[#22D3EE] hover:underline">
                    📄 Ver {q.documentName || "documento"}
                  </a>
                )}
                {q.imageUrl && (
                  <a href={q.imageUrl} target="_blank" className="text-xs text-[#22D3EE] hover:underline">
                    📸 Ver foto
                  </a>
                )}
              </div>
              <p className="text-xs text-[#525252] mt-1">{timeAgo(q.createdAt)}</p>
            </div>
          ))}
        </div>
      )}

      {answeredQuestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-green-400 font-medium">
            ✅ Respondidas ({answeredQuestions.length})
          </p>
          {answeredQuestions.map((q) => (
            <div key={q.id} className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3">
              <p className="text-sm text-[#f5f5f5]">❓ {q.content}</p>
              <div className="flex gap-2 mt-1">
                {q.videoUrl && (
                  <a href={q.videoUrl} target="_blank" className="text-xs text-[#22D3EE] hover:underline">
                    📹 Ver vídeo
                  </a>
                )}
                {q.documentUrl && (
                  <a href={q.documentUrl} target="_blank" className="text-xs text-[#22D3EE] hover:underline">
                    📄 Ver {q.documentName || "documento"}
                  </a>
                )}
                {q.imageUrl && (
                  <a href={q.imageUrl} target="_blank" className="text-xs text-[#22D3EE] hover:underline">
                    📸 Ver foto
                  </a>
                )}
              </div>
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

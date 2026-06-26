"use client";
import { useEffect, useState } from "react";

interface Student {
  id: string;
  name: string;
}

interface Notice {
  id: string;
  content: string;
  title?: string;
  type: string;
  createdAt: string;
  student?: { id: string; name: string };
  author?: { id: string; name: string };
}

export default function MuralPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStudents();
    fetchNotices();
  }, []);

  async function fetchStudents() {
    try {
      const res = await fetch("/api/student");
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || data || []);
      }
    } catch {}
  }

  async function fetchNotices() {
    try {
      const res = await fetch("/api/notices");
      if (res.ok) {
        const data = await res.json();
        setNotices(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          studentId: selectedStudent || undefined,
          type: "AVISO",
        }),
      });

      if (res.ok) {
        setSuccess(true);
        setContent("");
        fetchNotices();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const err = await res.json();
        setError(err.error || "Erro ao publicar aviso");
      }
    } catch {
      setError("Erro de conexão");
    }

    setSaving(false);
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-[#D4A373]">Mural de Avisos</h1>

        <form onSubmit={handleSubmit} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5 space-y-4">
          <h2 className="text-lg font-semibold text-[#D4A373]">Publicar novo aviso</h2>

          <div>
            <label className="text-sm text-[#a1a1a1] block mb-1">Aluno (opcional)</label>
            <select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
            >
              <option value="">Todos os alunos (aviso geral)</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-[#a1a1a1] block mb-1">Mensagem *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Digite o aviso para o aluno..."
              required
              className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373] resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving || !content.trim()}
            className="w-full bg-[#D4A373] text-[#0a0a0a] font-bold rounded-xl py-3 text-sm transition hover:bg-[#b88a5e] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Publicando..." : "📢 Publicar aviso"}
          </button>

          {success && (
            <p className="text-sm text-green-400 text-center">Aviso publicado com sucesso!</p>
          )}
        </form>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#D4A373] mb-4">Avisos publicados</h2>

          {notices.length === 0 ? (
            <p className="text-[#525252] text-sm text-center py-8">Nenhum aviso publicado ainda.</p>
          ) : (
            <div className="space-y-3">
              {notices.map((notice) => (
                <div key={notice.id} className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm text-[#f5f5f5]">{notice.content}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-[#6b6b6b]">
                        <span>📅 {formatDate(notice.createdAt)}</span>
                        {notice.student && (
                          <span>👤 {notice.student.name}</span>
                        )}
                        {!notice.student && (
                          <span>👥 Todos os alunos</span>
                        )}
                        <span className="bg-[#D4A373]/10 text-[#D4A373] px-2 py-0.5 rounded text-[10px]">
                          {notice.type}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

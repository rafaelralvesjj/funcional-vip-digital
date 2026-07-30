"use client";

import { useEffect, useState } from "react";

interface Student {
  id: string;
  name: string;
}

interface Notice {
  id: string;
  content: string;
  title?: string | null;
  type: string;
  expiresAt?: string | null;
  createdAt: string;
  student?: { id: string; name: string } | null;
  author?: { id: string; name: string; role?: string } | null;
  authorId?: string | null;
  _count?: { reads: number };
}

export default function MuralPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");

  const [title, setTitle] = useState("");
  const [noticeType, setNoticeType] = useState("AVISO");
  const [content, setContent] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [currentUserRole, setCurrentUserRole] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");

  const [editNotice, setEditNotice] = useState<Notice | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    fetchSession();
    fetchStudents();
    fetchNotices();
  }, []);

  async function fetchSession() {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });

      if (res.ok) {
        const session = await res.json();
        setCurrentUserRole(session?.user?.role || "");
        setCurrentUserId(session?.user?.id || "");
      }
    } catch {}
  }

  async function fetchStudents() {
    try {
      const res = await fetch("/api/students", { cache: "no-store" });

      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || data || []);
      }
    } catch {}
  }

  async function fetchNotices() {
    try {
      const res = await fetch("/api/notices", { cache: "no-store" });

      if (res.ok) {
        const data = await res.json();
        setNotices(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      setError("Título do aviso e conteúdo são obrigatórios.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        content: content.trim(),
        studentId: selectedStudent || undefined,
        type: noticeType || "AVISO",
        authorId: currentUserId,
      };

      if (expiresAt) {
        body.expiresAt = expiresAt;
      }

      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSuccess(true);
        setTitle("");
        setNoticeType("AVISO");
        setContent("");
        setExpiresAt("");
        setSelectedStudent("");
        fetchNotices();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const err = await res.json().catch(() => null);
        setError(err?.error || err?.message || "Erro ao publicar aviso");
      }
    } catch {
      setError("Erro de conexão");
    }

    setSaving(false);
  }

  function canEditOrDelete(notice: Notice): boolean {
    return currentUserRole === "GESTOR" || notice.authorId === currentUserId;
  }

  async function deleteNotice(id: string) {
    if (!confirm("Excluir este aviso?")) return;

    const res = await fetch("/api/notices?id=" + id, { method: "DELETE" });

    if (res.ok) {
      setNotices((prev) => prev.filter((n) => n.id !== id));
    }
  }

  async function saveNotice() {
    if (!editNotice) return;

    const res = await fetch("/api/notices", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editNotice.id,
        title: editTitle,
        content: editContent,
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      setNotices((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setEditNotice(null);
    }
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

  function isExpired(expiresAt?: string | null) {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-[#22D3EE]">Mural de Avisos</h1>

        <form
          onSubmit={handleSubmit}
          className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5 space-y-4"
        >
          <h2 className="text-lg font-semibold text-[#22D3EE]">
            Publicar novo aviso
          </h2>

          <div>
            <label className="text-sm text-[#a1a1a1] block mb-1">
              Aluno <span className="text-[#6b6b6b]">(opcional)</span>
            </label>

            <select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#22D3EE]"
            >
              <option value="">Todos os alunos</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-[#a1a1a1] block mb-1">
              Título do aviso *
            </label>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Digite o título do aviso"
              required
              className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE]"
            />
          </div>

          <div>
            <label className="text-sm text-[#a1a1a1] block mb-1">
              Conteúdo do aviso *
            </label>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Digite o conteúdo do aviso..."
              required
              className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE] resize-none"
            />
          </div>

          <div>
            <label className="text-sm text-[#a1a1a1] block mb-1">
              Tipo do aviso
            </label>

            <select
              value={noticeType}
              onChange={(e) => setNoticeType(e.target.value)}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#22D3EE]"
            >
              <option value="AVISO">Aviso</option>
              <option value="AVISO_IMPORTANTE">Aviso importante</option>
              <option value="FEEDBACK_TREINO">Feedback de treino</option>
              <option value="MUDANCA_HORARIO">Mudança de horário</option>
              <option value="AULA_CANCELADA">Aula cancelada</option>
              <option value="NOVA_META">Nova meta</option>
              <option value="LEMBRETE">Lembrete</option>
              <option value="PARABENS">Parabéns</option>
              <option value="INSTRUCOES">Instruções</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-[#a1a1a1] block mb-1">
              Data de expiração{" "}
              <span className="text-[#6b6b6b]">(opcional)</span>
            </label>

            <div className="relative">
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#22D3EE] [color-scheme:dark]"
              />

              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#22D3EE"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={saving || !title.trim() || !content.trim()}
            className="w-full bg-[#22D3EE] text-[#0a0a0a] font-bold rounded-xl py-3 text-sm transition hover:bg-[#0891B2] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Publicando..." : "Publicar aviso"}
          </button>

          {success && (
            <p className="text-sm text-green-400 text-center">
              Aviso publicado com sucesso!
            </p>
          )}
        </form>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#22D3EE] mb-4">
            Avisos publicados
          </h2>

          {notices.length === 0 ? (
            <p className="text-[#525252] text-sm text-center py-8">
              Nenhum aviso publicado ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {notices.map((notice) => {
                const expired = isExpired(notice.expiresAt);
                const totalReads = notice._count?.reads || 0;

                return (
                  <div
                    key={notice.id}
                    className={
                      "bg-[#0a0a0a] border rounded-lg p-4 " +
                      (expired
                        ? "border-red-500/20 opacity-50"
                        : "border-[#ffffff10]")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3 flex-1">
                        <div
                          className={
                            "w-3 h-3 rounded-full mt-1 shrink-0 " +
                            (totalReads > 0 ? "bg-green-500" : "bg-[#525252]")
                          }
                        />

                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-[#f5f5f5] mb-1">
                            {notice.title || "Sem título"}
                          </h3>

                          <p className="text-sm text-[#e5e5e5]">
                            {notice.content}
                          </p>

                          <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-[#6b6b6b]">
                            <span>{formatDate(notice.createdAt)}</span>

                            {notice.author && (
                              <span className="flex items-center gap-1">
                                <span
                                  className={
                                    "px-1.5 py-0.5 rounded text-[10px] " +
                                    (notice.author.role === "GESTOR"
                                      ? "bg-blue-500/10 text-blue-400"
                                      : "bg-green-500/10 text-green-400")
                                  }
                                >
                                  {notice.author.role === "GESTOR"
                                    ? "Gestão"
                                    : "Professor"}
                                </span>
                                {notice.author.name}
                              </span>
                            )}

                            {notice.student ? (
                              <span>Para: {notice.student.name}</span>
                            ) : (
                              <span>Para: Todos os alunos</span>
                            )}

                            {notice.expiresAt && (
                              <span
                                className={
                                  expired ? "text-red-400" : "text-green-400"
                                }
                              >
                                {expired
                                  ? "Expirado"
                                  : "Válido até " + formatDate(notice.expiresAt)}
                              </span>
                            )}

                            <span className="bg-[#22D3EE]/10 text-[#22D3EE] px-2 py-0.5 rounded text-[10px]">
                              {notice.type}
                            </span>

                            <span
                              className={
                                "px-1.5 py-0.5 rounded text-[10px] " +
                                (totalReads > 0
                                  ? "bg-green-500/10 text-green-400"
                                  : "bg-[#525252]/20 text-[#6b6b6b]")
                              }
                            >
                              {totalReads > 0
                                ? totalReads + " leitura(s)"
                                : "Nenhuma leitura"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {canEditOrDelete(notice) && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => {
                              setEditNotice(notice);
                              setEditTitle(notice.title || "");
                              setEditContent(notice.content);
                            }}
                            className="text-xs bg-[#2a2a2a] hover:bg-[#3a3a3a] text-[#a1a1a1] px-3 py-1.5 rounded transition-colors"
                          >
                            Editar
                          </button>

                          <button
                            onClick={() => deleteNotice(notice.id)}
                            className="text-xs bg-[#3a1a1a] hover:bg-[#4a2a2a] text-[#ff6b6b] px-3 py-1.5 rounded transition-colors"
                          >
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editNotice && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setEditNotice(null)}
        >
          <div
            className="bg-[#1a1a1a] rounded-lg p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-white font-medium mb-4">Editar Aviso</h2>

            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Título do aviso"
              className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-3 outline-none focus:border-[#22D3EE]"
            />

            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Conteúdo"
              rows={3}
              className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-4 outline-none focus:border-[#22D3EE] resize-none"
            />

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditNotice(null)}
                className="text-xs text-[#6b6b6b] hover:text-white px-3 py-1.5 transition-colors"
              >
                Cancelar
              </button>

              <button
                onClick={saveNotice}
                className="text-xs bg-[#22D3EE] hover:bg-[#06B6D4] text-black px-4 py-1.5 rounded transition-colors"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

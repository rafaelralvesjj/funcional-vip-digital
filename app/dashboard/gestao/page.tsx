
"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";

interface Student {
  id: string;
  name: string;
  userId?: string | null;
  user?: { id: string; name: string | null } | null;
}

interface Teacher {
  id: string;
  name: string;
  email?: string | null;
  userId?: string | null;
  user?: { id: string; name: string | null; email?: string | null } | null;
  _count?: { students: number };
}

interface Notice {
  id: string;
  title?: string | null;
  content: string;
  type?: string | null;
  authorId?: string | null;
  studentId?: string | null;
  targetRole?: string | null;
  professorId?: string | null;
  createdAt: string;
  author?: { id: string; name: string | null; role?: string | null } | null;
  student?: { id: string; name: string } | null;
  professor?: { id: string; name: string | null } | null;
}

interface ThreadMessage {
  id: string;
  studentId: string;
  teacherId?: string | null;
  content: string;
  senderRole: string;
  createdAt: string;
  answeredBy?: { id: string; name: string | null; role?: string | null } | null;
  student?: { id: string; name: string } | null;
  teacher?: { id: string; name: string | null } | null;
  children?: ThreadMessage[];
}

type TargetType = "ALUNO_ESPECIFICO" | "TODOS_ALUNOS" | "PROFESSOR_ESPECIFICO" | "TODOS_PROFESSORES";
type ActiveTab = "mural" | "chat";

export default function GestaoPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("mural");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [targetType, setTargetType] = useState<TargetType>("ALUNO_ESPECIFICO");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [questions, setQuestions] = useState<ThreadMessage[]>([]);
  const [noticeTitle, setNoticeTitle] = useState<string>("");
  const [noticeContent, setNoticeContent] = useState<string>("");
  const [savingNotice, setSavingNotice] = useState<boolean>(false);
  const [noticeSuccess, setNoticeSuccess] = useState<string>("");
  const [noticeError, setNoticeError] = useState<string>("");
  const [chatContent, setChatContent] = useState<string>("");
  const [sendingChat, setSendingChat] = useState<boolean>(false);
  const [chatSuccess, setChatSuccess] = useState<string>("");
  const [chatError, setChatError] = useState<string>("");
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});

  const studentsOptions = useMemo(() => {
    return [...students].sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const teachersOptions = useMemo(() => {
    return [...teachers].sort((a, b) => a.name.localeCompare(b.name));
  }, [teachers]);

  async function safeJson(response: Response) {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { message: text || "Erro inesperado" };
    }
  }

  function extractArray(data: any, candidateKeys: string[]): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    for (const key of candidateKeys) {
      if (Array.isArray(data[key])) return data[key];
    }
    return [];
  }

  function normalizeStudent(item: any): Student | null {
    if (!item || typeof item !== "object") return null;
    const id = item.id || item.studentId || item.userId || "";
    const name = item.name || item.studentName || item.user?.name || item.student?.name || "Aluno";
    if (!id || !name) return null;
    return {
      id: String(id),
      name: String(name),
      userId: item.userId ?? null,
      user: item.user ?? null,
    };
  }

  function normalizeTeacher(item: any): Teacher | null {
    if (!item || typeof item !== "object") return null;
    const id = item.userId || item.user?.id || item.id || "";
    const name = item.name || item.user?.name || item.teacherName || item.teacher?.name || "Professor";
    const email = item.email || item.user?.email || null;
    if (!id || !name) return null;
    return {
      id: String(id),
      name: String(name),
      email: email ? String(email) : null,
      userId: item.userId ?? null,
      user: item.user ?? null,
      _count: item._count ?? undefined,
    };
  }

  function formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getThreadStatus(thread: ThreadMessage[]): string {
    if (thread.length === 0) return "Aguardando resposta";
    const last = thread[thread.length - 1];
    const role = (last.senderRole || "").toUpperCase();
    if (role === "TEACHER") return "Respondida / aguardando gestão";
    if (role === "GESTOR") return "Aguardando professor";
    if (role === "STUDENT") return "Aguardando resposta";
    return "Aguardando resposta";
  }

  function getAuthorName(msg: ThreadMessage): string {
    const role = (msg.senderRole || "").toUpperCase();
    if (role === "TEACHER") return msg.answeredBy?.name || msg.teacher?.name || "Professor";
    if (role === "STUDENT") return msg.student?.name || "Aluno";
    if (role === "GESTOR") return "Gestão";
    return "Desconhecido";
  }

  function getRoleBadgeClass(role?: string | null): string {
    const r = (role || "").toUpperCase();
    if (r === "TEACHER" || r === "PROFESSOR") return "bg-blue-500/10 text-blue-400";
    if (r === "STUDENT" || r === "ALUNO") return "bg-green-500/10 text-green-400";
    if (r === "GESTOR" || r === "ADMIN") return "bg-[#D4A373]/10 text-[#D4A373]";
    return "bg-[#ffffff10] text-[#a1a1a1]";
  }

  async function fetchSession() {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await safeJson(res);
      if (data?.user?.id) {
        setCurrentUserId(String(data.user.id));
      }
    } catch (err) {
      console.error("Erro ao buscar sessão", err);
    }
  }

  async function fetchStudents() {
    try {
      const res = await fetch("/api/students", { cache: "no-store" });
      const data = await safeJson(res);
      const items = extractArray(data, ["students", "items", "results", "data"]);
      const normalized = items
        .map(normalizeStudent)
        .filter((s): s is Student => s !== null && !!s.id && !!s.name);
      setStudents(normalized);
    } catch (err) {
      console.error("Erro ao buscar alunos", err);
    }
  }

  async function fetchTeachers() {
    try {
      const res = await fetch("/api/teachers", { cache: "no-store" });
      const data = await safeJson(res);
      const items = extractArray(data, ["teachers", "items", "results", "data"]);
      const normalized = items
        .map(normalizeTeacher)
        .filter((t): t is Teacher => t !== null && !!t.id && !!t.name);
      setTeachers(normalized);
    } catch (err) {
      console.error("Erro ao buscar professores", err);
    }
  }

  async function fetchNotices() {
    try {
      const res = await fetch("/api/notices", { cache: "no-store" });
      const data = await safeJson(res);
      const items = extractArray(data, ["notices", "items", "results", "data"]);
      setNotices(items || []);
    } catch (err) {
      console.error("Erro ao buscar avisos", err);
    }
  }

  async function fetchQuestions() {
    try {
      const params = new URLSearchParams();
      params.set("senderRole", "GESTOR");
      if (selectedTeacherId) params.set("teacherId", selectedTeacherId);
      if (selectedStudentId) params.set("studentId", selectedStudentId);
      const res = await fetch(`/api/questions?${params.toString()}`, { cache: "no-store" });
      const data = await safeJson(res);
      const items = extractArray(data, ["questions", "items", "results", "data"]);
      setQuestions(items || []);
    } catch (err) {
      console.error("Erro ao buscar conversas", err);
    }
  }

  useEffect(() => {
    fetchSession();
    fetchStudents();
    fetchTeachers();
    fetchNotices();
  }, []);

  useEffect(() => {
    if (activeTab === "chat") {
      fetchQuestions();
    }
  }, [activeTab, selectedStudentId, selectedTeacherId]);

  async function handlePublishNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeError("");
    setNoticeSuccess("");

    if (!noticeContent.trim()) {
      setNoticeError("O conteúdo do aviso é obrigatório.");
      return;
    }

    let targetRole = "";
    let studentId: string | null = null;
    let professorId: string | null = null;

    if (targetType === "ALUNO_ESPECIFICO") {
      if (!selectedStudentId) {
        setNoticeError("Selecione um aluno específico.");
        return;
      }
      targetRole = "STUDENT";
      studentId = selectedStudentId;
    } else if (targetType === "TODOS_ALUNOS") {
      targetRole = "STUDENT";
    } else if (targetType === "PROFESSOR_ESPECIFICO") {
      if (!selectedTeacherId) {
        setNoticeError("Selecione um professor específico.");
        return;
      }
      targetRole = "TEACHER";
      professorId = selectedTeacherId;
    } else if (targetType === "TODOS_PROFESSORES") {
      targetRole = "TEACHER";
    }

    setSavingNotice(true);
    try {
      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: noticeTitle.trim() || "Aviso da Gestão",
          content: noticeContent.trim(),
          type: "MANAGEMENT",
          targetRole,
          studentId,
          professorId,
        }),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        setNoticeError(json.message || "Erro ao publicar aviso.");
      } else {
        setNoticeSuccess("Aviso publicado com sucesso.");
        setNoticeTitle("");
        setNoticeContent("");
        await fetchNotices();
      }
    } catch (err) {
      setNoticeError("Erro ao publicar aviso.");
    } finally {
      setSavingNotice(false);
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    setChatError("");
    setChatSuccess("");

    if (!chatContent.trim()) {
      setChatError("Digite uma mensagem.");
      return;
    }
    if (!selectedStudentId || !selectedTeacherId) {
      setChatError("Selecione um aluno e um professor.");
      return;
    }

    setSendingChat(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: chatContent.trim(),
          senderRole: "GESTOR",
          studentId: selectedStudentId,
          teacherId: selectedTeacherId,
        }),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        setChatError(json.message || "Erro ao enviar mensagem.");
      } else {
        setChatSuccess("Mensagem enviada com sucesso.");
        setChatContent("");
        await fetchQuestions();
      }
    } catch (err) {
      setChatError("Erro ao enviar mensagem.");
    } finally {
      setSendingChat(false);
    }
  }

  async function handleReply(question: ThreadMessage) {
    const replyText = replyContent[question.id] || "";
    if (!replyText.trim()) return;

    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyText.trim(),
          parentId: question.id,
          studentId: question.studentId,
          teacherId: question.teacherId,
          senderRole: "GESTOR",
          answeredById: currentUserId,
        }),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        console.error(json.message || "Erro ao responder");
      } else {
        setReplyContent((prev) => ({ ...prev, [question.id]: "" }));
        await fetchQuestions();
      }
    } catch (err) {
      console.error("Erro ao responder conversa", err);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-semibold text-[#f5f5f5]">Gestão</h1>
          <p className="mt-2 text-[#a1a1a1]">
            Painel administrativo para publicação de avisos e acompanhamento de conversas.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("mural")}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "mural"
                ? "bg-[#D4A373] text-[#0a0a0a]"
                : "bg-[#111111] text-[#a1a1a1] border border-[#ffffff10] hover:text-[#f5f5f5]"
            }`}
          >
            Mural
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "chat"
                ? "bg-[#D4A373] text-[#0a0a0a]"
                : "bg-[#111111] text-[#a1a1a1] border border-[#ffffff10] hover:text-[#f5f5f5]"
            }`}
          >
            Chat
          </button>
        </div>

        {activeTab === "mural" && (
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-[#f5f5f5]">Novo aviso</h2>
              <p className="text-sm text-[#a1a1a1] mt-1">
                Carregados {students.length} alunos e {teachers.length} professores.
              </p>
            </div>

            <form onSubmit={handlePublishNotice} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#f5f5f5] mb-2">Destinatário</label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as TargetType)}
                  className="w-full rounded-lg bg-[#0a0a0a] border border-[#ffffff10] text-[#f5f5f5] px-4 py-3 outline-none focus:border-[#D4A373]"
                >
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                </select>
              </div>

              {targetType === "ALUNO_ESPECIFICO" && (
                <div>
                  <label className="block text-sm font-medium text-[#f5f5f5] mb-2">Aluno</label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full rounded-lg bg-[#0a0a0a] border border-[#ffffff10] text-[#f5f5f5] px-4 py-3 outline-none focus:border-[#D4A373]"
                  >
                    <option value="">Selecione um aluno</option>
                    {studentsOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetType === "PROFESSOR_ESPECIFICO" && (
                <div>
                  <label className="block text-sm font-medium text-[#f5f5f5] mb-2">Professor</label>
                  <select
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className="w-full rounded-lg bg-[#0a0a0a] border border-[#ffffff10] text-[#f5f5f5] px-4 py-3 outline-none focus:border-[#D4A373]"
                  >
                    <option value="">Selecione um professor</option>
                    {teachersOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#f5f5f5] mb-2">Título</label>
                <input
                  type="text"
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  placeholder="Título do aviso"
                  className="w-full rounded-lg bg-[#0a0a0a] border border-[#ffffff10] text-[#f5f5f5] px-4 py-3 outline-none focus:border-[#D4A373] placeholder:text-[#a1a1a1]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#f5f5f5] mb-2">Conteúdo</label>
                <textarea
                  value={noticeContent}
                  onChange={(e) => setNoticeContent(e.target.value)}
                  placeholder="Escreva o conteúdo do aviso"
                  rows={5}
                  className="w-full rounded-lg bg-[#0a0a0a] border border-[#ffffff10] text-[#f5f5f5] px-4 py-3 outline-none focus:border-[#D4A373] placeholder:text-[#a1a1a1] resize-none"
                />
              </div>

              {noticeError && <p className="text-red-400 text-sm">{noticeError}</p>}
              {noticeSuccess && <p className="text-green-400 text-sm">{noticeSuccess}</p>}

              <button
                type="submit"
                disabled={savingNotice}
                className="px-6 py-3 rounded-lg bg-[#D4A373] text-[#0a0a0a] font-medium hover:bg-[#b88a5e] disabled:opacity-50 transition-colors"
              >
                {savingNotice ? "Publicando..." : "Publicar aviso"}
              </button>
            </form>

            <div className="pt-6 border-t border-[#ffffff10]">
              <h3 className="text-lg font-medium text-[#f5f5f5] mb-4">Avisos publicados</h3>
              {notices.length === 0 ? (
                <p className="text-[#a1a1a1]">Nenhum aviso publicado.</p>
              ) : (
                <div className="space-y-4">
                  {notices.map((n) => (
                    <div
                      key={n.id}
                      className="p-4 rounded-xl bg-[#0a0a0a] border border-[#ffffff10]"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[#f5f5f5] font-medium">{n.title || "Aviso"}</p>
                        <span className="text-xs text-[#a1a1a1]">{formatDateTime(n.createdAt)}</span>
                      </div>
                      <p className="text-[#a1a1a1] mt-2 text-sm">{n.content}</p>
                      <p className="text-xs text-[#D4A373] mt-2">
                        Para: {n.targetRole || "Todos"}
                        {n.student?.name ? ` — ${n.student.name}` : ""}
                        {n.professor?.name ? ` — ${n.professor.name}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="space-y-6">
            <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8 space-y-4">
              <h2 className="text-xl font-semibold text-[#f5f5f5]">Nova mensagem</h2>
              <p className="text-sm text-[#a1a1a1]">
                Carregados {students.length} alunos e {teachers.length} professores.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#f5f5f5] mb-2">Aluno</label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full rounded-lg bg-[#0a0a0a] border border-[#ffffff10] text-[#f5f5f5] px-4 py-3 outline-none focus:border-[#D4A373]"
                  >
                    <option value="">Selecione um aluno</option>
                    {studentsOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#f5f5f5] mb-2">Professor</label>
                  <select
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className="w-full rounded-lg bg-[#0a0a0a] border border-[#ffffff10] text-[#f5f5f5] px-4 py-3 outline-none focus:border-[#D4A373]"
                  >
                    <option value="">Selecione um professor</option>
                    {teachersOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <form onSubmit={handleSendChat} className="space-y-4">
                <textarea
                  value={chatContent}
                  onChange={(e) => setChatContent(e.target.value)}
                  placeholder="Digite a mensagem para iniciar a conversa"
                  rows={4}
                  className="w-full rounded-lg bg-[#0a0a0a] border border-[#ffffff10] text-[#f5f5f5] px-4 py-3 outline-none focus:border-[#D4A373] placeholder:text-[#a1a1a1] resize-none"
                />
                {chatError && <p className="text-red-400 text-sm">{chatError}</p>}
                {chatSuccess && <p className="text-green-400 text-sm">{chatSuccess}</p>}
                <button
                  type="submit"
                  disabled={sendingChat}
                  className="px-6 py-3 rounded-lg bg-[#D4A373] text-[#0a0a0a] font-medium hover:bg-[#b88a5e] disabled:opacity-50 transition-colors"
                >
                  {sendingChat ? "Enviando..." : "Enviar mensagem"}
                </button>
              </form>
            </div>

            <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">Histórico de conversas</h2>
              {questions.length === 0 ? (
                <p className="text-[#a1a1a1]">Nenhuma conversa encontrada.</p>
              ) : (
                <div className="space-y-4">
                  {questions.map((q) => {
                    const thread = [q, ...(q.children || [])].sort(
                      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                    );
                    const isExpanded = expandedQuestion === q.id;
                    return (
                      <div key={q.id} className="p-4 rounded-xl bg-[#0a0a0a] border border-[#ffffff10]">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[#f5f5f5] font-medium">
                              {q.student?.name || "Aluno"} ↔ {q.teacher?.name || "Professor"}
                            </p>
                            <p className="text-xs text-[#a1a1a1] mt-1">
                              {getThreadStatus(thread)} · {thread.length} mensagens
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedQuestion(isExpanded ? null : q.id)}
                            className="px-4 py-2 rounded-lg text-sm bg-[#ffffff10] text-[#f5f5f5] hover:bg-[#ffffff20] transition-colors"
                          >
                            {isExpanded ? "Ocultar" : "Continuar conversa"}
                          </button>
                        </div>

                        <div className="mt-4 space-y-3">
                          {thread.map((msg) => (
                            <div
                              key={msg.id}
                              className={`p-3 rounded-lg border ${
                                (msg.senderRole || "").toUpperCase() === "GESTOR"
                                  ? "bg-[#D4A373]/10 border-[#D4A373]/30"
                                  : "bg-[#111111] border-[#ffffff10]"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-[#f5f5f5]">
                                  {getAuthorName(msg)}
                                </span>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded ${getRoleBadgeClass(
                                    msg.senderRole
                                  )}`}
                                >
                                  {msg.senderRole || "Desconhecido"}
                                </span>
                                <span className="text-xs text-[#a1a1a1]">
                                  {formatDateTime(msg.createdAt)}
                                </span>
                              </div>
                              <p className="text-[#a1a1a1] text-sm mt-2">{msg.content}</p>
                            </div>
                          ))}
                        </div>

                        {isExpanded && (
                          <div className="mt-4 space-y-3">
                            <textarea
                              value={replyContent[q.id] || ""}
                              onChange={(e) =>
                                setReplyContent((prev) => ({ ...prev, [q.id]: e.target.value }))
                              }
                              placeholder="Escreva uma resposta como gestão"
                              rows={3}
                              className="w-full rounded-lg bg-[#111111] border border-[#ffffff10] text-[#f5f5f5] px-4 py-3 outline-none focus:border-[#D4A373] placeholder:text-[#a1a1a1] resize-none"
                            />
                            <div className="flex gap-3">
                              <button
                                type="button"
                                onClick={() => handleReply(q)}
                                className="px-5 py-2.5 rounded-lg bg-[#D4A373] text-[#0a0a0a] text-sm font-medium hover:bg-[#b88a5e] transition-colors"
                              >
                                Responder
                              </button>
                              <button
                                type="button"
                                onClick={() => setExpandedQuestion(null)}
                                className="px-5 py-2.5 rounded-lg bg-[#ffffff10] text-[#f5f5f5] text-sm font-medium hover:bg-[#ffffff20] transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

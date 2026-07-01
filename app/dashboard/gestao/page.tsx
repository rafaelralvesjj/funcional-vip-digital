
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

function safeJson(response: Response): Promise<any> {
  return response.json().catch(() => ({}));
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
  if (!item) return null;
  const id = item.id || item.userId || item.user?.id || "";
  const name = item.name || item.user?.name || "";
  if (!id || !name) return null;
  return {
    id,
    name,
    userId: item.userId ?? null,
    user: item.user ?? null,
  };
}

function normalizeTeacher(item: any): Teacher | null {
  if (!item) return null;
  const id = item.userId || item.user?.id || item.id || "";
  const name = item.name || item.user?.name || "";
  const email = item.email || item.user?.email || null;
  if (!id || !name) return null;
  return {
    id,
    name,
    email,
    userId: item.userId ?? null,
    user: item.user ?? null,
    _count: item._count ?? undefined,
  };
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getThreadStatus(thread: ThreadMessage): string {
  if (!thread.children || thread.children.length === 0) return "Aguardando resposta";
  const last = thread.children[thread.children.length - 1];
  if (last.senderRole === "GESTOR") return "Respondido pela gestão";
  if (last.senderRole === "TEACHER") return "Respondido pelo professor";
  return "Em andamento";
}

function getAuthorName(msg: ThreadMessage): string {
  if (msg.answeredBy?.name) return msg.answeredBy.name;
  if (msg.senderRole === "GESTOR") return "Gestão";
  if (msg.senderRole === "TEACHER") return msg.teacher?.name || "Professor";
  return msg.student?.name || "Aluno";
}

function getRoleBadgeClass(role?: string | null): string {
  if (!role) return "bg-[#a1a1a1]/10 text-[#a1a1a1]";
  const upper = role.toUpperCase();
  if (upper === "ADMIN" || upper === "GESTOR") return "bg-[#D4A373]/10 text-[#D4A373]";
  if (upper === "TEACHER" || upper === "PROFESSOR") return "bg-blue-500/10 text-blue-400";
  return "bg-emerald-500/10 text-emerald-400";
}

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

  async function fetchSession() {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await safeJson(res);
      const id = data?.user?.id || "";
      setCurrentUserId(id);
    } catch {
      setCurrentUserId("");
    }
  }

  async function fetchStudents() {
    try {
      const res = await fetch("/api/students", { cache: "no-store" });
      const data = await safeJson(res);
      const items = extractArray(data, ["students", "items", "results", "data"]);
      const normalized = items.map(normalizeStudent).filter(Boolean) as Student[];
      setStudents(normalized);
    } catch {
      setStudents([]);
    }
  }

  async function fetchTeachers() {
    try {
      const res = await fetch("/api/teachers", { cache: "no-store" });
      const data = await safeJson(res);
      const items = extractArray(data, ["teachers", "items", "results", "data"]);
      const normalized = items.map(normalizeTeacher).filter(Boolean) as Teacher[];
      setTeachers(normalized);
    } catch {
      setTeachers([]);
    }
  }

  async function fetchNotices() {
    try {
      const res = await fetch("/api/notices", { cache: "no-store" });
      const data = await safeJson(res);
      const items = extractArray(data, ["notices", "items", "results", "data"]);
      setNotices(items as Notice[]);
    } catch {
      setNotices([]);
    }
  }

  async function fetchQuestions() {
    try {
      const params = new URLSearchParams({ senderRole: "GESTOR" });
      if (selectedTeacherId) params.set("teacherId", selectedTeacherId);
      if (selectedStudentId) params.set("studentId", selectedStudentId);
      const res = await fetch(`/api/questions?${params.toString()}`, { cache: "no-store" });
      const data = await safeJson(res);
      const items = Array.isArray(data) ? data : extractArray(data, ["questions", "items", "results", "data"]);
      setQuestions(items as ThreadMessage[]);
    } catch {
      setQuestions([]);
    }
  }

  useEffect(() => {
    fetchSession();
    fetchStudents();
    fetchTeachers();
    fetchNotices();
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [selectedStudentId, selectedTeacherId]);

  async function handlePublishNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeSuccess("");
    setNoticeError("");

    if (!noticeContent.trim()) {
      setNoticeError("Preencha o conteúdo do aviso.");
      return;
    }

    let targetRole = "";
    let studentId: string | null = null;
    let professorId: string | null = null;

    if (targetType === "ALUNO_ESPECIFICO") {
      if (!selectedStudentId) {
        setNoticeError("Selecione um aluno.");
        return;
      }
      targetRole = "STUDENT";
      studentId = selectedStudentId;
    } else if (targetType === "TODOS_ALUNOS") {
      targetRole = "STUDENT";
    } else if (targetType === "PROFESSOR_ESPECIFICO") {
      if (!selectedTeacherId) {
        setNoticeError("Selecione um professor.");
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
        setNoticeError(json?.error || json?.message || "Erro ao publicar aviso.");
      } else {
        setNoticeSuccess("Aviso publicado com sucesso.");
        setNoticeTitle("");
        setNoticeContent("");
        await fetchNotices();
      }
    } catch {
      setNoticeError("Erro ao publicar aviso.");
    } finally {
      setSavingNotice(false);
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    setChatSuccess("");
    setChatError("");

    if (!chatContent.trim()) {
      setChatError("Preencha a mensagem.");
      return;
    }
    if (!selectedStudentId) {
      setChatError("Selecione um aluno.");
      return;
    }
    if (!selectedTeacherId) {
      setChatError("Selecione um professor.");
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
        setChatError(json?.error || json?.message || "Erro ao enviar mensagem.");
      } else {
        setChatSuccess("Mensagem enviada com sucesso.");
        setChatContent("");
        await fetchQuestions();
      }
    } catch {
      setChatError("Erro ao enviar mensagem.");
    } finally {
      setSendingChat(false);
    }
  }

  async function handleReply(question: ThreadMessage) {
    const replyText = (replyContent[question.id] || "").trim();
    if (!replyText) return;

    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyText,
          parentId: question.id,
          studentId: question.studentId,
          teacherId: question.teacherId,
          senderRole: "GESTOR",
          answeredById: currentUserId,
        }),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        window.alert(json?.error || json?.message || "Erro ao responder.");
      } else {
        setReplyContent((prev) => ({ ...prev, [question.id]: "" }));
        setExpandedQuestion(null);
        await fetchQuestions();
      }
    } catch {
      window.alert("Erro ao responder.");
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Gestão</h1>
            <p className="text-[#a1a1a1] mt-1">
              Área administrativa para avisos e comunicação.
            </p>
          </div>
          <div className="text-sm text-[#a1a1a1]">
            {students.length} aluno(s) • {teachers.length} professor(es)
          </div>
        </header>

        <div className="flex gap-2 border-b border-[#ffffff10]">
          <button
            type="button"
            onClick={() => setActiveTab("mural")}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === "mural"
                ? "text-[#D4A373] border-b-2 border-[#D4A373]"
                : "text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Mural
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === "chat"
                ? "text-[#D4A373] border-b-2 border-[#D4A373]"
                : "text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Chat
          </button>
        </div>

        {activeTab === "mural" && (
          <div className="space-y-8">
            <section className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
              <h2 className="text-lg font-medium mb-4">Publicar aviso</h2>
              <form onSubmit={handlePublishNotice} className="space-y-4">
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Título</label>
                  <input
                    type="text"
                    value={noticeTitle}
                    onChange={(e) => setNoticeTitle(e.target.value)}
                    placeholder="Aviso da Gestão"
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-xl px-4 py-2 text-[#f5f5f5] placeholder:text-[#a1a1a1]/50 focus:outline-none focus:border-[#D4A373]/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Conteúdo</label>
                  <textarea
                    value={noticeContent}
                    onChange={(e) => setNoticeContent(e.target.value)}
                    rows={4}
                    placeholder="Digite o aviso..."
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-xl px-4 py-2 text-[#f5f5f5] placeholder:text-[#a1a1a1]/50 focus:outline-none focus:border-[#D4A373]/50 resize-none"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Destinatário</label>
                    <select
                      value={targetType}
                      onChange={(e) => setTargetType(e.target.value as TargetType)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-xl px-4 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]/50"
                    >
                      <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                      <option value="TODOS_ALUNOS">Todos os alunos</option>
                      <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                      <option value="TODOS_PROFESSORES">Todos os professores</option>
                    </select>
                  </div>
                  {targetType === "ALUNO_ESPECIFICO" && (
                    <div>
                      <label className="block text-sm text-[#a1a1a1] mb-1">Aluno</label>
                      <select
                        value={selectedStudentId}
                        onChange={(e) => setSelectedStudentId(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-xl px-4 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]/50"
                      >
                        <option value="">Selecione...</option>
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
                      <label className="block text-sm text-[#a1a1a1] mb-1">Professor</label>
                      <select
                        value={selectedTeacherId}
                        onChange={(e) => setSelectedTeacherId(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-xl px-4 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]/50"
                      >
                        <option value="">Selecione...</option>
                        {teachersOptions.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {noticeError && (
                  <p className="text-sm text-red-400">{noticeError}</p>
                )}
                {noticeSuccess && (
                  <p className="text-sm text-emerald-400">{noticeSuccess}</p>
                )}

                <button
                  type="submit"
                  disabled={savingNotice}
                  className="inline-flex items-center justify-center bg-[#D4A373] text-[#0a0a0a] font-medium rounded-xl px-6 py-2.5 hover:bg-[#b88a5e] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {savingNotice ? "Publicando..." : "Publicar aviso"}
                </button>
              </form>
            </section>

            <section className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
              <h2 className="text-lg font-medium mb-4">Histórico de avisos</h2>
              {notices.length === 0 ? (
                <p className="text-[#a1a1a1] text-sm">Nenhum aviso publicado.</p>
              ) : (
                <ul className="space-y-3">
                  {notices.map((n) => (
                    <li
                      key={n.id}
                      className="bg-[#0a0a0a] border border-[#ffffff08] rounded-xl p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-medium text-[#f5f5f5]">
                            {n.title || "Aviso"}
                          </p>
                          <p className="text-sm text-[#a1a1a1] mt-1">{n.content}</p>
                          <p className="text-xs text-[#a1a1a1] mt-2">
                            {formatDateTime(n.createdAt)} • Por{" "}
                            {n.author?.name || "Gestão"}
                            {n.student?.name ? ` • Aluno: ${n.student.name}` : ""}
                            {n.professor?.name ? ` • Professor: ${n.professor.name}` : ""}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${getRoleBadgeClass(
                            n.targetRole
                          )}`}
                        >
                          {n.targetRole || "GERAL"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="space-y-8">
            <section className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
              <h2 className="text-lg font-medium mb-4">Enviar mensagem</h2>
              <form onSubmit={handleSendChat} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Aluno</label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-xl px-4 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]/50"
                    >
                      <option value="">Selecione um aluno...</option>
                      {studentsOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Professor</label>
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-xl px-4 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]/50"
                    >
                      <option value="">Selecione um professor...</option>
                      {teachersOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Mensagem</label>
                  <textarea
                    value={chatContent}
                    onChange={(e) => setChatContent(e.target.value)}
                    rows={4}
                    placeholder="Digite a mensagem..."
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-xl px-4 py-2 text-[#f5f5f5] placeholder:text-[#a1a1a1]/50 focus:outline-none focus:border-[#D4A373]/50 resize-none"
                  />
                </div>

                {chatError && <p className="text-sm text-red-400">{chatError}</p>}
                {chatSuccess && <p className="text-sm text-emerald-400">{chatSuccess}</p>}

                <button
                  type="submit"
                  disabled={sendingChat}
                  className="inline-flex items-center justify-center bg-[#D4A373] text-[#0a0a0a] font-medium rounded-xl px-6 py-2.5 hover:bg-[#b88a5e] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {sendingChat ? "Enviando..." : "Enviar mensagem"}
                </button>
              </form>
            </section>

            <section className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
              <h2 className="text-lg font-medium mb-4">Conversas</h2>
              {questions.length === 0 ? (
                <p className="text-[#a1a1a1] text-sm">Nenhuma conversa encontrada.</p>
              ) : (
                <ul className="space-y-4">
                  {questions.map((q) => (
                    <li
                      key={q.id}
                      className="bg-[#0a0a0a] border border-[#ffffff08] rounded-xl p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-medium text-[#f5f5f5]">
                            {q.student?.name || "Aluno"} ↔ {q.teacher?.name || "Professor"}
                          </p>
                          <p className="text-sm text-[#a1a1a1] mt-1">{q.content}</p>
                          <p className="text-xs text-[#a1a1a1] mt-2">
                            {formatDateTime(q.createdAt)} • {getThreadStatus(q)}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full h-fit ${getRoleBadgeClass(
                            q.senderRole
                          )}`}
                        >
                          {q.senderRole}
                        </span>
                      </div>

                      {q.children && q.children.length > 0 && (
                        <div className="mt-4 space-y-2 pl-4 border-l border-[#ffffff10]">
                          {q.children.map((child) => (
                            <div
                              key={child.id}
                              className="bg-[#111111] border border-[#ffffff08] rounded-lg p-3"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-[#D4A373]">
                                  {getAuthorName(child)}
                                </span>
                                <span className="text-[10px] text-[#a1a1a1]">
                                  {formatDateTime(child.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm text-[#f5f5f5] mt-1">{child.content}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {expandedQuestion === q.id ? (
                        <div className="mt-4 space-y-2">
                          <textarea
                            value={replyContent[q.id] || ""}
                            onChange={(e) =>
                              setReplyContent((prev) => ({
                                ...prev,
                                [q.id]: e.target.value,
                              }))
                            }
                            rows={3}
                            placeholder="Digite a resposta..."
                            className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-xl px-4 py-2 text-[#f5f5f5] placeholder:text-[#a1a1a1]/50 focus:outline-none focus:border-[#D4A373]/50 resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleReply(q)}
                              className="inline-flex items-center justify-center bg-[#D4A373] text-[#0a0a0a] font-medium rounded-xl px-4 py-2 hover:bg-[#b88a5e] transition"
                            >
                              Responder
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedQuestion(null)}
                              className="inline-flex items-center justify-center bg-[#111111] border border-[#ffffff10] text-[#a1a1a1] font-medium rounded-xl px-4 py-2 hover:text-[#f5f5f5] transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpandedQuestion(q.id)}
                          className="mt-4 text-sm font-medium text-[#D4A373] hover:underline"
                        >
                          Continuar conversa
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

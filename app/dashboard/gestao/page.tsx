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

type TargetType =
  | "ALUNO_ESPECIFICO"
  | "TODOS_ALUNOS"
  | "PROFESSOR_ESPECIFICO"
  | "TODOS_PROFESSORES";

type ActiveTab = "mural" | "chat";

const targetLabels: Record<TargetType, string> = {
  ALUNO_ESPECIFICO: "Aluno específico",
  TODOS_ALUNOS: "Todos os alunos",
  PROFESSOR_ESPECIFICO: "Professor específico",
  TODOS_PROFESSORES: "Todos os professores",
};

const targetTypeOptions: TargetType[] = [
  "ALUNO_ESPECIFICO",
  "TODOS_ALUNOS",
  "PROFESSOR_ESPECIFICO",
  "TODOS_PROFESSORES",
];

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

  const [expandedQuestion, setExpandedQuestion] = useState<string>("");
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});

  async function safeJson<T>(response: Response): Promise<T> {
    try {
      const text = await response.text();
      if (!text) return {} as T;
      return JSON.parse(text) as T;
    } catch {
      return {} as T;
    }
  }

  function extractArray(data: unknown, candidateKeys: string[]): unknown[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === "object") {
      for (const key of candidateKeys) {
        const value = (data as Record<string, unknown>)[key];
        if (Array.isArray(value)) return value;
      }
    }
    return [];
  }

  function normalizeStudent(item: any): Student {
    if (!item || typeof item !== "object") {
      return { id: "", name: "", userId: null, user: null };
    }
    const maybeStudent = item.student;
    const maybeUser = item.user;

    const id = String(
      maybeStudent?.id ?? maybeUser?.id ?? item.id ?? ""
    ).trim();
    const name = String(
      maybeStudent?.name ?? maybeUser?.name ?? item.name ?? ""
    ).trim();
    const userId = item.userId != null ? String(item.userId) : null;
    const user =
      maybeUser && typeof maybeUser === "object"
        ? {
            id: String(maybeUser.id ?? ""),
            name: maybeUser.name != null ? String(maybeUser.name) : null,
          }
        : null;

    return { id, name, userId, user };
  }

  function normalizeTeacher(item: any): Teacher {
    if (!item || typeof item !== "object") {
      return { id: "", name: "", email: null, userId: null, user: null };
    }
    const maybeUser = item.user;

    const userId = item.userId != null ? String(item.userId) : null;
    const finalId =
      userId || String(maybeUser?.id ?? "").trim() || String(item.id ?? "").trim();
    const name = String(maybeUser?.name ?? item.name ?? "").trim();
    const email =
      maybeUser?.email != null
        ? String(maybeUser.email)
        : item.email != null
        ? String(item.email)
        : null;
    const user =
      maybeUser && typeof maybeUser === "object"
        ? {
            id: String(maybeUser.id ?? ""),
            name: maybeUser.name != null ? String(maybeUser.name) : null,
            email: maybeUser.email != null ? String(maybeUser.email) : null,
          }
        : null;

    return {
      id: finalId,
      name,
      email,
      userId,
      user,
      _count: item._count && typeof item._count === "object" ? item._count : undefined,
    };
  }

  function formatDateTime(dateStr: string): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function getThreadStatus(thread: ThreadMessage[]): string {
    if (!thread.length) return "Nova";
    const last = thread[thread.length - 1];
    switch (last.senderRole) {
      case "TEACHER":
        return "Respondida / aguardando gestão";
      case "GESTOR":
        return "Aguardando professor";
      case "STUDENT":
        return "Aguardando resposta";
      default:
        return "Em andamento";
    }
  }

  function getAuthorName(msg: ThreadMessage): string {
    if (msg.senderRole === "GESTOR") return "Gestão";
    if (msg.senderRole === "TEACHER") {
      return msg.answeredBy?.name || msg.teacher?.name || "Professor";
    }
    if (msg.senderRole === "STUDENT") {
      return msg.student?.name || "Aluno";
    }
    return "Desconhecido";
  }

  function getRoleBadgeClass(role: string): string {
    switch (role) {
      case "GESTOR":
        return "bg-[#D4A373] text-black";
      case "TEACHER":
        return "bg-blue-500/20 text-blue-300 border border-blue-500/30";
      case "STUDENT":
        return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
      default:
        return "bg-[#ffffff10] text-[#a1a1a1]";
    }
  }

  async function fetchSession() {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await safeJson<{ user?: { id?: string } }>(res);
      if (data?.user?.id) setCurrentUserId(String(data.user.id));
    } catch {
      setCurrentUserId("");
    }
  }

  async function fetchStudents() {
    try {
      const res = await fetch("/api/students", { cache: "no-store" });
      const data = await safeJson<unknown>(res);
      const raw = extractArray(data, ["students", "items", "results", "data"]);
      const normalized = raw
        .map((item) => normalizeStudent(item))
        .filter((s) => s.id && s.name);
      setStudents(normalized);
    } catch {
      setStudents([]);
    }
  }

  async function fetchTeachers() {
    try {
      const res = await fetch("/api/teachers", { cache: "no-store" });
      const data = await safeJson<unknown>(res);
      const raw = extractArray(data, ["teachers", "items", "results", "data"]);
      const normalized = raw
        .map((item) => normalizeTeacher(item))
        .filter((t) => t.id && t.name);
      setTeachers(normalized);
    } catch {
      setTeachers([]);
    }
  }

  async function fetchNotices() {
    try {
      const res = await fetch("/api/notices", { cache: "no-store" });
      const data = await safeJson<unknown>(res);
      const raw = extractArray(data, ["notices", "items", "results", "data"]);
      setNotices(raw.map((n) => n as Notice));
    } catch {
      setNotices([]);
    }
  }

  async function fetchQuestions() {
    try {
      const params = new URLSearchParams({ senderRole: "GESTOR" });
      if (selectedTeacherId) params.append("teacherId", selectedTeacherId);
      if (selectedStudentId) params.append("studentId", selectedStudentId);
      const res = await fetch(`/api/questions?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await safeJson<unknown>(res);
      const raw = extractArray(data, ["questions", "items", "results", "data"]);
      setQuestions(raw.map((q) => q as ThreadMessage));
    } catch {
      setQuestions([]);
    }
  }

  useEffect(() => {
    fetchSession();
  }, []);

  useEffect(() => {
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
      setNoticeError("Preencha o conteúdo do aviso.");
      return;
    }

    let targetRole = "";
    let studentId = "";
    let professorId = "";

    switch (targetType) {
      case "ALUNO_ESPECIFICO":
        if (!selectedStudentId) {
          setNoticeError("Selecione um aluno.");
          return;
        }
        targetRole = "STUDENT";
        studentId = selectedStudentId;
        break;
      case "TODOS_ALUNOS":
        targetRole = "STUDENT";
        break;
      case "PROFESSOR_ESPECIFICO":
        if (!selectedTeacherId) {
          setNoticeError("Selecione um professor.");
          return;
        }
        targetRole = "TEACHER";
        professorId = selectedTeacherId;
        break;
      case "TODOS_PROFESSORES":
        targetRole = "TEACHER";
        break;
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
      const data = await safeJson<{ error?: string; message?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.message || data?.error || `Erro ${res.status}`);
      }
      setNoticeSuccess("Aviso publicado com sucesso.");
      setNoticeTitle("");
      setNoticeContent("");
      await fetchNotices();
    } catch (err: any) {
      setNoticeError(err?.message || "Erro ao publicar aviso.");
    } finally {
      setSavingNotice(false);
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    setChatError("");
    setChatSuccess("");

    if (!chatContent.trim()) {
      setChatError("Escreva uma mensagem.");
      return;
    }
    if (!selectedStudentId || !selectedTeacherId) {
      setChatError("Selecione aluno e professor.");
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
      const data = await safeJson<{ error?: string; message?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.message || data?.error || `Erro ${res.status}`);
      }
      setChatSuccess("Mensagem enviada.");
      setChatContent("");
      await fetchQuestions();
    } catch (err: any) {
      setChatError(err?.message || "Erro ao enviar mensagem.");
    } finally {
      setSendingChat(false);
    }
  }

  async function handleReply(question: ThreadMessage) {
    const replyText = (replyContent[question.id] || "").trim();
    if (!replyText) return;

    setChatError("");
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
      const data = await safeJson<{ error?: string; message?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.message || data?.error || `Erro ${res.status}`);
      }
      setReplyContent((prev) => ({ ...prev, [question.id]: "" }));
      await fetchQuestions();
    } catch (err: any) {
      setChatError(err?.message || "Erro ao responder.");
    }
  }

  const studentsOptions = useMemo(
    () => [...students].sort((a, b) => a.name.localeCompare(b.name)),
    [students]
  );

  const teachersOptions = useMemo(
    () => [...teachers].sort((a, b) => a.name.localeCompare(b.name)),
    [teachers]
  );

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Gestão</h1>
          <div className="mt-2 h-1 w-24 bg-[#D4A373] rounded-full" />
        </header>

        <div className="flex gap-2 mb-8">
          <button
            type="button"
            onClick={() => setActiveTab("mural")}
            className={`px-5 py-2 rounded-lg border border-[#ffffff10] font-medium transition ${
              activeTab === "mural"
                ? "bg-[#D4A373] text-black border-[#D4A373]"
                : "bg-[#111111] text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Mural
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`px-5 py-2 rounded-lg border border-[#ffffff10] font-medium transition ${
              activeTab === "chat"
                ? "bg-[#D4A373] text-black border-[#D4A373]"
                : "bg-[#111111] text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Chat
          </button>
        </div>

        {activeTab === "mural" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-1">Publicar aviso</h2>
              <p className="text-sm text-[#a1a1a1] mb-4">
                Alunos carregados: {students.length} · Professores carregados:{" "}
                {teachers.length}
              </p>

              <form onSubmit={handlePublishNotice} className="space-y-4">
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Destinatário</label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value as TargetType)}
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3 text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none"
                  >
                    {targetTypeOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {targetLabels[opt]}
                      </option>
                    ))}
                  </select>
                </div>

                {targetType === "ALUNO_ESPECIFICO" && (
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Aluno</label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3 text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none"
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
                    <label className="block text-sm text-[#a1a1a1] mb-1">Professor</label>
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3 text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none"
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
                  <label className="block text-sm text-[#a1a1a1] mb-1">Título</label>
                  <input
                    type="text"
                    value={noticeTitle}
                    onChange={(e) => setNoticeTitle(e.target.value)}
                    placeholder="Aviso da Gestão"
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3 text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Conteúdo</label>
                  <textarea
                    value={noticeContent}
                    onChange={(e) => setNoticeContent(e.target.value)}
                    rows={5}
                    placeholder="Digite o conteúdo do aviso..."
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3 text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none resize-none"
                  />
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
                  className="w-full bg-[#D4A373] text-black font-semibold py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                >
                  {savingNotice ? "Publicando..." : "Publicar aviso"}
                </button>
              </form>
            </section>

            <section className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Histórico de avisos</h2>
              <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
                {notices.length === 0 && (
                  <p className="text-sm text-[#a1a1a1]">Nenhum aviso publicado.</p>
                )}
                {notices.map((notice) => (
                  <div
                    key={notice.id}
                    className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-medium text-[#f5f5f5]">
                        {notice.title || "Aviso"}
                      </h3>
                      <span className="text-xs text-[#a1a1a1] whitespace-nowrap">
                        {formatDateTime(notice.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-[#a1a1a1] mb-2">{notice.content}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-[#ffffff10] text-[#a1a1a1]">
                        {notice.targetRole || "Todos"}
                      </span>
                      {notice.student?.name && (
                        <span className="px-2 py-0.5 rounded-full bg-[#ffffff10] text-[#a1a1a1]">
                          {notice.student.name}
                        </span>
                      )}
                      {notice.professor?.name && (
                        <span className="px-2 py-0.5 rounded-full bg-[#ffffff10] text-[#a1a1a1]">
                          {notice.professor.name}
                        </span>
                      )}
                      <span className="text-[#a1a1a1]">
                        por {notice.author?.name || "Gestão"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-1">Enviar mensagem</h2>
              <p className="text-sm text-[#a1a1a1] mb-4">
                Alunos carregados: {students.length} · Professores carregados:{" "}
                {teachers.length}
              </p>

              <form onSubmit={handleSendChat} className="space-y-4">
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Aluno</label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3 text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none"
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
                  <label className="block text-sm text-[#a1a1a1] mb-1">Professor</label>
                  <select
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3 text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none"
                  >
                    <option value="">Selecione um professor</option>
                    {teachersOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Mensagem</label>
                  <textarea
                    value={chatContent}
                    onChange={(e) => setChatContent(e.target.value)}
                    rows={5}
                    placeholder="Escreva a mensagem..."
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3 text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none resize-none"
                  />
                </div>

                {chatError && <p className="text-sm text-red-400">{chatError}</p>}
                {chatSuccess && (
                  <p className="text-sm text-emerald-400">{chatSuccess}</p>
                )}

                <button
                  type="submit"
                  disabled={sendingChat}
                  className="w-full bg-[#D4A373] text-black font-semibold py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                >
                  {sendingChat ? "Enviando..." : "Enviar mensagem"}
                </button>
              </form>
            </section>

            <section className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Histórico de mensagens</h2>
              <div className="space-y-4 max-h-[700px] overflow-y-auto pr-1">
                {questions.length === 0 && (
                  <p className="text-sm text-[#a1a1a1]">
                    Nenhuma mensagem encontrada.
                  </p>
                )}
                {questions.map((question) => {
                  const thread = [question, ...(question.children || [])].sort(
                    (a, b) =>
                      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  );
                  const last = thread[thread.length - 1];
                  const isExpanded = expandedQuestion === question.id;

                  return (
                    <div
                      key={question.id}
                      className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <h3 className="font-medium text-[#f5f5f5]">
                            {question.student?.name || "Aluno"} →{" "}
                            {question.teacher?.name || "Professor"}
                          </h3>
                          <p className="text-xs text-[#a1a1a1] mt-0.5">
                            {getThreadStatus(thread)} · Última mensagem:{" "}
                            {getAuthorName(last)} · {formatDateTime(last.createdAt)}
                          </p>
                        </div>
                      </div>

                      <p className="text-sm text-[#a1a1a1] line-clamp-2 mb-3">
                        {last.content}
                      </p>

                      {!isExpanded && (
                        <button
                          type="button"
                          onClick={() => setExpandedQuestion(question.id)}
                          className="text-sm font-medium text-[#D4A373] hover:underline"
                        >
                          Continuar conversa
                        </button>
                      )}

                      {isExpanded && (
                        <div className="mt-4 space-y-3">
                          {thread.map((msg) => (
                            <div
                              key={msg.id}
                              className="bg-[#111111] border border-[#ffffff10] rounded-lg p-3"
                            >
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span
                                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${getRoleBadgeClass(
                                    msg.senderRole
                                  )}`}
                                >
                                  {msg.senderRole}
                                </span>
                                <span className="text-sm text-[#f5f5f5]">
                                  {getAuthorName(msg)}
                                </span>
                                <span className="text-xs text-[#a1a1a1] ml-auto">
                                  {formatDateTime(msg.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm text-[#f5f5f5]">{msg.content}</p>
                            </div>
                          ))}

                          <textarea
                            value={replyContent[question.id] || ""}
                            onChange={(e) =>
                              setReplyContent((prev) => ({
                                ...prev,
                                [question.id]: e.target.value,
                              }))
                            }
                            rows={3}
                            placeholder="Escreva a resposta..."
                            className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3 text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none resize-none"
                          />

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleReply(question)}
                              className="bg-[#D4A373] text-black font-semibold py-2 px-4 rounded-lg hover:opacity-90 transition"
                            >
                              Responder
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedQuestion("");
                                setReplyContent((prev) => ({
                                  ...prev,
                                  [question.id]: "",
                                }));
                              }}
                              className="bg-[#ffffff10] text-[#f5f5f5] font-medium py-2 px-4 rounded-lg hover:bg-[#ffffff15] transition"
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
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

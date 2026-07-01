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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const v = value[key];
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const v = value[key];
  return isRecord(v) ? v : null;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  const directKeys = ["students", "items", "results", "data", "notices", "questions", "threads"];
  for (const key of directKeys) {
    const v = data[key];
    if (Array.isArray(v)) return v;
  }
  const nestedKeys = ["data", "result", "payload"];
  for (const key of nestedKeys) {
    const v = data[key];
    if (Array.isArray(v)) return v;
    if (isRecord(v)) {
      for (const innerKey of directKeys) {
        const iv = v[innerKey];
        if (Array.isArray(iv)) return iv;
      }
    }
  }
  return [];
}

function normalizeStudent(item: unknown): Student | null {
  if (!isRecord(item)) return null;

  const studentNested = getNestedRecord(item, "student");
  const userNested = getNestedRecord(item, "user");

  const id =
    getString(item, "id") ||
    (studentNested ? getString(studentNested, "id") : null) ||
    getString(item, "studentId") ||
    getString(item, "userId") ||
    (userNested ? getString(userNested, "id") : null);

  const name =
    getString(item, "name") ||
    (studentNested ? getString(studentNested, "name") : null) ||
    getString(item, "studentName") ||
    (userNested ? getString(userNested, "name") : null);

  if (!id || !name) return null;

  const userId = getString(item, "userId") || (userNested ? getString(userNested, "id") : null);

  return {
    id,
    name,
    userId: userId ?? null,
    user: userNested
      ? { id: userNested.id as string, name: typeof userNested.name === "string" ? userNested.name : null }
      : null,
  };
}

function normalizeTeacher(item: unknown): Teacher | null {
  if (!isRecord(item)) return null;

  const userNested = getNestedRecord(item, "user");
  const teacherNested = getNestedRecord(item, "teacher");

  const id =
    getString(item, "userId") ||
    (userNested ? getString(userNested, "id") : null) ||
    getString(item, "id");

  const name =
    getString(item, "name") ||
    (userNested ? getString(userNested, "name") : null) ||
    getString(item, "teacherName") ||
    (teacherNested ? getString(teacherNested, "name") : null);

  if (!id || !name) return null;

  const email =
    getString(item, "email") || (userNested ? getString(userNested, "email") : null) || null;

  const countNested = getNestedRecord(item, "_count");
  const studentsCount = countNested && typeof countNested.students === "number" ? countNested.students : undefined;

  return {
    id,
    name,
    email,
    userId: getString(item, "userId") ?? null,
    user: userNested
      ? {
          id: userNested.id as string,
          name: typeof userNested.name === "string" ? userNested.name : null,
          email: typeof userNested.email === "string" ? userNested.email : null,
        }
      : null,
    _count: studentsCount !== undefined ? { students: studentsCount } : undefined,
  };
}

function normalizeNotice(item: unknown): Notice | null {
  if (!isRecord(item)) return null;
  const id = getString(item, "id");
  const content = getString(item, "content");
  if (!id || !content) return null;

  const authorNested = getNestedRecord(item, "author");
  const studentNested = getNestedRecord(item, "student");
  const professorNested = getNestedRecord(item, "professor");

  const createdAt = getString(item, "createdAt") ?? new Date().toISOString();

  return {
    id,
    title: getString(item, "title"),
    content,
    type: getString(item, "type"),
    authorId: getString(item, "authorId"),
    studentId: getString(item, "studentId"),
    targetRole: getString(item, "targetRole"),
    professorId: getString(item, "professorId"),
    createdAt,
    author: authorNested
      ? {
          id: authorNested.id as string,
          name: typeof authorNested.name === "string" ? authorNested.name : null,
          role: typeof authorNested.role === "string" ? authorNested.role : null,
        }
      : null,
    student: studentNested
      ? { id: studentNested.id as string, name: (studentNested.name as string) ?? "" }
      : null,
    professor: professorNested
      ? { id: professorNested.id as string, name: typeof professorNested.name === "string" ? professorNested.name : null }
      : null,
  };
}

function normalizeThreadMessage(item: unknown): ThreadMessage | null {
  if (!isRecord(item)) return null;
  const id = getString(item, "id");
  const content = getString(item, "content");
  const studentId = getString(item, "studentId");
  if (!id || !content || !studentId) return null;

  const senderRole = getString(item, "senderRole") ?? "ALUNO";
  const createdAt = getString(item, "createdAt") ?? new Date().toISOString();

  const answeredByNested = getNestedRecord(item, "answeredBy");
  const studentNested = getNestedRecord(item, "student");
  const teacherNested = getNestedRecord(item, "teacher");

  const childrenRaw = item.children;
  const children: ThreadMessage[] = Array.isArray(childrenRaw)
    ? childrenRaw.map(normalizeThreadMessage).filter((m): m is ThreadMessage => m !== null)
    : [];

  return {
    id,
    studentId,
    teacherId: getString(item, "teacherId"),
    content,
    senderRole,
    createdAt,
    answeredBy: answeredByNested
      ? {
          id: answeredByNested.id as string,
          name: typeof answeredByNested.name === "string" ? answeredByNested.name : null,
          role: typeof answeredByNested.role === "string" ? answeredByNested.role : null,
        }
      : null,
    student: studentNested
      ? { id: studentNested.id as string, name: (studentNested.name as string) ?? "" }
      : null,
    teacher: teacherNested
      ? { id: teacherNested.id as string, name: typeof teacherNested.name === "string" ? teacherNested.name : null }
      : null,
    children,
  };
}

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function getThreadStatus(thread: ThreadMessage): { label: string; className: string } {
  const hasAnswer = (thread.children ?? []).some((c) => c.senderRole !== "ALUNO");
  if (hasAnswer) {
    return { label: "Respondido", className: "bg-[#D4A37320] text-[#D4A373] border-[#D4A37340]" };
  }
  return { label: "Aberto", className: "bg-[#ffffff10] text-[#a1a1a1] border-[#ffffff20]" };
}

function getAuthorName(msg: ThreadMessage): string {
  if (msg.senderRole === "ALUNO") return msg.student?.name ?? "Aluno";
  if (msg.senderRole === "PROFESSOR") return msg.teacher?.name ?? "Professor";
  if (msg.answeredBy?.name) return msg.answeredBy.name;
  return "Gestão";
}

function getRoleBadgeClass(role: string | null | undefined): string {
  if (!role) return "bg-[#ffffff10] text-[#a1a1a1] border-[#ffffff20]";
  switch (role) {
    case "GESTOR":
    case "ADMIN":
      return "bg-[#D4A37320] text-[#D4A373] border-[#D4A37340]";
    case "PROFESSOR":
      return "bg-[#3a5a4020] text-[#a3b18a] border-[#a3b18a40]";
    case "ALUNO":
      return "bg-[#ffffff10] text-[#f5f5f5] border-[#ffffff20]";
    default:
      return "bg-[#ffffff10] text-[#a1a1a1] border-[#ffffff20]";
  }
}

async function fetchSession(): Promise<{ userId: string | null; role: string | null }> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    if (!res.ok) return { userId: null, role: null };
    const data = await safeJson(res);
    if (!isRecord(data)) return { userId: null, role: null };
    const user = getNestedRecord(data, "user");
    const userId = (user ? getString(user, "id") : null) ?? getString(data, "userId");
    const role = (user ? getString(user, "role") : null) ?? getString(data, "role");
    return { userId, role };
  } catch {
    return { userId: null, role: null };
  }
}

async function fetchStudents(): Promise<Student[]> {
  try {
    const res = await fetch("/api/students", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await safeJson(res);
    return extractArray(data)
      .map(normalizeStudent)
      .filter((s): s is Student => s !== null);
  } catch {
    return [];
  }
}

async function fetchTeachers(): Promise<Teacher[]> {
  try {
    const res = await fetch("/api/teachers", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await safeJson(res);
    return extractArray(data)
      .map(normalizeTeacher)
      .filter((t): t is Teacher => t !== null);
  } catch {
    return [];
  }
}

async function fetchNotices(): Promise<Notice[]> {
  try {
    const res = await fetch("/api/notices", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await safeJson(res);
    return extractArray(data)
      .map(normalizeNotice)
      .filter((n): n is Notice => n !== null)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

async function fetchQuestions(): Promise<ThreadMessage[]> {
  try {
    const res = await fetch("/api/questions", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await safeJson(res);
    return extractArray(data)
      .map(normalizeThreadMessage)
      .filter((m): m is ThreadMessage => m !== null)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

export default function GestaoPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("mural");

  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [threads, setThreads] = useState<ThreadMessage[]>([]);

  const [targetType, setTargetType] = useState<TargetType>("TODOS_ALUNOS");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [noticeTitle, setNoticeTitle] = useState<string>("");
  const [noticeContent, setNoticeContent] = useState<string>("");

  const [chatContent, setChatContent] = useState<string>("");
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const session = await fetchSession();
      const [s, t, n, q] = await Promise.all([
        fetchStudents(),
        fetchTeachers(),
        fetchNotices(),
        fetchQuestions(),
      ]);
      if (!mounted) return;
      setCurrentUserId(session.userId);
      setStudents(s);
      setTeachers(t);
      setNotices(n);
      setThreads(q);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const studentsOptions = useMemo(
    () =>
      [...students]
        .map((s) => ({ value: s.id, label: s.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [students]
  );

  const teachersOptions = useMemo(
    () =>
      [...teachers]
        .map((t) => ({ value: t.id, label: t.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [teachers]
  );

  function resetNoticesForm() {
    setNoticeTitle("");
    setNoticeContent("");
    setSelectedStudentId("");
    setSelectedTeacherId("");
  }

  async function handlePublishNotice(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const content = noticeContent.trim();
    if (!content) {
      setError("Conteúdo do aviso é obrigatório.");
      return;
    }

    let targetRole: string | null = null;
    let studentId: string | null = null;
    let professorId: string | null = null;

    if (targetType === "ALUNO_ESPECIFICO") {
      if (!selectedStudentId) {
        setError("Selecione um aluno.");
        return;
      }
      studentId = selectedStudentId;
      targetRole = "ALUNO";
    } else if (targetType === "TODOS_ALUNOS") {
      targetRole = "ALUNO";
    } else if (targetType === "PROFESSOR_ESPECIFICO") {
      if (!selectedTeacherId) {
        setError("Selecione um professor.");
        return;
      }
      professorId = selectedTeacherId;
      targetRole = "PROFESSOR";
    } else if (targetType === "TODOS_PROFESSORES") {
      targetRole = "PROFESSOR";
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: noticeTitle.trim() || "Aviso da Gestão",
          content,
          type: "MANAGEMENT",
          targetRole,
          studentId,
          professorId,
        }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        const msg = (isRecord(data) && getString(data, "message")) || "Erro ao publicar aviso.";
        setError(msg);
        return;
      }
      setSuccess("Aviso publicado com sucesso.");
      resetNoticesForm();
      const updated = await fetchNotices();
      setNotices(updated);
    } catch {
      setError("Erro de conexão ao publicar aviso.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const content = chatContent.trim();
    if (!content) {
      setError("Conteúdo da mensagem é obrigatório.");
      return;
    }
    if (!selectedStudentId) {
      setError("Selecione um aluno para enviar a mensagem.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          senderRole: "GESTOR",
          studentId: selectedStudentId,
          teacherId: selectedTeacherId || null,
        }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        const msg = (isRecord(data) && getString(data, "message")) || "Erro ao enviar mensagem.";
        setError(msg);
        return;
      }
      setSuccess("Mensagem enviada com sucesso.");
      setChatContent("");
      const updated = await fetchQuestions();
      setThreads(updated);
    } catch {
      setError("Erro de conexão ao enviar mensagem.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(question: ThreadMessage, e: FormEvent) {
    e.preventDefault();
    const replyText = (replyContent[question.id] ?? "").trim();
    if (!replyText) {
      setError("Conteúdo da resposta é obrigatório.");
      return;
    }
    if (!currentUserId) {
      setError("Sessão não carregada.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyText,
          parentId: question.id,
          studentId: question.studentId,
          teacherId: question.teacherId ?? null,
          senderRole: "GESTOR",
          answeredById: currentUserId,
        }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        const msg = (isRecord(data) && getString(data, "message")) || "Erro ao responder.";
        setError(msg);
        return;
      }
      setReplyContent((prev) => ({ ...prev, [question.id]: "" }));
      const updated = await fetchQuestions();
      setThreads(updated);
    } catch {
      setError("Erro de conexão ao responder.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderThread(thread: ThreadMessage, depth = 0) {
    const status = getThreadStatus(thread);
    return (
      <div
        key={thread.id}
        className={`rounded-lg border border-[#ffffff10] bg-[#111111] p-4 ${depth > 0 ? "ml-6 mt-3" : ""}`}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[#f5f5f5]">{getAuthorName(thread)}</span>
          <span
            className={`rounded border px-2 py-0.5 text-xs ${getRoleBadgeClass(thread.senderRole)}`}
          >
            {thread.senderRole}
          </span>
          {depth === 0 && (
            <span className={`rounded border px-2 py-0.5 text-xs ${status.className}`}>
              {status.label}
            </span>
          )}
          <span className="text-xs text-[#a1a1a1]">{formatDateTime(thread.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-[#f5f5f5]">{thread.content}</p>

        {depth === 0 && (
          <form onSubmit={(e) => handleReply(thread, e)} className="mt-3 space-y-2">
            <textarea
              value={replyContent[thread.id] ?? ""}
              onChange={(e) =>
                setReplyContent((prev) => ({ ...prev, [thread.id]: e.target.value }))
              }
              placeholder="Responder nesta thread..."
              className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] p-2 text-sm text-[#f5f5f5] placeholder:text-[#a1a1a1] focus:border-[#D4A373] focus:outline-none"
              rows={2}
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[#D4A373] px-3 py-1.5 text-sm font-semibold text-[#0a0a0a] disabled:opacity-50"
            >
              Responder
            </button>
          </form>
        )}

        {(thread.children ?? []).length > 0 && (
          <div className="mt-3">
            {(thread.children ?? []).map((child) => renderThread(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-[#f5f5f5]">Gestão</h1>

        <div className="mb-4 text-sm text-[#a1a1a1]">
          {loading
            ? "Carregando dados..."
            : `${notices.length} avisos carregados · ${threads.length} threads carregadas · ${students.length} alunos · ${teachers.length} professores`}
        </div>

        <div className="mb-6 flex gap-2 border-b border-[#ffffff10]">
          <button
            type="button"
            onClick={() => setActiveTab("mural")}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "mural"
                ? "border-b-2 border-[#D4A373] text-[#D4A373]"
                : "text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Mural
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "chat"
                ? "border-b-2 border-[#D4A373] text-[#D4A373]"
                : "text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Chat
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-[#D4A37340] bg-[#D4A37320] p-3 text-sm text-[#D4A373]">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-md border border-[#a3b18a40] bg-[#3a5a4020] p-3 text-sm text-[#a3b18a]">
            {success}
          </div>
        )}

        {activeTab === "mural" && (
          <div className="space-y-6">
            <form
              onSubmit={handlePublishNotice}
              className="space-y-4 rounded-lg border border-[#ffffff10] bg-[#111111] p-5"
            >
              <h2 className="text-lg font-semibold text-[#f5f5f5]">Novo aviso</h2>

              <div className="space-y-2">
                <label className="text-sm text-[#a1a1a1]">Destinatário</label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as TargetType)}
                  className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] p-2 text-sm text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none"
                >
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                </select>
              </div>

              {targetType === "ALUNO_ESPECIFICO" && (
                <div className="space-y-2">
                  <label className="text-sm text-[#a1a1a1]">Aluno</label>
                  {studentsOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum aluno carregado.</p>
                  ) : (
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] p-2 text-sm text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none"
                    >
                      <option value="">Selecione um aluno</option>
                      {studentsOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {targetType === "PROFESSOR_ESPECIFICO" && (
                <div className="space-y-2">
                  <label className="text-sm text-[#a1a1a1]">Professor</label>
                  {teachersOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum professor carregado.</p>
                  ) : (
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] p-2 text-sm text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none"
                    >
                      <option value="">Selecione um professor</option>
                      {teachersOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm text-[#a1a1a1]">Título</label>
                <input
                  type="text"
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  placeholder="Título do aviso"
                  className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] p-2 text-sm text-[#f5f5f5] placeholder:text-[#a1a1a1] focus:border-[#D4A373] focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#a1a1a1]">Conteúdo</label>
                <textarea
                  value={noticeContent}
                  onChange={(e) => setNoticeContent(e.target.value)}
                  placeholder="Conteúdo do aviso"
                  rows={4}
                  className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] p-2 text-sm text-[#f5f5f5] placeholder:text-[#a1a1a1] focus:border-[#D4A373] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a] disabled:opacity-50"
              >
                Publicar
              </button>
            </form>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-[#f5f5f5]">Avisos publicados</h2>
              {notices.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhum aviso publicado.</p>
              ) : (
                notices.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-lg border border-[#ffffff10] bg-[#111111] p-4"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-[#f5f5f5]">
                        {n.title ?? "Sem título"}
                      </h3>
                      {n.targetRole && (
                        <span
                          className={`rounded border px-2 py-0.5 text-xs ${getRoleBadgeClass(n.targetRole)}`}
                        >
                          {n.targetRole}
                        </span>
                      )}
                      <span className="text-xs text-[#a1a1a1]">{formatDateTime(n.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-[#f5f5f5]">{n.content}</p>
                    <div className="mt-2 text-xs text-[#a1a1a1]">
                      {n.author?.name ?? "Autor desconhecido"}
                      {n.student?.name ? ` · Aluno: ${n.student.name}` : ""}
                      {n.professor?.name ? ` · Professor: ${n.professor.name}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="space-y-6">
            <form
              onSubmit={handleSendChat}
              className="space-y-4 rounded-lg border border-[#ffffff10] bg-[#111111] p-5"
            >
              <h2 className="text-lg font-semibold text-[#f5f5f5]">Nova mensagem</h2>

              <div className="space-y-2">
                <label className="text-sm text-[#a1a1a1]">Aluno</label>
                {studentsOptions.length === 0 ? (
                  <p className="text-sm text-[#a1a1a1]">Nenhum aluno carregado.</p>
                ) : (
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] p-2 text-sm text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none"
                  >
                    <option value="">Selecione um aluno</option>
                    {studentsOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#a1a1a1]">Professor (opcional)</label>
                {teachersOptions.length === 0 ? (
                  <p className="text-sm text-[#a1a1a1]">Nenhum professor carregado.</p>
                ) : (
                  <select
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] p-2 text-sm text-[#f5f5f5] focus:border-[#D4A373] focus:outline-none"
                  >
                    <option value="">Selecione um professor</option>
                    {teachersOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#a1a1a1]">Conteúdo</label>
                <textarea
                  value={chatContent}
                  onChange={(e) => setChatContent(e.target.value)}
                  placeholder="Conteúdo da mensagem"
                  rows={3}
                  className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] p-2 text-sm text-[#f5f5f5] placeholder:text-[#a1a1a1] focus:border-[#D4A373] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a] disabled:opacity-50"
              >
                Enviar
              </button>
            </form>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-[#f5f5f5]">Threads</h2>
              {threads.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhuma thread encontrada.</p>
              ) : (
                threads.map((t) => renderThread(t, 0))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';
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
  studentId?: string | null;
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

function getString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function getStringFromRecord(record: Record<string, unknown>, key: string): string | null {
  if (!(key in record)) return null;
  return getString(record[key]);
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findFirstArray(value: unknown, depth = 0): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (depth > 4 || !isRecord(value)) return null;
  for (const key of Object.keys(value)) {
    const found = findFirstArray((value as Record<string, unknown>)[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function extractArray(data: unknown, candidateKeys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  for (const key of candidateKeys) {
    if (key in data) {
      const value = data[key];
      if (Array.isArray(value)) return value;
      const nested = findFirstArray(value, 0);
      if (nested) return nested;
    }
  }
  const nested = findFirstArray(data, 0);
  return nested ?? [];
}

function normalizeStudent(item: unknown): Student | null {
  if (!isRecord(item)) return null;
  const studentNested = getNestedRecord(item, "student");
  const userNested = getNestedRecord(item, "user");

  const id =
    getStringFromRecord(item, "id") ||
    (studentNested ? getStringFromRecord(studentNested, "id") : null) ||
    getStringFromRecord(item, "studentId") ||
    getStringFromRecord(item, "userId") ||
    (userNested ? getStringFromRecord(userNested, "id") : null);

  const name =
    getStringFromRecord(item, "name") ||
    (studentNested ? getStringFromRecord(studentNested, "name") : null) ||
    getStringFromRecord(item, "studentName") ||
    (userNested ? getStringFromRecord(userNested, "name") : null) ||
    getStringFromRecord(item, "nome");

  if (!id || !name) return null;
  return {
    id,
    name,
    userId: getStringFromRecord(item, "userId") || (userNested ? getStringFromRecord(userNested, "id") : null),
    user: userNested ? { id: String(userNested.id ?? ""), name: getStringFromRecord(userNested, "name") } : null,
  };
}

function normalizeTeacher(item: unknown): Teacher | null {
  if (!isRecord(item)) return null;
  const userNested = getNestedRecord(item, "user");
  const teacherNested = getNestedRecord(item, "teacher");

  const id =
    getStringFromRecord(item, "userId") ||
    (userNested ? getStringFromRecord(userNested, "id") : null) ||
    getStringFromRecord(item, "id");

  const name =
    getStringFromRecord(item, "name") ||
    (userNested ? getStringFromRecord(userNested, "name") : null) ||
    getStringFromRecord(item, "teacherName") ||
    (teacherNested ? getStringFromRecord(teacherNested, "name") : null) ||
    getStringFromRecord(item, "nome");

  if (!id || !name) return null;
  return {
    id,
    name,
    email: getStringFromRecord(item, "email") || (userNested ? getStringFromRecord(userNested, "email") : null),
    userId: getStringFromRecord(item, "userId") || (userNested ? getStringFromRecord(userNested, "id") : null),
    user: userNested ? { id: String(userNested.id ?? ""), name: getStringFromRecord(userNested, "name"), email: getStringFromRecord(userNested, "email") } : null,
    _count: isRecord(item._count) ? { students: Number(item._count.students ?? 0) } : undefined,
  };
}

function normalizeNotice(item: unknown): Notice | null {
  if (!isRecord(item)) return null;
  const id = getStringFromRecord(item, "id");
  const content = getStringFromRecord(item, "content");
  if (!id || !content) return null;
  const authorNested = getNestedRecord(item, "author");
  const studentNested = getNestedRecord(item, "student");
  const professorNested = getNestedRecord(item, "professor");
  return {
    id,
    title: getStringFromRecord(item, "title"),
    content,
    type: getStringFromRecord(item, "type"),
    authorId: getStringFromRecord(item, "authorId"),
    studentId: getStringFromRecord(item, "studentId"),
    targetRole: getStringFromRecord(item, "targetRole"),
    professorId: getStringFromRecord(item, "professorId"),
    createdAt: getStringFromRecord(item, "createdAt") || new Date().toISOString(),
    author: authorNested ? { id: String(authorNested.id ?? ""), name: getStringFromRecord(authorNested, "name"), role: getStringFromRecord(authorNested, "role") } : null,
    student: studentNested ? { id: String(studentNested.id ?? ""), name: getStringFromRecord(studentNested, "name") || "Aluno" } : null,
    professor: professorNested ? { id: String(professorNested.id ?? ""), name: getStringFromRecord(professorNested, "name") } : null,
  };
}

function normalizeThreadMessage(item: unknown): ThreadMessage | null {
  if (!isRecord(item)) return null;
  const id = getStringFromRecord(item, "id");
  const content = getStringFromRecord(item, "content");
  if (!id || !content) return null;
  const answeredByNested = getNestedRecord(item, "answeredBy");
  const studentNested = getNestedRecord(item, "student");
  const teacherNested = getNestedRecord(item, "teacher");
  const childrenRaw = item.children;
  const children = Array.isArray(childrenRaw)
    ? childrenRaw.map(normalizeThreadMessage).filter((m): m is ThreadMessage => m !== null)
    : undefined;
  return {
    id,
    studentId: getStringFromRecord(item, "studentId"),
    teacherId: getStringFromRecord(item, "teacherId"),
    content,
    senderRole: getStringFromRecord(item, "senderRole") || "GESTOR",
    createdAt: getStringFromRecord(item, "createdAt") || new Date().toISOString(),
    answeredBy: answeredByNested ? { id: String(answeredByNested.id ?? ""), name: getStringFromRecord(answeredByNested, "name"), role: getStringFromRecord(answeredByNested, "role") } : null,
    student: studentNested ? { id: String(studentNested.id ?? ""), name: getStringFromRecord(studentNested, "name") || "Aluno" } : null,
    teacher: teacherNested ? { id: String(teacherNested.id ?? ""), name: getStringFromRecord(teacherNested, "name") } : null,
    children,
  };
}

function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of list) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateStr;
  }
}

function getThreadStatus(thread: ThreadMessage): string {
  if (thread.answeredBy) return "Respondido";
  if (thread.senderRole === "GESTOR") return "Enviado";
  return "Pendente";
}

function getAuthorName(msg: ThreadMessage): string {
  if (msg.answeredBy?.name) return msg.answeredBy.name;
  if (msg.senderRole === "GESTOR") return "Gestão";
  if (msg.senderRole === "PROFESSOR") return msg.teacher?.name || "Professor";
  if (msg.senderRole === "ALUNO") return msg.student?.name || "Aluno";
  return "Desconhecido";
}

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case "GESTOR":
      return "bg-[#D4A373]/20 text-[#D4A373] border-[#D4A373]/30";
    case "PROFESSOR":
      return "bg-[#3a6ea5]/20 text-[#7fb3ff] border-[#3a6ea5]/30";
    case "ALUNO":
      return "bg-[#3a8a5d]/20 text-[#7fd9a1] border-[#3a8a5d]/30";
    default:
      return "bg-[#ffffff10] text-[#a1a1a1] border-[#ffffff10]";
  }
}

export default function GestaoPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("mural");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [targetType, setTargetType] = useState<TargetType>("TODOS_ALUNOS");
  const [chatTargetType, setChatTargetType] = useState<TargetType>("TODOS_ALUNOS");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [chatSelectedStudentId, setChatSelectedStudentId] = useState<string>("");
  const [chatSelectedTeacherId, setChatSelectedTeacherId] = useState<string>("");

  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [questions, setQuestions] = useState<ThreadMessage[]>([]);

  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");
  const [savingNotice, setSavingNotice] = useState(false);
  const [noticeSuccess, setNoticeSuccess] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);

  const [chatContent, setChatContent] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [chatSuccess, setChatSuccess] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  const studentsOptions = useMemo(() => dedupeById(students), [students]);
  const teachersOptions = useMemo(() => dedupeById(teachers), [teachers]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok) return;
        const data = await safeJson(res);
        if (!isRecord(data)) return;
        const id = getStringFromRecord(data, "userId") || getStringFromRecord(data, "id");
        if (mounted && id) setCurrentUserId(id);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/students", { cache: "no-store" });
        if (!res.ok) return;
        const data = await safeJson(res);
        const list = extractArray(data, ["students", "items", "results", "data", "rows", "records", "alunos"])
          .map(normalizeStudent)
          .filter((s): s is Student => s !== null);
        if (mounted) setStudents(list);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/teachers", { cache: "no-store" });
        if (!res.ok) return;
        const data = await safeJson(res);
        const list = extractArray(data, ["teachers", "items", "results", "data", "rows", "records", "professores"])
          .map(normalizeTeacher)
          .filter((t): t is Teacher => t !== null);
        if (mounted) setTeachers(list);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const fetchNotices = async () => {
    try {
      const res = await fetch("/api/notices", { cache: "no-store" });
      if (!res.ok) return;
      const data = await safeJson(res);
      const list = extractArray(data, ["notices", "items", "results", "data", "rows", "records"])
        .map(normalizeNotice)
        .filter((n): n is Notice => n !== null);
      setNotices(list);
    } catch {
      /* ignore */
    }
  };

  const fetchQuestions = async () => {
    try {
      const res = await fetch("/api/questions", { cache: "no-store" });
      if (!res.ok) return;
      const data = await safeJson(res);
      const list = extractArray(data, ["questions", "items", "results", "data", "rows", "records"])
        .map(normalizeThreadMessage)
        .filter((q): q is ThreadMessage => q !== null);
      setQuestions(list);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchNotices();
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const handlePublishNotice = async (e: FormEvent) => {
    e.preventDefault();
    setNoticeSuccess(null);
    setNoticeError(null);

    if (!noticeTitle.trim() || !noticeContent.trim()) {
      setNoticeError("Preencha título e conteúdo.");
      return;
    }

    let studentId: string | null = null;
    let professorId: string | null = null;

    if (targetType === "ALUNO_ESPECIFICO") {
      if (!selectedStudentId) {
        setNoticeError("Selecione um aluno.");
        return;
      }
      studentId = selectedStudentId;
    } else if (targetType === "PROFESSOR_ESPECIFICO") {
      if (!selectedTeacherId) {
        setNoticeError("Selecione um professor.");
        return;
      }
      professorId = selectedTeacherId;
    }

    setSavingNotice(true);
    try {
      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: noticeTitle,
          content: noticeContent,
          type: "MANAGEMENT",
          targetRole: targetType,
          studentId,
          professorId,
          authorId: currentUserId,
        }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        setNoticeError(getStringFromRecord(data ?? {}, "error") || "Erro ao publicar aviso.");
        return;
      }
      setNoticeSuccess("Aviso publicado com sucesso.");
      setNoticeTitle("");
      setNoticeContent("");
      await fetchNotices();
    } catch {
      setNoticeError("Erro de conexão ao publicar aviso.");
    } finally {
      setSavingNotice(false);
    }
  };

  const handleSendChat = async (e: FormEvent) => {
    e.preventDefault();
    setChatSuccess(null);
    setChatError(null);

    if (!chatContent.trim()) {
      setChatError("Digite uma mensagem.");
      return;
    }

    let studentId: string | null = null;
    let teacherId: string | null = null;

    if (chatTargetType === "ALUNO_ESPECIFICO") {
      if (!chatSelectedStudentId) {
        setChatError("Selecione um aluno.");
        return;
      }
      studentId = chatSelectedStudentId;
      teacherId = null;
    } else if (chatTargetType === "TODOS_ALUNOS") {
      studentId = null;
      teacherId = null;
    } else if (chatTargetType === "PROFESSOR_ESPECIFICO") {
      if (!chatSelectedTeacherId) {
        setChatError("Selecione um professor.");
        return;
      }
      teacherId = chatSelectedTeacherId;
      studentId = null;
    } else if (chatTargetType === "TODOS_PROFESSORES") {
      teacherId = null;
      studentId = null;
    }

    setSendingChat(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: chatContent,
          senderRole: "GESTOR",
          studentId,
          teacherId,
        }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        setChatError(getStringFromRecord(data ?? {}, "error") || "Erro ao enviar mensagem.");
        return;
      }
      setChatSuccess("Mensagem enviada com sucesso.");
      setChatContent("");
      await fetchQuestions();
    } catch {
      setChatError("Erro de conexão ao enviar mensagem.");
    } finally {
      setSendingChat(false);
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim()) return;

    const parent = questions.find((q) => q.id === parentId);
    const studentId = parent?.studentId ?? null;
    const teacherId = parent?.teacherId ?? null;

    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyContent,
          parentId,
          studentId,
          teacherId,
          senderRole: "GESTOR",
          answeredById: currentUserId,
        }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        setChatError(getStringFromRecord(data ?? {}, "error") || "Erro ao responder.");
        return;
      }
      setReplyContent("");
      setExpandedQuestion(null);
      await fetchQuestions();
    } catch {
      setChatError("Erro de conexão ao responder.");
    }
  };

  const renderThread = (messages: ThreadMessage[], depth = 0) => (
    <div className={depth > 0 ? "ml-4 border-l border-[#ffffff10] pl-3 mt-2 space-y-2" : "space-y-2"}>
      {messages.map((msg) => (
        <div key={msg.id} className="rounded-md border border-[#ffffff10] bg-[#111111] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded border ${getRoleBadgeClass(msg.senderRole)}`}>
                {msg.senderRole}
              </span>
              <span className="text-sm text-[#f5f5f5]">{getAuthorName(msg)}</span>
            </div>
            <span className="text-[10px] text-[#a1a1a1]">{formatDateTime(msg.createdAt)}</span>
          </div>
          <p className="text-sm text-[#f5f5f5] mt-2 whitespace-pre-wrap">{msg.content}</p>
          {msg.children && msg.children.length > 0 ? renderThread(msg.children, depth + 1) : null}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">Gestão</h1>
        <p className="text-sm text-[#a1a1a1] mb-6">
          {studentsOptions.length} aluno(s) e {teachersOptions.length} professor(es) carregados.
        </p>

        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab("mural")}
            className={`px-4 py-2 rounded-md text-sm border transition ${
              activeTab === "mural"
                ? "bg-[#D4A373] text-[#0a0a0a] border-[#D4A373]"
                : "bg-[#111111] text-[#f5f5f5] border-[#ffffff10] hover:border-[#D4A373]/40"
            }`}
          >
            Mural
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 rounded-md text-sm border transition ${
              activeTab === "chat"
                ? "bg-[#D4A373] text-[#0a0a0a] border-[#D4A373]"
                : "bg-[#111111] text-[#f5f5f5] border-[#ffffff10] hover:border-[#D4A373]/40"
            }`}
          >
            Chat
          </button>
        </div>

        {activeTab === "mural" && (
          <section className="space-y-6">
            <form onSubmit={handlePublishNotice} className="space-y-4 bg-[#111111] border border-[#ffffff10] rounded-lg p-5">
              <div>
                <label className="block text-sm text-[#a1a1a1] mb-1">Destinatário</label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as TargetType)}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                >
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                </select>
              </div>

              {targetType === "ALUNO_ESPECIFICO" &&
                (studentsOptions.length === 0 ? (
                  <p className="text-sm text-[#a1a1a1]">Nenhum aluno carregado.</p>
                ) : (
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Aluno</label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                    >
                      <option value="">Selecione...</option>
                      {studentsOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                ))}

              {targetType === "PROFESSOR_ESPECIFICO" &&
                (teachersOptions.length === 0 ? (
                  <p className="text-sm text-[#a1a1a1]">Nenhum professor carregado.</p>
                ) : (
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Professor</label>
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                    >
                      <option value="">Selecione...</option>
                      {teachersOptions.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                ))}

              <div>
                <label className="block text-sm text-[#a1a1a1] mb-1">Título</label>
                <input
                  type="text"
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                />
              </div>

              <div>
                <label className="block text-sm text-[#a1a1a1] mb-1">Conteúdo</label>
                <textarea
                  value={noticeContent}
                  onChange={(e) => setNoticeContent(e.target.value)}
                  rows={4}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                />
              </div>

              {noticeError && <p className="text-sm text-red-400">{noticeError}</p>}
              {noticeSuccess && <p className="text-sm text-[#D4A373]">{noticeSuccess}</p>}

              <button
                type="submit"
                disabled={savingNotice}
                className="px-4 py-2 rounded-md bg-[#D4A373] text-[#0a0a0a] text-sm font-medium disabled:opacity-50"
              >
                {savingNotice ? "Publicando..." : "Publicar"}
              </button>
            </form>

            <div className="space-y-3">
              <h2 className="text-lg font-medium">Avisos publicados</h2>
              {notices.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhum aviso publicado.</p>
              ) : (
                notices.map((n) => (
                  <div key={n.id} className="rounded-lg border border-[#ffffff10] bg-[#111111] p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-[#f5f5f5]">{n.title || "Sem título"}</h3>
                      <span className="text-[10px] text-[#a1a1a1]">{formatDateTime(n.createdAt)}</span>
                    </div>
                    <p className="text-sm text-[#a1a1a1] mt-2 whitespace-pre-wrap">{n.content}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                      {n.targetRole && (
                        <span className="px-2 py-0.5 rounded border border-[#ffffff10] text-[#a1a1a1]">{n.targetRole}</span>
                      )}
                      {n.student && (
                        <span className="px-2 py-0.5 rounded border border-[#ffffff10] text-[#a1a1a1]">Aluno: {n.student.name}</span>
                      )}
                      {n.professor && (
                        <span className="px-2 py-0.5 rounded border border-[#ffffff10] text-[#a1a1a1]">Professor: {n.professor.name}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === "chat" && (
          <section className="space-y-6">
            <form onSubmit={handleSendChat} className="space-y-4 bg-[#111111] border border-[#ffffff10] rounded-lg p-5">
              <div>
                <label className="block text-sm text-[#a1a1a1] mb-1">Destinatário</label>
                <select
                  value={chatTargetType}
                  onChange={(e) => setChatTargetType(e.target.value as TargetType)}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                >
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                </select>
              </div>

              {chatTargetType === "ALUNO_ESPECIFICO" &&
                (studentsOptions.length === 0 ? (
                  <p className="text-sm text-[#a1a1a1]">Nenhum aluno carregado.</p>
                ) : (
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Aluno</label>
                    <select
                      value={chatSelectedStudentId}
                      onChange={(e) => setChatSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                    >
                      <option value="">Selecione...</option>
                      {studentsOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                ))}

              {chatTargetType === "PROFESSOR_ESPECIFICO" &&
                (teachersOptions.length === 0 ? (
                  <p className="text-sm text-[#a1a1a1]">Nenhum professor carregado.</p>
                ) : (
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Professor</label>
                    <select
                      value={chatSelectedTeacherId}
                      onChange={(e) => setChatSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                    >
                      <option value="">Selecione...</option>
                      {teachersOptions.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                ))}

              <div>
                <label className="block text-sm text-[#a1a1a1] mb-1">Conteúdo</label>
                <textarea
                  value={chatContent}
                  onChange={(e) => setChatContent(e.target.value)}
                  rows={3}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                />
              </div>

              {chatError && <p className="text-sm text-red-400">{chatError}</p>}
              {chatSuccess && <p className="text-sm text-[#D4A373]">{chatSuccess}</p>}

              <button
                type="submit"
                disabled={sendingChat}
                className="px-4 py-2 rounded-md bg-[#D4A373] text-[#0a0a0a] text-sm font-medium disabled:opacity-50"
              >
                {sendingChat ? "Enviando..." : "Enviar"}
              </button>
            </form>

            <div className="space-y-3">
              <h2 className="text-lg font-medium">Conversas</h2>
              {questions.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhuma mensagem.</p>
              ) : (
                questions.map((q) => (
                  <div key={q.id} className="rounded-lg border border-[#ffffff10] bg-[#111111] p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${getRoleBadgeClass(q.senderRole)}`}>
                          {q.senderRole}
                        </span>
                        <span className="text-sm text-[#f5f5f5]">{getAuthorName(q)}</span>
                        <span className="text-[10px] text-[#a1a1a1]">{getThreadStatus(q)}</span>
                      </div>
                      <span className="text-[10px] text-[#a1a1a1]">{formatDateTime(q.createdAt)}</span>
                    </div>
                    <p className="text-sm text-[#f5f5f5] mt-2 whitespace-pre-wrap">{q.content}</p>

                    {q.children && q.children.length > 0 ? renderThread(q.children, 1) : null}

                    {expandedQuestion === q.id ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          rows={2}
                          className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleReply(q.id)}
                            className="px-3 py-1.5 rounded-md bg-[#D4A373] text-[#0a0a0a] text-xs font-medium"
                          >
                            Responder
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedQuestion(null);
                              setReplyContent("");
                            }}
                            className="px-3 py-1.5 rounded-md border border-[#ffffff10] text-[#a1a1a1] text-xs"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedQuestion(q.id);
                          setReplyContent("");
                        }}
                        className="mt-3 text-xs text-[#D4A373] hover:underline"
                      >
                        Continuar conversa
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

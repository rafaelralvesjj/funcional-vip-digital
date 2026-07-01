use client";
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

function getString(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const v = value[key];
  if (typeof v === "string" && v.trim().length > 0) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
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
  if (!isRecord(value) || depth > 4) return null;
  for (const key of Object.keys(value)) {
    const found = findFirstArray(value[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function extractArray(data: unknown, candidateKeys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  for (const key of candidateKeys) {
    const v = data[key];
    if (Array.isArray(v)) return v;
  }
  const nestedKeys = ["data", "result", "payload", "response"];
  for (const nestedKey of nestedKeys) {
    const nested = data[nestedKey];
    if (Array.isArray(nested)) return nested;
    if (isRecord(nested)) {
      for (const key of candidateKeys) {
        const v = nested[key];
        if (Array.isArray(v)) return v;
      }
      const deeper = findFirstArray(nested, 2);
      if (deeper) return deeper;
    }
  }
  const deep = findFirstArray(data, 1);
  return deep || [];
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
    (userNested ? getString(userNested, "name") : null) ||
    getString(item, "nome");

  if (!id || !name) return null;
  return {
    id,
    name,
    userId: getString(item, "userId") || (userNested ? getString(userNested, "id") : null),
    user: userNested
      ? { id: String(userNested.id ?? ""), name: userNested.name ?? null }
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
    (teacherNested ? getString(teacherNested, "name") : null) ||
    getString(item, "nome");

  if (!id || !name) return null;
  return {
    id,
    name,
    email: getString(item, "email") || (userNested ? getString(userNested, "email") : null),
    userId: getString(item, "userId") || (userNested ? getString(userNested, "id") : null),
    user: userNested
      ? { id: String(userNested.id ?? ""), name: userNested.name ?? null, email: userNested.email ?? null }
      : null,
    _count: undefined,
  };
}

function normalizeNotice(item: unknown): Notice | null {
  if (!isRecord(item)) return null;
  const id = getString(item, "id");
  const content = getString(item, "content");
  if (!id || !content) return null;
  const author = getNestedRecord(item, "author");
  const student = getNestedRecord(item, "student");
  const professor = getNestedRecord(item, "professor");
  return {
    id,
    title: getString(item, "title"),
    content,
    type: getString(item, "type"),
    authorId: getString(item, "authorId"),
    studentId: getString(item, "studentId"),
    targetRole: getString(item, "targetRole"),
    professorId: getString(item, "professorId"),
    createdAt: getString(item, "createdAt") || new Date().toISOString(),
    author: author
      ? { id: String(author.id ?? ""), name: author.name ?? null, role: author.role ?? null }
      : null,
    student: student ? { id: String(student.id ?? ""), name: String(student.name ?? "") } : null,
    professor: professor ? { id: String(professor.id ?? ""), name: professor.name ?? null } : null,
  };
}

function normalizeThreadMessage(item: unknown): ThreadMessage | null {
  if (!isRecord(item)) return null;
  const id = getString(item, "id");
  const content = getString(item, "content");
  if (!id || !content) return null;
  const answeredBy = getNestedRecord(item, "answeredBy");
  const student = getNestedRecord(item, "student");
  const teacher = getNestedRecord(item, "teacher");
  const childrenRaw = item["children"];
  const children = Array.isArray(childrenRaw)
    ? childrenRaw.map(normalizeThreadMessage).filter((m): m is ThreadMessage => m !== null)
    : [];
  return {
    id,
    studentId: getString(item, "studentId"),
    teacherId: getString(item, "teacherId"),
    content,
    senderRole: getString(item, "senderRole") || "GESTOR",
    createdAt: getString(item, "createdAt") || new Date().toISOString(),
    answeredBy: answeredBy
      ? { id: String(answeredBy.id ?? ""), name: answeredBy.name ?? null, role: answeredBy.role ?? null }
      : null,
    student: student ? { id: String(student.id ?? ""), name: String(student.name ?? "") } : null,
    teacher: teacher ? { id: String(teacher.id ?? ""), name: teacher.name ?? null } : null,
    children,
  };
}

function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    if (!item || !item.id) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
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

function getThreadStatus(thread: ThreadMessage[]): { answered: boolean; total: number } {
  const total = thread.length;
  const answered = thread.some((m) => m.answeredBy !== null && m.answeredBy !== undefined);
  return { answered, total };
}

function getAuthorName(msg: ThreadMessage): string {
  if (msg.answeredBy?.name) return msg.answeredBy.name;
  if (msg.student?.name) return msg.student.name;
  if (msg.teacher?.name) return msg.teacher.name;
  if (msg.senderRole === "GESTOR") return "Gestão";
  if (msg.senderRole === "TEACHER") return "Professor";
  if (msg.senderRole === "STUDENT") return "Aluno";
  return "Desconhecido";
}

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case "GESTOR":
      return "bg-[#D4A37320] text-[#D4A373] border-[#D4A37340]";
    case "TEACHER":
      return "bg-[#3a5a4020] text-[#a3b18a] border-[#a3b18a40]";
    case "STUDENT":
      return "bg-[#58815720] text-[#b5e48c] border-[#b5e48c40]";
    default:
      return "bg-[#ffffff10] text-[#a1a1a1] border-[#ffffff20]";
  }
}

export default function GestaoPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("mural");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [targetType, setTargetType] = useState<TargetType>("TODOS_ALUNOS");
  const [chatTargetType, setChatTargetType] = useState<TargetType>("TODOS_ALUNOS");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");

  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [questions, setQuestions] = useState<ThreadMessage[]>([]);

  const [noticeTitle, setNoticeTitle] = useState<string>("");
  const [noticeContent, setNoticeContent] = useState<string>("");
  const [savingNotice, setSavingNotice] = useState<boolean>(false);
  const [noticeSuccess, setNoticeSuccess] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);

  const [chatContent, setChatContent] = useState<string>("");
  const [sendingChat, setSendingChat] = useState<boolean>(false);
  const [chatSuccess, setChatSuccess] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});

  const studentsOptions = useMemo(() => students, [students]);
  const teachersOptions = useMemo(() => teachers, [teachers]);

  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      try {
        const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
        if (sessionRes.ok) {
          const data = await safeJson(sessionRes);
          if (isRecord(data)) {
            const uid = getString(data, "userId") || getString(data, "id");
            if (uid && mounted) setCurrentUserId(uid);
          }
        }
      } catch {
        /* ignore */
      }

      try {
        const res = await fetch("/api/students", { cache: "no-store" });
        if (res.ok) {
          const data = await safeJson(res);
          const arr = extractArray(data, ["students", "items", "results", "data", "rows", "records", "alunos"]);
          const normalized = arr.map(normalizeStudent).filter((s): s is Student => s !== null);
          if (mounted) setStudents(dedupeById(normalized));
        }
      } catch {
        /* ignore */
      }

      try {
        const res = await fetch("/api/teachers", { cache: "no-store" });
        if (res.ok) {
          const data = await safeJson(res);
          const arr = extractArray(data, ["teachers", "items", "results", "data", "rows", "records", "professores"]);
          const normalized = arr.map(normalizeTeacher).filter((t): t is Teacher => t !== null);
          if (mounted) setTeachers(dedupeById(normalized));
        }
      } catch {
        /* ignore */
      }

      try {
        const res = await fetch("/api/notices", { cache: "no-store" });
        if (res.ok) {
          const data = await safeJson(res);
          const arr = extractArray(data, ["notices", "items", "results", "data", "rows", "records"]);
          const normalized = arr.map(normalizeNotice).filter((n): n is Notice => n !== null);
          if (mounted) setNotices(normalized);
        }
      } catch {
        /* ignore */
      }

      try {
        const res = await fetch("/api/questions", { cache: "no-store" });
        if (res.ok) {
          const data = await safeJson(res);
          const arr = extractArray(data, ["questions", "items", "results", "data", "rows", "records"]);
          const normalized = arr.map(normalizeThreadMessage).filter((q): q is ThreadMessage => q !== null);
          if (mounted) setQuestions(normalized);
        }
      } catch {
        /* ignore */
      }
    }
    loadAll();
    return () => {
      mounted = false;
    };
  }, []);

  async function reloadQuestions() {
    try {
      const res = await fetch("/api/questions", { cache: "no-store" });
      if (res.ok) {
        const data = await safeJson(res);
        const arr = extractArray(data, ["questions", "items", "results", "data", "rows", "records"]);
        const normalized = arr.map(normalizeThreadMessage).filter((q): q is ThreadMessage => q !== null);
        setQuestions(normalized);
      }
    } catch {
      /* ignore */
    }
  }

  async function handlePublishNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeSuccess(null);
    setNoticeError(null);

    if (!noticeContent.trim()) {
      setNoticeError("O conteúdo do aviso é obrigatório.");
      return;
    }

    let targetRole: string = "STUDENT";
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
      if (!res.ok) {
        const data = await safeJson(res);
        const msg = (isRecord(data) && getString(data, "error")) || "Falha ao publicar aviso.";
        setNoticeError(msg);
        return;
      }
      setNoticeSuccess("Aviso publicado com sucesso.");
      setNoticeTitle("");
      setNoticeContent("");
      try {
        const r = await fetch("/api/notices", { cache: "no-store" });
        if (r.ok) {
          const data = await safeJson(r);
          const arr = extractArray(data, ["notices", "items", "results", "data", "rows", "records"]);
          const normalized = arr.map(normalizeNotice).filter((n): n is Notice => n !== null);
          setNotices(normalized);
        }
      } catch {
        /* ignore */
      }
    } catch {
      setNoticeError("Erro de conexão ao publicar aviso.");
    } finally {
      setSavingNotice(false);
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    setChatSuccess(null);
    setChatError(null);

    if (!chatContent.trim()) {
      setChatError("O conteúdo da mensagem é obrigatório.");
      return;
    }

    const targets: { studentId: string | null; teacherId: string | null }[] = [];

    if (chatTargetType === "TODOS_ALUNOS") {
      if (students.length === 0) {
        setChatError("Nenhum aluno carregado.");
        return;
      }
      for (const s of students) targets.push({ studentId: s.id, teacherId: null });
    } else if (chatTargetType === "ALUNO_ESPECIFICO") {
      if (!selectedStudentId) {
        setChatError("Selecione um aluno.");
        return;
      }
      targets.push({ studentId: selectedStudentId, teacherId: null });
    } else if (chatTargetType === "TODOS_PROFESSORES") {
      if (teachers.length === 0) {
        setChatError("Nenhum professor carregado.");
        return;
      }
      for (const t of teachers) targets.push({ studentId: null, teacherId: t.id });
    } else if (chatTargetType === "PROFESSOR_ESPECIFICO") {
      if (!selectedTeacherId) {
        setChatError("Selecione um professor.");
        return;
      }
      targets.push({ studentId: null, teacherId: selectedTeacherId });
    }

    setSendingChat(true);
    let success = 0;
    let failures = 0;

    for (const target of targets) {
      try {
        const res = await fetch("/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: chatContent.trim(),
            senderRole: "GESTOR",
            studentId: target.studentId,
            teacherId: target.teacherId,
          }),
        });
        if (res.ok) {
          success++;
        } else {
          failures++;
        }
      } catch {
        failures++;
      }
    }

    setSendingChat(false);

    if (success > 0 && failures === 0) {
      setChatSuccess(success === 1 ? "Mensagem enviada com sucesso." : "Mensagens enviadas com sucesso.");
      setChatContent("");
      await reloadQuestions();
    } else if (success > 0 && failures > 0) {
      setChatSuccess(`Envio parcial: ${success} mensagem(ns) enviada(s), ${failures} falha(s).`);
      await reloadQuestions();
    } else {
      setChatError("Falha ao enviar mensagem(ns).");
    }
  }

  async function handleReply(question: ThreadMessage, e: FormEvent) {
    e.preventDefault();
    const text = (replyContent[question.id] || "").trim();
    if (!text) return;
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          parentId: question.id,
          studentId: question.studentId,
          teacherId: question.teacherId,
          senderRole: "GESTOR",
          answeredById: currentUserId,
        }),
      });
      if (res.ok) {
        setReplyContent((prev) => ({ ...prev, [question.id]: "" }));
        setExpandedQuestion(null);
        await reloadQuestions();
      }
    } catch {
      /* ignore */
    }
  }

  const threads = useMemo(() => {
    const roots = questions.filter((q) => !q.children || q.children.length === 0 || true);
    return roots.map((q) => {
      const thread = [q, ...(q.children || [])].sort((a, b) => {
        const da = new Date(a.createdAt).getTime();
        const db = new Date(b.createdAt).getTime();
        return da - db;
      });
      return thread;
    });
  }, [questions]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Gestão</h1>
        <p className="text-[#a1a1a1] text-sm mb-6">
          {students.length} aluno(s) carregado(s) · {teachers.length} professor(es) carregado(s)
        </p>

        <div className="flex gap-2 mb-6 border-b border-[#ffffff10]">
          <button
            type="button"
            onClick={() => setActiveTab("mural")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
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
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "chat"
                ? "text-[#D4A373] border-b-2 border-[#D4A373]"
                : "text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Chat
          </button>
        </div>

        {activeTab === "mural" && (
          <section className="space-y-6">
            <form onSubmit={handlePublishNotice} className="bg-[#111111] border border-[#ffffff10] rounded-lg p-6 space-y-4">
              <div>
                <label className="block text-sm text-[#a1a1a1] mb-2">Destinatário</label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as TargetType)}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                >
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                </select>
              </div>

              {targetType === "ALUNO_ESPECIFICO" && (
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-2">Aluno</label>
                  {studentsOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum aluno carregado.</p>
                  ) : (
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione um aluno</option>
                      {studentsOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {targetType === "PROFESSOR_ESPECIFICO" && (
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-2">Professor</label>
                  {teachersOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum professor carregado.</p>
                  ) : (
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione um professor</option>
                      {teachersOptions.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm text-[#a1a1a1] mb-2">Título</label>
                <input
                  type="text"
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  placeholder="Título do aviso"
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                />
              </div>

              <div>
                <label className="block text-sm text-[#a1a1a1] mb-2">Conteúdo</label>
                <textarea
                  value={noticeContent}
                  onChange={(e) => setNoticeContent(e.target.value)}
                  placeholder="Conteúdo do aviso"
                  rows={5}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373] resize-y"
                />
              </div>

              {noticeError && <p className="text-sm text-red-400">{noticeError}</p>}
              {noticeSuccess && <p className="text-sm text-[#D4A373]">{noticeSuccess}</p>}

              <button
                type="submit"
                disabled={savingNotice}
                className="bg-[#D4A373] text-[#0a0a0a] font-semibold px-5 py-2 rounded hover:bg-[#c89a5f] transition-colors disabled:opacity-50"
              >
                {savingNotice ? "Publicando..." : "Publicar"}
              </button>
            </form>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Avisos publicados</h2>
              {notices.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhum aviso publicado.</p>
              ) : (
                notices.map((n) => (
                  <div key={n.id} className="bg-[#111111] border border-[#ffffff10] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-[#D4A373]">{n.title || "Aviso da Gestão"}</span>
                      <span className="text-xs text-[#a1a1a1]">{formatDateTime(n.createdAt)}</span>
                    </div>
                    <p className="text-sm text-[#f5f5f5] whitespace-pre-wrap">{n.content}</p>
                    <div className="mt-2 text-xs text-[#a1a1a1]">
                      {n.targetRole === "TEACHER" ? "Professores" : "Alunos"}
                      {n.student?.name ? ` · ${n.student.name}` : ""}
                      {n.professor?.name ? ` · ${n.professor.name}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === "chat" && (
          <section className="space-y-6">
            <form onSubmit={handleSendChat} className="bg-[#111111] border border-[#ffffff10] rounded-lg p-6 space-y-4">
              <div>
                <label className="block text-sm text-[#a1a1a1] mb-2">Destinatário</label>
                <select
                  value={chatTargetType}
                  onChange={(e) => setChatTargetType(e.target.value as TargetType)}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                >
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                </select>
              </div>

              {chatTargetType === "ALUNO_ESPECIFICO" && (
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-2">Aluno</label>
                  {studentsOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum aluno carregado.</p>
                  ) : (
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione um aluno</option>
                      {studentsOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {chatTargetType === "PROFESSOR_ESPECIFICO" && (
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-2">Professor</label>
                  {teachersOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum professor carregado.</p>
                  ) : (
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione um professor</option>
                      {teachersOptions.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm text-[#a1a1a1] mb-2">Conteúdo</label>
                <textarea
                  value={chatContent}
                  onChange={(e) => setChatContent(e.target.value)}
                  placeholder="Conteúdo da mensagem"
                  rows={5}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373] resize-y"
                />
              </div>

              {chatError && <p className="text-sm text-red-400">{chatError}</p>}
              {chatSuccess && <p className="text-sm text-[#D4A373]">{chatSuccess}</p>}

              <button
                type="submit"
                disabled={sendingChat}
                className="bg-[#D4A373] text-[#0a0a0a] font-semibold px-5 py-2 rounded hover:bg-[#c89a5f] transition-colors disabled:opacity-50"
              >
                {sendingChat ? "Enviando..." : "Enviar"}
              </button>
            </form>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Histórico</h2>
              {threads.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhuma mensagem.</p>
              ) : (
                threads.map((thread) => {
                  const root = thread[0];
                  if (!root) return null;
                  const status = getThreadStatus(thread);
                  const isOpen = expandedQuestion === root.id;
                  return (
                    <div key={root.id} className="bg-[#111111] border border-[#ffffff10] rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded border ${getRoleBadgeClass(root.senderRole)}`}>
                            {root.senderRole}
                          </span>
                          <span className="text-sm text-[#a1a1a1]">{getAuthorName(root)}</span>
                        </div>
                        <span className="text-xs text-[#a1a1a1]">{formatDateTime(root.createdAt)}</span>
                      </div>
                      <p className="text-sm text-[#f5f5f5] whitespace-pre-wrap mb-2">{root.content}</p>
                      <div className="flex items-center gap-3 text-xs text-[#a1a1a1]">
                        <span>{status.total} mensagem(ns)</span>
                        <span>{status.answered ? "Respondida" : "Sem resposta"}</span>
                        <button
                          type="button"
                          onClick={() => setExpandedQuestion(isOpen ? null : root.id)}
                          className="text-[#D4A373] hover:underline"
                        >
                          {isOpen ? "Fechar" : "Responder / Ver thread"}
                        </button>
                      </div>

                      {isOpen && (
                        <div className="mt-4 space-y-3 border-t border-[#ffffff10] pt-4">
                          {thread.slice(1).map((m) => (
                            <div key={m.id} className="pl-4 border-l border-[#ffffff10]">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs px-2 py-0.5 rounded border ${getRoleBadgeClass(m.senderRole)}`}>
                                  {m.senderRole}
                                </span>
                                <span className="text-xs text-[#a1a1a1]">{getAuthorName(m)}</span>
                                <span className="text-xs text-[#a1a1a1]">{formatDateTime(m.createdAt)}</span>
                              </div>
                              <p className="text-sm text-[#f5f5f5] whitespace-pre-wrap">{m.content}</p>
                            </div>
                          ))}

                          <form onSubmit={(e) => handleReply(root, e)} className="space-y-2">
                            <textarea
                              value={replyContent[root.id] || ""}
                              onChange={(e) =>
                                setReplyContent((prev) => ({ ...prev, [root.id]: e.target.value }))
                              }
                              placeholder="Resposta"
                              rows={3}
                              className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373] resize-y"
                            />
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                className="bg-[#D4A373] text-[#0a0a0a] font-semibold px-4 py-1.5 rounded hover:bg-[#c89a5f] transition-colors text-sm"
                              >
                                Responder
                              </button>
                              <button
                                type="button"
                                onClick={() => setExpandedQuestion(null)}
                                className="text-[#a1a1a1] hover:text-[#f5f5f5] px-4 py-1.5 text-sm"
                              >
                                Cancelar
                              </button>
                            </div>
                          </form>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

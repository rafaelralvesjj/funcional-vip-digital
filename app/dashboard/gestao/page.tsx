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

function getString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function safeJson(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function findFirstArray(input: unknown): unknown[] | null {
  if (Array.isArray(input)) return input;
  if (!isRecord(input)) return null;
  const keys = [
    "students",
    "items",
    "results",
    "data",
    "rows",
    "records",
    "alunos",
    "teachers",
    "professores",
    "notices",
    "questions",
  ];
  for (const key of keys) {
    const candidate = input[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return null;
}

function extractArray(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  let current: unknown = input;
  for (let depth = 0; depth < 4; depth++) {
    const arr = findFirstArray(current);
    if (arr) return arr;
    if (!isRecord(current)) break;
    const next = current["data"] ?? current["result"] ?? current["payload"] ?? current["response"];
    if (next === undefined) break;
    current = next;
  }
  const fallback = findFirstArray(current);
  return fallback ?? [];
}

function normalizeStudent(item: unknown): Student | null {
  if (!isRecord(item)) return null;
  const student = getNestedRecord(item, "student");
  const user = getNestedRecord(item, "user");
  const id =
    getString(item.id) ||
    (student ? getString(student.id) : "") ||
    getString(item.studentId) ||
    getString(item.userId) ||
    (user ? getString(user.id) : "");
  const name =
    getString(item.name) ||
    (student ? getString(student.name) : "") ||
    getString(item.studentName) ||
    (user ? getString(user.name) : "") ||
    getString(item.nome);
  if (!id) return null;
  return { id, name: name || "Aluno", userId: getString(item.userId) || null, user: user ? { id: getString(user.id), name: getString(user.name) || null } : null };
}

function normalizeTeacher(item: unknown): Teacher | null {
  if (!isRecord(item)) return null;
  const user = getNestedRecord(item, "user");
  const teacher = getNestedRecord(item, "teacher");
  const id =
    getString(item.userId) ||
    (user ? getString(user.id) : "") ||
    getString(item.id) ||
    (teacher ? getString(teacher.id) : "");
  const name =
    getString(item.name) ||
    (user ? getString(user.name) : "") ||
    getString(item.teacherName) ||
    (teacher ? getString(teacher.name) : "") ||
    getString(item.nome);
  if (!id) return null;
  return {
    id,
    name: name || "Professor",
    email: getString(item.email) || (user ? getString(user.email) : "") || null,
    userId: getString(item.userId) || null,
    user: user ? { id: getString(user.id), name: getString(user.name) || null, email: getString(user.email) || null } : null,
  };
}

function normalizeNotice(item: unknown): Notice | null {
  if (!isRecord(item)) return null;
  const author = getNestedRecord(item, "author");
  const student = getNestedRecord(item, "student");
  const professor = getNestedRecord(item, "professor");
  const id = getString(item.id);
  if (!id) return null;
  return {
    id,
    title: getString(item.title) || null,
    content: getString(item.content),
    type: getString(item.type) || null,
    authorId: getString(item.authorId) || null,
    studentId: getString(item.studentId) || null,
    targetRole: getString(item.targetRole) || null,
    professorId: getString(item.professorId) || null,
    createdAt: getString(item.createdAt) || new Date().toISOString(),
    author: author ? { id: getString(author.id), name: getString(author.name) || null, role: getString(author.role) || null } : null,
    student: student ? { id: getString(student.id), name: getString(student.name) || "Aluno" } : null,
    professor: professor ? { id: getString(professor.id), name: getString(professor.name) || null } : null,
  };
}

function normalizeThreadMessage(item: unknown): ThreadMessage | null {
  if (!isRecord(item)) return null;
  const id = getString(item.id);
  if (!id) return null;
  const answeredBy = getNestedRecord(item, "answeredBy");
  const student = getNestedRecord(item, "student");
  const teacher = getNestedRecord(item, "teacher");
  const childrenRaw = item.children;
  const children = Array.isArray(childrenRaw)
    ? childrenRaw.map(normalizeThreadMessage).filter((c): c is ThreadMessage => c !== null)
    : [];
  return {
    id,
    studentId: getString(item.studentId) || null,
    teacherId: getString(item.teacherId) || null,
    content: getString(item.content),
    senderRole: getString(item.senderRole) || "STUDENT",
    createdAt: getString(item.createdAt) || new Date().toISOString(),
    answeredBy: answeredBy ? { id: getString(answeredBy.id), name: getString(answeredBy.name) || null, role: getString(answeredBy.role) || null } : null,
    student: student ? { id: getString(student.id), name: getString(student.name) || "Aluno" } : null,
    teacher: teacher ? { id: getString(teacher.id), name: getString(teacher.name) || "Professor" } : null,
    children,
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    if (item.id && !map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function formatDateTime(iso: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getThreadStatus(question: ThreadMessage): "open" | "answered" | "closed" {
  const hasGestor = question.children?.some((c) => c.senderRole === "GESTOR") ?? false;
  if (hasGestor) return "answered";
  return "open";
}

function getAuthorName(question: ThreadMessage): string {
  if (question.senderRole === "GESTOR") return question.answeredBy?.name || "Gestão";
  if (question.senderRole === "TEACHER") return question.teacher?.name || "Professor";
  return question.student?.name || "Aluno";
}

function getRoleBadgeClass(role: string): string {
  if (role === "GESTOR") return "bg-[#D4A37320] text-[#D4A373] border-[#D4A37340]";
  if (role === "TEACHER") return "bg-[#3b82f620] text-[#93c5fd] border-[#3b82f640]";
  return "bg-[#ffffff10] text-[#a1a1a1] border-[#ffffff20]";
}

async function fetchSession(): Promise<{ id: string }> {
  const res = await fetch("/api/auth/session", { cache: "no-store" });
  if (!res.ok) return { id: "" };
  const data = await res.json();
  const record = safeJson(data);
  if (!record) return { id: "" };
  const id = getString(record.id) || getNestedString(record, "user.id");
  return { id };
}

function getNestedString(record: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let current: unknown = record;
  for (const part of parts) {
    if (!isRecord(current)) return "";
    current = current[part];
  }
  return getString(current);
}

async function fetchStudents(): Promise<Student[]> {
  const res = await fetch("/api/students", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const arr = extractArray(data);
  return dedupeById(arr.map(normalizeStudent).filter((s): s is Student => s !== null));
}

async function fetchTeachers(): Promise<Teacher[]> {
  const res = await fetch("/api/teachers", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const arr = extractArray(data);
  return dedupeById(arr.map(normalizeTeacher).filter((t): t is Teacher => t !== null));
}

async function fetchNotices(): Promise<Notice[]> {
  const res = await fetch("/api/notices", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const arr = extractArray(data);
  return dedupeById(arr.map(normalizeNotice).filter((n): n is Notice => n !== null));
}

async function fetchQuestions(): Promise<ThreadMessage[]> {
  const res = await fetch("/api/questions", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const arr = extractArray(data);
  return dedupeById(arr.map(normalizeThreadMessage).filter((q): q is ThreadMessage => q !== null));
}

export default function GestaoPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("mural");
  const [currentUserId, setCurrentUserId] = useState<string>("");
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
  const [noticeSuccess, setNoticeSuccess] = useState<string>("");
  const [noticeError, setNoticeError] = useState<string>("");

  const [chatContent, setChatContent] = useState<string>("");
  const [sendingChat, setSendingChat] = useState<boolean>(false);
  const [chatSuccess, setChatSuccess] = useState<string>("");
  const [chatError, setChatError] = useState<string>("");

  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [session, studs, teacs, nots, quests] = await Promise.all([
        fetchSession(),
        fetchStudents(),
        fetchTeachers(),
        fetchNotices(),
        fetchQuestions(),
      ]);
      if (!mounted) return;
      setCurrentUserId(session.id);
      setStudents(studs);
      setTeachers(teacs);
      setNotices(nots);
      setQuestions(quests);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const studentsOptions = useMemo(
    () =>
      students
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({ value: s.id, label: s.name })),
    [students]
  );

  const teachersOptions = useMemo(
    () =>
      teachers
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({ value: t.id, label: t.name })),
    [teachers]
  );

  function resetNoticeMessages() {
    setNoticeSuccess("");
    setNoticeError("");
  }

  function resetChatMessages() {
    setChatSuccess("");
    setChatError("");
  }

  async function handlePublishNotice(e: FormEvent) {
    e.preventDefault();
    resetNoticeMessages();
    if (!noticeContent.trim()) {
      setNoticeError("O conteúdo é obrigatório.");
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
      studentId = selectedStudentId;
      targetRole = "STUDENT";
    } else if (targetType === "TODOS_ALUNOS") {
      targetRole = "STUDENT";
    } else if (targetType === "PROFESSOR_ESPECIFICO") {
      if (!selectedTeacherId) {
        setNoticeError("Selecione um professor.");
        return;
      }
      professorId = selectedTeacherId;
      targetRole = "TEACHER";
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
        const text = await res.text().catch(() => "");
        throw new Error(text || `Erro ${res.status}`);
      }
      setNoticeSuccess("Aviso publicado com sucesso.");
      setNoticeTitle("");
      setNoticeContent("");
      const nots = await fetchNotices();
      setNotices(nots);
    } catch (err) {
      setNoticeError(err instanceof Error ? err.message : "Erro ao publicar aviso.");
    } finally {
      setSavingNotice(false);
    }
  }

  async function sendChatMessage(studentId: string | null, teacherId: string | null): Promise<boolean> {
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: chatContent.trim(),
        senderRole: "GESTOR",
        studentId,
        teacherId,
      }),
    });
    return res.ok;
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    resetChatMessages();
    if (!chatContent.trim()) {
      setChatError("O conteúdo é obrigatório.");
      return;
    }
    setSendingChat(true);
    let success = 0;
    let failures = 0;
    try {
      if (chatTargetType === "TODOS_ALUNOS") {
        for (const student of students) {
          const ok = await sendChatMessage(student.id, null);
          if (ok) success++;
          else failures++;
        }
      } else if (chatTargetType === "ALUNO_ESPECIFICO") {
        if (!selectedStudentId) {
          setChatError("Selecione um aluno.");
          return;
        }
        const ok = await sendChatMessage(selectedStudentId, null);
        if (ok) success++;
        else failures++;
      } else if (chatTargetType === "TODOS_PROFESSORES") {
        for (const teacher of teachers) {
          const ok = await sendChatMessage(null, teacher.id);
          if (ok) success++;
          else failures++;
        }
      } else if (chatTargetType === "PROFESSOR_ESPECIFICO") {
        if (!selectedTeacherId) {
          setChatError("Selecione um professor.");
          return;
        }
        const ok = await sendChatMessage(null, selectedTeacherId);
        if (ok) success++;
        else failures++;
      }

      if (failures === 0 && success === 0) {
        setChatError("Nenhuma mensagem enviada.");
      } else if (failures === 0 && success === 1) {
        setChatSuccess("Mensagem enviada com sucesso.");
        setChatContent("");
      } else if (failures === 0 && success > 1) {
        setChatSuccess("Mensagens enviadas com sucesso.");
        setChatContent("");
      } else if (success > 0 && failures > 0) {
        setChatSuccess(`Envio parcial: ${success} mensagem(ns) enviada(s), ${failures} falha(s).`);
      } else {
        setChatError("Falha ao enviar todas as mensagens.");
      }

      const quests = await fetchQuestions();
      setQuestions(quests);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Erro ao enviar mensagem.");
    } finally {
      setSendingChat(false);
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
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Erro ${res.status}`);
      }
      setReplyContent((prev) => ({ ...prev, [question.id]: "" }));
      const quests = await fetchQuestions();
      setQuestions(quests);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Erro ao responder.");
    }
  }

  function renderThread(messages: ThreadMessage[], depth = 0) {
    return (
      <div className={depth > 0 ? "ml-4 border-l border-[#ffffff10] pl-3" : ""}>
        {messages.map((msg) => (
          <div key={msg.id} className="mb-3">
            <div className="rounded-md border border-[#ffffff10] bg-[#111111] p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#f5f5f5]">{getAuthorName(msg)}</span>
                  <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${getRoleBadgeClass(msg.senderRole)}`}>
                    {msg.senderRole}
                  </span>
                </div>
                <span className="text-[11px] text-[#a1a1a1]">{formatDateTime(msg.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-[#d4d4d4]">{msg.content}</p>
            </div>
            {msg.children && msg.children.length > 0 ? renderThread(msg.children, depth + 1) : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-6 text-[#f5f5f5]">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Gestão</h1>
          <p className="mt-1 text-sm text-[#a1a1a1]">
            {students.length} aluno(s) carregado(s) · {teachers.length} professor(es) carregado(s)
          </p>
        </header>

        <div className="mb-6 flex gap-2 border-b border-[#ffffff10]">
          {(["mural", "chat"] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "border-[#D4A373] text-[#D4A373]"
                  : "border-transparent text-[#a1a1a1] hover:text-[#f5f5f5]"
              }`}
            >
              {tab === "mural" ? "Mural" : "Chat"}
            </button>
          ))}
        </div>

        {activeTab === "mural" && (
          <section className="space-y-6">
            <form onSubmit={handlePublishNotice} className="space-y-4 rounded-lg border border-[#ffffff10] bg-[#111111] p-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#a1a1a1]">Destinatário</label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as TargetType)}
                  className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                >
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                </select>
              </div>

              {targetType === "ALUNO_ESPECIFICO" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#a1a1a1]">Aluno</label>
                  {studentsOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum aluno carregado.</p>
                  ) : (
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
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
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#a1a1a1]">Professor</label>
                  {teachersOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum professor carregado.</p>
                  ) : (
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
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

              <div>
                <label className="mb-1 block text-sm font-medium text-[#a1a1a1]">Título</label>
                <input
                  type="text"
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  placeholder="Aviso da Gestão"
                  className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[#a1a1a1]">Conteúdo</label>
                <textarea
                  value={noticeContent}
                  onChange={(e) => setNoticeContent(e.target.value)}
                  rows={5}
                  required
                  className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                />
              </div>

              {noticeSuccess && <p className="text-sm text-[#D4A373]">{noticeSuccess}</p>}
              {noticeError && <p className="text-sm text-red-400">{noticeError}</p>}

              <button
                type="submit"
                disabled={savingNotice}
                className="rounded-md bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {savingNotice ? "Publicando..." : "Publicar"}
              </button>
            </form>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Avisos publicados</h2>
              {notices.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhum aviso publicado.</p>
              ) : (
                notices.map((notice) => (
                  <div key={notice.id} className="rounded-lg border border-[#ffffff10] bg-[#111111] p-4">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h3 className="font-medium text-[#f5f5f5]">{notice.title || "Aviso da Gestão"}</h3>
                      <span className="text-[11px] text-[#a1a1a1]">{formatDateTime(notice.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-[#d4d4d4]">{notice.content}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#a1a1a1]">
                      {notice.targetRole && (
                        <span className="rounded border border-[#ffffff10] px-2 py-0.5">{notice.targetRole}</span>
                      )}
                      {notice.student && <span>Aluno: {notice.student.name}</span>}
                      {notice.professor && <span>Professor: {notice.professor.name}</span>}
                      {notice.author?.name && <span>Autor: {notice.author.name}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === "chat" && (
          <section className="space-y-6">
            <form onSubmit={handleSendChat} className="space-y-4 rounded-lg border border-[#ffffff10] bg-[#111111] p-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#a1a1a1]">Destinatário</label>
                <select
                  value={chatTargetType}
                  onChange={(e) => setChatTargetType(e.target.value as TargetType)}
                  className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                >
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                </select>
              </div>

              {chatTargetType === "ALUNO_ESPECIFICO" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#a1a1a1]">Aluno</label>
                  {studentsOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum aluno carregado.</p>
                  ) : (
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
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

              {chatTargetType === "PROFESSOR_ESPECIFICO" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#a1a1a1]">Professor</label>
                  {teachersOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum professor carregado.</p>
                  ) : (
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
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

              <div>
                <label className="mb-1 block text-sm font-medium text-[#a1a1a1]">Conteúdo</label>
                <textarea
                  value={chatContent}
                  onChange={(e) => setChatContent(e.target.value)}
                  rows={4}
                  required
                  className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                />
              </div>

              {chatSuccess && <p className="text-sm text-[#D4A373]">{chatSuccess}</p>}
              {chatError && <p className="text-sm text-red-400">{chatError}</p>}

              <button
                type="submit"
                disabled={sendingChat}
                className="rounded-md bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {sendingChat ? "Enviando..." : "Enviar"}
              </button>
            </form>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Histórico de conversas</h2>
              {questions.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhuma conversa encontrada.</p>
              ) : (
                questions.map((question) => {
                  const status = getThreadStatus(question);
                  const isExpanded = expandedQuestion === question.id;
                  return (
                    <div key={question.id} className="rounded-lg border border-[#ffffff10] bg-[#111111] p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#f5f5f5]">{getAuthorName(question)}</span>
                          <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${getRoleBadgeClass(question.senderRole)}`}>
                            {question.senderRole}
                          </span>
                          <span
                            className={`rounded border px-2 py-0.5 text-[10px] uppercase ${
                              status === "answered"
                                ? "border-[#D4A37340] bg-[#D4A37320] text-[#D4A373]"
                                : "border-[#ffffff20] bg-[#ffffff10] text-[#a1a1a1]"
                            }`}
                          >
                            {status === "answered" ? "Respondido" : "Aberto"}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#a1a1a1]">{formatDateTime(question.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-[#d4d4d4]">{question.content}</p>

                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          {question.children && question.children.length > 0 ? (
                            renderThread(question.children, 1)
                          ) : (
                            <p className="text-xs text-[#a1a1a1]">Sem respostas ainda.</p>
                          )}
                          <form onSubmit={(e) => handleReply(question, e)} className="space-y-2">
                            <textarea
                              value={replyContent[question.id] || ""}
                              onChange={(e) =>
                                setReplyContent((prev) => ({ ...prev, [question.id]: e.target.value }))
                              }
                              rows={3}
                              placeholder="Continuar conversa..."
                              className="w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                            />
                            <button
                              type="submit"
                              className="rounded-md border border-[#D4A373] px-3 py-1.5 text-xs font-semibold text-[#D4A373] transition-colors hover:bg-[#D4A37310]"
                            >
                              Continuar conversa
                            </button>
                          </form>
                        </div>
                      )}

                      {!isExpanded && (
                        <button
                          type="button"
                          onClick={() => setExpandedQuestion(question.id)}
                          className="mt-3 text-xs font-medium text-[#D4A373] hover:underline"
                        >
                          Continuar conversa
                        </button>
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

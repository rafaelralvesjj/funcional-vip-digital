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
type ChatStudentMode = "TODOS_ALUNOS" | "ALUNO_ESPECIFICO";
type ChatTeacherMode = "TODOS_PROFESSORES" | "PROFESSOR_ESPECIFICO";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findFirstArray(value: unknown, depth = 0): unknown[] | null {
  if (depth > 4) return null;
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  const keys = ["students", "items", "results", "data", "rows", "records", "alunos", "teachers", "professores", "notices", "questions"];
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
  }
  for (const key of Object.keys(value)) {
    const candidate = value[key];
    const found = findFirstArray(candidate, depth + 1);
    if (found) return found;
  }
  return null;
}

function extractArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const found = findFirstArray(value, 0);
  return found ?? [];
}

function normalizeStudent(item: unknown): Student | null {
  if (!isRecord(item)) return null;
  const studentNested = getNestedRecord(item, "student");
  const userNested = getNestedRecord(item, "user");

  const id =
    getString(item.id) ??
    (studentNested ? getString(studentNested.id) : null) ??
    getString(item.studentId) ??
    getString(item.userId) ??
    (userNested ? getString(userNested.id) : null);

  const name =
    getString(item.name) ??
    (studentNested ? getString(studentNested.name) : null) ??
    getString(item.studentName) ??
    (userNested ? getString(userNested.name) : null) ??
    getString(item.nome);

  if (!id || !name) return null;

  return {
    id,
    name,
    userId: getString(item.userId) ?? (userNested ? getString(userNested.id) : null) ?? null,
    user: userNested
      ? { id: String(userNested.id ?? id), name: userNested.name ? getString(userNested.name) : null }
      : null,
  };
}

function normalizeTeacher(item: unknown): Teacher | null {
  if (!isRecord(item)) return null;
  const userNested = getNestedRecord(item, "user");
  const teacherNested = getNestedRecord(item, "teacher");

  const id =
    getString(item.userId) ??
    (userNested ? getString(userNested.id) : null) ??
    getString(item.id) ??
    (teacherNested ? getString(teacherNested.id) : null);

  const name =
    getString(item.name) ??
    (userNested ? getString(userNested.name) : null) ??
    getString(item.teacherName) ??
    (teacherNested ? getString(teacherNested.name) : null) ??
    getString(item.nome);

  if (!id || !name) return null;

  return {
    id,
    name,
    email: getString(item.email) ?? (userNested ? getString(userNested.email) : null) ?? null,
    userId: getString(item.userId) ?? (userNested ? getString(userNested.id) : null) ?? null,
    user: userNested
      ? {
          id: String(userNested.id ?? id),
          name: userNested.name ? getString(userNested.name) : null,
          email: userNested.email ? getString(userNested.email) : null,
        }
      : null,
    _count: isRecord(item._count) && typeof item._count.students === "number" ? { students: item._count.students } : undefined,
  };
}

function normalizeNotice(item: unknown): Notice | null {
  if (!isRecord(item)) return null;
  const id = getString(item.id);
  const content = getString(item.content);
  const createdAt = getString(item.createdAt) ?? new Date().toISOString();
  if (!id || !content) return null;

  const authorNested = getNestedRecord(item, "author");
  const studentNested = getNestedRecord(item, "student");
  const professorNested = getNestedRecord(item, "professor");

  return {
    id,
    title: getString(item.title),
    content,
    type: getString(item.type),
    authorId: getString(item.authorId),
    studentId: getString(item.studentId),
    targetRole: getString(item.targetRole),
    professorId: getString(item.professorId),
    createdAt,
    author: authorNested
      ? {
          id: String(authorNested.id ?? ""),
          name: authorNested.name ? getString(authorNested.name) : null,
          role: authorNested.role ? getString(authorNested.role) : null,
        }
      : null,
    student: studentNested
      ? { id: String(studentNested.id ?? ""), name: getString(studentNested.name) ?? "" }
      : null,
    professor: professorNested
      ? { id: String(professorNested.id ?? ""), name: professorNested.name ? getString(professorNested.name) : null }
      : null,
  };
}

function normalizeThreadMessage(item: unknown): ThreadMessage | null {
  if (!isRecord(item)) return null;
  const id = getString(item.id);
  const studentId = getString(item.studentId);
  const content = getString(item.content);
  const senderRole = getString(item.senderRole);
  const createdAt = getString(item.createdAt) ?? new Date().toISOString();
  if (!id || !studentId || !content || !senderRole) return null;

  const answeredByNested = getNestedRecord(item, "answeredBy");
  const studentNested = getNestedRecord(item, "student");
  const teacherNested = getNestedRecord(item, "teacher");
  const childrenRaw = item.children;
  const children = Array.isArray(childrenRaw)
    ? childrenRaw.map(normalizeThreadMessage).filter((m): m is ThreadMessage => m !== null)
    : [];

  return {
    id,
    studentId,
    teacherId: getString(item.teacherId),
    content,
    senderRole,
    createdAt,
    answeredBy: answeredByNested
      ? {
          id: String(answeredByNested.id ?? ""),
          name: answeredByNested.name ? getString(answeredByNested.name) : null,
          role: answeredByNested.role ? getString(answeredByNested.role) : null,
        }
      : null,
    student: studentNested
      ? { id: String(studentNested.id ?? ""), name: getString(studentNested.name) ?? "" }
      : null,
    teacher: teacherNested
      ? { id: String(teacherNested.id ?? ""), name: teacherNested.name ? getString(teacherNested.name) : null }
      : null,
    children,
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getThreadStatus(thread: ThreadMessage[]): { label: string; className: string } {
  if (thread.length === 0) return { label: "Sem mensagens", className: "bg-[#ffffff10] text-[#a1a1a1]" };
  const last = thread[thread.length - 1];
  const role = last.senderRole.toUpperCase();
  if (role === "GESTOR") return { label: "Respondido pela gestão", className: "bg-[#D4A37320] text-[#D4A373]" };
  if (role === "PROFESSOR" || role === "TEACHER") return { label: "Respondido pelo professor", className: "bg-[#3a6b8a20] text-[#7fb3d9]" };
  if (role === "ALUNO" || role === "STUDENT") return { label: "Aguardando resposta", className: "bg-[#ffffff10] text-[#a1a1a1]" };
  return { label: "Em andamento", className: "bg-[#ffffff10] text-[#a1a1a1]" };
}

function getAuthorName(notice: Notice): string {
  if (notice.author?.name) return notice.author.name;
  if (notice.author?.role?.toUpperCase() === "GESTOR") return "Gestão";
  if (notice.author?.role?.toUpperCase() === "PROFESSOR" || notice.author?.role?.toUpperCase() === "TEACHER") return "Professor";
  if (notice.author?.role?.toUpperCase() === "ALUNO" || notice.author?.role?.toUpperCase() === "STUDENT") return "Aluno";
  return "Sistema";
}

function getRoleBadgeClass(role?: string | null): string {
  if (!role) return "bg-[#ffffff10] text-[#a1a1a1]";
  const r = role.toUpperCase();
  if (r === "GESTOR") return "bg-[#D4A37320] text-[#D4A373]";
  if (r === "PROFESSOR" || r === "TEACHER") return "bg-[#3a6b8a20] text-[#7fb3d9]";
  if (r === "ALUNO" || r === "STUDENT") return "bg-[#5a8a5a20] text-[#9bd9a0]";
  return "bg-[#ffffff10] text-[#a1a1a1]";
}

export default function GestaoPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("mural");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<TargetType>("TODOS_ALUNOS");
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
  const [chatStudentMode, setChatStudentMode] = useState<ChatStudentMode>("TODOS_ALUNOS");
  const [chatTeacherMode, setChatTeacherMode] = useState<ChatTeacherMode>("TODOS_PROFESSORES");

  const studentsOptions = useMemo(() => students, [students]);
  const teachersOptions = useMemo(() => teachers, [teachers]);

  async function fetchSession() {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const id = isRecord(data) ? getString((data as Record<string, unknown>).user ? (getNestedRecord(data, "user")?.id ?? (data as Record<string, unknown>).userId) : (data as Record<string, unknown>).id) : null;
      if (id) setCurrentUserId(id);
    } catch {
      /* ignore */
    }
  }

  async function fetchStudents() {
    try {
      const res = await fetch("/api/students", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const list = extractArray(data).map(normalizeStudent).filter((s): s is Student => s !== null);
      setStudents(dedupeById(list));
    } catch {
      /* ignore */
    }
  }

  async function fetchTeachers() {
    try {
      const res = await fetch("/api/teachers", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const list = extractArray(data).map(normalizeTeacher).filter((t): t is Teacher => t !== null);
      setTeachers(dedupeById(list));
    } catch {
      /* ignore */
    }
  }

  async function fetchNotices() {
    try {
      const res = await fetch("/api/notices", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const list = extractArray(data).map(normalizeNotice).filter((n): n is Notice => n !== null);
      setNotices(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch {
      /* ignore */
    }
  }

  async function fetchQuestions() {
    try {
      const res = await fetch("/api/questions?senderRole=GESTOR", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const list = extractArray(data).map(normalizeThreadMessage).filter((q): q is ThreadMessage => q !== null);
      setQuestions(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    fetchSession();
    fetchStudents();
    fetchTeachers();
    fetchNotices();
    fetchQuestions();
  }, []);

  async function handlePublishNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeSuccess(null);
    setNoticeError(null);

    if (!noticeContent.trim()) {
      setNoticeError("O conteúdo do aviso é obrigatório.");
      return;
    }

    let bodyTargetRole: string = "STUDENT";
    let bodyStudentId: string | null = null;
    let bodyProfessorId: string | null = null;

    if (targetType === "ALUNO_ESPECIFICO") {
      if (!selectedStudentId) {
        setNoticeError("Selecione um aluno.");
        return;
      }
      bodyTargetRole = "STUDENT";
      bodyStudentId = selectedStudentId;
    } else if (targetType === "TODOS_ALUNOS") {
      bodyTargetRole = "STUDENT";
    } else if (targetType === "PROFESSOR_ESPECIFICO") {
      if (!selectedTeacherId) {
        setNoticeError("Selecione um professor.");
        return;
      }
      bodyTargetRole = "TEACHER";
      bodyProfessorId = selectedTeacherId;
    } else if (targetType === "TODOS_PROFESSORES") {
      bodyTargetRole = "TEACHER";
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
          targetRole: bodyTargetRole,
          studentId: bodyStudentId,
          professorId: bodyProfessorId,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        const parsed = safeJson(text);
        const msg = isRecord(parsed) ? getString((parsed as Record<string, unknown>).error) ?? getString((parsed as Record<string, unknown>).message) : null;
        setNoticeError(msg ?? `Erro ao publicar aviso (${res.status}).`);
        return;
      }

      setNoticeSuccess("Aviso publicado com sucesso.");
      setNoticeTitle("");
      setNoticeContent("");
      await fetchNotices();
    } catch {
      setNoticeError("Falha ao publicar aviso.");
    } finally {
      setSavingNotice(false);
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    setChatSuccess(null);
    setChatError(null);

    if (!chatContent.trim()) {
      setChatError("A mensagem não pode estar vazia.");
      return;
    }

    const studentIds =
      chatStudentMode === "ALUNO_ESPECIFICO"
        ? selectedStudentId
          ? [selectedStudentId]
          : []
        : students.map((s) => s.id);

    const teacherIds =
      chatTeacherMode === "PROFESSOR_ESPECIFICO"
        ? selectedTeacherId
          ? [selectedTeacherId]
          : []
        : teachers.map((t) => t.id);

    if (studentIds.length === 0) {
      setChatError("Nenhum aluno selecionado para envio.");
      return;
    }
    if (teacherIds.length === 0) {
      setChatError("Nenhum professor selecionado para envio.");
      return;
    }

    const combinations: Array<{ studentId: string; teacherId: string }> = [];
    const seen = new Set<string>();
    for (const sId of studentIds) {
      for (const tId of teacherIds) {
        const key = `${sId}__${tId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        combinations.push({ studentId: sId, teacherId: tId });
      }
    }

    if (combinations.length === 0) {
      setChatError("Nenhuma combinação aluno x professor disponível.");
      return;
    }

    setSendingChat(true);
    let successCount = 0;
    let failCount = 0;

    for (const combo of combinations) {
      try {
        const res = await fetch("/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: chatContent.trim(),
            senderRole: "GESTOR",
            studentId: combo.studentId,
            teacherId: combo.teacherId,
          }),
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    if (failCount === 0 && successCount > 0) {
      setChatSuccess(successCount === 1 ? "Mensagem enviada com sucesso." : "Mensagens enviadas com sucesso.");
      setChatContent("");
      await fetchQuestions();
    } else if (successCount > 0 && failCount > 0) {
      setChatSuccess(`Envio parcial: ${successCount} mensagem(ns) enviada(s), ${failCount} falha(s).`);
      setChatContent("");
      await fetchQuestions();
    } else {
      setChatError("Falha ao enviar as mensagens.");
    }

    setSendingChat(false);
  }

  async function handleReply(question: ThreadMessage) {
    const replyText = (replyContent[question.id] ?? "").trim();
    if (!replyText) return;

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

      if (res.ok) {
        setReplyContent((prev) => ({ ...prev, [question.id]: "" }));
        setExpandedQuestion(null);
        await fetchQuestions();
      }
    } catch {
      /* ignore */
    }
  }

  const inputClass =
    "w-full rounded-md border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-[#f5f5f5] placeholder:text-[#a1a1a1] focus:border-[#D4A373] focus:outline-none";
  const labelClass = "mb-1 block text-sm text-[#a1a1a1]";
  const buttonPrimary =
    "rounded-md bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a] hover:bg-[#c79a5f] disabled:opacity-50";
  const buttonGhost =
    "rounded-md border border-[#ffffff10] px-3 py-1 text-sm text-[#a1a1a1] hover:border-[#D4A373] hover:text-[#f5f5f5]";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-[#f5f5f5]">Gestão</h1>
          <p className="mt-1 text-sm text-[#a1a1a1]">
            {students.length} aluno(s) carregado(s) · {teachers.length} professor(es) carregado(s)
          </p>
        </header>

        <div className="mb-6 flex gap-2 border-b border-[#ffffff10]">
          <button
            type="button"
            onClick={() => setActiveTab("mural")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "mural" ? "border-b-2 border-[#D4A373] text-[#f5f5f5]" : "text-[#a1a1a1]"
            }`}
          >
            Mural
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "chat" ? "border-b-2 border-[#D4A373] text-[#f5f5f5]" : "text-[#a1a1a1]"
            }`}
          >
            Chat
          </button>
        </div>

        {activeTab === "mural" && (
          <section className="space-y-6">
            <form onSubmit={handlePublishNotice} className="space-y-4 rounded-lg border border-[#ffffff10] bg-[#111111] p-5">
              <div>
                <label className={labelClass}>Destinatário</label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as TargetType)}
                  className={inputClass}
                >
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                </select>
              </div>

              {targetType === "ALUNO_ESPECIFICO" && (
                <div>
                  <label className={labelClass}>Aluno</label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className={inputClass}
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
                  <label className={labelClass}>Professor</label>
                  <select
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className={inputClass}
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
                <label className={labelClass}>Título</label>
                <input
                  type="text"
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  placeholder="Título do aviso"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Conteúdo</label>
                <textarea
                  value={noticeContent}
                  onChange={(e) => setNoticeContent(e.target.value)}
                  placeholder="Conteúdo do aviso"
                  rows={5}
                  className={inputClass}
                />
              </div>

              {noticeError && <p className="text-sm text-red-400">{noticeError}</p>}
              {noticeSuccess && <p className="text-sm text-[#D4A373]">{noticeSuccess}</p>}

              <button type="submit" disabled={savingNotice} className={buttonPrimary}>
                {savingNotice ? "Publicando..." : "Publicar"}
              </button>
            </form>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-[#f5f5f5]">Avisos publicados</h2>
              {notices.length === 0 && (
                <p className="text-sm text-[#a1a1a1]">Nenhum aviso publicado.</p>
              )}
              {notices.map((n) => (
                <div key={n.id} className="rounded-lg border border-[#ffffff10] bg-[#111111] p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-[#f5f5f5]">{n.title ?? "Aviso da Gestão"}</h3>
                    <span className={`rounded px-2 py-0.5 text-xs ${getRoleBadgeClass(n.targetRole)}`}>
                      {n.targetRole === "TEACHER" ? "Professores" : "Alunos"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-[#f5f5f5]">{n.content}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#a1a1a1]">
                    <span>Autor: {getAuthorName(n)}</span>
                    {n.student && <span>Aluno: {n.student.name}</span>}
                    {n.professor && <span>Professor: {n.professor.name}</span>}
                    <span>{formatDateTime(n.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "chat" && (
          <section className="space-y-6">
            <form onSubmit={handleSendChat} className="space-y-4 rounded-lg border border-[#ffffff10] bg-[#111111] p-5">
              <div>
                <label className={labelClass}>Alunos</label>
                <select
                  value={chatStudentMode}
                  onChange={(e) => setChatStudentMode(e.target.value as ChatStudentMode)}
                  className={inputClass}
                >
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                </select>
              </div>

              {chatStudentMode === "ALUNO_ESPECIFICO" && (
                <div>
                  <label className={labelClass}>Aluno</label>
                  {studentsOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum aluno carregado.</p>
                  ) : (
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Selecione um aluno</option>
                      {studentsOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className={labelClass}>Professores</label>
                <select
                  value={chatTeacherMode}
                  onChange={(e) => setChatTeacherMode(e.target.value as ChatTeacherMode)}
                  className={inputClass}
                >
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                </select>
              </div>

              {chatTeacherMode === "PROFESSOR_ESPECIFICO" && (
                <div>
                  <label className={labelClass}>Professor</label>
                  {teachersOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum professor carregado.</p>
                  ) : (
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Selecione um professor</option>
                      {teachersOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className={labelClass}>Mensagem</label>
                <textarea
                  value={chatContent}
                  onChange={(e) => setChatContent(e.target.value)}
                  placeholder="Digite a mensagem"
                  rows={5}
                  className={inputClass}
                />
              </div>

              {chatError && <p className="text-sm text-red-400">{chatError}</p>}
              {chatSuccess && <p className="text-sm text-[#D4A373]">{chatSuccess}</p>}

              <button type="submit" disabled={sendingChat} className={buttonPrimary}>
                {sendingChat ? "Enviando..." : "Enviar"}
              </button>
            </form>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-[#f5f5f5]">Histórico de conversas</h2>
              {questions.length === 0 && (
                <p className="text-sm text-[#a1a1a1]">Nenhuma conversa encontrada.</p>
              )}
              {questions.map((q) => {
                const thread = [q, ...(q.children ?? [])].sort((a, b) =>
                  a.createdAt.localeCompare(b.createdAt)
                );
                const status = getThreadStatus(thread);
                const isOpen = expandedQuestion === q.id;
                return (
                  <div key={q.id} className="rounded-lg border border-[#ffffff10] bg-[#111111] p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2 text-xs text-[#a1a1a1]">
                        <span>Aluno: {q.student?.name ?? "—"}</span>
                        <span>Professor: {q.teacher?.name ?? "—"}</span>
                      </div>
                      <span className={`rounded px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span>
                    </div>

                    <div className="space-y-2">
                      {thread.map((m) => (
                        <div key={m.id} className="rounded-md border border-[#ffffff10] bg-[#0a0a0a] p-3">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className={`rounded px-2 py-0.5 text-xs ${getRoleBadgeClass(m.senderRole)}`}>
                              {m.senderRole}
                            </span>
                            <span className="text-xs text-[#a1a1a1]">{formatDateTime(m.createdAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm text-[#f5f5f5]">{m.content}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3">
                      {!isOpen ? (
                        <button type="button" onClick={() => setExpandedQuestion(q.id)} className={buttonGhost}>
                          Continuar conversa
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <textarea
                            value={replyContent[q.id] ?? ""}
                            onChange={(e) =>
                              setReplyContent((prev) => ({ ...prev, [q.id]: e.target.value }))
                            }
                            placeholder="Digite a resposta"
                            rows={3}
                            className={inputClass}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleReply(q)}
                              className={buttonPrimary}
                            >
                              Responder
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedQuestion(null);
                                setReplyContent((prev) => ({ ...prev, [q.id]: "" }));
                              }}
                              className={buttonGhost}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

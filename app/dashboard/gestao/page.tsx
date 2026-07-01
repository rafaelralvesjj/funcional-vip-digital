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

function getStringFromRecord(record: Record<string, unknown>, key: string): string {
  const v = record[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function findFirstArray(value: unknown, depth = 0): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (depth > 4) return null;
  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      const found = findFirstArray(value[key], depth + 1);
      if (found) return found;
    }
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
  for (const key of nestedKeys) {
    const nested = data[key];
    if (Array.isArray(nested)) return nested;
    if (isRecord(nested)) {
      for (const ck of candidateKeys) {
        const v = nested[ck];
        if (Array.isArray(v)) return v;
      }
      const deeper = findFirstArray(nested, 0);
      if (deeper) return deeper;
    }
  }
  const found = findFirstArray(data, 0);
  return found ? found : [];
}

function normalizeStudent(item: unknown): Student | null {
  if (!isRecord(item)) return null;
  const studentRec = getNestedRecord(item, "student");
  const userRec = getNestedRecord(item, "user");

  const idCandidates = [
    getStringFromRecord(item, "id"),
    studentRec ? getStringFromRecord(studentRec, "id") : "",
    getStringFromRecord(item, "studentId"),
    getStringFromRecord(item, "userId"),
    userRec ? getStringFromRecord(userRec, "id") : "",
  ];
  const id = idCandidates.find((v) => v.length > 0) || "";

  const nameCandidates = [
    getStringFromRecord(item, "name"),
    studentRec ? getStringFromRecord(studentRec, "name") : "",
    getStringFromRecord(item, "studentName"),
    userRec ? getStringFromRecord(userRec, "name") : "",
    getStringFromRecord(item, "nome"),
  ];
  const name = nameCandidates.find((v) => v.length > 0) || "Sem nome";

  if (!id) return null;

  const userId = getStringFromRecord(item, "userId") || (userRec ? getStringFromRecord(userRec, "id") : "") || null;

  return {
    id,
    name,
    userId: userId || null,
    user: userRec
      ? { id: getStringFromRecord(userRec, "id"), name: getStringFromRecord(userRec, "name") || null }
      : null,
  };
}

function normalizeTeacher(item: unknown): Teacher | null {
  if (!isRecord(item)) return null;
  const userRec = getNestedRecord(item, "user");
  const teacherRec = getNestedRecord(item, "teacher");

  const idCandidates = [
    getStringFromRecord(item, "userId"),
    userRec ? getStringFromRecord(userRec, "id") : "",
    getStringFromRecord(item, "id"),
  ];
  const id = idCandidates.find((v) => v.length > 0) || "";

  const nameCandidates = [
    getStringFromRecord(item, "name"),
    userRec ? getStringFromRecord(userRec, "name") : "",
    getStringFromRecord(item, "teacherName"),
    teacherRec ? getStringFromRecord(teacherRec, "name") : "",
    getStringFromRecord(item, "nome"),
  ];
  const name = nameCandidates.find((v) => v.length > 0) || "Sem nome";

  if (!id) return null;

  const email =
    getStringFromRecord(item, "email") ||
    (userRec ? getStringFromRecord(userRec, "email") : "") ||
    null;

  const countRec = getNestedRecord(item, "_count");
  const studentsCount = countRec ? Number(countRec["students"] ?? 0) : undefined;

  return {
    id,
    name,
    email: email || null,
    userId: getStringFromRecord(item, "userId") || (userRec ? getStringFromRecord(userRec, "id") : "") || null,
    user: userRec
      ? {
          id: getStringFromRecord(userRec, "id"),
          name: getStringFromRecord(userRec, "name") || null,
          email: getStringFromRecord(userRec, "email") || null,
        }
      : null,
    _count: typeof studentsCount === "number" ? { students: studentsCount } : undefined,
  };
}

function normalizeNotice(item: unknown): Notice | null {
  if (!isRecord(item)) return null;
  const id = getStringFromRecord(item, "id");
  if (!id) return null;

  const authorRec = getNestedRecord(item, "author");
  const studentRec = getNestedRecord(item, "student");
  const professorRec = getNestedRecord(item, "professor");

  return {
    id,
    title: getStringFromRecord(item, "title") || null,
    content: getStringFromRecord(item, "content"),
    type: getStringFromRecord(item, "type") || null,
    authorId: getStringFromRecord(item, "authorId") || null,
    studentId: getStringFromRecord(item, "studentId") || null,
    targetRole: getStringFromRecord(item, "targetRole") || null,
    professorId: getStringFromRecord(item, "professorId") || null,
    createdAt: getStringFromRecord(item, "createdAt"),
    author: authorRec
      ? {
          id: getStringFromRecord(authorRec, "id"),
          name: getStringFromRecord(authorRec, "name") || null,
          role: getStringFromRecord(authorRec, "role") || null,
        }
      : null,
    student: studentRec
      ? { id: getStringFromRecord(studentRec, "id"), name: getStringFromRecord(studentRec, "name") || "Sem nome" }
      : null,
    professor: professorRec
      ? { id: getStringFromRecord(professorRec, "id"), name: getStringFromRecord(professorRec, "name") || null }
      : null,
  };
}

function normalizeThreadMessage(item: unknown): ThreadMessage | null {
  if (!isRecord(item)) return null;
  const id = getStringFromRecord(item, "id");
  if (!id) return null;

  const answeredByRec = getNestedRecord(item, "answeredBy");
  const studentRec = getNestedRecord(item, "student");
  const teacherRec = getNestedRecord(item, "teacher");

  const childrenRaw = item["children"];
  const children: ThreadMessage[] = Array.isArray(childrenRaw)
    ? childrenRaw.map(normalizeThreadMessage).filter((m): m is ThreadMessage => m !== null)
    : [];

  return {
    id,
    studentId: getStringFromRecord(item, "studentId") || null,
    teacherId: getStringFromRecord(item, "teacherId") || null,
    content: getStringFromRecord(item, "content"),
    senderRole: getStringFromRecord(item, "senderRole") || "GESTOR",
    createdAt: getStringFromRecord(item, "createdAt"),
    answeredBy: answeredByRec
      ? {
          id: getStringFromRecord(answeredByRec, "id"),
          name: getStringFromRecord(answeredByRec, "name") || null,
          role: getStringFromRecord(answeredByRec, "role") || null,
        }
      : null,
    student: studentRec
      ? { id: getStringFromRecord(studentRec, "id"), name: getStringFromRecord(studentRec, "name") || "Sem nome" }
      : null,
    teacher: teacherRec
      ? { id: getStringFromRecord(teacherRec, "id"), name: getStringFromRecord(teacherRec, "name") || null }
      : null,
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
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getThreadStatus(thread: ThreadMessage[]): { answered: boolean; total: number } {
  const total = thread.length;
  const answered = thread.some((m) => m.senderRole !== "GESTOR" && m.senderRole !== "STUDENT" ? true : false);
  return { answered, total };
}

function getAuthorName(msg: ThreadMessage): string {
  if (msg.answeredBy?.name) return msg.answeredBy.name;
  if (msg.senderRole === "GESTOR") return "Gestão";
  if (msg.senderRole === "TEACHER") return msg.teacher?.name || "Professor";
  if (msg.senderRole === "STUDENT") return msg.student?.name || "Aluno";
  return "Usuário";
}

function getRoleBadgeClass(role: string): string {
  if (role === "GESTOR") return "bg-[#D4A37320] text-[#D4A373] border-[#D4A37340]";
  if (role === "TEACHER") return "bg-[#3a87f520] text-[#7bb6ff] border-[#3a87f540]";
  if (role === "STUDENT") return "bg-[#34d39920] text-[#6ee7b7] border-[#34d39940]";
  return "bg-[#ffffff10] text-[#a1a1a1] border-[#ffffff20]";
}

export default function GestaoPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("mural");
  const [currentUserId, setCurrentUserId] = useState<string>("");

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

  const studentsOptions = useMemo(() => students, [students]);
  const teachersOptions = useMemo(() => teachers, [teachers]);

  async function fetchSession() {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await safeJson(res);
      if (!isRecord(data)) return;
      const userRec = getNestedRecord(data, "user");
      const id =
        getStringFromRecord(data, "id") ||
        (userRec ? getStringFromRecord(userRec, "id") : "") ||
        getStringFromRecord(data, "userId");
      if (id) setCurrentUserId(id);
    } catch {
      /* ignore */
    }
  }

  async function fetchStudents() {
    try {
      const res = await fetch("/api/students", { cache: "no-store" });
      const data = await safeJson(res);
      const arr = extractArray(data, ["students", "items", "results", "data", "rows", "records", "alunos"]);
      const normalized = arr.map(normalizeStudent).filter((s): s is Student => s !== null);
      setStudents(dedupeById(normalized));
    } catch {
      setStudents([]);
    }
  }

  async function fetchTeachers() {
    try {
      const res = await fetch("/api/teachers", { cache: "no-store" });
      const data = await safeJson(res);
      const arr = extractArray(data, ["teachers", "items", "results", "data", "rows", "records", "professores"]);
      const normalized = arr.map(normalizeTeacher).filter((t): t is Teacher => t !== null);
      setTeachers(dedupeById(normalized));
    } catch {
      setTeachers([]);
    }
  }

  async function fetchNotices() {
    try {
      const res = await fetch("/api/notices", { cache: "no-store" });
      const data = await safeJson(res);
      const arr = extractArray(data, ["notices", "items", "results", "data", "rows", "records"]);
      const normalized = arr.map(normalizeNotice).filter((n): n is Notice => n !== null);
      setNotices(normalized);
    } catch {
      setNotices([]);
    }
  }

  async function fetchQuestions() {
    try {
      const res = await fetch("/api/questions", { cache: "no-store" });
      const data = await safeJson(res);
      const arr = extractArray(data, ["questions", "items", "results", "data", "rows", "records"]);
      const normalized = arr.map(normalizeThreadMessage).filter((q): q is ThreadMessage => q !== null);
      setQuestions(normalized);
    } catch {
      setQuestions([]);
    }
  }

  useEffect(() => {
    fetchSession();
    fetchStudents();
    fetchTeachers();
    fetchNotices();
    fetchQuestions();
  }, []);

  function resolveTargetRole(tt: TargetType): string {
    if (tt === "ALUNO_ESPECIFICO" || tt === "TODOS_ALUNOS") return "STUDENT";
    return "TEACHER";
  }

  async function handlePublishNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeSuccess("");
    setNoticeError("");

    if (!noticeContent.trim()) {
      setNoticeError("O conteúdo do aviso é obrigatório.");
      return;
    }

    if (targetType === "ALUNO_ESPECIFICO" && !selectedStudentId) {
      setNoticeError("Selecione um aluno.");
      return;
    }
    if (targetType === "PROFESSOR_ESPECIFICO" && !selectedTeacherId) {
      setNoticeError("Selecione um professor.");
      return;
    }

    setSavingNotice(true);
    try {
      const body = {
        title: noticeTitle.trim() || "Aviso da Gestão",
        content: noticeContent.trim(),
        type: "MANAGEMENT",
        targetRole: resolveTargetRole(targetType),
        studentId: targetType === "ALUNO_ESPECIFICO" ? selectedStudentId : null,
        professorId: targetType === "PROFESSOR_ESPECIFICO" ? selectedTeacherId : null,
        authorId: currentUserId,
      };
      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        const msg = isRecord(data) ? getStringFromRecord(data, "error") || getStringFromRecord(data, "message") : "";
        throw new Error(msg || "Falha ao publicar aviso.");
      }
      setNoticeSuccess("Aviso publicado com sucesso.");
      setNoticeTitle("");
      setNoticeContent("");
      await fetchNotices();
    } catch (err) {
      setNoticeError(err instanceof Error ? err.message : "Erro ao publicar aviso.");
    } finally {
      setSavingNotice(false);
    }
  }

  async function sendOneChatMessage(payload: {
    content: string;
    senderRole: string;
    studentId: string | null;
    teacherId: string | null;
  }): Promise<boolean> {
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    setChatSuccess("");
    setChatError("");

    if (!chatContent.trim()) {
      setChatError("O conteúdo da mensagem é obrigatório.");
      return;
    }

    if (chatTargetType === "ALUNO_ESPECIFICO" && !chatSelectedStudentId) {
      setChatError("Selecione um aluno.");
      return;
    }
    if (chatTargetType === "PROFESSOR_ESPECIFICO" && !chatSelectedTeacherId) {
      setChatError("Selecione um professor.");
      return;
    }

    setSendingChat(true);
    let success = 0;
    let failures = 0;

    try {
      if (chatTargetType === "ALUNO_ESPECIFICO") {
        const ok = await sendOneChatMessage({
          content: chatContent.trim(),
          senderRole: "GESTOR",
          studentId: chatSelectedStudentId,
          teacherId: null,
        });
        if (ok) success++;
        else failures++;
      } else if (chatTargetType === "TODOS_ALUNOS") {
        for (const s of students) {
          const ok = await sendOneChatMessage({
            content: chatContent.trim(),
            senderRole: "GESTOR",
            studentId: s.id,
            teacherId: null,
          });
          if (ok) success++;
          else failures++;
        }
      } else if (chatTargetType === "PROFESSOR_ESPECIFICO") {
        const ok = await sendOneChatMessage({
          content: chatContent.trim(),
          senderRole: "GESTOR",
          studentId: null,
          teacherId: chatSelectedTeacherId,
        });
        if (ok) success++;
        else failures++;
      } else if (chatTargetType === "TODOS_PROFESSORES") {
        for (const t of teachers) {
          const ok = await sendOneChatMessage({
            content: chatContent.trim(),
            senderRole: "GESTOR",
            studentId: null,
            teacherId: t.id,
          });
          if (ok) success++;
          else failures++;
        }
      }

      if (failures === 0 && success === 1) {
        setChatSuccess("Mensagem enviada com sucesso.");
      } else if (failures === 0 && success > 1) {
        setChatSuccess("Mensagens enviadas com sucesso.");
      } else if (success > 0 && failures > 0) {
        setChatSuccess(`Envio parcial: ${success} mensagem(ns) enviada(s), ${failures} falha(s).`);
      } else {
        setChatError("Falha ao enviar mensagem(ns).");
      }

      if (success > 0) {
        setChatContent("");
        await fetchQuestions();
      }
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
          studentId: question.studentId ?? null,
          teacherId: question.teacherId ?? null,
          senderRole: "GESTOR",
          answeredById: currentUserId,
        }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        const msg = isRecord(data) ? getStringFromRecord(data, "error") || getStringFromRecord(data, "message") : "";
        throw new Error(msg || "Falha ao responder.");
      }
      setReplyContent((prev) => ({ ...prev, [question.id]: "" }));
      await fetchQuestions();
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Erro ao responder.");
    }
  }

  function getThreadList(q: ThreadMessage): ThreadMessage[] {
    const list = [q, ...(q.children || [])];
    return list.sort((a, b) => {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      if (Number.isNaN(da) && Number.isNaN(db)) return 0;
      if (Number.isNaN(da)) return 1;
      if (Number.isNaN(db)) return -1;
      return da - db;
    });
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-semibold tracking-tight mb-1">Gestão</h1>
        <p className="text-[#a1a1a1] text-sm mb-6">
          {students.length} aluno(s) carregado(s) · {teachers.length} professor(es) carregado(s)
        </p>

        <div className="flex gap-2 mb-6 border-b border-[#ffffff10]">
          {(["mural", "chat"] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
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
            <form onSubmit={handlePublishNotice} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold">Novo aviso</h2>

              <div>
                <label className="block text-sm text-[#a1a1a1] mb-1">Destinatário</label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as TargetType)}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                >
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                </select>
              </div>

              {targetType === "ALUNO_ESPECIFICO" && (
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Aluno</label>
                  {studentsOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum aluno carregado.</p>
                  ) : (
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione...</option>
                      {studentsOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {targetType === "PROFESSOR_ESPECIFICO" && (
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Professor</label>
                  {teachersOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum professor carregado.</p>
                  ) : (
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione...</option>
                      {teachersOptions.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm text-[#a1a1a1] mb-1">Título</label>
                <input
                  type="text"
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  placeholder="Título do aviso"
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                />
              </div>

              <div>
                <label className="block text-sm text-[#a1a1a1] mb-1">Conteúdo</label>
                <textarea
                  value={noticeContent}
                  onChange={(e) => setNoticeContent(e.target.value)}
                  placeholder="Conteúdo do aviso"
                  rows={4}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373] resize-y"
                />
              </div>

              {noticeError && <p className="text-sm text-red-400">{noticeError}</p>}
              {noticeSuccess && <p className="text-sm text-[#D4A373]">{noticeSuccess}</p>}

              <button
                type="submit"
                disabled={savingNotice}
                className="px-4 py-2 rounded-lg bg-[#D4A373] text-[#0a0a0a] text-sm font-semibold hover:bg-[#c89a63] disabled:opacity-50 transition-colors"
              >
                {savingNotice ? "Publicando..." : "Publicar"}
              </button>
            </form>

            <div className="space-y-3">
              <h3 className="text-sm uppercase tracking-wide text-[#a1a1a1]">Avisos recentes</h3>
              {notices.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhum aviso publicado.</p>
              ) : (
                notices.map((n) => (
                  <div key={n.id} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-4">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="font-medium text-[#f5f5f5]">{n.title || "Aviso da Gestão"}</h4>
                      <span className="text-xs text-[#a1a1a1]">{formatDateTime(n.createdAt)}</span>
                    </div>
                    <p className="text-sm text-[#d4d4d4] whitespace-pre-wrap">{n.content}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#a1a1a1]">
                      {n.targetRole && (
                        <span className={`px-2 py-0.5 rounded border ${getRoleBadgeClass(n.targetRole)}`}>
                          {n.targetRole === "STUDENT" ? "Alunos" : "Professores"}
                        </span>
                      )}
                      {n.student && <span>Aluno: {n.student.name}</span>}
                      {n.professor && <span>Professor: {n.professor.name}</span>}
                      {n.author?.name && <span>Por: {n.author.name}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === "chat" && (
          <section className="space-y-6">
            <form onSubmit={handleSendChat} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold">Nova mensagem</h2>

              <div>
                <label className="block text-sm text-[#a1a1a1] mb-1">Destinatário</label>
                <select
                  value={chatTargetType}
                  onChange={(e) => setChatTargetType(e.target.value as TargetType)}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                >
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                </select>
              </div>

              {chatTargetType === "ALUNO_ESPECIFICO" && (
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Aluno</label>
                  {studentsOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum aluno carregado.</p>
                  ) : (
                    <select
                      value={chatSelectedStudentId}
                      onChange={(e) => setChatSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione...</option>
                      {studentsOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {chatTargetType === "PROFESSOR_ESPECIFICO" && (
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Professor</label>
                  {teachersOptions.length === 0 ? (
                    <p className="text-sm text-[#a1a1a1]">Nenhum professor carregado.</p>
                  ) : (
                    <select
                      value={chatSelectedTeacherId}
                      onChange={(e) => setChatSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione...</option>
                      {teachersOptions.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm text-[#a1a1a1] mb-1">Conteúdo</label>
                <textarea
                  value={chatContent}
                  onChange={(e) => setChatContent(e.target.value)}
                  placeholder="Conteúdo da mensagem"
                  rows={4}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373] resize-y"
                />
              </div>

              {chatError && <p className="text-sm text-red-400">{chatError}</p>}
              {chatSuccess && <p className="text-sm text-[#D4A373]">{chatSuccess}</p>}

              <button
                type="submit"
                disabled={sendingChat}
                className="px-4 py-2 rounded-lg bg-[#D4A373] text-[#0a0a0a] text-sm font-semibold hover:bg-[#c89a63] disabled:opacity-50 transition-colors"
              >
                {sendingChat ? "Enviando..." : "Enviar"}
              </button>
            </form>

            <div className="space-y-3">
              <h3 className="text-sm uppercase tracking-wide text-[#a1a1a1]">Histórico de conversas</h3>
              {questions.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhuma mensagem encontrada.</p>
              ) : (
                questions.map((q) => {
                  const thread = getThreadList(q);
                  const status = getThreadStatus(thread);
                  const isOpen = expandedQuestion === q.id;
                  return (
                    <div key={q.id} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded border text-xs ${getRoleBadgeClass(q.senderRole)}`}>
                            {q.senderRole}
                          </span>
                          <span className="text-xs text-[#a1a1a1]">
                            {q.student?.name || q.teacher?.name || "—"}
                          </span>
                        </div>
                        <span className="text-xs text-[#a1a1a1]">{formatDateTime(q.createdAt)}</span>
                      </div>

                      <div className="space-y-2">
                        {thread.map((m) => (
                          <div key={m.id} className="border-l border-[#ffffff10] pl-3">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium text-[#f5f5f5]">{getAuthorName(m)}</span>
                              <span className="text-[10px] text-[#a1a1a1]">{formatDateTime(m.createdAt)}</span>
                            </div>
                            <p className="text-sm text-[#d4d4d4] whitespace-pre-wrap">{m.content}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedQuestion(isOpen ? null : q.id)}
                          className="text-xs px-3 py-1 rounded-lg border border-[#ffffff10] text-[#a1a1a1] hover:text-[#f5f5f5] hover:border-[#ffffff30] transition-colors"
                        >
                          Continuar conversa
                        </button>
                        <span className="text-[10px] text-[#a1a1a1]">{status.total} mensagem(ns)</span>
                      </div>

                      {isOpen && (
                        <form onSubmit={(e) => handleReply(q, e)} className="mt-3 space-y-2">
                          <textarea
                            value={replyContent[q.id] || ""}
                            onChange={(e) =>
                              setReplyContent((prev) => ({ ...prev, [q.id]: e.target.value }))
                            }
                            placeholder="Escreva sua resposta..."
                            rows={3}
                            className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373] resize-y"
                          />
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              className="px-3 py-1.5 rounded-lg bg-[#D4A373] text-[#0a0a0a] text-xs font-semibold hover:bg-[#c89a63] transition-colors"
                            >
                              Responder
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedQuestion(null);
                                setReplyContent((prev) => ({ ...prev, [q.id]: "" }));
                              }}
                              className="px-3 py-1.5 rounded-lg border border-[#ffffff10] text-[#a1a1a1] text-xs hover:text-[#f5f5f5] transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
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

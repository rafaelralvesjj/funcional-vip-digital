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
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
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
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findFirstArray(value: unknown, depth = 0): unknown[] | null {
  if (depth > 4) return null;
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
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
    if (key in data) {
      const found = findFirstArray(data[key], 0);
      if (found) return found;
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
    user: userNested
      ? { id: getStringFromRecord(userNested, "id") ?? id, name: getStringFromRecord(userNested, "name") ?? name }
      : null,
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
    user: userNested
      ? {
          id: getStringFromRecord(userNested, "id") ?? id,
          name: getStringFromRecord(userNested, "name") ?? name,
          email: userNested ? getStringFromRecord(userNested, "email") : null,
        }
      : null,
    _count: isRecord(item["_count"]) && typeof item["_count"]["students"] === "number"
      ? { students: item["_count"]["students"] as number }
      : undefined,
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
    createdAt: getStringFromRecord(item, "createdAt") ?? new Date().toISOString(),
    author: authorNested
      ? {
          id: getStringFromRecord(authorNested, "id") ?? "",
          name: getStringFromRecord(authorNested, "name"),
          role: getStringFromRecord(authorNested, "role"),
        }
      : null,
    student: studentNested
      ? { id: getStringFromRecord(studentNested, "id") ?? "", name: getStringFromRecord(studentNested, "name") ?? "" }
      : null,
    professor: professorNested
      ? { id: getStringFromRecord(professorNested, "id") ?? "", name: getStringFromRecord(professorNested, "name") }
      : null,
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
  const childrenRaw = item["children"];
  const children = Array.isArray(childrenRaw)
    ? childrenRaw.map(normalizeThreadMessage).filter((m): m is ThreadMessage => m !== null)
    : undefined;
  return {
    id,
    studentId: getStringFromRecord(item, "studentId"),
    teacherId: getStringFromRecord(item, "teacherId"),
    content,
    senderRole: getStringFromRecord(item, "senderRole") ?? "GESTOR",
    createdAt: getStringFromRecord(item, "createdAt") ?? new Date().toISOString(),
    answeredBy: answeredByNested
      ? {
          id: getStringFromRecord(answeredByNested, "id") ?? "",
          name: getStringFromRecord(answeredByNested, "name"),
          role: getStringFromRecord(answeredByNested, "role"),
        }
      : null,
    student: studentNested
      ? { id: getStringFromRecord(studentNested, "id") ?? "", name: getStringFromRecord(studentNested, "name") ?? "" }
      : null,
    teacher: teacherNested
      ? { id: getStringFromRecord(teacherNested, "id") ?? "", name: getStringFromRecord(teacherNested, "name") }
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
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
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
  const hasReply = Array.isArray(thread.children) && thread.children.length > 0;
  if (hasReply) {
    return { label: "Respondida", className: "bg-[#D4A37320] text-[#D4A373] border-[#D4A37340]" };
  }
  return { label: "Aguardando", className: "bg-[#ffffff10] text-[#a1a1a1] border-[#ffffff20]" };
}

function getAuthorName(msg: ThreadMessage): string {
  if (msg.answeredBy?.name) return msg.answeredBy.name;
  if (msg.senderRole === "GESTOR") return "Gestão";
  if (msg.senderRole === "PROFESSOR") return msg.teacher?.name ?? "Professor";
  if (msg.senderRole === "ALUNO") return msg.student?.name ?? "Aluno";
  return "Usuário";
}

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case "GESTOR":
      return "bg-[#D4A37320] text-[#D4A373] border-[#D4A37340]";
    case "PROFESSOR":
      return "bg-[#3a5a4020] text-[#a3b18a] border-[#a3b18a40]";
    case "ALUNO":
      return "bg-[#ffffff10] text-[#f5f5f5] border-[#ffffff20]";
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
  const [chatSelectedStudentId, setChatSelectedStudentId] = useState<string>("");
  const [chatSelectedTeacherId, setChatSelectedTeacherId] = useState<string>("");

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
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok) return;
        const data = await safeJson(res);
        if (!isRecord(data)) return;
        const uid = getStringFromRecord(data, "userId") || getStringFromRecord(data, "id");
        const userNested = getNestedRecord(data, "user");
        const finalUid = uid || (userNested ? getStringFromRecord(userNested, "id") : null);
        if (mounted && finalUid) setCurrentUserId(finalUid);
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
        const arr = extractArray(data, [
          "students",
          "items",
          "results",
          "data",
          "rows",
          "records",
          "alunos",
        ]);
        const normalized = arr.map(normalizeStudent).filter((s): s is Student => s !== null);
        if (mounted) setStudents(dedupeById(normalized));
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
        const arr = extractArray(data, [
          "teachers",
          "items",
          "results",
          "data",
          "rows",
          "records",
          "professores",
        ]);
        const normalized = arr.map(normalizeTeacher).filter((t): t is Teacher => t !== null);
        if (mounted) setTeachers(dedupeById(normalized));
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
      const arr = extractArray(data, ["notices", "items", "results", "data", "rows", "records"]);
      const normalized = arr.map(normalizeNotice).filter((n): n is Notice => n !== null);
      setNotices(normalized);
    } catch {
      /* ignore */
    }
  };

  const fetchQuestions = async () => {
    try {
      const res = await fetch("/api/questions", { cache: "no-store" });
      if (!res.ok) return;
      const data = await safeJson(res);
      const arr = extractArray(data, ["questions", "items", "results", "data", "rows", "records"]);
      const normalized = arr.map(normalizeThreadMessage).filter((q): q is ThreadMessage => q !== null);
      setQuestions(normalized);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchNotices();
  }, []);

  useEffect(() => {
    if (activeTab === "chat") fetchQuestions();
  }, [activeTab]);

  const handlePublishNotice = async (e: FormEvent) => {
    e.preventDefault();
    setNoticeSuccess(null);
    setNoticeError(null);
    if (!noticeTitle.trim() || !noticeContent.trim()) {
      setNoticeError("Preencha título e conteúdo.");
      return;
    }
    if (!currentUserId) {
      setNoticeError("Sessão não carregada. Tente novamente.");
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
      const body: Record<string, unknown> = {
        title: noticeTitle.trim(),
        content: noticeContent.trim(),
        type: "MANAGEMENT",
        targetRole: targetType,
        authorId: currentUserId,
      };
      if (targetType === "ALUNO_ESPECIFICO") body.studentId = selectedStudentId;
      if (targetType === "PROFESSOR_ESPECIFICO") body.professorId = selectedTeacherId;
      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        const msg = isRecord(data) ? getStringFromRecord(data, "error") || getStringFromRecord(data, "message") : null;
        setNoticeError(msg ?? `Falha ao publicar aviso (status ${res.status}).`);
        return;
      }
      setNoticeSuccess("Aviso publicado com sucesso.");
      setNoticeTitle("");
      setNoticeContent("");
      setSelectedStudentId("");
      setSelectedTeacherId("");
      await fetchNotices();
    } catch (err) {
      setNoticeError(err instanceof Error ? err.message : "Erro ao publicar aviso.");
    } finally {
      setSavingNotice(false);
    }
  };

  const buildChatTargets = (): { studentId?: string; teacherId?: string }[] => {
    if (chatTargetType === "ALUNO_ESPECIFICO") {
      if (!chatSelectedStudentId) return [];
      return [{ studentId: chatSelectedStudentId }];
    }
    if (chatTargetType === "PROFESSOR_ESPECIFICO") {
      if (!chatSelectedTeacherId) return [];
      return [{ teacherId: chatSelectedTeacherId }];
    }
    if (chatTargetType === "TODOS_ALUNOS") {
      return students.map((s) => ({ studentId: s.id }));
    }
    if (chatTargetType === "TODOS_PROFESSORES") {
      return teachers.map((t) => ({ teacherId: t.id }));
    }
    return [];
  };

  const handleSendChat = async (e: FormEvent) => {
    e.preventDefault();
    setChatSuccess(null);
    setChatError(null);
    if (!chatContent.trim()) {
      setChatError("Digite uma mensagem.");
      return;
    }
    if (!currentUserId) {
      setChatError("Sessão não carregada. Tente novamente.");
      return;
    }
    const targets = buildChatTargets();
    if (targets.length === 0) {
      setChatError("Selecione ao menos um destinatário.");
      return;
    }
    setSendingChat(true);
    let success = 0;
    let lastError: string | null = null;
    try {
      for (const target of targets) {
        const body: Record<string, unknown> = {
          content: chatContent.trim(),
          senderRole: "GESTOR",
          answeredById: currentUserId,
        };
        if (target.studentId) body.studentId = target.studentId;
        if (target.teacherId) body.teacherId = target.teacherId;
        try {
          const res = await fetch("/api/questions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await safeJson(res);
          if (!res.ok) {
            const msg = isRecord(data)
              ? getStringFromRecord(data, "error") || getStringFromRecord(data, "message")
              : null;
            lastError = msg ?? `Falha ao enviar mensagem (status ${res.status}).`;
          } else {
            success++;
          }
        } catch (err) {
          lastError = err instanceof Error ? err.message : "Erro de rede ao enviar mensagem.";
        }
      }
      if (success > 0) {
        setChatSuccess(`${success} mensagem(ns) enviada(s) com sucesso.`);
        setChatContent("");
        setChatSelectedStudentId("");
        setChatSelectedTeacherId("");
        await fetchQuestions();
      }
      if (success === 0 && lastError) {
        setChatError(lastError);
      } else if (success > 0 && lastError) {
        setChatError(`Algumas mensagens falharam. Último erro: ${lastError}`);
      }
    } finally {
      setSendingChat(false);
    }
  };

  const handleReply = async (parentId: string, parent: ThreadMessage) => {
    const content = (replyContent[parentId] ?? "").trim();
    if (!content) return;
    if (!currentUserId) {
      setChatError("Sessão não carregada. Tente novamente.");
      return;
    }
    setSendingChat(true);
    setChatError(null);
    setChatSuccess(null);
    try {
      const body: Record<string, unknown> = {
        content,
        parentId,
        senderRole: "GESTOR",
        answeredById: currentUserId,
      };
      if (parent.studentId) body.studentId = parent.studentId;
      if (parent.teacherId) body.teacherId = parent.teacherId;
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        const msg = isRecord(data)
          ? getStringFromRecord(data, "error") || getStringFromRecord(data, "message")
          : null;
        setChatError(msg ?? `Falha ao responder (status ${res.status}).`);
        return;
      }
      setReplyContent((prev) => ({ ...prev, [parentId]: "" }));
      setExpandedQuestion(null);
      setChatSuccess("Resposta enviada com sucesso.");
      await fetchQuestions();
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Erro ao responder.");
    } finally {
      setSendingChat(false);
    }
  };

  const renderThread = (msg: ThreadMessage, depth = 0): JSX.Element => {
    const status = getThreadStatus(msg);
    return (
      <div key={msg.id} className="flex flex-col gap-2">
        <div
          className="rounded-lg border border-[#ffffff10] bg-[#111111] p-3"
          style={{ marginLeft: depth * 16 }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded border px-2 py-0.5 text-xs ${getRoleBadgeClass(msg.senderRole)}`}>
              {msg.senderRole}
            </span>
            <span className="text-sm font-semibold text-[#f5f5f5]">{getAuthorName(msg)}</span>
            <span className="text-xs text-[#a1a1a1]">{formatDateTime(msg.createdAt)}</span>
            {depth === 0 && (
              <span className={`rounded border px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span>
            )}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[#f5f5f5]">{msg.content}</p>
        </div>
        {Array.isArray(msg.children) && msg.children.length > 0 && (
          <div className="flex flex-col gap-2">
            {msg.children.map((child) => renderThread(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-[#f5f5f5]">Gestão</h1>
        <p className="mt-1 text-sm text-[#a1a1a1]">
          {students.length} aluno(s) carregado(s) • {teachers.length} professor(es) carregado(s) •{" "}
          {notices.length} aviso(s) • {questions.length} mensagem(ns)
        </p>

        <div className="mt-6 flex gap-2 border-b border-[#ffffff10]">
          <button
            type="button"
            onClick={() => setActiveTab("mural")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
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
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "chat"
                ? "border-b-2 border-[#D4A373] text-[#D4A373]"
                : "text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Chat
          </button>
        </div>

        {activeTab === "mural" && (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <form
              onSubmit={handlePublishNotice}
              className="flex flex-col gap-4 rounded-lg border border-[#ffffff10] bg-[#111111] p-4"
            >
              <h2 className="text-lg font-semibold text-[#f5f5f5]">Publicar aviso</h2>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-[#a1a1a1]">Destinatário</span>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as TargetType)}
                  className="rounded border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5]"
                >
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                </select>
              </label>

              {targetType === "ALUNO_ESPECIFICO" &&
                (studentsOptions.length === 0 ? (
                  <p className="text-sm text-[#a1a1a1]">Nenhum aluno carregado.</p>
                ) : (
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-[#a1a1a1]">Aluno</span>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="rounded border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5]"
                    >
                      <option value="">Selecione...</option>
                      {studentsOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}

              {targetType === "PROFESSOR_ESPECIFICO" &&
                (teachersOptions.length === 0 ? (
                  <p className="text-sm text-[#a1a1a1]">Nenhum professor carregado.</p>
                ) : (
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-[#a1a1a1]">Professor</span>
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="rounded border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5]"
                    >
                      <option value="">Selecione...</option>
                      {teachersOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}

              <label className="flex flex-col gap-1">
                <span className="text-sm text-[#a1a1a1]">Título</span>
                <input
                  type="text"
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  className="rounded border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5]"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-[#a1a1a1]">Conteúdo</span>
                <textarea
                  value={noticeContent}
                  onChange={(e) => setNoticeContent(e.target.value)}
                  rows={4}
                  className="rounded border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5]"
                />
              </label>

              {noticeError && <p className="text-sm text-red-400">{noticeError}</p>}
              {noticeSuccess && <p className="text-sm text-[#D4A373]">{noticeSuccess}</p>}

              <button
                type="submit"
                disabled={savingNotice}
                className="rounded bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a] disabled:opacity-50"
              >
                {savingNotice ? "Publicando..." : "Publicar"}
              </button>
            </form>

            <div className="flex flex-col gap-3 rounded-lg border border-[#ffffff10] bg-[#111111] p-4">
              <h2 className="text-lg font-semibold text-[#f5f5f5]">Avisos publicados</h2>
              {notices.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhum aviso publicado.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {notices.map((n) => (
                    <div key={n.id} className="rounded border border-[#ffffff10] bg-[#0a0a0a] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#f5f5f5]">
                          {n.title ?? "Sem título"}
                        </span>
                        <span className="rounded border border-[#ffffff20] bg-[#ffffff10] px-2 py-0.5 text-xs text-[#a1a1a1]">
                          {n.targetRole ?? n.type ?? "-"}
                        </span>
                        <span className="text-xs text-[#a1a1a1]">{formatDateTime(n.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[#f5f5f5]">{n.content}</p>
                      <p className="mt-2 text-xs text-[#a1a1a1]">
                        {n.student?.name && `Aluno: ${n.student.name}`}
                        {n.professor?.name && ` • Professor: ${n.professor.name}`}
                        {n.author?.name && ` • Autor: ${n.author.name}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <form
              onSubmit={handleSendChat}
              className="flex flex-col gap-4 rounded-lg border border-[#ffffff10] bg-[#111111] p-4"
            >
              <h2 className="text-lg font-semibold text-[#f5f5f5]">Enviar mensagem</h2>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-[#a1a1a1]">Destinatário</span>
                <select
                  value={chatTargetType}
                  onChange={(e) => setChatTargetType(e.target.value as TargetType)}
                  className="rounded border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5]"
                >
                  <option value="TODOS_ALUNOS">Todos os alunos</option>
                  <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                  <option value="TODOS_PROFESSORES">Todos os professores</option>
                  <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                </select>
              </label>

              {chatTargetType === "ALUNO_ESPECIFICO" &&
                (studentsOptions.length === 0 ? (
                  <p className="text-sm text-[#a1a1a1]">Nenhum aluno carregado.</p>
                ) : (
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-[#a1a1a1]">Aluno</span>
                    <select
                      value={chatSelectedStudentId}
                      onChange={(e) => setChatSelectedStudentId(e.target.value)}
                      className="rounded border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5]"
                    >
                      <option value="">Selecione...</option>
                      {studentsOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}

              {chatTargetType === "PROFESSOR_ESPECIFICO" &&
                (teachersOptions.length === 0 ? (
                  <p className="text-sm text-[#a1a1a1]">Nenhum professor carregado.</p>
                ) : (
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-[#a1a1a1]">Professor</span>
                    <select
                      value={chatSelectedTeacherId}
                      onChange={(e) => setChatSelectedTeacherId(e.target.value)}
                      className="rounded border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5]"
                    >
                      <option value="">Selecione...</option>
                      {teachersOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}

              <label className="flex flex-col gap-1">
                <span className="text-sm text-[#a1a1a1]">Conteúdo</span>
                <textarea
                  value={chatContent}
                  onChange={(e) => setChatContent(e.target.value)}
                  rows={4}
                  className="rounded border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5]"
                />
              </label>

              {chatError && <p className="text-sm text-red-400">{chatError}</p>}
              {chatSuccess && <p className="text-sm text-[#D4A373]">{chatSuccess}</p>}

              <button
                type="submit"
                disabled={sendingChat}
                className="rounded bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a] disabled:opacity-50"
              >
                {sendingChat ? "Enviando..." : "Enviar"}
              </button>
            </form>

            <div className="flex flex-col gap-3 rounded-lg border border-[#ffffff10] bg-[#111111] p-4">
              <h2 className="text-lg font-semibold text-[#f5f5f5]">Conversas</h2>
              {questions.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhuma mensagem carregada.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {questions.map((q) => {
                    const isExpanded = expandedQuestion === q.id;
                    return (
                      <div key={q.id} className="flex flex-col gap-2">
                        {renderThread(q, 0)}
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedQuestion(isExpanded ? null : q.id)
                            }
                            className="self-start rounded border border-[#ffffff20] bg-[#0a0a0a] px-3 py-1 text-xs text-[#a1a1a1] hover:text-[#f5f5f5]"
                          >
                            {isExpanded ? "Fechar conversa" : "Continuar conversa"}
                          </button>
                          {isExpanded && (
                            <div className="flex flex-col gap-2">
                              <textarea
                                value={replyContent[q.id] ?? ""}
                                onChange={(e) =>
                                  setReplyContent((prev) => ({
                                    ...prev,
                                    [q.id]: e.target.value,
                                  }))
                                }
                                rows={3}
                                className="rounded border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f5f5f5]"
                                placeholder="Digite a resposta..."
                              />
                              <button
                                type="button"
                                disabled={sendingChat}
                                onClick={() => handleReply(q.id, q)}
                                className="self-start rounded bg-[#D4A373] px-3 py-1 text-xs font-semibold text-[#0a0a0a] disabled:opacity-50"
                              >
                                {sendingChat ? "Enviando..." : "Responder"}
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
        )}
      </div>
    </div>
  );
}

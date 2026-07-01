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

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function findFirstArray(value: unknown, depth = 0): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (depth > 4 || !isRecord(value)) return null;
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
    if (Array.isArray(data[key])) return data[key] as unknown[];
  }
  const nestedKeys = ["data", "result", "payload", "response"];
  for (const nestedKey of nestedKeys) {
    const nested = data[nestedKey];
    if (Array.isArray(nested)) return nested as unknown[];
    if (isRecord(nested)) {
      for (const key of candidateKeys) {
        if (Array.isArray(nested[key])) return nested[key] as unknown[];
      }
    }
  }
  const found = findFirstArray(data, 0);
  return found ? found : [];
}

function normalizeStudent(item: unknown): Student | null {
  if (!isRecord(item)) return null;
  const studentRec = getNestedRecord(item, "student");
  const userRec = getNestedRecord(item, "user");

  const id =
    getString(item.id) ||
    (studentRec ? getString(studentRec.id) : "") ||
    getString(item.studentId) ||
    getString(item.userId) ||
    (userRec ? getString(userRec.id) : "");

  const name =
    getString(item.name) ||
    (studentRec ? getString(studentRec.name) : "") ||
    getString(item.studentName) ||
    (userRec ? getString(userRec.name) : "") ||
    getString(item.nome);

  if (!id) return null;
  return {
    id,
    name: name || "Aluno sem nome",
    userId: getString(item.userId) || (userRec ? getString(userRec.id) : "") || null,
    user: userRec ? { id: getString(userRec.id), name: userRec.name } : null,
  };
}

function normalizeTeacher(item: unknown): Teacher | null {
  if (!isRecord(item)) return null;
  const userRec = getNestedRecord(item, "user");
  const teacherRec = getNestedRecord(item, "teacher");

  const id =
    getString(item.userId) ||
    (userRec ? getString(userRec.id) : "") ||
    getString(item.id);

  const name =
    getString(item.name) ||
    (userRec ? getString(userRec.name) : "") ||
    getString(item.teacherName) ||
    (teacherRec ? getString(teacherRec.name) : "") ||
    getString(item.nome);

  if (!id) return null;
  return {
    id,
    name: name || "Professor sem nome",
    email: getString(item.email) || (userRec ? getString(userRec.email) : "") || null,
    userId: getString(item.userId) || (userRec ? getString(userRec.id) : "") || null,
    user: userRec ? { id: getString(userRec.id), name: userRec.name, email: userRec.email } : null,
    _count: isRecord(item._count) ? { students: Number(item._count.students) || 0 } : undefined,
  };
}

function normalizeNotice(item: unknown): Notice | null {
  if (!isRecord(item)) return null;
  const id = getString(item.id);
  if (!id) return null;
  const authorRec = getNestedRecord(item, "author");
  const studentRec = getNestedRecord(item, "student");
  const professorRec = getNestedRecord(item, "professor");
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
    author: authorRec ? { id: getString(authorRec.id), name: authorRec.name, role: authorRec.role } : null,
    student: studentRec ? { id: getString(studentRec.id), name: getString(studentRec.name) } : null,
    professor: professorRec ? { id: getString(professorRec.id), name: professorRec.name } : null,
  };
}

function normalizeThreadMessage(item: unknown): ThreadMessage | null {
  if (!isRecord(item)) return null;
  const id = getString(item.id);
  if (!id) return null;
  const answeredByRec = getNestedRecord(item, "answeredBy");
  const studentRec = getNestedRecord(item, "student");
  const teacherRec = getNestedRecord(item, "teacher");
  const childrenRaw = item.children;
  const children = Array.isArray(childrenRaw)
    ? childrenRaw.map(normalizeThreadMessage).filter((m): m is ThreadMessage => m !== null)
    : [];
  return {
    id,
    studentId: getString(item.studentId) || null,
    teacherId: getString(item.teacherId) || null,
    content: getString(item.content),
    senderRole: getString(item.senderRole) || "GESTOR",
    createdAt: getString(item.createdAt) || new Date().toISOString(),
    answeredBy: answeredByRec ? { id: getString(answeredByRec.id), name: answeredByRec.name, role: answeredByRec.role } : null,
    student: studentRec ? { id: getString(studentRec.id), name: getString(studentRec.name) } : null,
    teacher: teacherRec ? { id: getString(teacherRec.id), name: teacherRec.name } : null,
    children,
  };
}

function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of list) {
    if (item && item.id && !map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getThreadStatus(question: ThreadMessage): string {
  const hasGestorReply = (msgs: ThreadMessage[]): boolean => {
    for (const m of msgs) {
      if (m.senderRole === "GESTOR") return true;
      if (m.children && m.children.length > 0 && hasGestorReply(m.children)) return true;
    }
    return false;
  };
  if (hasGestorReply(question.children || [])) return "Respondido";
  return "Aguardando";
}

function getAuthorName(msg: ThreadMessage): string {
  if (msg.answeredBy?.name) return msg.answeredBy.name;
  if (msg.senderRole === "GESTOR") return "Gestão";
  if (msg.senderRole === "PROFESSOR") return msg.teacher?.name || "Professor";
  return msg.student?.name || "Aluno";
}

function getRoleBadgeClass(role: string): string {
  if (role === "GESTOR") return "bg-[#D4A373]/20 text-[#D4A373] border-[#D4A373]/30";
  if (role === "PROFESSOR") return "bg-[#3a5a40]/20 text-[#a3b18a] border-[#a3b18a]/30";
  return "bg-[#ffffff10] text-[#a1a1a1] border-[#ffffff20]";
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

  const studentsOptions = useMemo(() => students, [students]);
  const teachersOptions = useMemo(() => teachers, [teachers]);

  async function fetchSession() {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await safeJson(res);
      if (isRecord(data)) {
        const id = getString(data.id) || getString(data.userId) || (data.user ? getString((data.user as Record<string, unknown>).id) : "");
        if (id) setCurrentUserId(id);
      }
    } catch {
      /* ignore */
    }
  }

  async function fetchStudents() {
    try {
      const res = await fetch("/api/students", { cache: "no-store" });
      const data = await safeJson(res);
      const list = extractArray(data, ["students", "items", "results", "data", "rows", "records", "alunos"]);
      const normalized = list.map(normalizeStudent).filter((s): s is Student => s !== null);
      setStudents(dedupeById(normalized));
    } catch {
      setStudents([]);
    }
  }

  async function fetchTeachers() {
    try {
      const res = await fetch("/api/teachers", { cache: "no-store" });
      const data = await safeJson(res);
      const list = extractArray(data, ["teachers", "items", "results", "data", "rows", "records", "professores"]);
      const normalized = list.map(normalizeTeacher).filter((t): t is Teacher => t !== null);
      setTeachers(dedupeById(normalized));
    } catch {
      setTeachers([]);
    }
  }

  async function fetchNotices() {
    try {
      const res = await fetch("/api/notices", { cache: "no-store" });
      const data = await safeJson(res);
      const list = extractArray(data, ["notices", "items", "results", "data", "rows", "records"]);
      const normalized = list.map(normalizeNotice).filter((n): n is Notice => n !== null);
      setNotices(normalized);
    } catch {
      setNotices([]);
    }
  }

  async function fetchQuestions() {
    try {
      const res = await fetch("/api/questions", { cache: "no-store" });
      const data = await safeJson(res);
      const list = extractArray(data, ["questions", "items", "results", "data", "rows", "records"]);
      const normalized = list.map(normalizeThreadMessage).filter((q): q is ThreadMessage => q !== null);
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

  async function handlePublishNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeSuccess("");
    setNoticeError("");

    if (!noticeContent.trim()) {
      setNoticeError("O conteúdo é obrigatório.");
      return;
    }
    if (!currentUserId) {
      setNoticeError("Sessão não carregada. Recarregue a página.");
      return;
    }

    setSavingNotice(true);
    try {
      const body: Record<string, unknown> = {
        title: noticeTitle.trim(),
        content: noticeContent.trim(),
        authorId: currentUserId,
        type: "AVISO",
      };

      if (targetType === "ALUNO_ESPECIFICO") {
        if (!selectedStudentId) {
          setNoticeError("Selecione um aluno.");
          setSavingNotice(false);
          return;
        }
        body.studentId = selectedStudentId;
        body.targetRole = "ALUNO";
      } else if (targetType === "TODOS_ALUNOS") {
        body.targetRole = "ALUNO";
      } else if (targetType === "PROFESSOR_ESPECIFICO") {
        if (!selectedTeacherId) {
          setNoticeError("Selecione um professor.");
          setSavingNotice(false);
          return;
        }
        body.professorId = selectedTeacherId;
        body.targetRole = "PROFESSOR";
      } else if (targetType === "TODOS_PROFESSORES") {
        body.targetRole = "PROFESSOR";
      }

      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        const msg = isRecord(data) ? getString(data.error) : "";
        setNoticeError(msg || `Erro ao publicar aviso (${res.status}).`);
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
    setChatSuccess("");
    setChatError("");

    if (!chatContent.trim()) {
      setChatError("O conteúdo é obrigatório.");
      return;
    }

    let targets: { studentId: string | null; teacherId: string | null }[] = [];

    if (chatTargetType === "TODOS_ALUNOS") {
      if (students.length === 0) {
        setChatError("Nenhum aluno carregado.");
        return;
      }
      targets = students.map((s) => ({ studentId: s.id, teacherId: null }));
    } else if (chatTargetType === "ALUNO_ESPECIFICO") {
      if (!selectedStudentId) {
        setChatError("Selecione um aluno.");
        return;
      }
      targets = [{ studentId: selectedStudentId, teacherId: null }];
    } else if (chatTargetType === "TODOS_PROFESSORES") {
      if (teachers.length === 0) {
        setChatError("Nenhum professor carregado.");
        return;
      }
      targets = teachers.map((t) => ({ studentId: null, teacherId: t.id }));
    } else if (chatTargetType === "PROFESSOR_ESPECIFICO") {
      if (!selectedTeacherId) {
        setChatError("Selecione um professor.");
        return;
      }
      targets = [{ studentId: null, teacherId: selectedTeacherId }];
    }

    setSendingChat(true);
    let success = 0;
    let failures = 0;

    try {
      for (const target of targets) {
        const body: Record<string, unknown> = {
          content: chatContent.trim(),
          senderRole: "GESTOR",
          studentId: target.studentId,
          teacherId: target.teacherId,
        };
        try {
          const res = await fetch("/api/questions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
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

      if (success > 0 && failures === 0) {
        setChatSuccess(success === 1 ? "Mensagem enviada com sucesso." : "Mensagens enviadas com sucesso.");
        setChatContent("");
        await fetchQuestions();
      } else if (success > 0 && failures > 0) {
        setChatSuccess(`Envio parcial: ${success} mensagem(ns) enviada(s), ${failures} falha(s).`);
        await fetchQuestions();
      } else {
        setChatError("Falha ao enviar mensagem(ns).");
      }
    } catch {
      setChatError("Falha ao enviar mensagem(ns).");
    } finally {
      setSendingChat(false);
    }
  }

  async function handleReply(question: ThreadMessage) {
    const text = (replyContent[question.id] || "").trim();
    if (!text) return;
    if (!currentUserId) {
      setChatError("Sessão não carregada. Recarregue a página.");
      return;
    }

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
        const data = await safeJson(res);
        const msg = isRecord(data) ? getString(data.error) : "";
        setChatError(msg || "Falha ao enviar resposta.");
        return;
      }
      setReplyContent((prev) => ({ ...prev, [question.id]: "" }));
      await fetchQuestions();
    } catch {
      setChatError("Falha ao enviar resposta.");
    }
  }

  function renderThread(messages: ThreadMessage[], depth = 0): JSX.Element {
    return (
      <div className={depth > 0 ? "ml-4 border-l border-[#ffffff10] pl-3 mt-2 space-y-2" : "space-y-2"}>
        {messages.map((msg) => (
          <div key={msg.id} className="rounded-md border border-[#ffffff10] bg-[#111111] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded border ${getRoleBadgeClass(msg.senderRole)}`}>
                  {msg.senderRole}
                </span>
                <span className="text-sm text-[#f5f5f5] font-medium">{getAuthorName(msg)}</span>
              </div>
              <span className="text-[11px] text-[#a1a1a1]">{formatDateTime(msg.createdAt)}</span>
            </div>
            <p className="text-sm text-[#d4d4d4] mt-2 whitespace-pre-wrap">{msg.content}</p>
            {msg.children && msg.children.length > 0 ? renderThread(msg.children, depth + 1) : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold text-[#D4A373] mb-1">Gestão</h1>
        <p className="text-xs text-[#a1a1a1] mb-6">
          {students.length} aluno(s) carregado(s) · {teachers.length} professor(es) carregado(s)
        </p>

        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab("mural")}
            className={`px-4 py-2 rounded-md text-sm border transition ${
              activeTab === "mural"
                ? "bg-[#D4A373] text-[#0a0a0a] border-[#D4A373]"
                : "bg-[#111111] text-[#a1a1a1] border-[#ffffff10] hover:text-[#f5f5f5]"
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
                : "bg-[#111111] text-[#a1a1a1] border-[#ffffff10] hover:text-[#f5f5f5]"
            }`}
          >
            Chat
          </button>
        </div>

        {activeTab === "mural" && (
          <section className="space-y-6">
            <form onSubmit={handlePublishNotice} className="space-y-4 bg-[#111111] border border-[#ffffff10] rounded-lg p-5">
              <h2 className="text-lg font-medium text-[#f5f5f5]">Publicar aviso</h2>

              <div>
                <label className="block text-xs text-[#a1a1a1] mb-1">Destinatário</label>
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

              {targetType === "ALUNO_ESPECIFICO" && (
                <div>
                  <label className="block text-xs text-[#a1a1a1] mb-1">Aluno</label>
                  {studentsOptions.length === 0 ? (
                    <p className="text-xs text-[#a1a1a1]">Nenhum aluno carregado.</p>
                  ) : (
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
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
                  <label className="block text-xs text-[#a1a1a1] mb-1">Professor</label>
                  {teachersOptions.length === 0 ? (
                    <p className="text-xs text-[#a1a1a1]">Nenhum professor carregado.</p>
                  ) : (
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
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
                <label className="block text-xs text-[#a1a1a1] mb-1">Título</label>
                <input
                  type="text"
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                  placeholder="Título do aviso"
                />
              </div>

              <div>
                <label className="block text-xs text-[#a1a1a1] mb-1">Conteúdo</label>
                <textarea
                  value={noticeContent}
                  onChange={(e) => setNoticeContent(e.target.value)}
                  rows={4}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                  placeholder="Conteúdo do aviso"
                />
              </div>

              {noticeError && <p className="text-xs text-red-400">{noticeError}</p>}
              {noticeSuccess && <p className="text-xs text-[#D4A373]">{noticeSuccess}</p>}

              <button
                type="submit"
                disabled={savingNotice}
                className="px-4 py-2 rounded-md bg-[#D4A373] text-[#0a0a0a] text-sm font-medium disabled:opacity-50"
              >
                {savingNotice ? "Publicando..." : "Publicar"}
              </button>
            </form>

            <div className="space-y-3">
              <h3 className="text-sm text-[#a1a1a1]">Avisos publicados</h3>
              {notices.length === 0 ? (
                <p className="text-xs text-[#a1a1a1]">Nenhum aviso publicado.</p>
              ) : (
                notices.map((n) => (
                  <div key={n.id} className="rounded-md border border-[#ffffff10] bg-[#111111] p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[#f5f5f5]">{n.title || "Sem título"}</span>
                      <span className="text-[11px] text-[#a1a1a1]">{formatDateTime(n.createdAt)}</span>
                    </div>
                    <p className="text-sm text-[#d4d4d4] mt-2 whitespace-pre-wrap">{n.content}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#a1a1a1]">
                      {n.targetRole && <span className="px-2 py-0.5 rounded border border-[#ffffff10]">{n.targetRole}</span>}
                      {n.student && <span>Aluno: {n.student.name}</span>}
                      {n.professor && <span>Professor: {n.professor.name}</span>}
                      {n.author?.name && <span>Autor: {n.author.name}</span>}
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
              <h2 className="text-lg font-medium text-[#f5f5f5]">Enviar mensagem</h2>

              <div>
                <label className="block text-xs text-[#a1a1a1] mb-1">Destinatário</label>
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

              {chatTargetType === "ALUNO_ESPECIFICO" && (
                <div>
                  <label className="block text-xs text-[#a1a1a1] mb-1">Aluno</label>
                  {studentsOptions.length === 0 ? (
                    <p className="text-xs text-[#a1a1a1]">Nenhum aluno carregado.</p>
                  ) : (
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
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
                  <label className="block text-xs text-[#a1a1a1] mb-1">Professor</label>
                  {teachersOptions.length === 0 ? (
                    <p className="text-xs text-[#a1a1a1]">Nenhum professor carregado.</p>
                  ) : (
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
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
                <label className="block text-xs text-[#a1a1a1] mb-1">Conteúdo</label>
                <textarea
                  value={chatContent}
                  onChange={(e) => setChatContent(e.target.value)}
                  rows={4}
                  className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                  placeholder="Conteúdo da mensagem"
                />
              </div>

              {chatError && <p className="text-xs text-red-400">{chatError}</p>}
              {chatSuccess && <p className="text-xs text-[#D4A373]">{chatSuccess}</p>}

              <button
                type="submit"
                disabled={sendingChat}
                className="px-4 py-2 rounded-md bg-[#D4A373] text-[#0a0a0a] text-sm font-medium disabled:opacity-50"
              >
                {sendingChat ? "Enviando..." : "Enviar"}
              </button>
            </form>

            <div className="space-y-3">
              <h3 className="text-sm text-[#a1a1a1]">Histórico de conversas</h3>
              {questions.length === 0 ? (
                <p className="text-xs text-[#a1a1a1]">Nenhuma mensagem no histórico.</p>
              ) : (
                questions.map((q) => {
                  const isOpen = expandedQuestion === q.id;
                  const status = getThreadStatus(q);
                  return (
                    <div key={q.id} className="rounded-md border border-[#ffffff10] bg-[#111111] p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded border ${getRoleBadgeClass(q.senderRole)}`}>
                            {q.senderRole}
                          </span>
                          <span className="text-sm text-[#f5f5f5] font-medium">{getAuthorName(q)}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded border border-[#ffffff10] text-[#a1a1a1]">
                            {status}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#a1a1a1]">{formatDateTime(q.createdAt)}</span>
                      </div>
                      <p className="text-sm text-[#d4d4d4] mt-2 whitespace-pre-wrap">{q.content}</p>

                      {q.children && q.children.length > 0 && renderThread(q.children, 1)}

                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setExpandedQuestion(isOpen ? null : q.id)}
                          className="text-xs text-[#D4A373] hover:underline"
                        >
                          {isOpen ? "Fechar conversa" : "Continuar conversa"}
                        </button>

                        {isOpen && (
                          <div className="mt-2 space-y-2">
                            <textarea
                              value={replyContent[q.id] || ""}
                              onChange={(e) =>
                                setReplyContent((prev) => ({ ...prev, [q.id]: e.target.value }))
                              }
                              rows={3}
                              className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-md px-3 py-2 text-sm text-[#f5f5f5]"
                              placeholder="Escreva uma resposta"
                            />
                            <button
                              type="button"
                              onClick={() => handleReply(q)}
                              className="px-3 py-1.5 rounded-md bg-[#D4A373] text-[#0a0a0a] text-xs font-medium"
                            >
                              Responder
                            </button>
                          </div>
                        )}
                      </div>
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

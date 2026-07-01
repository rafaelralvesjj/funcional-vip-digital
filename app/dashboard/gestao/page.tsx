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
type ChatStudentMode = "TODOS_ALUNOS" | "ALUNO_ESPECIFICO";
type ChatTeacherMode = "TODOS_PROFESSORES" | "PROFESSOR_ESPECIFICO";

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

function getNestedRecord(
  value: unknown,
  key: string
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const v = value[key];
  return isRecord(v) ? v : null;
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
  if (Array.isArray(value)) return value as unknown[];
  if (depth >= 4) return null;
  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      const found = findFirstArray((value as Record<string, unknown>)[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function extractArray(data: unknown, candidateKeys: string[]): unknown[] {
  if (Array.isArray(data)) return data as unknown[];
  if (!isRecord(data)) return [];
  for (const key of candidateKeys) {
    const v = (data as Record<string, unknown>)[key];
    if (Array.isArray(v)) return v as unknown[];
  }
  const nested = findFirstArray(data, 0);
  return nested ?? [];
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
    userId: getString(item, "userId") ?? undefined,
    user: userNested
      ? { id: userNested.id as string, name: getString(userNested, "name") }
      : undefined,
  };
}

function normalizeTeacher(item: unknown): Teacher | null {
  if (!isRecord(item)) return null;
  const userNested = getNestedRecord(item, "user");
  const teacherNested = getNestedRecord(item, "teacher");

  const id =
    getString(item, "userId") ||
    (userNested ? getString(userNested, "id") : null) ||
    getString(item, "id") ||
    (teacherNested ? getString(teacherNested, "id") : null);

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
    email: getString(item, "email") ?? undefined,
    userId: getString(item, "userId") ?? undefined,
    user: userNested
      ? {
          id: userNested.id as string,
          name: getString(userNested, "name"),
          email: getString(userNested, "email"),
        }
      : undefined,
  };
}

function normalizeNotice(item: unknown): Notice | null {
  if (!isRecord(item)) return null;
  const id = getString(item, "id");
  const content = getString(item, "content");
  const createdAt = getString(item, "createdAt");
  if (!id || !content || !createdAt) return null;
  const authorNested = getNestedRecord(item, "author");
  const studentNested = getNestedRecord(item, "student");
  const professorNested = getNestedRecord(item, "professor");
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
          name: getString(authorNested, "name"),
          role: getString(authorNested, "role"),
        }
      : null,
    student: studentNested
      ? { id: studentNested.id as string, name: getString(studentNested, "name") || "Aluno" }
      : null,
    professor: professorNested
      ? { id: professorNested.id as string, name: getString(professorNested, "name") }
      : null,
  };
}

function normalizeThreadMessage(item: unknown): ThreadMessage | null {
  if (!isRecord(item)) return null;
  const id = getString(item, "id");
  const content = getString(item, "content");
  const createdAt = getString(item, "createdAt");
  const studentId = getString(item, "studentId");
  const senderRole = getString(item, "senderRole");
  if (!id || !content || !createdAt || !studentId || !senderRole) return null;
  const answeredNested = getNestedRecord(item, "answeredBy");
  const studentNested = getNestedRecord(item, "student");
  const teacherNested = getNestedRecord(item, "teacher");
  const childrenRaw = (item as Record<string, unknown>)["children"];
  const children = Array.isArray(childrenRaw)
    ? childrenRaw
        .map(normalizeThreadMessage)
        .filter((x): x is ThreadMessage => x !== null)
    : undefined;
  return {
    id,
    studentId,
    teacherId: getString(item, "teacherId"),
    content,
    senderRole,
    createdAt,
    answeredBy: answeredNested
      ? {
          id: answeredNested.id as string,
          name: getString(answeredNested, "name"),
          role: getString(answeredNested, "role"),
        }
      : null,
    student: studentNested
      ? { id: studentNested.id as string, name: getString(studentNested, "name") || "Aluno" }
      : null,
    teacher: teacherNested
      ? { id: teacherNested.id as string, name: getString(teacherNested, "name") }
      : null,
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

function getThreadStatus(thread: ThreadMessage[]): string {
  if (thread.length === 0) return "Aguardando resposta";
  const last = thread[thread.length - 1];
  if (last.senderRole === "TEACHER") return "Respondida / aguardando gestão";
  if (last.senderRole === "GESTOR") return "Aguardando professor";
  return "Aguardando resposta";
}

function getAuthorName(msg: ThreadMessage): string {
  if (msg.senderRole === "TEACHER")
    return msg.answeredBy?.name || msg.teacher?.name || "Professor";
  if (msg.senderRole === "STUDENT") return msg.student?.name || "Aluno";
  return "Gestão";
}

function getRoleBadgeClass(role: string): string {
  if (role === "TEACHER")
    return "bg-[#D4A37320] text-[#D4A373] border border-[#D4A37340]";
  if (role === "STUDENT")
    return "bg-[#3a7bd520] text-[#7fb3ff] border border-[#3a7bd540]";
  return "bg-[#ffffff10] text-[#f5f5f5] border border-[#ffffff20]";
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

  const studentsOptions = useMemo(
    () =>
      students.map((s) => ({ value: s.id, label: s.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [students]
  );

  const teachersOptions = useMemo(
    () =>
      teachers.map((t) => ({ value: t.id, label: t.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [teachers]
  );

  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      try {
        const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
        const sessionData = await safeJson(sessionRes);
        if (isRecord(sessionData)) {
          const uid =
            getString(sessionData, "userId") ||
            (getNestedRecord(sessionData, "user") ? getString(getNestedRecord(sessionData, "user")!, "id") : null);
          if (mounted && uid) setCurrentUserId(uid);
        }

        const [stuRes, teaRes, notRes, queRes] = await Promise.all([
          fetch("/api/students", { cache: "no-store" }),
          fetch("/api/teachers", { cache: "no-store" }),
          fetch("/api/notices", { cache: "no-store" }),
          fetch("/api/questions?senderRole=GESTOR", { cache: "no-store" }),
        ]);

        const stuData = await safeJson(stuRes);
        const teaData = await safeJson(teaRes);
        const notData = await safeJson(notRes);
        const queData = await safeJson(queRes);

        if (!mounted) return;

        const stuList = extractArray(stuData, [
          "students",
          "items",
          "results",
          "data",
          "rows",
          "records",
          "alunos",
        ])
          .map(normalizeStudent)
          .filter((x): x is Student => x !== null);

        const teaList = extractArray(teaData, [
          "teachers",
          "items",
          "results",
          "data",
          "rows",
          "records",
          "professores",
        ])
          .map(normalizeTeacher)
          .filter((x): x is Teacher => x !== null);

        const notList = extractArray(notData, [
          "notices",
          "items",
          "results",
          "data",
          "rows",
          "records",
        ])
          .map(normalizeNotice)
          .filter((x): x is Notice => x !== null);

        const queList = extractArray(queData, [
          "questions",
          "items",
          "results",
          "data",
          "rows",
          "records",
        ])
          .map(normalizeThreadMessage)
          .filter((x): x is ThreadMessage => x !== null);

        setStudents(dedupeById(stuList));
        setTeachers(dedupeById(teaList));
        setNotices(notList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setQuestions(queList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      } catch {
        if (mounted) setNoticeError("Falha ao carregar dados iniciais.");
      }
    }
    loadAll();
    return () => {
      mounted = false;
    };
  }, []);

  function handleTargetTypeChange(next: TargetType) {
    setTargetType(next);
    if (next !== "ALUNO_ESPECIFICO") setSelectedStudentId("");
    if (next !== "PROFESSOR_ESPECIFICO") setSelectedTeacherId("");
  }

  async function reloadNotices() {
    try {
      const res = await fetch("/api/notices", { cache: "no-store" });
      const data = await safeJson(res);
      const list = extractArray(data, ["notices", "items", "results", "data", "rows", "records"])
        .map(normalizeNotice)
        .filter((x): x is Notice => x !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setNotices(list);
    } catch {
      setNoticeError("Falha ao recarregar avisos.");
    }
  }

  async function reloadQuestions() {
    try {
      const res = await fetch("/api/questions?senderRole=GESTOR", { cache: "no-store" });
      const data = await safeJson(res);
      const list = extractArray(data, ["questions", "items", "results", "data", "rows", "records"])
        .map(normalizeThreadMessage)
        .filter((x): x is ThreadMessage => x !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setQuestions(list);
    } catch {
      setChatError("Falha ao recarregar histórico.");
    }
  }

  async function handlePublishNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeSuccess(null);
    setNoticeError(null);
    const content = noticeContent.trim();
    if (!content) {
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
    } else {
      targetRole = "TEACHER";
    }
    setSavingNotice(true);
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
        const msg = (isRecord(data) && getString(data, "message")) || "Falha ao publicar aviso.";
        setNoticeError(msg);
        return;
      }
      setNoticeSuccess("Aviso publicado com sucesso.");
      setNoticeTitle("");
      setNoticeContent("");
      setSelectedStudentId("");
      setSelectedTeacherId("");
      await reloadNotices();
    } catch {
      setNoticeError("Erro de rede ao publicar aviso.");
    } finally {
      setSavingNotice(false);
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    setChatSuccess(null);
    setChatError(null);
    const content = chatContent.trim();
    if (!content) {
      setChatError("A mensagem não pode estar vazia.");
      return;
    }
    const studentIds =
      chatStudentMode === "ALUNO_ESPECIFICO"
        ? [selectedStudentId].filter(Boolean)
        : studentsOptions.map((s) => s.value);
    const teacherIds =
      chatTeacherMode === "PROFESSOR_ESPECIFICO"
        ? [selectedTeacherId].filter(Boolean)
        : teachersOptions.map((t) => t.value);

    if (studentIds.length === 0) {
      setChatError("Nenhum aluno selecionado.");
      return;
    }
    if (teacherIds.length === 0) {
      setChatError("Nenhum professor selecionado.");
      return;
    }
    if (chatStudentMode === "ALUNO_ESPECIFICO" && !selectedStudentId) {
      setChatError("Selecione um aluno.");
      return;
    }
    if (chatTeacherMode === "PROFESSOR_ESPECIFICO" && !selectedTeacherId) {
      setChatError("Selecione um professor.");
      return;
    }

    const combos: { studentId: string; teacherId: string }[] = [];
    const seen = new Set<string>();
    for (const sId of studentIds) {
      for (const tId of teacherIds) {
        const key = `${sId}__${tId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        combos.push({ studentId: sId, teacherId: tId });
      }
    }

    setSendingChat(true);
    let success = 0;
    let fail = 0;
    try {
      for (const combo of combos) {
        try {
          const res = await fetch("/api/questions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content,
              senderRole: "GESTOR",
              studentId: combo.studentId,
              teacherId: combo.teacherId,
            }),
          });
          if (res.ok) success++;
          else fail++;
        } catch {
          fail++;
        }
      }

      if (success > 0 && fail === 0) {
        setChatSuccess(
          success === 1 ? "Mensagem enviada com sucesso." : "Mensagens enviadas com sucesso."
        );
        setChatContent("");
        await reloadQuestions();
      } else if (success > 0 && fail > 0) {
        setChatError(`Envio parcial: ${success} mensagem(ns) enviada(s), ${fail} falha(s).`);
        await reloadQuestions();
      } else {
        setChatError("Falha ao enviar as mensagens.");
      }
    } finally {
      setSendingChat(false);
    }
  }

  async function handleReply(question: ThreadMessage) {
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
        const data = await safeJson(res);
        const msg = (isRecord(data) && getString(data, "message")) || "Falha ao enviar resposta.";
        setChatError(msg);
        return;
      }
      setReplyContent((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      await reloadQuestions();
    } catch {
      setChatError("Erro de rede ao responder.");
    }
  }

  const inputClass =
    "w-full rounded-md bg-[#0a0a0a] border border-[#ffffff10] px-3 py-2 text-sm text-[#f5f5f5] placeholder:text-[#a1a1a1] focus:outline-none focus:border-[#D4A373]";
  const labelClass = "block text-xs uppercase tracking-wide text-[#a1a1a1] mb-1";
  const btnPrimary =
    "rounded-md bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a] hover:bg-[#c79a63] disabled:opacity-50";
  const btnGhost =
    "rounded-md border border-[#ffffff10] px-4 py-2 text-sm text-[#f5f5f5] hover:bg-[#ffffff10]";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Gestão</h1>
          <p className="mt-1 text-sm text-[#a1a1a1]">
            {students.length} aluno(s) carregado(s) · {teachers.length} professor(es) carregado(s)
          </p>
        </header>

        <div className="mb-6 flex gap-2 border-b border-[#ffffff10]">
          {(["mural", "chat"] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-[#D4A373] text-[#D4A373]"
                  : "text-[#a1a1a1] hover:text-[#f5f5f5]"
              }`}
            >
              {tab === "mural" ? "Mural" : "Chat"}
            </button>
          ))}
        </div>

        {activeTab === "mural" && (
          <section className="space-y-8">
            <div className="rounded-lg border border-[#ffffff10] bg-[#111111] p-6">
              <h2 className="mb-4 text-lg font-semibold">Novo aviso</h2>
              <form onSubmit={handlePublishNotice} className="space-y-4">
                <div>
                  <label className={labelClass}>Destinatário</label>
                  <select
                    value={targetType}
                    onChange={(e) => handleTargetTypeChange(e.target.value as TargetType)}
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
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {targetType === "PROFESSOR_ESPECIFICO" && (
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
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    )}
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
                    placeholder="Escreva o conteúdo do aviso..."
                    rows={5}
                    className={inputClass}
                  />
                </div>

                {noticeSuccess && (
                  <p className="text-sm text-[#D4A373]">{noticeSuccess}</p>
                )}
                {noticeError && <p className="text-sm text-red-400">{noticeError}</p>}

                <button type="submit" disabled={savingNotice} className={btnPrimary}>
                  {savingNotice ? "Publicando..." : "Publicar"}
                </button>
              </form>
            </div>

            <div className="rounded-lg border border-[#ffffff10] bg-[#111111] p-6">
              <h2 className="mb-4 text-lg font-semibold">Avisos publicados</h2>
              {notices.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhum aviso publicado.</p>
              ) : (
                <ul className="space-y-4">
                  {notices.map((n) => (
                    <li key={n.id} className="rounded-md border border-[#ffffff10] bg-[#0a0a0a] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-[#f5f5f5]">
                          {n.title || "Aviso da Gestão"}
                        </h3>
                        <span className="text-xs text-[#a1a1a1]">{formatDateTime(n.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[#d4d4d4]">{n.content}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#a1a1a1]">
                        {n.targetRole && (
                          <span className={`rounded px-2 py-0.5 ${getRoleBadgeClass(n.targetRole)}`}>
                            {n.targetRole === "TEACHER" ? "Professores" : "Alunos"}
                          </span>
                        )}
                        {n.student && <span>Aluno: {n.student.name}</span>}
                        {n.professor && <span>Professor: {n.professor.name}</span>}
                        {n.author?.name && <span>Autor: {n.author.name}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {activeTab === "chat" && (
          <section className="space-y-8">
            <div className="rounded-lg border border-[#ffffff10] bg-[#111111] p-6">
              <h2 className="mb-4 text-lg font-semibold">Nova conversa</h2>
              <form onSubmit={handleSendChat} className="space-y-4">
                <div>
                  <label className={labelClass}>Alunos</label>
                  <select
                    value={chatStudentMode}
                    onChange={(e) => {
                      setChatStudentMode(e.target.value as ChatStudentMode);
                      setSelectedStudentId("");
                    }}
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
                          <option key={s.value} value={s.value}>
                            {s.label}
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
                    onChange={(e) => {
                      setChatTeacherMode(e.target.value as ChatTeacherMode);
                      setSelectedTeacherId("");
                    }}
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
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <div>
                  <label className={labelClass}>Conteúdo</label>
                  <textarea
                    value={chatContent}
                    onChange={(e) => setChatContent(e.target.value)}
                    placeholder="Escreva a mensagem..."
                    rows={5}
                    className={inputClass}
                  />
                </div>

                {chatSuccess && <p className="text-sm text-[#D4A373]">{chatSuccess}</p>}
                {chatError && <p className="text-sm text-red-400">{chatError}</p>}

                <button type="submit" disabled={sendingChat} className={btnPrimary}>
                  {sendingChat ? "Enviando..." : "Enviar"}
                </button>
              </form>
            </div>

            <div className="rounded-lg border border-[#ffffff10] bg-[#111111] p-6">
              <h2 className="mb-4 text-lg font-semibold">Histórico de conversas</h2>
              {questions.length === 0 ? (
                <p className="text-sm text-[#a1a1a1]">Nenhuma conversa encontrada.</p>
              ) : (
                <ul className="space-y-4">
                  {questions.map((q) => {
                    const thread = [q, ...(q.children || [])].sort((a, b) =>
                      a.createdAt.localeCompare(b.createdAt)
                    );
                    const status = getThreadStatus(thread);
                    const isOpen = expandedQuestion === q.id;
                    return (
                      <li
                        key={q.id}
                        className="rounded-md border border-[#ffffff10] bg-[#0a0a0a] p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#a1a1a1]">
                            <span className={`rounded px-2 py-0.5 ${getRoleBadgeClass(q.senderRole)}`}>
                              {q.senderRole}
                            </span>
                            <span>{status}</span>
                            <span>{formatDateTime(q.createdAt)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedQuestion(isOpen ? null : q.id)
                            }
                            className="text-xs text-[#D4A373] hover:underline"
                          >
                            Continuar conversa
                          </button>
                        </div>

                        <div className="mt-3 space-y-3">
                          {thread.map((m) => (
                            <div key={m.id} className="rounded-md bg-[#111111] p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-[#f5f5f5]">
                                  {getAuthorName(m)}
                                </span>
                                <span className="text-xs text-[#a1a1a1]">
                                  {formatDateTime(m.createdAt)}
                                </span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-[#d4d4d4]">
                                {m.content}
                              </p>
                            </div>
                          ))}
                        </div>

                        {isOpen && (
                          <div className="mt-4 space-y-3">
                            <textarea
                              value={replyContent[q.id] || ""}
                              onChange={(e) =>
                                setReplyContent((prev) => ({
                                  ...prev,
                                  [q.id]: e.target.value,
                                }))
                              }
                              placeholder="Escreva a resposta..."
                              rows={3}
                              className={inputClass}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleReply(q)}
                                className={btnPrimary}
                              >
                                Responder
                              </button>
                              <button
                                type="button"
                                onClick={() => setExpandedQuestion(null)}
                                className={btnGhost}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

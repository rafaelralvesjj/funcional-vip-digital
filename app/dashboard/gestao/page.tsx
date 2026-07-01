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

async function safeJson(response: Response): Promise<any> {
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  if (!response.ok) {
    throw new Error(
      body?.message || body?.error || body?.err || `Erro ${response.status}`
    );
  }
  return body;
}

function extractArray(data: any, candidateKeys: string[]): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const key of candidateKeys) {
    const value = data[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeStudent(item: any): Student | null {
  if (!item || typeof item !== "object") return null;
  const id =
    item.id || item.student?.id || item.studentId || item.userId || item.user?.id;
  const name =
    item.name || item.student?.name || item.studentName || item.user?.name;
  if (!id || !name) return null;
  return {
    id: String(id),
    name: String(name),
    userId: item.userId ? String(item.userId) : null,
    user: item.user
      ? { id: String(item.user.id), name: item.user.name ?? null }
      : null,
  };
}

function normalizeTeacher(item: any): Teacher | null {
  if (!item || typeof item !== "object") return null;
  const id = item.userId || item.user?.id || item.id;
  const name =
    item.name || item.user?.name || item.teacherName || item.teacher?.name;
  if (!id || !name) return null;
  return {
    id: String(id),
    name: String(name),
    email: item.email ?? item.user?.email ?? null,
    userId: item.userId ? String(item.userId) : null,
    user: item.user
      ? {
          id: String(item.user.id),
          name: item.user.name ?? null,
          email: item.user.email ?? null,
        }
      : null,
    _count: item._count,
  };
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}

function getThreadStatus(thread: ThreadMessage[]): string {
  if (!thread.length) return "Aguardando resposta";
  const last = thread[thread.length - 1];
  const role = last.senderRole;
  if (role === "TEACHER") return "Respondida / aguardando gestão";
  if (role === "GESTOR") return "Aguardando professor";
  if (role === "STUDENT") return "Aguardando resposta";
  return "Aguardando resposta";
}

function getAuthorName(msg: ThreadMessage): string {
  const role = msg.senderRole;
  if (role === "TEACHER") return msg.answeredBy?.name || msg.teacher?.name || "Professor";
  if (role === "STUDENT") return msg.student?.name || "Aluno";
  if (role === "GESTOR") return "Gestão";
  return msg.answeredBy?.name || "Desconhecido";
}

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case "GESTOR":
      return "bg-[#D4A373] text-[#0a0a0a]";
    case "TEACHER":
      return "bg-blue-500/20 text-blue-300";
    case "STUDENT":
      return "bg-emerald-500/20 text-emerald-300";
    default:
      return "bg-[#ffffff10] text-[#a1a1a1]";
  }
}

export default function GestaoPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("mural");
  const [currentUserId, setCurrentUserId] = useState<string>("");
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
  const [noticeSuccess, setNoticeSuccess] = useState<string>("");
  const [noticeError, setNoticeError] = useState<string>("");
  const [chatContent, setChatContent] = useState<string>("");
  const [sendingChat, setSendingChat] = useState<boolean>(false);
  const [chatSuccess, setChatSuccess] = useState<string>("");
  const [chatError, setChatError] = useState<string>("");
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});

  const fetchSession = async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await safeJson(res);
      setCurrentUserId(data?.user?.id || "");
    } catch (e) {
      console.error("Erro ao carregar sessão:", e);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await fetch("/api/students", { cache: "no-store" });
      const data = await safeJson(res);
      const list = extractArray(data, ["students", "items", "results", "data"])
        .map(normalizeStudent)
        .filter(Boolean) as Student[];
      setStudents(list);
    } catch (e) {
      console.error("Erro ao carregar alunos:", e);
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await fetch("/api/teachers", { cache: "no-store" });
      const data = await safeJson(res);
      const list = extractArray(data, ["teachers", "items", "results", "data"])
        .map(normalizeTeacher)
        .filter(Boolean) as Teacher[];
      setTeachers(list);
    } catch (e) {
      console.error("Erro ao carregar professores:", e);
    }
  };

  const fetchNotices = async () => {
    try {
      const res = await fetch("/api/notices", { cache: "no-store" });
      const data = await safeJson(res);
      const list = Array.isArray(data) ? data : data?.notices || [];
      setNotices(list);
    } catch (e) {
      console.error("Erro ao carregar avisos:", e);
    }
  };

  const fetchQuestions = async () => {
    try {
      const params = new URLSearchParams({ senderRole: "GESTOR" });
      if (selectedTeacherId) params.append("teacherId", selectedTeacherId);
      if (selectedStudentId) params.append("studentId", selectedStudentId);
      const res = await fetch(`/api/questions?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await safeJson(res);
      const list = Array.isArray(data)
        ? data
        : data?.questions || data?.items || data?.results || data?.data || [];
      setQuestions(list);
    } catch (e) {
      console.error("Erro ao carregar conversas:", e);
    }
  };

  useEffect(() => {
    fetchSession();
    fetchStudents();
    fetchTeachers();
    fetchNotices();
  }, []);

  useEffect(() => {
    if (activeTab === "chat") {
      fetchQuestions();
    }
  }, [activeTab, selectedStudentId, selectedTeacherId]);

  const studentsOptions = useMemo(() => {
    return [...students].sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const teachersOptions = useMemo(() => {
    return [...teachers].sort((a, b) => a.name.localeCompare(b.name));
  }, [teachers]);

  const handlePublishNotice = async (e: FormEvent) => {
    e.preventDefault();
    setNoticeError("");
    setNoticeSuccess("");

    if (!noticeContent.trim()) {
      setNoticeError("O conteúdo do aviso é obrigatório.");
      return;
    }

    let targetRole = "";
    let studentId: string | undefined;
    let professorId: string | undefined;

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
      await safeJson(res);
      setNoticeSuccess("Aviso publicado com sucesso.");
      setNoticeTitle("");
      setNoticeContent("");
      await fetchNotices();
    } catch (err: any) {
      setNoticeError(err?.message || "Erro ao publicar aviso.");
    } finally {
      setSavingNotice(false);
    }
  };

  const handleSendChat = async (e: FormEvent) => {
    e.preventDefault();
    setChatError("");
    setChatSuccess("");

    if (!chatContent.trim()) {
      setChatError("Digite uma mensagem.");
      return;
    }
    if (!selectedStudentId || !selectedTeacherId) {
      setChatError("Selecione o aluno e o professor.");
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
      await safeJson(res);
      setChatSuccess("Mensagem enviada.");
      setChatContent("");
      await fetchQuestions();
    } catch (err: any) {
      setChatError(err?.message || "Erro ao enviar mensagem.");
    } finally {
      setSendingChat(false);
    }
  };

  const handleReply = async (question: ThreadMessage) => {
    const replyText = (replyContent[question.id] || "").trim();
    if (!replyText) return;

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
      await safeJson(res);
      setReplyContent((prev) => ({ ...prev, [question.id]: "" }));
      setExpandedQuestion(null);
      await fetchQuestions();
    } catch (err: any) {
      setChatError(err?.message || "Erro ao responder.");
    }
  };

  const inputClass =
    "w-full bg-[#111111] border border-[#ffffff10] rounded-lg p-3 text-[#f5f5f5] placeholder:text-[#a1a1a1] focus:outline-none focus:border-[#D4A373]";

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-6">Gestão</h1>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setActiveTab("mural")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "mural"
                ? "bg-[#D4A373] text-[#0a0a0a]"
                : "bg-[#111111] text-[#a1a1a1] border border-[#ffffff10] hover:text-[#f5f5f5]"
            }`}
          >
            Mural
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "chat"
                ? "bg-[#D4A373] text-[#0a0a0a]"
                : "bg-[#111111] text-[#a1a1a1] border border-[#ffffff10] hover:text-[#f5f5f5]"
            }`}
          >
            Chat
          </button>
        </div>

        <p className="text-xs text-[#a1a1a1] mb-8">
          Alunos carregados: {students.length} | Professores carregados: {teachers.length}
        </p>

        {activeTab === "mural" && (
          <div className="space-y-8">
            <section className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">Novo aviso</h2>
              <form onSubmit={handlePublishNotice} className="space-y-4">
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Destinatário</label>
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
                    <label className="block text-sm text-[#a1a1a1] mb-1">Aluno</label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className={inputClass}
                      required
                    >
                      <option value="">Selecione um aluno</option>
                      {studentsOptions.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name}
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
                      className={inputClass}
                      required
                    >
                      <option value="">Selecione um professor</option>
                      {teachersOptions.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.name}
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
                    placeholder="Título do aviso"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Conteúdo</label>
                  <textarea
                    value={noticeContent}
                    onChange={(e) => setNoticeContent(e.target.value)}
                    placeholder="Escreva o conteúdo do aviso..."
                    rows={5}
                    className={inputClass}
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
                  className="bg-[#D4A373] text-[#0a0a0a] px-6 py-2 rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
                >
                  {savingNotice ? "Publicando..." : "Publicar aviso"}
                </button>
              </form>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Avisos publicados</h2>
              {notices.length === 0 && (
                <p className="text-sm text-[#a1a1a1]">Nenhum aviso publicado.</p>
              )}
              {notices.map((notice) => (
                <div
                  key={notice.id}
                  className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h3 className="font-medium text-[#f5f5f5]">
                      {notice.title || "Aviso"}
                    </h3>
                    <span className="text-xs px-2 py-1 rounded-full bg-[#ffffff10] text-[#a1a1a1]">
                      {notice.targetRole || "Todos"}
                    </span>
                  </div>
                  <p className="text-[#a1a1a1] whitespace-pre-wrap text-sm">
                    {notice.content}
                  </p>
                  <p className="text-xs text-[#a1a1a1] mt-3">
                    {formatDateTime(notice.createdAt)}
                  </p>
                </div>
              ))}
            </section>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="space-y-6">
            <section className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">Nova mensagem</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Aluno</label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Selecione um aluno</option>
                    {studentsOptions.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Professor</label>
                  <select
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Selecione um professor</option>
                    {teachersOptions.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <form onSubmit={handleSendChat} className="space-y-3">
                <textarea
                  value={chatContent}
                  onChange={(e) => setChatContent(e.target.value)}
                  placeholder="Escreva a mensagem..."
                  rows={3}
                  className={inputClass}
                />
                {chatError && <p className="text-sm text-red-400">{chatError}</p>}
                {chatSuccess && <p className="text-sm text-emerald-400">{chatSuccess}</p>}
                <button
                  type="submit"
                  disabled={sendingChat}
                  className="bg-[#D4A373] text-[#0a0a0a] px-6 py-2 rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
                >
                  {sendingChat ? "Enviando..." : "Enviar mensagem"}
                </button>
              </form>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Histórico de conversas</h2>
              {questions.length === 0 && (
                <p className="text-sm text-[#a1a1a1]">Nenhuma conversa encontrada.</p>
              )}
              {questions.map((question) => {
                const thread = [question, ...(question.children || [])].sort(
                  (a, b) =>
                    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
                const isExpanded = expandedQuestion === question.id;
                return (
                  <div
                    key={question.id}
                    className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <span className="text-sm text-[#a1a1a1]">
                        {getThreadStatus(thread)}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${getRoleBadgeClass(
                          question.senderRole
                        )}`}
                      >
                        {question.senderRole}
                      </span>
                    </div>

                    <div className="space-y-4">
                      {thread.map((msg) => (
                        <div
                          key={msg.id}
                          className="border-l-2 border-[#ffffff10] pl-3"
                        >
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-[#f5f5f5]">
                              {getAuthorName(msg)}
                            </span>
                            <span className="text-xs text-[#a1a1a1]">
                              {formatDateTime(msg.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-[#a1a1a1]">{msg.content}</p>
                        </div>
                      ))}
                    </div>

                    {!isExpanded && (
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedQuestion(question.id);
                          setChatError("");
                        }}
                        className="mt-4 text-sm text-[#D4A373] hover:underline"
                      >
                        Continuar conversa
                      </button>
                    )}

                    {isExpanded && (
                      <div className="mt-4 space-y-3">
                        <textarea
                          value={replyContent[question.id] || ""}
                          onChange={(e) =>
                            setReplyContent((prev) => ({
                              ...prev,
                              [question.id]: e.target.value,
                            }))
                          }
                          placeholder="Escreva a resposta..."
                          rows={3}
                          className={inputClass}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleReply(question)}
                            className="bg-[#D4A373] text-[#0a0a0a] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition"
                          >
                            Responder
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedQuestion(null)}
                            className="px-4 py-2 rounded-lg text-sm text-[#a1a1a1] border border-[#ffffff10] hover:bg-[#ffffff08] transition"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

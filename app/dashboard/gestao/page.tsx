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

export default function GestaoPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("mural");
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const [targetType, setTargetType] = useState<TargetType>("ALUNO_ESPECIFICO");
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
  const [replyContent, setReplyContent] = useState<string>("");

  // Helpers
  const safeJson = async (response: Response) => {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { message: text || response.statusText };
    }
  };

  const extractArray = (data: unknown, candidateKeys: string[]): unknown[] => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      for (const key of candidateKeys) {
        const value = obj[key];
        if (Array.isArray(value)) return value;
      }
      const nestedKeys = ["data", "result", "payload"];
      for (const nested of nestedKeys) {
        const inner = obj[nested];
        if (inner && typeof inner === "object") {
          const innerObj = inner as Record<string, unknown>;
          for (const key of [...candidateKeys, "items", "results", "data"]) {
            const value = innerObj[key];
            if (Array.isArray(value)) return value;
          }
        }
      }
    }
    return [];
  };

  const normalizeStudent = (item: unknown): Student | null => {
    if (!item || typeof item !== "object") return null;
    const i = item as Record<string, unknown>;

    const id =
      (i.id as string) ||
      (i.student?.id as string) ||
      (i.studentId as string) ||
      (i.userId as string) ||
      (i.user?.id as string);

    const name =
      (i.name as string) ||
      (i.student?.name as string) ||
      (i.studentName as string) ||
      (i.user?.name as string);

    if (!id || !name) return null;
    return { id, name };
  };

  const normalizeTeacher = (item: unknown): Teacher | null => {
    if (!item || typeof item !== "object") return null;
    const i = item as Record<string, unknown>;

    const id =
      (i.userId as string) ||
      (i.user?.id as string) ||
      (i.id as string);

    const name =
      (i.name as string) ||
      (i.user?.name as string) ||
      (i.teacherName as string) ||
      (i.teacher?.name as string);

    if (!id || !name) return null;
    return { id, name };
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getThreadStatus = (thread: ThreadMessage[]) => {
    if (!thread.length) return "";
    const last = thread[thread.length - 1];
    const role = last.senderRole;
    if (role === "TEACHER") return "Respondida / aguardando gestão";
    if (role === "GESTOR") return "Aguardando professor";
    if (role === "STUDENT") return "Aguardando resposta";
    return "";
  };

  const getAuthorName = (msg: ThreadMessage) => {
    const role = msg.senderRole;
    if (role === "TEACHER") {
      return msg.answeredBy?.name || msg.teacher?.name || "Professor";
    }
    if (role === "STUDENT") {
      return msg.student?.name || "Aluno";
    }
    if (role === "GESTOR") {
      return "Gestão";
    }
    return "Desconhecido";
  };

  const getRoleBadgeClass = (role: string) => {
    if (role === "TEACHER") return "bg-blue-600/20 text-blue-300 border-blue-500/30";
    if (role === "STUDENT") return "bg-emerald-600/20 text-emerald-300 border-emerald-500/30";
    if (role === "GESTOR") return "bg-[#D4A373]/20 text-[#D4A373] border-[#D4A373]/30";
    return "bg-gray-600/20 text-gray-300 border-gray-500/30";
  };

  // Fetches
  const fetchSession = async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await safeJson(res);
      if (data?.user?.id) {
        setCurrentUserId(data.user.id);
      }
    } catch (err) {
      console.error("Erro ao carregar sessão:", err);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await fetch("/api/students", { cache: "no-store" });
      const data = await safeJson(res);
      const raw = extractArray(data, ["students", "items", "results", "data"]);
      const normalized = raw
        .map(normalizeStudent)
        .filter((s): s is Student => s !== null);
      setStudents(normalized);
    } catch (err) {
      console.error("Erro ao carregar alunos:", err);
      setStudents([]);
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await fetch("/api/teachers", { cache: "no-store" });
      const data = await safeJson(res);
      const raw = extractArray(data, ["teachers", "items", "results", "data"]);
      const normalized = raw
        .map(normalizeTeacher)
        .filter((t): t is Teacher => t !== null);
      setTeachers(normalized);
    } catch (err) {
      console.error("Erro ao carregar professores:", err);
      setTeachers([]);
    }
  };

  const fetchNotices = async () => {
    try {
      const res = await fetch("/api/notices", { cache: "no-store" });
      const data = await safeJson(res);
      const raw = Array.isArray(data) ? data : extractArray(data, ["notices", "items", "results", "data"]);
      setNotices(raw as Notice[]);
    } catch (err) {
      console.error("Erro ao carregar avisos:", err);
      setNotices([]);
    }
  };

  const fetchQuestions = async () => {
    try {
      const params = new URLSearchParams();
      params.set("senderRole", "GESTOR");
      if (selectedTeacherId) params.set("teacherId", selectedTeacherId);
      if (selectedStudentId) params.set("studentId", selectedStudentId);
      const res = await fetch(`/api/questions?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await safeJson(res);
      const raw = Array.isArray(data) ? data : extractArray(data, ["questions", "items", "results", "data"]);
      setQuestions(raw as ThreadMessage[]);
    } catch (err) {
      console.error("Erro ao carregar mensagens:", err);
      setQuestions([]);
    }
  };

  useEffect(() => {
    fetchSession();
    fetchStudents();
    fetchTeachers();
    fetchNotices();
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [selectedStudentId, selectedTeacherId]);

  useEffect(() => {
    if (targetType === "ALUNO_ESPECIFICO" && selectedTeacherId) {
      setSelectedTeacherId("");
    }
    if (targetType === "PROFESSOR_ESPECIFICO" && selectedStudentId) {
      setSelectedStudentId("");
    }
    if (targetType === "TODOS_ALUNOS") {
      setSelectedStudentId("");
      setSelectedTeacherId("");
    }
    if (targetType === "TODOS_PROFESSORES") {
      setSelectedStudentId("");
      setSelectedTeacherId("");
    }
  }, [targetType]);

  // Options
  const studentsOptions = useMemo(() => {
    return [...students].sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const teachersOptions = useMemo(() => {
    return [...teachers].sort((a, b) => a.name.localeCompare(b.name));
  }, [teachers]);

  // Handlers
  const handlePublishNotice = async (e: FormEvent) => {
    e.preventDefault();
    setNoticeError("");
    setNoticeSuccess("");

    const content = noticeContent.trim();
    if (!content) {
      setNoticeError("Preencha o conteúdo do aviso.");
      return;
    }

    let targetRole = "";
    let studentId: string | undefined;
    let professorId: string | undefined;

    if (targetType === "ALUNO_ESPECIFICO") {
      if (!selectedStudentId) {
        setNoticeError("Selecione um aluno específico.");
        return;
      }
      targetRole = "STUDENT";
      studentId = selectedStudentId;
    } else if (targetType === "TODOS_ALUNOS") {
      targetRole = "STUDENT";
    } else if (targetType === "PROFESSOR_ESPECIFICO") {
      if (!selectedTeacherId) {
        setNoticeError("Selecione um professor específico.");
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
          content,
          type: "MANAGEMENT",
          targetRole,
          studentId,
          professorId,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setNoticeError(data?.message || data?.error || "Erro ao publicar aviso.");
        return;
      }
      setNoticeSuccess("Aviso publicado com sucesso!");
      setNoticeTitle("");
      setNoticeContent("");
      await fetchNotices();
    } catch (err) {
      setNoticeError("Erro ao publicar aviso.");
    } finally {
      setSavingNotice(false);
    }
  };

  const handleSendChat = async (e: FormEvent) => {
    e.preventDefault();
    setChatError("");
    setChatSuccess("");

    const content = chatContent.trim();
    if (!content) {
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
          content,
          senderRole: "GESTOR",
          studentId: selectedStudentId,
          teacherId: selectedTeacherId,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setChatError(data?.message || data?.error || "Erro ao enviar mensagem.");
        return;
      }
      setChatSuccess("Mensagem enviada com sucesso!");
      setChatContent("");
      await fetchQuestions();
    } catch (err) {
      setChatError("Erro ao enviar mensagem.");
    } finally {
      setSendingChat(false);
    }
  };

  const handleReply = async (question: ThreadMessage) => {
    const replyText = replyContent.trim();
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
      const data = await safeJson(res);
      if (!res.ok) {
        console.error("Erro ao responder:", data);
        return;
      }
      setReplyContent("");
      await fetchQuestions();
    } catch (err) {
      console.error("Erro ao responder:", err);
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedQuestion === id) {
      setExpandedQuestion(null);
      setReplyContent("");
    } else {
      setExpandedQuestion(id);
      setReplyContent("");
    }
  };

  const targetOptions: { value: TargetType; label: string }[] = [
    { value: "ALUNO_ESPECIFICO", label: "Aluno específico" },
    { value: "TODOS_ALUNOS", label: "Todos os alunos" },
    { value: "PROFESSOR_ESPECIFICO", label: "Professor específico" },
    { value: "TODOS_PROFESSORES", label: "Todos os professores" },
  ];

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-semibold mb-6 text-[#f5f5f5]">Gestão</h1>

        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setActiveTab("mural")}
            className={`px-4 py-2 rounded-lg border transition ${
              activeTab === "mural"
                ? "bg-[#D4A373] text-[#0a0a0a] border-[#D4A373] font-medium"
                : "bg-[#111111] text-[#a1a1a1] border-[#ffffff10] hover:border-[#ffffff20]"
            }`}
          >
            Mural
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 rounded-lg border transition ${
              activeTab === "chat"
                ? "bg-[#D4A373] text-[#0a0a0a] border-[#D4A373] font-medium"
                : "bg-[#111111] text-[#a1a1a1] border-[#ffffff10] hover:border-[#ffffff20]"
            }`}
          >
            Chat
          </button>
        </div>

        <p className="text-sm text-[#a1a1a1] mb-6">
          {students.length} aluno(s) e {teachers.length} professor(es) carregados.
        </p>

        {activeTab === "mural" && (
          <section>
            <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 mb-6">
              <h2 className="text-xl font-medium mb-4 text-[#f5f5f5]">Novo aviso</h2>
              <form onSubmit={handlePublishNotice} className="space-y-4">
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Destinatário</label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value as TargetType)}
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                  >
                    {targetOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {targetType === "ALUNO_ESPECIFICO" && (
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Aluno</label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione um aluno</option>
                      {studentsOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {studentsOptions.length === 0 && (
                      <p className="text-sm text-red-400 mt-2">Nenhum aluno carregado.</p>
                    )}
                  </div>
                )}

                {targetType === "PROFESSOR_ESPECIFICO" && (
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Professor</label>
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione um professor</option>
                      {teachersOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    {teachersOptions.length === 0 && (
                      <p className="text-sm text-red-400 mt-2">Nenhum professor carregado.</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Título</label>
                  <input
                    type="text"
                    value={noticeTitle}
                    onChange={(e) => setNoticeTitle(e.target.value)}
                    placeholder="Aviso da Gestão"
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-[#f5f5f5] placeholder-[#a1a1a1] focus:outline-none focus:border-[#D4A373]"
                  />
                </div>

                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Conteúdo</label>
                  <textarea
                    value={noticeContent}
                    onChange={(e) => setNoticeContent(e.target.value)}
                    rows={4}
                    placeholder="Digite o conteúdo do aviso..."
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-[#f5f5f5] placeholder-[#a1a1a1] focus:outline-none focus:border-[#D4A373] resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingNotice}
                  className="px-5 py-2.5 rounded-lg bg-[#D4A373] text-[#0a0a0a] font-medium hover:bg-[#c29365] transition disabled:opacity-50"
                >
                  {savingNotice ? "Publicando..." : "Publicar"}
                </button>

                {noticeSuccess && (
                  <p className="text-sm text-emerald-400">{noticeSuccess}</p>
                )}
                {noticeError && (
                  <p className="text-sm text-red-400">{noticeError}</p>
                )}
              </form>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-medium text-[#f5f5f5]">Avisos publicados</h2>
              {notices.length === 0 ? (
                <p className="text-[#a1a1a1]">Nenhum aviso publicado.</p>
              ) : (
                notices.map((notice) => (
                  <div
                    key={notice.id}
                    className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5"
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="font-medium text-[#f5f5f5]">
                        {notice.title || "Aviso"}
                      </h3>
                      <span className="text-xs text-[#a1a1a1] whitespace-nowrap">
                        {formatDateTime(notice.createdAt)}
                      </span>
                    </div>
                    <p className="text-[#f5f5f5] whitespace-pre-wrap mb-3">
                      {notice.content}
                    </p>
                    <div className="text-xs text-[#a1a1a1] flex flex-wrap gap-2">
                      <span className="px-2 py-1 rounded bg-[#ffffff08] border border-[#ffffff10]">
                        Para: {notice.targetRole === "STUDENT" ? "Alunos" : "Professores"}
                      </span>
                      {notice.student && (
                        <span className="px-2 py-1 rounded bg-[#ffffff08] border border-[#ffffff10]">
                          Aluno: {notice.student.name}
                        </span>
                      )}
                      {notice.professor && (
                        <span className="px-2 py-1 rounded bg-[#ffffff08] border border-[#ffffff10]">
                          Professor: {notice.professor.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === "chat" && (
          <section>
            <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 mb-6">
              <h2 className="text-xl font-medium mb-4 text-[#f5f5f5]">Nova mensagem</h2>
              <form onSubmit={handleSendChat} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Aluno</label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione um aluno</option>
                      {studentsOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Professor</label>
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione um professor</option>
                      {teachersOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">Mensagem</label>
                  <textarea
                    value={chatContent}
                    onChange={(e) => setChatContent(e.target.value)}
                    rows={3}
                    placeholder="Digite sua mensagem..."
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-[#f5f5f5] placeholder-[#a1a1a1] focus:outline-none focus:border-[#D4A373] resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sendingChat}
                  className="px-5 py-2.5 rounded-lg bg-[#D4A373] text-[#0a0a0a] font-medium hover:bg-[#c29365] transition disabled:opacity-50"
                >
                  {sendingChat ? "Enviando..." : "Enviar"}
                </button>

                {chatSuccess && (
                  <p className="text-sm text-emerald-400">{chatSuccess}</p>
                )}
                {chatError && (
                  <p className="text-sm text-red-400">{chatError}</p>
                )}
              </form>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-medium text-[#f5f5f5]">Histórico</h2>
              {questions.length === 0 ? (
                <p className="text-[#a1a1a1]">Nenhuma mensagem encontrada.</p>
              ) : (
                questions.map((q) => {
                  const thread = [q, ...(q.children || [])].sort(
                    (a, b) =>
                      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  );
                  const isExpanded = expandedQuestion === q.id;

                  return (
                    <div
                      key={q.id}
                      className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[#a1a1a1]">
                            Aluno: {q.student?.name || "—"}
                          </span>
                          <span className="text-sm text-[#a1a1a1]">
                            • Professor: {q.teacher?.name || "—"}
                          </span>
                        </div>
                        <span className="text-xs text-[#a1a1a1]">
                          {getThreadStatus(thread)}
                        </span>
                      </div>

                      <div className="space-y-3 mb-4">
                        {thread.map((msg) => (
                          <div
                            key={msg.id}
                            className="flex flex-col gap-1 p-3 rounded-lg bg-[#0a0a0a] border border-[#ffffff08]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-[#f5f5f5]">
                                {getAuthorName(msg)}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded border ${getRoleBadgeClass(
                                  msg.senderRole
                                )}`}
                              >
                                {msg.senderRole}
                              </span>
                            </div>
                            <p className="text-sm text-[#f5f5f5]">{msg.content}</p>
                            <span className="text-xs text-[#a1a1a1]">
                              {formatDateTime(msg.createdAt)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {!isExpanded && (
                        <button
                          onClick={() => toggleExpand(q.id)}
                          className="text-sm text-[#D4A373] hover:underline"
                        >
                          Continuar conversa
                        </button>
                      )}

                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          <textarea
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            rows={3}
                            placeholder="Digite sua resposta..."
                            className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-3 py-2 text-[#f5f5f5] placeholder-[#a1a1a1] focus:outline-none focus:border-[#D4A373] resize-none"
                          />
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleReply(q)}
                              disabled={!replyContent.trim()}
                              className="px-4 py-2 rounded-lg bg-[#D4A373] text-[#0a0a0a] text-sm font-medium hover:bg-[#c29365] transition disabled:opacity-50"
                            >
                              Responder
                            </button>
                            <button
                              onClick={() => toggleExpand(q.id)}
                              className="px-4 py-2 rounded-lg border border-[#ffffff10] text-sm text-[#a1a1a1] hover:border-[#ffffff20] transition"
                            >
                              Cancelar
                            </button>
                          </div>
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
    </main>
  );
}

"use client";
import { useEffect, useState, type FormEvent } from "react";

interface Student {
  id: string;
  name: string;
  user?: { id: string; name: string | null };
}

interface Teacher {
  id: string;
  name: string;
  email?: string;
  _count?: { students: number };
}

interface Notice {
  id: string;
  title?: string;
  content: string;
  type?: string;
  authorId?: string;
  studentId?: string;
  targetRole: string;
  professorId?: string;
  createdAt: string;
  author?: { id: string; name: string | null; role?: string | null };
  student?: { id: string; name: string };
  professor?: { id: string; name: string | null };
}

interface ThreadMessage {
  id: string;
  studentId: string;
  teacherId?: string;
  content: string;
  senderRole: string;
  createdAt: string;
  answeredBy?: { id: string; name: string | null; role?: string | null };
  student?: { id: string; name: string };
  teacher?: { id: string; name: string | null };
  children?: ThreadMessage[];
}

type TargetType = "ALUNO_ESPECIFICO" | "TODOS_ALUNOS" | "PROFESSOR_ESPECIFICO" | "TODOS_PROFESSORES";
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
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchSession();
    fetchStudents();
    fetchTeachers();
    fetchNotices();
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [selectedStudentId, selectedTeacherId]);

  async function fetchSession() {
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      if (data?.user?.id) {
        setCurrentUserId(data.user.id);
      }
    } catch (err) {
      console.error("Erro ao buscar sessão:", err);
    }
  }

  async function fetchStudents() {
    try {
      const res = await fetch("/api/students");
      const data = await res.json();
      setStudents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erro ao buscar alunos:", err);
    }
  }

  async function fetchTeachers() {
    try {
      const res = await fetch("/api/teachers");
      const data = await res.json();
      setTeachers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erro ao buscar professores:", err);
    }
  }

  async function fetchNotices() {
    try {
      const res = await fetch("/api/notices");
      const data = await res.json();
      setNotices(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erro ao buscar avisos:", err);
    }
  }

  async function fetchQuestions() {
    const params = new URLSearchParams();
    params.set("senderRole", "GESTOR");
    if (selectedTeacherId) params.set("teacherId", selectedTeacherId);
    if (selectedStudentId) params.set("studentId", selectedStudentId);

    try {
      const res = await fetch(`/api/questions?${params.toString()}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data?.questions || [];
      setQuestions(list);
    } catch (err) {
      console.error("Erro ao buscar mensagens:", err);
    }
  }

  async function handlePublishNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeError("");
    setNoticeSuccess("");

    if (!noticeContent.trim()) {
      setNoticeError("O conteúdo do aviso é obrigatório.");
      return;
    }

    let targetRole = "STUDENT";
    let studentId: string | null = null;
    let professorId: string | null = null;

    if (targetType === "ALUNO_ESPECIFICO") {
      targetRole = "STUDENT";
      if (!selectedStudentId) {
        setNoticeError("Selecione um aluno.");
        return;
      }
      studentId = selectedStudentId;
    } else if (targetType === "TODOS_ALUNOS") {
      targetRole = "STUDENT";
    } else if (targetType === "PROFESSOR_ESPECIFICO") {
      targetRole = "TEACHER";
      if (!selectedTeacherId) {
        setNoticeError("Selecione um professor.");
        return;
      }
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
          title: noticeTitle.trim() || "Aviso",
          content: noticeContent.trim(),
          type: "MANAGEMENT",
          targetRole,
          studentId,
          professorId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao publicar aviso");
      }

      setNoticeSuccess("Aviso publicado com sucesso!");
      setNoticeTitle("");
      setNoticeContent("");
      fetchNotices();
    } catch (err: any) {
      setNoticeError(err.message || "Erro ao publicar aviso");
    } finally {
      setSavingNotice(false);
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    setChatError("");
    setChatSuccess("");

    if (!chatContent.trim()) {
      setChatError("A mensagem é obrigatória.");
      return;
    }

    if (!selectedStudentId || !selectedTeacherId) {
      setChatError("Selecione um aluno e um professor.");
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

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao enviar mensagem");
      }

      setChatSuccess("Mensagem enviada com sucesso!");
      setChatContent("");
      fetchQuestions();
    } catch (err: any) {
      setChatError(err.message || "Erro ao enviar mensagem");
    } finally {
      setSendingChat(false);
    }
  }

  async function handleReply(question: ThreadMessage) {
    const content = (replyContent[question.id] || "").trim();
    if (!content) return;

    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          parentId: question.id,
          studentId: question.studentId,
          teacherId: question.teacherId,
          senderRole: "GESTOR",
          answeredById: currentUserId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao responder");
      }

      setReplyContent((prev) => ({ ...prev, [question.id]: "" }));
      fetchQuestions();
    } catch (err: any) {
      alert(err.message || "Erro ao responder");
    }
  }

  function getThreadAuthor(message: ThreadMessage) {
    if (message.senderRole === "TEACHER") {
      return message.answeredBy?.name || message.teacher?.name || "Professor";
    }
    if (message.senderRole === "STUDENT") {
      return message.student?.name || "Aluno";
    }
    return "Gestão";
  }

  function getThreadStatus(thread: ThreadMessage[]) {
    if (thread.length === 0) return "Aguardando resposta";
    const last = thread[thread.length - 1];
    if (last.senderRole === "TEACHER") return "Respondida / aguardando gestão";
    if (last.senderRole === "GESTOR") return "Aguardando professor";
    return "Aguardando resposta";
  }

  function renderThread(question: ThreadMessage) {
    const thread = [question, ...(question.children || [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return (
      <div className="mt-4 space-y-3">
        {thread.map((msg) => (
          <div
            key={msg.id}
            className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-[#D4A373]">
                {msg.senderRole === "GESTOR"
                  ? "GESTOR"
                  : msg.senderRole === "TEACHER"
                  ? "TEACHER"
                  : "STUDENT"}
              </span>
              <span className="text-xs text-[#a1a1a1]">
                {new Date(msg.createdAt).toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="text-sm text-[#f5f5f5]">{msg.content}</p>
            <p className="text-xs text-[#a1a1a1] mt-1">
              {getThreadAuthor(msg)}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-[#f5f5f5]">Gestão</h1>

        <div className="flex items-center gap-2 border-b border-[#ffffff10]">
          <button
            type="button"
            onClick={() => setActiveTab("mural")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "mural"
                ? "border-[#D4A373] text-[#D4A373]"
                : "border-transparent text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Mural
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "chat"
                ? "border-[#D4A373] text-[#D4A373]"
                : "border-transparent text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Chat
          </button>
        </div>

        {activeTab === "mural" && (
          <div className="space-y-8">
            <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
              <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
                Publicar Aviso
              </h2>
              <form onSubmit={handlePublishNotice} className="space-y-4">
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">
                    Título
                  </label>
                  <input
                    type="text"
                    value={noticeTitle}
                    onChange={(e) => setNoticeTitle(e.target.value)}
                    placeholder="Título do aviso"
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 text-sm text-[#f5f5f5] placeholder-[#a1a1a1] focus:outline-none focus:border-[#D4A373]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">
                    Destinatários
                  </label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value as TargetType)}
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                  >
                    <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                    <option value="TODOS_ALUNOS">Todos os alunos</option>
                    <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                    <option value="TODOS_PROFESSORES">Todos os professores</option>
                  </select>
                </div>
                {targetType === "ALUNO_ESPECIFICO" && (
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">
                      Aluno
                    </label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {targetType === "PROFESSOR_ESPECIFICO" && (
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">
                      Professor
                    </label>
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">
                    Conteúdo
                  </label>
                  <textarea
                    value={noticeContent}
                    onChange={(e) => setNoticeContent(e.target.value)}
                    placeholder="Digite o aviso..."
                    rows={4}
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 text-sm text-[#f5f5f5] placeholder-[#a1a1a1] focus:outline-none focus:border-[#D4A373] resize-none"
                  />
                </div>
                {noticeError && (
                  <p className="text-sm text-red-400">{noticeError}</p>
                )}
                {noticeSuccess && (
                  <p className="text-sm text-green-400">{noticeSuccess}</p>
                )}
                <button
                  type="submit"
                  disabled={savingNotice}
                  className="bg-[#D4A373] text-[#0a0a0a] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {savingNotice ? "Publicando..." : "Publicar Aviso"}
                </button>
              </form>
            </div>

            <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
              <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
                Histórico de Avisos
              </h2>
              <div className="space-y-3">
                {notices.length === 0 && (
                  <p className="text-sm text-[#a1a1a1]">
                    Nenhum aviso publicado.
                  </p>
                )}
                {notices.map((n) => (
                  <div
                    key={n.id}
                    className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3"
                  >
                    <p className="text-sm font-medium text-[#f5f5f5]">
                      {n.title || "Aviso"}
                    </p>
                    <p className="text-sm text-[#a1a1a1] mt-1">{n.content}</p>
                    <p className="text-xs text-[#a1a1a1] mt-2">
                      {n.targetRole === "STUDENT" ? "Alunos" : "Professores"} •{" "}
                      {new Date(n.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="space-y-8">
            <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
              <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
                Enviar Mensagem
              </h2>
              <form onSubmit={handleSendChat} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">
                      Aluno
                    </label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">
                      Professor
                    </label>
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#D4A373]"
                    >
                      <option value="">Selecione</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-[#a1a1a1] mb-1">
                    Mensagem
                  </label>
                  <textarea
                    value={chatContent}
                    onChange={(e) => setChatContent(e.target.value)}
                    placeholder="Digite a mensagem..."
                    rows={3}
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 text-sm text-[#f5f5f5] placeholder-[#a1a1a1] focus:outline-none focus:border-[#D4A373] resize-none"
                  />
                </div>
                {chatError && (
                  <p className="text-sm text-red-400">{chatError}</p>
                )}
                {chatSuccess && (
                  <p className="text-sm text-green-400">{chatSuccess}</p>
                )}
                <button
                  type="submit"
                  disabled={sendingChat}
                  className="bg-[#D4A373] text-[#0a0a0a] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {sendingChat ? "Enviando..." : "Enviar Mensagem"}
                </button>
              </form>
            </div>

            <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
              <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
                Histórico de Conversas
              </h2>
              <div className="space-y-4">
                {questions.length === 0 && (
                  <p className="text-sm text-[#a1a1a1]">
                    Nenhuma conversa encontrada.
                  </p>
                )}
                {questions.map((q) => {
                  const thread = [q, ...(q.children || [])].sort(
                    (a, b) =>
                      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  );
                  const status = getThreadStatus(thread);
                  const isExpanded = expandedQuestion === q.id;

                  return (
                    <div
                      key={q.id}
                      className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[#f5f5f5]">
                            {q.student?.name || "Aluno"} /{" "}
                            {q.teacher?.name || "Professor"}
                          </p>
                          <p className="text-sm text-[#a1a1a1] mt-1">
                            {q.content}
                          </p>
                          <p className="text-xs text-[#D4A373] mt-2">
                            Status: {status}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedQuestion(isExpanded ? null : q.id)
                          }
                          className="text-xs text-[#a1a1a1] hover:text-[#D4A373] underline"
                        >
                          {isExpanded ? "Fechar" : "Ver thread"}
                        </button>
                      </div>

                      {isExpanded && (
                        <>
                          {renderThread(q)}
                          <div className="mt-4 flex gap-2">
                            <input
                              type="text"
                              value={replyContent[q.id] || ""}
                              onChange={(e) =>
                                setReplyContent((prev) => ({
                                  ...prev,
                                  [q.id]: e.target.value,
                                }))
                              }
                              placeholder="Responder como gestão..."
                              className="flex-1 bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 text-sm text-[#f5f5f5] placeholder-[#a1a1a1] focus:outline-none focus:border-[#D4A373]"
                            />
                            <button
                              type="button"
                              onClick={() => handleReply(q)}
                              className="bg-[#D4A373] text-[#0a0a0a] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                            >
                              Responder
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

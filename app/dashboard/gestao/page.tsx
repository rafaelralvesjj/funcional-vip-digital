"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";

interface Student {
  id: string;
  name: string;
  user?: { id: string; name: string | null } | null;
}

interface Teacher {
  id: string;
  name: string;
  email?: string | null;
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

export default function GestaoPage() {
  // UI States
  const [activeTab, setActiveTab] = useState<ActiveTab>("mural");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<TargetType>("TODOS_ALUNOS");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");

  // Data States
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [questions, setQuestions] = useState<ThreadMessage[]>([]);

  // Notice Form States
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");
  const [savingNotice, setSavingNotice] = useState(false);
  const [noticeSuccess, setNoticeSuccess] = useState("");
  const [noticeError, setNoticeError] = useState("");

  // Chat Form States
  const [chatContent, setChatContent] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [chatSuccess, setChatSuccess] = useState("");
  const [chatError, setChatError] = useState("");
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});

  // Helpers
  const extractArray = (data: any, key: string): any[] => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data[key])) return data[key];
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getAuthorName = (m: ThreadMessage) => {
    if (m.senderRole === "GESTOR") return "Gestão";
    if (m.senderRole === "TEACHER") return m.answeredBy?.name || m.teacher?.name || "Professor";
    if (m.senderRole === "STUDENT") return m.student?.name || "Aluno";
    return "Usuário";
  };

  const getThreadStatus = (q: ThreadMessage) => {
    const thread = [q, ...(q.children || [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const last = thread[thread.length - 1];
    if (last.senderRole === "TEACHER") return "Respondida / aguardando gestão";
    if (last.senderRole === "GESTOR") return "Aguardando professor";
    if (last.senderRole === "STUDENT") return "Aguardando resposta";
    return "Em andamento";
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case "GESTOR": return "bg-[#D4A373] text-black";
      case "TEACHER": return "bg-blue-600 text-white";
      case "STUDENT": return "bg-green-600 text-white";
      default: return "bg-gray-600 text-white";
    }
  };

  // Fetching
  const fetchSession = async () => {
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      if (data?.user?.id) setCurrentUserId(data.user.id);
    } catch (e) {
      console.error("Session fetch error", e);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await fetch("/api/students");
      const data = await res.json();
      setStudents(extractArray(data, "students"));
    } catch (e) {
      console.error("Students fetch error", e);
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await fetch("/api/teachers");
      const data = await res.json();
      setTeachers(extractArray(data, "teachers"));
    } catch (e) {
      console.error("Teachers fetch error", e);
    }
  };

  const fetchNotices = async () => {
    try {
      const res = await fetch("/api/notices");
      const data = await res.json();
      setNotices(extractArray(data, "notices"));
    } catch (e) {
      console.error("Notices fetch error", e);
    }
  };

  const fetchQuestions = async () => {
    try {
      const params = new URLSearchParams();
      params.append("senderRole", "GESTOR");
      if (selectedTeacherId) params.append("teacherId", selectedTeacherId);
      if (selectedStudentId) params.append("studentId", selectedStudentId);

      const res = await fetch(`/api/questions?${params.toString()}`);
      const data = await res.json();
      setQuestions(extractArray(data, "questions"));
    } catch (e) {
      console.error("Questions fetch error", e);
    }
  };

  useEffect(() => {
    fetchSession();
    fetchStudents();
    fetchTeachers();
    fetchNotices();
    fetchQuestions();
  }, []);

  useEffect(() => {
    if (activeTab === "chat") fetchQuestions();
  }, [selectedStudentId, selectedTeacherId, activeTab]);

  // Handlers
  const handlePublishNotice = async (e: FormEvent) => {
    e.preventDefault();
    if (!noticeContent.trim()) return;

    setSavingNotice(true);
    setNoticeError("");
    setNoticeSuccess("");

    let targetRole = "STUDENT";
    let studentId: string | null = null;
    let professorId: string | null = null;

    if (targetType === "ALUNO_ESPECIFICO") {
      if (!selectedStudentId) {
        setNoticeError("Selecione um aluno");
        setSavingNotice(false);
        return;
      }
      studentId = selectedStudentId;
    } else if (targetType === "PROFESSOR_ESPECIFICO") {
      targetRole = "TEACHER";
      if (!selectedTeacherId) {
        setNoticeError("Selecione um professor");
        setSavingNotice(false);
        return;
      }
      professorId = selectedTeacherId;
    } else if (targetType === "TODOS_PROFESSORES") {
      targetRole = "TEACHER";
    }

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
        const err = await res.json();
        throw new Error(err.message || "Erro ao publicar aviso");
      }

      setNoticeSuccess("Aviso publicado com sucesso!");
      setNoticeTitle("");
      setNoticeContent("");
      fetchNotices();
    } catch (err: any) {
      setNoticeError(err.message);
    } finally {
      setSavingNotice(false);
    }
  };

  const handleSendChat = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatContent.trim() || !selectedStudentId || !selectedTeacherId) {
      setChatError("Preencha todos os campos e selecione aluno/professor");
      return;
    }

    setSendingChat(true);
    setChatError("");
    setChatSuccess("");

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
        throw new Error(err.message || "Erro ao enviar mensagem");
      }

      setChatSuccess("Mensagem enviada!");
      setChatContent("");
      fetchQuestions();
    } catch (err: any) {
      setChatError(err.message);
    } finally {
      setSendingChat(false);
    }
  };

  const handleReply = async (question: ThreadMessage) => {
    const text = replyContent[question.id];
    if (!text?.trim()) return;

    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text.trim(),
          parentId: question.id,
          studentId: question.studentId,
          teacherId: question.teacherId,
          senderRole: "GESTOR",
          answeredById: currentUserId,
        }),
      });

      if (!res.ok) throw new Error("Erro ao responder");

      setReplyContent((prev) => ({ ...prev, [question.id]: "" }));
      fetchQuestions();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#D4A373]">Gestão</h1>
          <p className="text-[#a1a1a1]">Painel administrativo para avisos e comunicações.</p>
        </header>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-[#ffffff10]">
          <button
            onClick={() => setActiveTab("mural")}
            className={`pb-2 px-4 transition-colors ${
              activeTab === "mural" ? "border-b-2 border-[#D4A373] text-[#D4A373]" : "text-[#a1a1a1] hover:text-white"
            }`}
          >
            Mural de Avisos
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`pb-2 px-4 transition-colors ${
              activeTab === "chat" ? "border-b-2 border-[#D4A373] text-[#D4A373]" : "text-[#a1a1a1] hover:text-white"
            }`}
          >
            Chat / Mensagens
          </button>
        </div>

        {activeTab === "mural" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form Column */}
            <div className="lg:col-span-1">
              <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6 sticky top-8">
                <h2 className="text-xl font-semibold mb-4">Publicar Aviso</h2>
                <form onSubmit={handlePublishNotice} className="space-y-4">
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Título (opcional)</label>
                    <input
                      type="text"
                      value={noticeTitle}
                      onChange={(e) => setNoticeTitle(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 focus:outline-none focus:border-[#D4A373]"
                      placeholder="Ex: Reunião Geral"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Conteúdo</label>
                    <textarea
                      required
                      value={noticeContent}
                      onChange={(e) => setNoticeContent(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 h-32 focus:outline-none focus:border-[#D4A373]"
                      placeholder="Escreva o aviso aqui..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Destinatário</label>
                    <select
                      value={targetType}
                      onChange={(e) => setTargetType(e.target.value as TargetType)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 focus:outline-none"
                    >
                      <option value="TODOS_ALUNOS">Todos os Alunos</option>
                      <option value="ALUNO_ESPECIFICO">Aluno Específico</option>
                      <option value="TODOS_PROFESSORES">Todos os Professores</option>
                      <option value="PROFESSOR_ESPECIFICO">Professor Específico</option>
                    </select>
                  </div>

                  {targetType === "ALUNO_ESPECIFICO" && (
                    <div>
                      <label className="block text-sm text-[#a1a1a1] mb-1">Selecionar Aluno</label>
                      <select
                        value={selectedStudentId}
                        onChange={(e) => setSelectedStudentId(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 focus:outline-none"
                      >
                        <option value="">Selecione...</option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {targetType === "PROFESSOR_ESPECIFICO" && (
                    <div>
                      <label className="block text-sm text-[#a1a1a1] mb-1">Selecionar Professor</label>
                      <select
                        value={selectedTeacherId}
                        onChange={(e) => setSelectedTeacherId(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 focus:outline-none"
                      >
                        <option value="">Selecione...</option>
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {noticeError && <p className="text-red-500 text-sm">{noticeError}</p>}
                  {noticeSuccess && <p className="text-green-500 text-sm">{noticeSuccess}</p>}

                  <button
                    type="submit"
                    disabled={savingNotice}
                    className="w-full bg-[#D4A373] text-black font-bold py-2 rounded-lg hover:bg-[#b88a5d] transition-colors disabled:opacity-50"
                  >
                    {savingNotice ? "Publicando..." : "Publicar Aviso"}
                  </button>
                </form>
              </div>
            </div>

            {/* History Column */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-xl font-semibold mb-4">Histórico de Avisos</h2>
              {notices.length === 0 ? (
                <p className="text-[#a1a1a1]">Nenhum aviso encontrado.</p>
              ) : (
                notices.map((n) => (
                  <div key={n.id} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-bold text-[#D4A373]">{n.title || "Aviso"}</h3>
                      <span className="text-xs text-[#a1a1a1]">{formatDateTime(n.createdAt)}</span>
                    </div>
                    <p className="text-[#f5f5f5] mb-4 whitespace-pre-wrap">{n.content}</p>
                    <div className="flex gap-2">
                      <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-[#ffffff08] text-[#a1a1a1]">
                        Para: {n.targetRole === "STUDENT" ? (n.student?.name || "Todos Alunos") : (n.professor?.name || "Todos Professores")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Chat Form Column */}
            <div className="lg:col-span-1">
              <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6 sticky top-8">
                <h2 className="text-xl font-semibold mb-4">Nova Mensagem</h2>
                <form onSubmit={handleSendChat} className="space-y-4">
                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Aluno</label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 focus:outline-none"
                    >
                      <option value="">Selecione o aluno...</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Professor</label>
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 focus:outline-none"
                    >
                      <option value="">Selecione o professor...</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-[#a1a1a1] mb-1">Mensagem</label>
                    <textarea
                      required
                      value={chatContent}
                      onChange={(e) => setChatContent(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-2 h-24 focus:outline-none focus:border-[#D4A373]"
                      placeholder="Inicie uma conversa..."
                    />
                  </div>

                  {chatError && <p className="text-red-500 text-sm">{chatError}</p>}
                  {chatSuccess && <p className="text-green-500 text-sm">{chatSuccess}</p>}

                  <button
                    type="submit"
                    disabled={sendingChat}
                    className="w-full bg-[#D4A373] text-black font-bold py-2 rounded-lg hover:bg-[#b88a5d] transition-colors disabled:opacity-50"
                  >
                    {sendingChat ? "Enviando..." : "Enviar Mensagem"}
                  </button>
                </form>
              </div>
            </div>

            {/* Chat History Column */}
            <div className="lg:col-span-2 space-y-6">
              <h2 className="text-xl font-semibold mb-4">Conversas Ativas</h2>
              {questions.length === 0 ? (
                <p className="text-[#a1a1a1]">Nenhuma conversa encontrada para os filtros selecionados.</p>
              ) : (
                questions.map((q) => {
                  const thread = [q, ...(q.children || [])].sort(
                    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  );
                  const isExpanded = expandedQuestion === q.id;

                  return (
                    <div key={q.id} className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
                      {/* Header */}
                      <div className="p-4 bg-[#ffffff05] border-b border-[#ffffff10] flex justify-between items-center">
                        <div>
                          <span className="text-xs font-bold text-[#D4A373] uppercase">{q.student?.name} ↔ {q.teacher?.name}</span>
                          <div className="text-[10px] text-[#a1a1a1] mt-1">Status: {getThreadStatus(q)}</div>
                        </div>
                        <button
                          onClick={() => setExpandedQuestion(isExpanded ? null : q.id)}
                          className="text-xs text-[#D4A373] hover:underline"
                        >
                          {isExpanded ? "Recolher" : "Ver conversa"}
                        </button>
                      </div>

                      {/* Messages */}
                      <div className="p-4 space-y-4">
                        {thread.map((msg, idx) => (
                          <div key={msg.id} className={`flex flex-col ${msg.senderRole === "GESTOR" ? "items-end" : "items-start"}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${getRoleBadgeClass(msg.senderRole)}`}>
                                {msg.senderRole}
                              </span>
                              <span className="text-[10px] text-[#a1a1a1]">{getAuthorName(msg)} • {formatDateTime(msg.createdAt)}</span>
                            </div>
                            <div className={`max-w-[85%] p-3 rounded-lg text-sm ${msg.senderRole === "GESTOR" ? "bg-[#D4A37320] border border-[#D4A37340]" : "bg-[#ffffff08] border border-[#ffffff10]"}`}>
                              {msg.content}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Reply Area */}
                      {isExpanded && (
                        <div className="p-4 bg-[#0a0a0a] border-t border-[#ffffff10]">
                          <textarea
                            value={replyContent[q.id] || ""}
                            onChange={(e) => setReplyContent(prev => ({ ...prev, [q.id]: e.target.value }))}
                            className="w-full bg-[#111111] border border-[#ffffff10] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#D4A373] mb-2"
                            placeholder="Escreva uma resposta..."
                            rows={2}
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setExpandedQuestion(null)}
                              className="px-3 py-1 text-xs text-[#a1a1a1] hover:text-white"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleReply(q)}
                              className="px-4 py-1 text-xs bg-[#D4A373] text-black font-bold rounded hover:bg-[#b88a5d]"
                            >
                              Responder
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

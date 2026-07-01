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
  title?: string | null;
  content: string;
  type?: string | null;
  authorId?: string | null;
  studentId?: string | null;
  targetRole: string;
  professorId?: string | null;
  createdAt: string;
  author?: { id: string; name: string | null };
  student?: { id: string; name: string };
  professor?: { id: string; name: string | null };
}

interface ThreadMessage {
  id: string;
  studentId: string;
  teacherId?: string | null;
  content: string;
  senderRole: string;
  createdAt: string;
  answeredBy?: { id: string; name: string | null; role?: string | null };
  student?: { id: string; name: string };
  teacher?: { id: string; name: string };
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

  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");
  const [savingNotice, setSavingNotice] = useState(false);
  const [noticeSuccess, setNoticeSuccess] = useState("");
  const [noticeError, setNoticeError] = useState("");

  const [chatContent, setChatContent] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [chatSuccess, setChatSuccess] = useState("");
  const [chatError, setChatError] = useState("");

  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

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
      if (data?.user?.id) setCurrentUserId(data.user.id);
    } catch (err) {
      console.error("fetchSession error:", err);
    }
  }

  async function fetchStudents() {
    try {
      const res = await fetch("/api/students");
      const data = await res.json();
      setStudents(data.students || []);
    } catch (err) {
      console.error("fetchStudents error:", err);
    }
  }

  async function fetchTeachers() {
    try {
      const res = await fetch("/api/teachers");
      const data = await res.json();
      setTeachers(data.teachers || []);
    } catch (err) {
      console.error("fetchTeachers error:", err);
    }
  }

  async function fetchNotices() {
    try {
      const res = await fetch("/api/notices");
      const data = await res.json();
      setNotices(data.notices || []);
    } catch (err) {
      console.error("fetchNotices error:", err);
    }
  }

  async function fetchQuestions() {
    try {
      const params = new URLSearchParams();
      if (selectedTeacherId) params.set("teacherId", selectedTeacherId);
      if (selectedStudentId) params.set("studentId", selectedStudentId);
      params.set("senderRole", "GESTOR");
      const res = await fetch(`/api/questions?${params.toString()}`);
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (err) {
      console.error("fetchQuestions error:", err);
    }
  }

  async function handlePublishNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeError("");
    setNoticeSuccess("");
    if (!noticeContent.trim()) {
      setNoticeError("Conteúdo do aviso é obrigatório.");
      return;
    }
    setSavingNotice(true);
    try {
      const payload: any = {
        title: noticeTitle.trim(),
        content: noticeContent.trim(),
        targetRole: "STUDENT",
      };

      if (targetType === "ALUNO_ESPECIFICO") {
        if (!selectedStudentId) {
          setNoticeError("Selecione um aluno.");
          setSavingNotice(false);
          return;
        }
        payload.studentId = selectedStudentId;
        payload.targetRole = "STUDENT";
      } else if (targetType === "TODOS_ALUNOS") {
        payload.targetRole = "STUDENT";
      } else if (targetType === "PROFESSOR_ESPECIFICO") {
        if (!selectedTeacherId) {
          setNoticeError("Selecione um professor.");
          setSavingNotice(false);
          return;
        }
        payload.professorId = selectedTeacherId;
        payload.targetRole = "TEACHER";
      } else if (targetType === "TODOS_PROFESSORES") {
        payload.targetRole = "TEACHER";
      }

      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Erro ao publicar aviso");
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
      setChatError("Mensagem é obrigatória.");
      return;
    }
    if (targetType === "ALUNO_ESPECIFICO" && !selectedStudentId) {
      setChatError("Selecione um aluno.");
      return;
    }
    if (targetType === "PROFESSOR_ESPECIFICO" && !selectedTeacherId) {
      setChatError("Selecione um professor.");
      return;
    }

    setSendingChat(true);
    try {
      const payload: any = {
        content: chatContent.trim(),
        senderRole: "GESTOR",
      };

      if (targetType === "ALUNO_ESPECIFICO" || targetType === "TODOS_ALUNOS") {
        payload.studentId = selectedStudentId || "";
        if (selectedTeacherId) payload.teacherId = selectedTeacherId;
      } else if (targetType === "PROFESSOR_ESPECIFICO" || targetType === "TODOS_PROFESSORES") {
        payload.teacherId = selectedTeacherId || "";
        if (selectedStudentId) payload.studentId = selectedStudentId;
      }

      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Erro ao enviar mensagem");
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
    if (!replyContent.trim() || !currentUserId) return;
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyContent.trim(),
          parentId: question.id,
          studentId: question.studentId,
          teacherId: question.teacherId,
          senderRole: "GESTOR",
          answeredById: currentUserId,
        }),
      });
      if (!res.ok) throw new Error("Erro ao responder");
      setReplyContent("");
      setExpandedQuestion(null);
      fetchQuestions();
    } catch (err: any) {
      alert(err.message || "Erro ao responder");
    }
  }

  function renderThreadStatus(thread: ThreadMessage[]) {
    if (thread.length === 0) return null;
    const last = thread[thread.length - 1];
    if (last.senderRole === "TEACHER") {
      return <span className="text-emerald-400 text-sm">Respondida / aguardando gestão</span>;
    }
    if (last.senderRole === "GESTOR") {
      return <span className="text-amber-400 text-sm">Aguardando professor</span>;
    }
    return <span className="text-amber-400 text-sm">Aguardando resposta</span>;
  }

  function renderAuthorLabel(msg: ThreadMessage) {
    if (msg.senderRole === "GESTOR") return { label: "Gestão", color: "text-amber-300" };
    if (msg.senderRole === "TEACHER") {
      const name = msg.answeredBy?.name || msg.teacher?.name || "Professor";
      return { label: `Professor: ${name}`, color: "text-emerald-300" };
    }
    const name = msg.student?.name || "Aluno";
    return { label: `Aluno: ${name}`, color: "text-zinc-300" };
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Gestão</h1>

        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("mural")}
            className={`px-4 py-2 rounded-lg font-medium ${activeTab === "mural" ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
          >
            Mural
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 rounded-lg font-medium ${activeTab === "chat" ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
          >
            Chat
          </button>
        </div>

        {activeTab === "mural" && (
          <div className="space-y-6">
            <section className="bg-zinc-900 rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-4">Publicar aviso</h2>
              <form onSubmit={handlePublishNotice} className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Destinatário</label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value as TargetType)}
                    className="w-full bg-zinc-800 rounded-lg p-2 text-zinc-100"
                  >
                    <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                    <option value="TODOS_ALUNOS">Todos os alunos</option>
                    <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                    <option value="TODOS_PROFESSORES">Todos os professores</option>
                  </select>
                </div>

                {targetType === "ALUNO_ESPECIFICO" && (
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Aluno</label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-zinc-800 rounded-lg p-2 text-zinc-100"
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
                    <label className="block text-sm text-zinc-400 mb-1">Professor</label>
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-zinc-800 rounded-lg p-2 text-zinc-100"
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
                  <label className="block text-sm text-zinc-400 mb-1">Título</label>
                  <input
                    type="text"
                    value={noticeTitle}
                    onChange={(e) => setNoticeTitle(e.target.value)}
                    className="w-full bg-zinc-800 rounded-lg p-2 text-zinc-100"
                    placeholder="Título do aviso"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Conteúdo</label>
                  <textarea
                    value={noticeContent}
                    onChange={(e) => setNoticeContent(e.target.value)}
                    className="w-full bg-zinc-800 rounded-lg p-2 text-zinc-100 min-h-[100px]"
                    placeholder="Conteúdo do aviso"
                  />
                </div>

                {noticeError && <p className="text-red-400 text-sm">{noticeError}</p>}
                {noticeSuccess && <p className="text-emerald-400 text-sm">{noticeSuccess}</p>}

                <button
                  type="submit"
                  disabled={savingNotice}
                  className="bg-zinc-100 text-zinc-900 px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                >
                  {savingNotice ? "Publicando..." : "Publicar"}
                </button>
              </form>
            </section>

            <section className="bg-zinc-900 rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-4">Avisos publicados</h2>
              <div className="space-y-4">
                {notices.length === 0 ? (
                  <p className="text-zinc-400">Nenhum aviso publicado.</p>
                ) : (
                  notices.map((n) => (
                    <div key={n.id} className="bg-zinc-800 rounded-xl p-4">
                      <p className="font-medium">{n.title || "Aviso"}</p>
                      <p className="text-sm text-zinc-300">{n.content}</p>
                      <p className="text-xs text-zinc-500 mt-2">
                        {n.author?.name || "Gestão"} • {new Date(n.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="space-y-6">
            <section className="bg-zinc-900 rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-4">Nova mensagem</h2>
              <form onSubmit={handleSendChat} className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Destinatário</label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value as TargetType)}
                    className="w-full bg-zinc-800 rounded-lg p-2 text-zinc-100"
                  >
                    <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                    <option value="TODOS_ALUNOS">Todos os alunos</option>
                    <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                    <option value="TODOS_PROFESSORES">Todos os professores</option>
                  </select>
                </div>

                {targetType === "ALUNO_ESPECIFICO" && (
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Aluno</label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-zinc-800 rounded-lg p-2 text-zinc-100"
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
                    <label className="block text-sm text-zinc-400 mb-1">Professor</label>
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full bg-zinc-800 rounded-lg p-2 text-zinc-100"
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
                  <label className="block text-sm text-zinc-400 mb-1">Mensagem</label>
                  <textarea
                    value={chatContent}
                    onChange={(e) => setChatContent(e.target.value)}
                    className="w-full bg-zinc-800 rounded-lg p-2 text-zinc-100 min-h-[100px]"
                    placeholder="Escreva sua mensagem"
                  />
                </div>

                {chatError && <p className="text-red-400 text-sm">{chatError}</p>}
                {chatSuccess && <p className="text-emerald-400 text-sm">{chatSuccess}</p>}

                <button
                  type="submit"
                  disabled={sendingChat}
                  className="bg-zinc-100 text-zinc-900 px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                >
                  {sendingChat ? "Enviando..." : "Enviar"}
                </button>
              </form>
            </section>

            <section className="bg-zinc-900 rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-4">Histórico de conversas</h2>
              <div className="space-y-4">
                {questions.length === 0 ? (
                  <p className="text-zinc-400">Nenhuma conversa encontrada.</p>
                ) : (
                  questions.map((q) => {
                    const thread = [q, ...(q.children || [])].sort(
                      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                    );
                    const isExpanded = expandedQuestion === q.id;

                    return (
                      <div key={q.id} className="bg-zinc-800 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">
                              {q.student?.name || "Aluno"} • {q.teacher?.name || "Professor"}
                            </p>
                            {renderThreadStatus(thread)}
                          </div>
                          <button
                            onClick={() => setExpandedQuestion(isExpanded ? null : q.id)}
                            className="text-sm text-zinc-300 hover:text-white"
                          >
                            Continuar conversa
                          </button>
                        </div>

                        <div className="space-y-2">
                          {thread.map((msg) => {
                            const author = renderAuthorLabel(msg);
                            return (
                              <div key={msg.id} className="bg-zinc-900 rounded-lg p-3">
                                <p className={`text-xs font-medium ${author.color}`}>{author.label}</p>
                                <p className="text-sm text-zinc-100 mt-1">{msg.content}</p>
                                <p className="text-xs text-zinc-500 mt-1">
                                  {new Date(msg.createdAt).toLocaleString("pt-BR")}
                                </p>
                              </div>
                            );
                          })}
                        </div>

                        {isExpanded && (
                          <div className="space-y-2">
                            <textarea
                              value={replyContent}
                              onChange={(e) => setReplyContent(e.target.value)}
                              className="w-full bg-zinc-900 rounded-lg p-2 text-zinc-100 min-h-[80px]"
                              placeholder="Escreva uma resposta"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleReply(q)}
                                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                              >
                                Responder
                              </button>
                              <button
                                onClick={() => setExpandedQuestion(null)}
                                className="bg-zinc-700 text-zinc-100 px-4 py-2 rounded-lg text-sm font-medium"
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
          </div>
        )}
      </div>
    </main>
  );
}

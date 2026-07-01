"use client";
import { useEffect, useState } from "react";

interface Student { id: string; name: string; user?: { id: string; name: string }; }
interface Teacher { id: string; name: string; email?: string; _count?: { students: number }; }
interface Notice {
  id: string; title?: string; content: string; type: string; authorId: string; studentId?: string;
  targetRole: string; professorId?: string; createdAt: string;
  author?: { id: string; name: string; role?: string }; student?: { id: string; name: string }; professor?: { id: string; name: string };
}
interface Question {
  id: string; studentId: string; content: string; answer?: string; answeredAt?: string; senderRole: string;
  teacherId?: string; createdAt: string;
  student?: { id: string; name: string; user?: { id: string; name: string } };
  teacher?: { id: string; name: string }; answeredBy?: { id: string; name: string; role?: string }; children?: Question[];
}
type TargetType = "ALUNO_ESPECIFICO" | "TODOS_ALUNOS" | "PROFESSOR_ESPECIFICO" | "TODOS_PROFESSORES";
type ActiveTab = "mural" | "chat";

export default function GestaoPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("mural");
  const [currentUserId, setCurrentUserId] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("TODOS_ALUNOS");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");
  const [savingNotice, setSavingNotice] = useState(false);
  const [noticeSuccess, setNoticeSuccess] = useState(false);
  const [noticeError, setNoticeError] = useState("");
  const [chatContent, setChatContent] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [chatSuccess, setChatSuccess] = useState(false);
  const [chatError, setChatError] = useState("");
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  useEffect(() => { fetchSession(); fetchStudents(); fetchTeachers(); }, []);
  useEffect(() => { if (currentUserId) { fetchNotices(); fetchQuestions(); } }, [currentUserId, targetType, selectedStudentId, selectedTeacherId]);

  async function fetchSession() {
    try { const res = await fetch("/api/auth/session"); if (res.ok) { const session = await res.json(); setCurrentUserId(session?.user?.id || ""); } } catch {}
  }
  async function fetchStudents() {
    try { const res = await fetch("/api/students"); if (res.ok) { const data = await res.json(); setStudents(data.students || data || []); } } catch {}
  }
  async function fetchTeachers() {
    try { const res = await fetch("/api/teachers"); if (res.ok) { const data = await res.json(); setTeachers(Array.isArray(data) ? data : []); } } catch {}
  }
  async function fetchNotices() {
    try {
      const params = new URLSearchParams();
      if (targetType === "TODOS_PROFESSORES" || targetType === "PROFESSOR_ESPECIFICO") params.set("targetRole", "PROFESSOR");
      if (targetType === "PROFESSOR_ESPECIFICO" && selectedTeacherId) params.set("professorId", selectedTeacherId);
      const res = await fetch(`/api/notices?${params}`);
      if (res.ok) { const data = await res.json(); setNotices(Array.isArray(data) ? data : []); }
    } catch {}
  }
  async function fetchQuestions() {
    try {
      const params = new URLSearchParams();
      if (selectedTeacherId) params.set("teacherId", selectedTeacherId);
      else if (selectedStudentId) params.set("studentId", selectedStudentId);
      const res = await fetch(`/api/questions?${params}`);
      if (res.ok) { const data = await res.json(); setQuestions(Array.isArray(data) ? data : []); }
    } catch {}
  }

  async function handlePublishNotice(e: React.FormEvent) {
    e.preventDefault();
    if (!noticeContent.trim() || !currentUserId) return;
    setSavingNotice(true); setNoticeError(""); setNoticeSuccess(false);
    try {
      const body: any = { content: noticeContent.trim(), authorId: currentUserId, targetRole: targetType === "TODOS_PROFESSORES" || targetType === "PROFESSOR_ESPECIFICO" ? "PROFESSOR" : "ALUNO" };
      if (noticeTitle) body.title = noticeTitle;
      if (targetType === "ALUNO_ESPECIFICO" && selectedStudentId) body.studentId = selectedStudentId;
      if (targetType === "PROFESSOR_ESPECIFICO" && selectedTeacherId) body.professorId = selectedTeacherId;
      const res = await fetch("/api/notices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { setNoticeSuccess(true); setNoticeTitle(""); setNoticeContent(""); fetchNotices(); setTimeout(() => setNoticeSuccess(false), 3000); }
      else { const err = await res.json(); setNoticeError(err.error || "Erro ao publicar aviso"); }
    } catch { setNoticeError("Erro de conexão"); }
    setSavingNotice(false);
  }

  async function handleSendChat() {
    if (!chatContent.trim() || !currentUserId) return;
    if (!selectedStudentId && !selectedTeacherId) { setChatError("Selecione um destinatário (aluno ou professor)"); return; }
    setSendingChat(true); setChatError(""); setChatSuccess(false);
    try {
      const body: any = { content: chatContent.trim(), senderRole: "GESTOR" };
      if (selectedStudentId) body.studentId = selectedStudentId;
      if (selectedTeacherId) body.teacherId = selectedTeacherId;
      const res = await fetch("/api/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { setChatSuccess(true); setChatContent(""); fetchQuestions(); setTimeout(() => setChatSuccess(false), 3000); }
      else { const errData = await res.json().catch(() => ({})); setChatError(errData.error || `Erro ${res.status}`); }
    } catch (err: any) { setChatError(err?.message || "Erro de conexão"); }
    setSendingChat(false);
  }

  async function handleReply(questionId: string) {
    if (!replyContent.trim() || !currentUserId) return;
    const res = await fetch("/api/questions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: questionId, answer: replyContent.trim(), answeredById: currentUserId }),
    });
    if (res.ok) { setReplyContent(""); setExpandedQuestion(null); fetchQuestions(); }
    else { const err = await res.json().catch(() => ({})); console.error("Erro ao responder:", err); }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  const targetLabel = () => {
    switch (targetType) {
      case "ALUNO_ESPECIFICO": return students.find((s) => s.id === selectedStudentId)?.name || "aluno";
      case "TODOS_ALUNOS": return "todos os alunos";
      case "PROFESSOR_ESPECIFICO": return teachers.find((t) => t.id === selectedTeacherId)?.name || "professor";
      case "TODOS_PROFESSORES": return "todos os professores";
    }
  };
  const canSendChat = () => {
    if (!chatContent.trim()) return false;
    if (!selectedStudentId && !selectedTeacherId) return false;
    return true;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-[#D4A373]">Gestão</h1>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#f5f5f5]">Comunicação</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#a1a1a1] block mb-1.5">Para quem?</label>
              <select value={targetType} onChange={(e) => { setTargetType(e.target.value as TargetType); setSelectedStudentId(""); setSelectedTeacherId(""); setChatError(""); }}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-2.5 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]">
                <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                <option value="TODOS_ALUNOS">Todos os alunos</option>
                <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                <option value="TODOS_PROFESSORES">Todos os professores</option>
              </select>
            </div>
            {(targetType === "ALUNO_ESPECIFICO" || targetType === "TODOS_ALUNOS") && (
              <div>
                <label className="text-xs text-[#a1a1a1] block mb-1.5">Selecione o aluno *</label>
                <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-2.5 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]">
                  <option value="">Selecione...</option>
                  {students.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                </select>
              </div>
            )}
            {(targetType === "PROFESSOR_ESPECIFICO" || targetType === "TODOS_PROFESSORES") && (
              <div>
                <label className="text-xs text-[#a1a1a1] block mb-1.5">Selecione o professor *</label>
                <select value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-2.5 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]">
                  <option value="">Selecione...</option>
                  {teachers.map((t) => (<option key={t.id} value={t.id}>{t.name} {t._count ? `(${t._count.students} alunos)` : ""}</option>))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-1 bg-[#0a0a0a] rounded-lg p-1 border border-[#ffffff10]">
            <button onClick={() => setActiveTab("mural")}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition ${activeTab === "mural" ? "bg-[#D4A373] text-[#0a0a0a]" : "text-[#a1a1a1] hover:text-[#f5f5f5]"}`}>📢 Mural</button>
            <button onClick={() => setActiveTab("chat")}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition ${activeTab === "chat" ? "bg-[#D4A373] text-[#0a0a0a]" : "text-[#a1a1a1] hover:text-[#f5f5f5]"}`}>💬 Chat</button>
          </div>
        </div>

        {activeTab === "mural" && (
          <>
            <form onSubmit={handlePublishNotice} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#f5f5f5]">Publicar aviso para <span className="text-[#D4A373]">{targetLabel()}</span></h2>
              <div>
                <label className="text-xs text-[#a1a1a1] block mb-1">Título (opcional)</label>
                <input type="text" value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} placeholder="Ex: Mudança de horário"
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-2.5 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]" />
              </div>
              <div>
                <label className="text-xs text-[#a1a1a1] block mb-1">Descrição *</label>
                <textarea value={noticeContent} onChange={(e) => setNoticeContent(e.target.value)} rows={3} placeholder="Digite o conteúdo do aviso..." required
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-2.5 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373] resize-none" />
              </div>
              {noticeError && <p className="text-xs text-red-400">{noticeError}</p>}
              <button type="submit" disabled={savingNotice || !noticeContent.trim()}
                className="w-full bg-[#D4A373] text-[#0a0a0a] font-bold rounded-xl py-2.5 text-sm transition hover:bg-[#b88a5e] disabled:opacity-50 disabled:cursor-not-allowed">
                {savingNotice ? "Publicando..." : "Publicar aviso"}</button>
              {noticeSuccess && <p className="text-xs text-green-400 text-center">Aviso publicado com sucesso!</p>}
            </form>
            <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-[#f5f5f5] mb-4">Avisos publicados</h2>
              {notices.length === 0 ? (<p className="text-[#525252] text-xs text-center py-6">Nenhum aviso publicado.</p>
              ) : (<div className="space-y-3">{notices.map((notice) => (
                <div key={notice.id} className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#D4A373] mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      {notice.title && <h3 className="text-sm font-semibold text-[#f5f5f5] mb-0.5">{notice.title}</h3>}
                      <p className="text-xs text-[#e5e5e5]">{notice.content}</p>
                      <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-[#6b6b6b]">
                        <span>{formatDate(notice.createdAt)}</span>
                        {notice.author && (<span className="bg-[#D4A373]/10 text-[#D4A373] px-1.5 py-0.5 rounded-full">{notice.author.role === "GESTOR" ? "Gestor" : "Prof"}: {notice.author.name}</span>)}
                        {notice.targetRole === "PROFESSOR" && <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full">Para professores</span>}
                        {notice.targetRole === "ALUNO" && <span className="bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-full">Para alunos</span>}
                        {notice.professor && <span className="text-[#D4A373]">Prof específico: {notice.professor.name}</span>}
                        {notice.student && <span className="text-[#D4A373]">Aluno: {notice.student.name}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}</div>)}
            </div>
          </>
        )}

        {activeTab === "chat" && (
          <>
            <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#f5f5f5]">Enviar mensagem para <span className="text-[#D4A373]">{targetLabel()}</span></h2>
              {!selectedStudentId && !selectedTeacherId && (
                <div className="bg-amber-500/10 text-amber-400 text-xs p-3 rounded-lg text-center">Selecione um destinatário específico nas opções acima</div>
              )}
              <div>
                <label className="text-xs text-[#a1a1a1] block mb-1">Mensagem *</label>
                <textarea value={chatContent} onChange={(e) => { setChatContent(e.target.value); if (chatError) setChatError(""); }} rows={3} placeholder="Digite sua mensagem..." required
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-2.5 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373] resize-none" />
              </div>
              {chatError && <p className="text-xs text-red-400">{chatError}</p>}
              <button onClick={handleSendChat} disabled={sendingChat || !canSendChat()}
                className="w-full bg-[#D4A373] text-[#0a0a0a] font-bold rounded-xl py-2.5 text-sm transition hover:bg-[#b88a5e] disabled:opacity-50 disabled:cursor-not-allowed">
                {sendingChat ? "Enviando..." : "Enviar mensagem"}</button>
              {chatSuccess && <p className="text-xs text-green-400 text-center">Mensagem enviada!</p>}
            </div>

            <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-[#f5f5f5] mb-4">Histórico de conversas</h2>
              {questions.length === 0 ? (<p className="text-[#525252] text-xs text-center py-6">Nenhuma conversa encontrada.</p>
              ) : (<div className="space-y-3">{questions.map((q) => {
                const hasDirectAnswer = !!q.answer;
                const hasChildAnswer = q.children?.some((c) => c.answer);
                const isAnswered = hasDirectAnswer || hasChildAnswer;
                const lastChildReply = q.children?.filter((c) => c.answer).pop();
                const replyAnswer = hasDirectAnswer ? q.answer : lastChildReply?.answer;
                const replyAuthor = hasDirectAnswer ? q.answeredBy?.name : lastChildReply?.answeredBy?.name;

                return (
                  <div key={q.id} className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-[#f5f5f5]">{q.student?.name || "Aluno"}</span>
                        {q.teacher && <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">Prof: {q.teacher.name}</span>}
                        <span className="text-[9px] text-[#D4A373] bg-[#D4A373]/10 px-1.5 py-0.5 rounded-full">
                          {q.senderRole === "GESTOR" ? "Gestor" : q.senderRole === "TEACHER" ? "Professor" : "Aluno"}
                        </span>
                      </div>
                      <p className="text-xs text-[#e5e5e5] mt-1">{q.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-[#525252]">{formatDate(q.createdAt)}</span>
                        {isAnswered ? <span className="text-[9px] text-green-400">Respondida</span> : <span className="text-[9px] text-amber-400">Pendente</span>}
                      </div>
                      {isAnswered && replyAnswer && (
                        <div className="mt-2 pl-3 border-l-2 border-green-500/30">
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-green-400">Resposta:</span>
                            {replyAuthor && <span className="text-[9px] text-[#525252]">- {replyAuthor}</span>}
                          </div>
                          <p className="text-xs text-[#a1a1a1] mt-0.5">{replyAnswer}</p>
                        </div>
                      )}
                      {!isAnswered && (
                        <div className="mt-3">
                          {expandedQuestion === q.id ? (
                            <div className="space-y-2">
                              <textarea value={replyContent} onChange={(e) => setReplyContent(e.target.value)} rows={2} placeholder="Digite sua resposta..."
                                className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-3 py-2 text-xs text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373] resize-none" />
                              <div className="flex gap-2">
                                <button onClick={() => handleReply(q.id)} disabled={!replyContent.trim()}
                                  className="text-xs bg-[#D4A373] text-[#0a0a0a] px-4 py-1.5 rounded-lg font-medium disabled:opacity-50">Responder</button>
                                <button onClick={() => { setExpandedQuestion(null); setReplyContent(""); }}
                                  className="text-xs text-[#6b6b6b] px-3 py-1.5">Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setExpandedQuestion(q.id)} className="text-xs text-[#D4A373] hover:text-[#c49563] transition mt-1">Responder</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}</div>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

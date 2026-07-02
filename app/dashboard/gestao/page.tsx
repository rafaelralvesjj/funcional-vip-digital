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
  parentId?: string | null;
  resolvedAt?: string | null;
}

type TargetType = "ALUNO_ESPECIFICO" | "TODOS_ALUNOS" | "PROFESSOR_ESPECIFICO" | "TODOS_PROFESSORES";
type ChatTargetType = "ALUNO_ESPECIFICO" | "PROFESSOR_ESPECIFICO";
type ActiveTab = "mural" | "chat";

// --- HELPERS ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getStringFromRecord(record: Record<string, unknown>, key: string): string {
  return getString(record[key]);
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

function findFirstArray(value: unknown, depth = 0): unknown[] {
  if (Array.isArray(value)) return value;
  if (depth >= 4 || value === null || typeof value !== 'object') return [];
  const obj = value as Record<string, unknown>;
  for (const key in obj) {
    const arr = findFirstArray(obj[key], depth + 1);
    if (arr.length > 0) return arr;
  }
  return [];
}

function extractArray(data: unknown, candidateKeys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  for (const key of candidateKeys) {
    const val = data[key];
    if (Array.isArray(val)) return val;
  }
  return findFirstArray(data, 0);
}

function normalizeStudent(item: any): Student {
  const id = getString(item.id || item.student?.id || item.studentId || item.userId || item.user?.id);
  const name = getString(item.name || item.student?.name || item.studentName || item.user?.name || item.nome) || "Sem nome";
  return { id, name, userId: getString(item.userId) };
}

function normalizeTeacher(item: any): Teacher {
  const id = getString(item.userId || item.user?.id || item.id);
  const name = getString(item.name || item.user?.name || item.teacherName || item.teacher?.name || item.nome) || "Sem nome";
  return { id, name, userId: getString(item.userId) };
}

function normalizeNotice(item: any): Notice {
  return {
    id: getString(item.id),
    title: getString(item.title),
    content: getString(item.content),
    type: getString(item.type),
    authorId: getString(item.authorId),
    studentId: getString(item.studentId),
    targetRole: getString(item.targetRole),
    professorId: getString(item.professorId),
    createdAt: getString(item.createdAt),
    author: isRecord(item.author) ? { id: getString(item.author.id), name: getString(item.author.name), role: getString(item.author.role) } : null,
    student: isRecord(item.student) ? { id: getString(item.student.id), name: getString(item.student.name) } : null,
    professor: isRecord(item.professor) ? { id: getString(item.professor.id), name: getString(item.professor.name) } : null
  };
}

function normalizeThreadMessage(item: any): ThreadMessage {
  return {
    id: getString(item.id),
    studentId: getString(item.studentId),
    teacherId: getString(item.teacherId),
    content: getString(item.content),
    senderRole: getString(item.senderRole),
    createdAt: getString(item.createdAt),
    parentId: getString(item.parentId),
    resolvedAt: getString(item.resolvedAt),
    answeredBy: isRecord(item.answeredBy) ? { id: getString(item.answeredBy.id), name: getString(item.answeredBy.name), role: getString(item.answeredBy.role) } : null,
    student: isRecord(item.student) ? { id: getString(item.student.id), name: getString(item.student.name) } : null,
    teacher: isRecord(item.teacher) ? { id: getString(item.teacher.id), name: getString(item.teacher.name) } : null,
    children: Array.isArray(item.children) ? item.children.map(normalizeThreadMessage) : []
  };
}

function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set();
  return list.filter(item => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return "--/--/--";
  try {
    return new Date(dateStr).toLocaleString('pt-BR');
  } catch {
    return dateStr;
  }
}

function getThreadStatus(thread: ThreadMessage): string {
  if (thread.resolvedAt) return "Encerrada";
  return (thread.children && thread.children.length > 0) ? "Respondido" : "Aguardando resposta";
}

function getThreadStatusClass(thread: ThreadMessage): string {
  if (thread.resolvedAt) return "text-zinc-400";
  return (thread.children && thread.children.length > 0) ? "text-emerald-400" : "text-amber-400";
}

function getAuthorName(msg: ThreadMessage): string {
  if (msg.senderRole === 'GESTOR') return msg.answeredBy?.name || 'Gestor';
  if (msg.senderRole === 'STUDENT') return msg.student?.name || 'Aluno';
  if (msg.senderRole === 'TEACHER') return msg.teacher?.name || 'Professor';
  return 'Usuário';
}

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case 'GESTOR': return 'bg-amber-900/30 text-amber-400 border border-amber-500/20';
    case 'STUDENT': return 'bg-blue-900/30 text-blue-400 border border-blue-500/20';
    case 'TEACHER': return 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/20';
    default: return 'bg-zinc-800 text-zinc-400 border border-zinc-700';
  }
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (isRecord(data)) {
    const error = getStringFromRecord(data, "error");
    if (error) return error;
    const message = getStringFromRecord(data, "message");
    if (message) return message;
  }
  return fallback;
}

// --- PAGE COMPONENT ---

export default function GestaoPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("mural");
  const [currentUserId, setCurrentUserId] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("TODOS_ALUNOS");
  const [chatTargetType, setChatTargetType] = useState<ChatTargetType>("ALUNO_ESPECIFICO");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [chatSelectedStudentId, setChatSelectedStudentId] = useState("");
  const [chatSelectedTeacherId, setChatSelectedTeacherId] = useState("");

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
  const [closingQuestionId, setClosingQuestionId] = useState<string | null>(null);

  const studentsOptions = useMemo(() => students.filter(s => !!s.id && !!s.name), [students]);
  const teachersOptions = useMemo(() => teachers.filter(t => !!t.id && !!t.name), [teachers]);

  function getNoticeTargetGroup(notice: Notice): string {
    return String(notice.targetRole || "").toUpperCase() === "TEACHER"
      ? "Professores"
      : "Alunos";
  }

  function getNoticeTargetNames(notice: Notice): string[] {
    const targetRole = String(notice.targetRole || "").toUpperCase();

    if (targetRole === "TEACHER") {
      if (notice.professor?.name) {
        return [notice.professor.name];
      }

      if (notice.professorId) {
        const professor = teachersOptions.find((teacher) => teacher.id === notice.professorId);
        return [professor?.name || "Professor específico"];
      }

      return teachersOptions.map((teacher) => teacher.name);
    }

    if (notice.student?.name) {
      return [notice.student.name];
    }

    if (notice.studentId) {
      const student = studentsOptions.find((item) => item.id === notice.studentId);
      return [student?.name || "Aluno específico"];
    }

    return studentsOptions.map((student) => student.name);
  }

  const reloadQuestions = async () => {
    const qRes = await fetch('/api/questions', { cache: 'no-store' });
    const qData = await safeJson(qRes);
    setQuestions(extractArray(qData, ["questions", "items", "data"]).map(normalizeThreadMessage).filter(q => !q.parentId));
  };

  useEffect(() => {
    const loadData = async () => {
      const [sessionRes, studentsRes, teachersRes, noticesRes, questionsRes] = await Promise.all([
        fetch('/api/auth/session', { cache: 'no-store' }),
        fetch('/api/students', { cache: 'no-store' }),
        fetch('/api/teachers', { cache: 'no-store' }),
        fetch('/api/notices', { cache: 'no-store' }),
        fetch('/api/questions', { cache: 'no-store' })
      ]);

      const sessionData = await safeJson(sessionRes);
      if (isRecord(sessionData)) {
        const user = getNestedRecord(sessionData, "user");
        if (user) setCurrentUserId(getStringFromRecord(user, "id"));
      }

      const sData = await safeJson(studentsRes);
      setStudents(dedupeById(extractArray(sData, ["students", "items", "data", "alunos"]).map(normalizeStudent)));

      const tData = await safeJson(teachersRes);
      setTeachers(dedupeById(extractArray(tData, ["teachers", "items", "data", "professores"]).map(normalizeTeacher)));

      const nData = await safeJson(noticesRes);
      setNotices(extractArray(nData, ["notices", "items", "data"]).map(normalizeNotice));

      const qData = await safeJson(questionsRes);
      setQuestions(extractArray(qData, ["questions", "items", "data"]).map(normalizeThreadMessage).filter(q => !q.parentId));
    };
    loadData();
  }, []);

  const handlePublishNotice = async (e: FormEvent) => {
    e.preventDefault();
    setSavingNotice(true);
    setNoticeError("");
    setNoticeSuccess("");

    let targetRole = "STUDENT";
    let studentId = null;
    let professorId = null;

    if (targetType === "TODOS_ALUNOS") { targetRole = "STUDENT"; }
    else if (targetType === "ALUNO_ESPECIFICO") { targetRole = "STUDENT"; studentId = selectedStudentId; }
    else if (targetType === "TODOS_PROFESSORES") { targetRole = "TEACHER"; }
    else if (targetType === "PROFESSOR_ESPECIFICO") { targetRole = "TEACHER"; professorId = selectedTeacherId; }

    const res = await fetch('/api/notices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: noticeTitle,
        content: noticeContent,
        type: 'MANAGEMENT',
        targetRole,
        studentId,
        professorId,
        authorId: currentUserId
      })
    });

    const data = await safeJson(res);
    if (!res.ok) {
      setNoticeError(getErrorMessage(data, "Erro ao publicar aviso."));
      setSavingNotice(false);
      return;
    }

    setNoticeSuccess("Aviso publicado com sucesso!");
    setNoticeTitle("");
    setNoticeContent("");
    setSavingNotice(false);

    const nRes = await fetch('/api/notices', { cache: 'no-store' });
    const nData = await safeJson(nRes);
    setNotices(extractArray(nData, ["notices"]).map(normalizeNotice));
  };

  const handleSendChat = async (e: FormEvent) => {
    e.preventDefault();
    setSendingChat(true);
    setChatError("");
    setChatSuccess("");

    let studentId = null;
    let teacherId = null;

    if (chatTargetType === "ALUNO_ESPECIFICO") {
      if (!chatSelectedStudentId) {
        setChatError("Selecione um aluno para iniciar a conversa.");
        setSendingChat(false);
        return;
      }

      studentId = chatSelectedStudentId;
    } else if (chatTargetType === "PROFESSOR_ESPECIFICO") {
      if (!chatSelectedTeacherId) {
        setChatError("Selecione um professor para iniciar a conversa.");
        setSendingChat(false);
        return;
      }

      teacherId = chatSelectedTeacherId;
    }

    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: chatContent,
        senderRole: 'GESTOR',
        studentId,
        teacherId
      })
    });

    const data = await safeJson(res);
    if (!res.ok) {
      setChatError(getErrorMessage(data, "Erro ao enviar mensagem."));
      setSendingChat(false);
      return;
    }

    setChatSuccess("Mensagem enviada com sucesso!");
    setChatContent("");
    setChatSelectedStudentId("");
    setChatSelectedTeacherId("");
    setSendingChat(false);

    await reloadQuestions();
  };

  const handleReply = async (q: ThreadMessage) => {
    if (!replyContent.trim() || q.resolvedAt) return;

    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: replyContent,
        parentId: q.id,
        studentId: q.studentId || null,
        teacherId: q.teacherId || null,
        senderRole: 'GESTOR',
        answeredById: currentUserId
      })
    });

    const data = await safeJson(res);
    if (!res.ok) {
      alert(getErrorMessage(data, "Erro ao responder."));
      return;
    }

    setReplyContent("");
    await reloadQuestions();
  };


  const handleCloseConversation = async (q: ThreadMessage) => {
    if (q.resolvedAt) return;

    const confirmClose = window.confirm("Deseja encerrar esta conversa? Depois de encerrada, ela ficará apenas para consulta.");
    if (!confirmClose) return;

    setClosingQuestionId(q.id);

    const res = await fetch('/api/questions/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: q.id })
    });

    const data = await safeJson(res);

    if (!res.ok) {
      alert(getErrorMessage(data, "Erro ao encerrar conversa."));
      setClosingQuestionId(null);
      return;
    }

    setClosingQuestionId(null);
    await reloadQuestions();
  };


  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#D4A373] mb-2">Gestão</h1>
          <p className="text-[#a1a1a1] text-sm">
            {students.length} alunos e {teachers.length} professores carregados.
          </p>
        </header>

        <div className="flex gap-4 mb-8 border-b border-[#ffffff10]">
          <button
            onClick={() => setActiveTab("mural")}
            className={`pb-2 px-4 transition-colors ${activeTab === "mural" ? "border-b-2 border-[#D4A373] text-[#D4A373]" : "text-[#a1a1a1] hover:text-[#f5f5f5]"}`}
          >
            Mural
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`pb-2 px-4 transition-colors ${activeTab === "chat" ? "border-b-2 border-[#D4A373] text-[#D4A373]" : "text-[#a1a1a1] hover:text-[#f5f5f5]"}`}
          >
            Chat
          </button>
        </div>

        {activeTab === "mural" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <form onSubmit={handlePublishNotice} className="bg-[#111111] border border-[#ffffff10] p-6 rounded-xl space-y-4">
                <h2 className="text-lg font-semibold mb-4">Novo Aviso</h2>

                <div>
                  <label className="block text-xs text-[#a1a1a1] mb-1">Destinatário</label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value as TargetType)}
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-2 text-sm focus:outline-none focus:border-[#D4A373]"
                  >
                    <option value="TODOS_ALUNOS">Todos os alunos</option>
                    <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                    <option value="TODOS_PROFESSORES">Todos os professores</option>
                    <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                  </select>
                </div>

                {targetType === "ALUNO_ESPECIFICO" && (
                  <div>
                    <label className="block text-xs text-[#a1a1a1] mb-1">Selecionar Aluno</label>
                    {studentsOptions.length > 0 ? (
                      <select
                        value={selectedStudentId}
                        onChange={(e) => setSelectedStudentId(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-2 text-sm focus:outline-none focus:border-[#D4A373]"
                        required
                      >
                        <option value="">Selecione...</option>
                        {studentsOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    ) : <p className="text-xs text-red-400">Nenhum aluno carregado.</p>}
                  </div>
                )}

                {targetType === "PROFESSOR_ESPECIFICO" && (
                  <div>
                    <label className="block text-xs text-[#a1a1a1] mb-1">Selecionar Professor</label>
                    {teachersOptions.length > 0 ? (
                      <select
                        value={selectedTeacherId}
                        onChange={(e) => setSelectedTeacherId(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-2 text-sm focus:outline-none focus:border-[#D4A373]"
                        required
                      >
                        <option value="">Selecione...</option>
                        {teachersOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : <p className="text-xs text-red-400">Nenhum professor carregado.</p>}
                  </div>
                )}

                <div>
                  <label className="block text-xs text-[#a1a1a1] mb-1">Título</label>
                  <input
                    type="text"
                    value={noticeTitle}
                    onChange={(e) => setNoticeTitle(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-2 text-sm focus:outline-none focus:border-[#D4A373]"
                    placeholder="Título do aviso"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#a1a1a1] mb-1">Conteúdo</label>
                  <textarea
                    value={noticeContent}
                    onChange={(e) => setNoticeContent(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-2 text-sm focus:outline-none focus:border-[#D4A373] h-32 resize-none"
                    placeholder="Escreva o aviso aqui..."
                    required
                  />
                </div>

                {noticeError && <p className="text-xs text-red-400">{noticeError}</p>}
                {noticeSuccess && <p className="text-xs text-emerald-400">{noticeSuccess}</p>}

                <button
                  type="submit"
                  disabled={savingNotice}
                  className="w-full bg-[#D4A373] text-black font-bold py-2 rounded-lg hover:bg-[#b88b5d] transition-colors disabled:opacity-50"
                >
                  {savingNotice ? "Publicando..." : "Publicar"}
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-lg font-semibold mb-4">Avisos Publicados</h2>
              {notices.length === 0 ? (
                <p className="text-[#a1a1a1] text-sm">Nenhum aviso encontrado.</p>
              ) : (
                notices.map(n => (
                  <div key={n.id} className="bg-[#111111] border border-[#ffffff10] p-4 rounded-xl">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-[#D4A373]">{n.title}</h3>
                      <span className="text-[10px] text-[#a1a1a1]">{formatDateTime(n.createdAt)}</span>
                    </div>
                    <p className="text-sm text-[#f5f5f5] whitespace-pre-wrap mb-3">{n.content}</p>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-[#a1a1a1]">
                          Para: {getNoticeTargetGroup(n)}
                        </span>

                        {getNoticeTargetNames(n).length === 0 ? (
                          <span className="text-[10px] bg-[#D4A373]/10 text-[#D4A373] px-2 py-0.5 rounded">
                            Nenhum destinatário carregado
                          </span>
                        ) : (
                          getNoticeTargetNames(n).map((name) => (
                            <span
                              key={`${n.id}-${name}`}
                              className={
                                "text-[10px] px-2 py-0.5 rounded " +
                                (String(n.targetRole || "").toUpperCase() === "TEACHER"
                                  ? "bg-emerald-900/20 text-emerald-400"
                                  : "bg-blue-900/20 text-blue-400")
                              }
                            >
                              {name}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <form onSubmit={handleSendChat} className="bg-[#111111] border border-[#ffffff10] p-6 rounded-xl space-y-4">
                <h2 className="text-lg font-semibold mb-4">Nova Mensagem</h2>

                <div>
                  <label className="block text-xs text-[#a1a1a1] mb-1">Destinatário</label>
                  <select
                    value={chatTargetType}
                    onChange={(e) => {
                      const value = e.target.value as ChatTargetType;
                      setChatTargetType(value);
                      setChatSelectedStudentId("");
                      setChatSelectedTeacherId("");
                    }}
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-2 text-sm focus:outline-none focus:border-[#D4A373]"
                  >
                    <option value="ALUNO_ESPECIFICO">Aluno específico</option>
                    <option value="PROFESSOR_ESPECIFICO">Professor específico</option>
                  </select>
                </div>

                {chatTargetType === "ALUNO_ESPECIFICO" && (
                  <div>
                    <label className="block text-xs text-[#a1a1a1] mb-1">Selecionar Aluno</label>
                    {studentsOptions.length > 0 ? (
                      <select
                        value={chatSelectedStudentId}
                        onChange={(e) => setChatSelectedStudentId(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-2 text-sm focus:outline-none focus:border-[#D4A373]"
                        required
                      >
                        <option value="">Selecione...</option>
                        {studentsOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    ) : <p className="text-xs text-red-400">Nenhum aluno carregado.</p>}
                  </div>
                )}

                {chatTargetType === "PROFESSOR_ESPECIFICO" && (
                  <div>
                    <label className="block text-xs text-[#a1a1a1] mb-1">Selecionar Professor</label>
                    {teachersOptions.length > 0 ? (
                      <select
                        value={chatSelectedTeacherId}
                        onChange={(e) => setChatSelectedTeacherId(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-2 text-sm focus:outline-none focus:border-[#D4A373]"
                        required
                      >
                        <option value="">Selecione...</option>
                        {teachersOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : <p className="text-xs text-red-400">Nenhum professor carregado.</p>}
                  </div>
                )}

                <div>
                  <label className="block text-xs text-[#a1a1a1] mb-1">Mensagem</label>
                  <textarea
                    value={chatContent}
                    onChange={(e) => setChatContent(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-2 text-sm focus:outline-none focus:border-[#D4A373] h-32 resize-none"
                    placeholder="Escreva sua mensagem..."
                    required
                  />
                </div>

                {chatError && <p className="text-xs text-red-400">{chatError}</p>}
                {chatSuccess && <p className="text-xs text-emerald-400">{chatSuccess}</p>}

                <button
                  type="submit"
                  disabled={sendingChat}
                  className="w-full bg-[#D4A373] text-black font-bold py-2 rounded-lg hover:bg-[#b88b5d] transition-colors disabled:opacity-50"
                >
                  {sendingChat ? "Enviando..." : "Enviar"}
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-lg font-semibold mb-4">Conversas</h2>
              {questions.length === 0 ? (
                <p className="text-[#a1a1a1] text-sm">Nenhuma conversa encontrada.</p>
              ) : (
                questions.map(q => (
                  <div key={q.id} className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
                    <div className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getRoleBadgeClass(q.senderRole)}`}>
                            {q.senderRole}
                          </span>
                          <span className="text-sm font-bold">{getAuthorName(q)}</span>
                        </div>
                        <span className="text-[10px] text-[#a1a1a1]">{formatDateTime(q.createdAt)}</span>
                      </div>
                      <p className="text-sm text-[#f5f5f5] mb-3">{q.content}</p>

                      <div className="flex justify-between items-center">
                        <span className={`text-[10px] ${getThreadStatusClass(q)}`}>
                          {getThreadStatus(q)}
                        </span>
                        <button
                          onClick={() => setExpandedQuestion(expandedQuestion === q.id ? null : q.id)}
                          className="text-xs text-[#D4A373] hover:underline"
                        >
                          {expandedQuestion === q.id ? "Recolher conversa" : "Abrir conversa"}
                        </button>
                      </div>
                    </div>

                    {expandedQuestion === q.id && (
                      <div className="bg-[#0a0a0a] border-t border-[#ffffff10] p-4 space-y-4">
                        {q.children && q.children.map(child => (
                          <div key={child.id} className="pl-4 border-l border-[#ffffff10]">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${getRoleBadgeClass(child.senderRole)}`}>
                                {child.senderRole}
                              </span>
                              <span className="text-xs font-semibold">{getAuthorName(child)}</span>
                              <span className="text-[9px] text-[#a1a1a1]">{formatDateTime(child.createdAt)}</span>
                            </div>
                            <p className="text-xs text-[#a1a1a1]">{child.content}</p>
                          </div>
                        ))}

                        {q.resolvedAt ? (
                          <div className="pt-2">
                            <p className="text-xs text-zinc-400">
                              Conversa encerrada em {formatDateTime(q.resolvedAt)}. Ela fica disponível apenas para consulta.
                            </p>
                          </div>
                        ) : (
                          <div className="pt-2 space-y-2">
                            <textarea
                              value={replyContent}
                              onChange={(e) => setReplyContent(e.target.value)}
                              className="w-full bg-[#111111] border border-[#ffffff10] rounded-lg p-2 text-xs focus:outline-none focus:border-[#D4A373] h-20 resize-none"
                              placeholder="Escreva sua resposta..."
                            />

                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => handleReply(q)}
                                className="bg-[#D4A373] text-black text-xs font-bold px-4 py-1.5 rounded hover:bg-[#b88b5d] transition-colors"
                              >
                                Responder
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCloseConversation(q)}
                                disabled={closingQuestionId === q.id}
                                className="border border-red-500/30 text-red-400 text-xs font-bold px-4 py-1.5 rounded hover:bg-red-500/10 transition-colors disabled:opacity-50"
                              >
                                {closingQuestionId === q.id ? "Encerrando..." : "Encerrar conversa"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

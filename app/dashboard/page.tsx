import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import GestaoMessageReply from "@/components/GestaoMessageReply";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");
  const userId = session.user.id;
  const userRole = (session.user as any)?.role || "PROFESSOR";
  const isGestor = userRole === "GESTOR";

  // 1. ALUNOS
  const myStudents = await prisma.student.findMany({
    where: isGestor ? undefined : { userId },
    select: { id: true, name: true, user: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  const myStudentIds = myStudents.map((s) => s.id);

  // 2. WORKOUTS PENDENTES
  const pendingWorkouts = await prisma.workout.findMany({
    where: { studentId: { in: myStudentIds }, status: "PENDENTE" },
    select: { id: true, studentId: true, date: true, workoutPlan: { select: { name: true } } },
    orderBy: { date: "desc" },
  });
  const pendingByStudent = new Map<string, typeof pendingWorkouts>();
  for (const w of pendingWorkouts) {
    if (!pendingByStudent.has(w.studentId)) pendingByStudent.set(w.studentId, []);
    pendingByStudent.get(w.studentId)!.push(w);
  }
  const studentsWithPendingWorkouts = myStudents.map((s) => ({ ...s, workouts: pendingByStudent.get(s.id) || [] })).filter((s) => s.workouts.length > 0);
  const totalPendingWorkouts = studentsWithPendingWorkouts.reduce((acc, s) => acc + s.workouts.length, 0);

  // 3. AVISOS (leitura pendente) - do professor para alunos OU do gestor para alunos
  const allNotices = await prisma.notice.findMany({
    where: isGestor ? { targetRole: "ALUNO" } : { authorId: userId },
    orderBy: { createdAt: "desc" },
    include: { student: { select: { id: true, name: true } }, author: { select: { id: true, name: true, role: true } }, reads: { where: { studentId: { in: myStudentIds } }, select: { studentId: true } } },
  });
  const unreadNotices = allNotices.filter((n) => {
    if (n.studentId) return !n.reads.some((r) => r.studentId === n.studentId);
    if (myStudentIds.length === 0) return false;
    return n.reads.filter((r) => myStudentIds.includes(r.studentId)).length < myStudentIds.length;
  });
  const totalUnreadNotices = unreadNotices.length;

  // 4. DUVIDAS SEM RESPOSTA
  const unansweredQuestions = await prisma.question.findMany({
    where: { parentId: null, answer: null, answeredAt: null, studentId: { in: myStudentIds }, senderRole: "STUDENT" },
    include: { student: { select: { id: true, name: true, user: { select: { id: true, name: true } } } }, children: { select: { id: true, answer: true } } },
    orderBy: { createdAt: "desc" }, take: 20,
  });
  const trulyUnanswered = unansweredQuestions.filter((q) => !q.children.some((c) => c.answer !== null));
  const totalUnansweredQuestions = trulyUnanswered.length;

  // 5. AVISOS DA GESTÃO (só professor - recebidos do gestor)
  let gestaoNotices: any[] = [];
  if (!isGestor) {
    gestaoNotices = await prisma.notice.findMany({
      where: { targetRole: "PROFESSOR", OR: [{ professorId: userId }, { professorId: null }] },
      orderBy: { createdAt: "desc" }, take: 20,
      include: { author: { select: { id: true, name: true, role: true } } },
    });
  }

  // 6. MENSAGENS DA GESTÃO (só professor - recebidas do gestor)
  let gestaoMessages: any[] = [];
  if (!isGestor) {
    gestaoMessages = await prisma.question.findMany({
      where: { teacherId: userId, senderRole: "GESTOR" },
      orderBy: { createdAt: "desc" }, take: 20,
      include: {
        student: { select: { id: true, name: true } },
        answeredBy: { select: { id: true, name: true } },
        children: { orderBy: { createdAt: "asc" }, select: { id: true, answer: true, content: true, answeredBy: { select: { name: true } } } },
      },
    });
  }

  // 7. (NOVO) GESTOR: AVISOS ENVIADOS PARA PROFESSORES
  let gestorNoticesToTeachers: any[] = [];
  let totalGestorUnreadNotices = 0;
  if (isGestor) {
    gestorNoticesToTeachers = await prisma.notice.findMany({
      where: { authorId: userId, targetRole: "PROFESSOR" },
      orderBy: { createdAt: "desc" }, take: 20,
      include: { author: { select: { id: true, name: true } }, professor: { select: { id: true, name: true } } },
    });
    totalGestorUnreadNotices = gestorNoticesToTeachers.length;
  }

  // 8. (NOVO) GESTOR: MENSAGENS ENVIADAS PARA PROFESSORES (com status de resposta)
  let gestorSentMessages: any[] = [];
  if (isGestor) {
    gestorSentMessages = await prisma.question.findMany({
      where: { senderRole: "GESTOR" },
      orderBy: { createdAt: "desc" }, take: 20,
      include: {
        student: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        children: { orderBy: { createdAt: "asc" }, select: { id: true, answer: true, answeredBy: { select: { name: true } } } },
      },
    });
  }

  const totalStudents = myStudents.length;
  const displayName = session.user.name ?? "Personal";

  return (
    <div className="space-y-6 p-4 md:p-6 min-h-screen bg-[#0a0a0a]">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#f5f5f5]">Olá, {displayName}</h1>
          <p className="text-xs md:text-sm text-[#a1a1a1]">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] md:text-xs px-3 py-1 rounded-full border ${isGestor ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-[#D4A373]/10 text-[#D4A373] border-[#D4A373]/20"}`}>
            {isGestor ? "Gestor" : "Professor"}
          </span>
          <span className="text-[10px] md:text-xs text-[#525252]">{totalStudents} aluno(s)</span>
        </div>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Link href="/dashboard/mural" className="group">
          <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-[#ffffff10] rounded-xl p-4 md:p-5 hover:border-[#D4A373]/30 transition-all group-hover:shadow-lg group-hover:shadow-[#D4A373]/5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${totalUnreadNotices > 0 ? "bg-amber-500/20 text-amber-400" : "bg-[#525252]/20 text-[#525252]"}`}>{totalUnreadNotices} não lido(s)</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">{totalUnreadNotices}</p>
            <p className="text-xs text-[#a1a1a1] mt-1">Avisos pendentes</p>
          </div>
        </Link>
        <Link href="/dashboard/montar-treino" className="group">
          <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-[#ffffff10] rounded-xl p-4 md:p-5 hover:border-[#D4A373]/30 transition-all group-hover:shadow-lg group-hover:shadow-[#D4A373]/5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 text-green-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${totalPendingWorkouts > 0 ? "bg-green-500/20 text-green-400" : "bg-[#525252]/20 text-[#525252]"}`}>{totalPendingWorkouts} pendente(s)</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">{totalPendingWorkouts}</p>
            <p className="text-xs text-[#a1a1a1] mt-1">Treinos pendentes</p>
          </div>
        </Link>
        <Link href="/dashboard/students" className="group">
          <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-[#ffffff10] rounded-xl p-4 md:p-5 hover:border-[#D4A373]/30 transition-all group-hover:shadow-lg group-hover:shadow-[#D4A373]/5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M09.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">{totalUnansweredQuestions}</p>
            <p className="text-xs text-[#a1a1a1] mt-1">Dúvidas sem resposta</p>
          </div>
        </Link>
      </div>

      {/* LISTA 1: ALUNOS COM TREINOS PENDENTES */}
      {studentsWithPendingWorkouts.length > 0 && (
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">Alunos com treinos pendentes</h2>
            <span className="text-xs text-[#a1a1a1]">{studentsWithPendingWorkouts.length} aluno(s)</span>
          </div>
          <div className="divide-y divide-[#ffffff05] max-h-80 overflow-y-auto">
            {studentsWithPendingWorkouts.map((s) => {
              const teacherName = myStudents.find((ms) => ms.id === s.id)?.user?.name || "";
              return (
                <div key={s.id} className="p-3 md:p-4 hover:bg-white/[0.02] transition">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/dashboard/aluno?id=${s.id}`} className="text-sm font-medium text-[#f5f5f5] hover:text-[#D4A373] transition">{s.name}</Link>
                      {isGestor && teacherName && <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">Prof: {teacherName}</span>}
                    </div>
                    <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">{s.workouts.length} pendente(s)</span>
                  </div>
                  <div className="space-y-0.5">
                    {s.workouts.slice(0, 5).map((w, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[10px] text-[#6b6b6b]">
                        <span className="w-1 h-1 rounded-full bg-red-500/50" />
                        <span>{w.workoutPlan?.name || "Treino"}</span>
                        <span className="text-[#525252]">{new Date(w.date).toLocaleDateString("pt-BR")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LISTA 2: DUVIDAS SEM RESPOSTA */}
      {trulyUnanswered.length > 0 && (
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">Dúvidas sem resposta</h2>
            <span className="text-xs text-[#a1a1a1]">{trulyUnanswered.length} dúvida(s)</span>
          </div>
          <div className="divide-y divide-[#ffffff05]">
            {trulyUnanswered.map((q) => {
              const teacherName = (q.student as any)?.user?.name || "";
              return (
                <div key={q.id} className="p-3 md:p-4 hover:bg-white/[0.02] transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/aluno?id=${q.studentId}`} className="text-xs font-medium text-[#D4A373] hover:text-[#c49563] transition">{q.student?.name || "Aluno"}</Link>
                        {isGestor && teacherName && <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">Prof: {teacherName}</span>}
                      </div>
                      <p className="text-xs text-[#e5e5e5] mt-0.5 line-clamp-2">{q.content}</p>
                    </div>
                    <span className="text-[9px] text-[#525252] shrink-0">{new Date(q.createdAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LISTA 3: AVISOS COM LEITURA PENDENTE */}
      {unreadNotices.length > 0 && (
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">Avisos com leitura pendente</h2>
            <span className="text-xs text-[#a1a1a1]">{unreadNotices.length} aviso(s)</span>
          </div>
          <div className="divide-y divide-[#ffffff05] max-h-80 overflow-y-auto">
            {unreadNotices.slice(0, 15).map((notice) => (
              <div key={notice.id} className="p-3 md:p-4 hover:bg-white/[0.02] transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-xs font-medium text-[#f5f5f5]">{notice.title || "Sem título"}</span>
                      <span className="text-[8px] text-[#D4A373] bg-[#D4A373]/10 px-1 py-0.5 rounded-full">{notice.type || "Aviso"}</span>
                      {isGestor && notice.author && <span className="text-[8px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">Por: {notice.author.name}</span>}
                    </div>
                    <p className="text-[10px] text-[#a1a1a1] mt-0.5 line-clamp-1">{notice.content}</p>
                    {notice.student ? <p className="text-[8px] text-[#525252] mt-0.5">Para: {notice.student.name}</p> : <p className="text-[8px] text-[#525252] mt-0.5">Para: Todos os alunos</p>}
                  </div>
                  <span className="text-[8px] text-[#525252] shrink-0">{new Date(notice.createdAt).toLocaleDateString("pt-BR")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LISTA 4: AVISOS DA GESTÃO (só professor - ou avisos enviados para professores se for gestor) */}
      {!isGestor && gestaoNotices.length > 0 && (
        <div className="bg-[#111111] border border-[#D4A373]/20 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between bg-[#D4A373]/5">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">📢 Avisos da Gestão</h2>
            <span className="text-xs text-[#a1a1a1]">{gestaoNotices.length} aviso(s)</span>
          </div>
          <div className="divide-y divide-[#ffffff05]">
            {gestaoNotices.map((notice) => (
              <div key={notice.id} className="p-3 md:p-4 hover:bg-white/[0.02] transition">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D4A373] shrink-0" />
                    <span className="text-xs font-medium text-[#f5f5f5]">{notice.title || "Comunicado"}</span>
                    <span className="text-[8px] text-[#D4A373] bg-[#D4A373]/10 px-1.5 py-0.5 rounded-full">Gestão</span>
                  </div>
                  <p className="text-xs text-[#e5e5e5] mt-1">{notice.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[8px] text-[#525252]">{new Date(notice.createdAt).toLocaleDateString("pt-BR")}</span>
                    {notice.author && <span className="text-[8px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">{notice.author.name}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {isGestor && gestorNoticesToTeachers.length > 0 && (
        <div className="bg-[#111111] border border-[#D4A373]/20 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between bg-[#D4A373]/5">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">📢 Avisos enviados para professores</h2>
            <span className="text-xs text-[#a1a1a1]">{gestorNoticesToTeachers.length} aviso(s)</span>
          </div>
          <div className="divide-y divide-[#ffffff05]">
            {gestorNoticesToTeachers.map((notice) => (
              <div key={notice.id} className="p-3 md:p-4 hover:bg-white/[0.02] transition">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D4A373] shrink-0" />
                    <span className="text-xs font-medium text-[#f5f5f5]">{notice.title || "Comunicado"}</span>
                    <span className="text-[8px] text-[#D4A373] bg-[#D4A373]/10 px-1.5 py-0.5 rounded-full">Gestão</span>
                  </div>
                  <p className="text-xs text-[#e5e5e5] mt-1">{notice.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[8px] text-[#525252]">{new Date(notice.createdAt).toLocaleDateString("pt-BR")}</span>
                    {notice.professor && <span className="text-[8px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">Prof: {notice.professor.name}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LISTA 5: MENSAGENS DA GESTÃO (só professor - ou mensagens enviadas se for gestor) */}
      {!isGestor && gestaoMessages.length > 0 && (
        <div className="bg-[#111111] border border-blue-500/20 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between bg-blue-500/5">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">💬 Mensagens da Gestão</h2>
            <span className="text-xs text-[#a1a1a1]">{gestaoMessages.length} mensagem(ns)</span>
          </div>
          <div className="divide-y divide-[#ffffff05]">
            {gestaoMessages.map((msg) => {
              const hasDirectAnswer = !!msg.answer;
              const hasChildAnswer = msg.children?.some((c: any) => c.answer);
              const hasReply = hasDirectAnswer || hasChildAnswer;
              return (
                <div key={msg.id} className="p-3 md:p-4 hover:bg-white/[0.02] transition">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">Gestão</span>
                      {msg.student && <span className="text-[9px] text-[#525252]">Sobre: {msg.student.name}</span>}
                      {hasReply ? <span className="text-[9px] text-green-400">Respondida</span> : <span className="text-[9px] text-amber-400">Aguardando resposta</span>}
                    </div>
                    <p className="text-xs text-[#e5e5e5] mt-1">{msg.content}</p>
                    <div className="text-[9px] text-[#525252] mt-0.5">{new Date(msg.createdAt).toLocaleDateString("pt-BR")}</div>
                    {hasReply ? (
                      <div className="mt-2 pl-3 border-l-2 border-green-500/30">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-green-400">Resposta enviada ✓</span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <GestaoMessageReply questionId={msg.id} studentId={msg.studentId} teacherId={userId} currentUserId={userId} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {isGestor && gestorSentMessages.length > 0 && (
        <div className="bg-[#111111] border border-blue-500/20 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between bg-blue-500/5">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">💬 Mensagens enviadas para professores</h2>
            <span className="text-xs text-[#a1a1a1]">{gestorSentMessages.length} mensagem(ns)</span>
          </div>
          <div className="divide-y divide-[#ffffff05]">
            {gestorSentMessages.map((msg) => {
              const hasDirectAnswer = !!msg.answer;
              const hasChildAnswer = msg.children?.some((c: any) => c.answer);
              const hasReply = hasDirectAnswer || hasChildAnswer;

              let replyAnswer = null;
              let replyAuthor = null;
              if (hasDirectAnswer) {
                replyAnswer = msg.answer;
                replyAuthor = msg.answeredBy?.name;
              } else if (hasChildAnswer) {
                const lastChild = msg.children?.filter((c: any) => c.answer).pop();
                replyAnswer = lastChild?.answer;
                replyAuthor = lastChild?.answeredBy?.name;
              }
              return (
                <div key={msg.id} className="p-3 md:p-4 hover:bg-white/[0.02] transition">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">Gestão</span>
                      {msg.teacher && <span className="text-[9px] text-[#D4A373] bg-[#D4A373]/10 px-1.5 py-0.5 rounded-full">Para: {msg.teacher.name}</span>}
                      {hasReply ? <span className="text-[9px] text-green-400">Respondida ✅</span> : <span className="text-[9px] text-amber-400">Aguardando</span>}
                    </div>
                    <p className="text-xs text-[#e5e5e5] mt-1">{msg.content}</p>
                    <div className="text-[9px] text-[#525252] mt-0.5">{new Date(msg.createdAt).toLocaleDateString("pt-BR")}</div>
                    {hasReply && replyAnswer && (
                      <div className="mt-2 pl-3 border-l-2 border-green-500/30">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-green-400">Resposta do professor:</span>
                          {replyAuthor && <span className="text-[9px] text-[#525252]">- {replyAuthor}</span>}
                        </div>
                        <p className="text-xs text-[#a1a1a1] mt-0.5">{replyAnswer}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="text-center py-4">
        <p className="text-[10px] text-[#525252]">Dashboard atualizado em tempo real | {new Date().toLocaleString("pt-BR")}</p>
      </div>
    </div>
  );
}

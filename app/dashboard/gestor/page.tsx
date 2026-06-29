import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
export const dynamic = "force-dynamic";

export default async function GestorDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "GESTOR") redirect("/auth/signin");

  // ==================== CONSULTAS GLOBAIS ====================

  // 1. TODOS OS AVISOS
  const allNotices = await prisma.notice.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, name: true, role: true } },
      reads: { select: { studentId: true } },
      student: { select: { name: true } },
    },
    take: 50,
  });

  // 2. TODOS OS PROFESSORES
  const allTeachers = await prisma.user.findMany({
    where: { role: "PROFESSOR" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  // 3. ALUNOS COM SEUS PROFESSORES
  const allStudents = await prisma.student.findMany({
    select: {
      id: true,
      name: true,
      userId: true,
      user: { select: { name: true } },
      workouts: {
        where: { status: "PENDENTE" },
        select: { id: true, date: true, workoutPlan: { select: { name: true } } },
        orderBy: { date: "desc" },
        take: 3,
      },
    },
    orderBy: { name: "asc" },
  });

  // 4. DÚVIDAS SEM RESPOSTA (todas)
  const allUnanswered = await prisma.question.findMany({
    where: { parentId: null, answer: null, answeredAt: null },
    include: {
      student: { select: { id: true, name: true, userId: true, user: { select: { name: true } } } },
      children: { select: { id: true, answer: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const trulyUnanswered = allUnanswered.filter((q) => {
    return !q.children.some((c) => c.answer !== null);
  });

  // 5. AVISOS NÃO LIDOS (gerais)
  const noticesWithUnread = allNotices.filter((n) => n.reads.length === 0);

  // 6. ALUNOS COM TREINO PENDENTE AGRUPADOS POR PROFESSOR
  const studentsWithPending = allStudents.filter((s) => s.workouts.length > 0);

  // Contagens
  const totalNotices = allNotices.length;
  const totalUnreadNotices = noticesWithUnread.length;
  const totalPendingWorkouts = studentsWithPending.reduce((acc, s) => acc + s.workouts.length, 0);
  const totalUnansweredQuestions = trulyUnanswered.length;
  const totalTeachers = allTeachers.length;
  const totalStudents = allStudents.length;

  return (
    <div className="space-y-6 p-4 md:p-6 min-h-screen bg-[#0a0a0a]">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#f5f5f5]">
            Painel de Controle 📊
          </h1>
          <p className="text-xs md:text-sm text-[#a1a1a1]">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] md:text-xs bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full border border-blue-500/20">
            Gestor
          </span>
          <span className="text-[10px] md:text-xs text-[#525252]">
            {totalTeachers} professor(es) • {totalStudents} aluno(s)
          </span>
        </div>
      </div>

      {/* CARDS DE KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {/* Card Avisos */}
        <Link href="/dashboard/mural" className="group">
          <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-[#ffffff10] rounded-xl p-4 md:p-5 hover:border-[#D4A373]/30 transition-all group-hover:shadow-lg group-hover:shadow-[#D4A373]/5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${totalUnreadNotices > 0 ? "bg-amber-500/20 text-amber-400" : "bg-[#525252]/20 text-[#525252]"}`}>{totalUnreadNotices} não lido(s)</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">{totalNotices}</p>
            <p className="text-xs text-[#a1a1a1] mt-1">Total de avisos no sistema</p>
          </div>
        </Link>

        {/* Card Treinos */}
        <Link href="/dashboard/gestor/alunos" className="group">
          <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-[#ffffff10] rounded-xl p-4 md:p-5 hover:border-[#D4A373]/30 transition-all group-hover:shadow-lg group-hover:shadow-[#D4A373]/5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 text-green-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${totalPendingWorkouts > 0 ? "bg-green-500/20 text-green-400" : "bg-[#525252]/20 text-[#525252]"}`}>{totalPendingWorkouts} pendente(s)</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">{totalPendingWorkouts}</p>
            <p className="text-xs text-[#a1a1a1] mt-1">Treinos não concluídos</p>
          </div>
        </Link>

        {/* Card Dúvidas */}
        <Link href="/dashboard/gestor/alunos" className="group">
          <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-[#ffffff10] rounded-xl p-4 md:p-5 hover:border-[#D4A373]/30 transition-all group-hover:shadow-lg group-hover:shadow-[#D4A373]/5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${totalUnansweredQuestions > 0 ? "bg-blue-500/20 text-blue-400" : "bg-[#525252]/20 text-[#525252]"}`}>{totalUnansweredQuestions} sem resposta</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">{totalUnansweredQuestions}</p>
            <p className="text-xs text-[#a1a1a1] mt-1">Dúvidas aguardando resposta</p>
          </div>
        </Link>
      </div>

      {/* LISTAGENS DETALHADAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ALUNOS COM TREINOS PENDENTES */}
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">🏋️ Treinos pendentes por aluno</h2>
            <span className="text-xs text-[#a1a1a1]">{studentsWithPending.length} aluno(s)</span>
          </div>
          {studentsWithPending.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-green-400">✅ Todos os treinos estão em dia!</p>
            </div>
          ) : (
            <div className="divide-y divide-[#ffffff05] max-h-80 overflow-y-auto">
              {studentsWithPending.map((s) => (
                <div key={s.id} className="p-3 md:p-4 hover:bg-white/[0.02] transition">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <Link href={`/dashboard/aluno?id=${s.id}`} className="text-sm font-medium text-[#f5f5f5] hover:text-[#D4A373] transition">
                        {s.name}
                      </Link>
                      <p className="text-[9px] text-[#D4A373] mt-0.5">
                        Prof: {s.user?.name || "Sem professor"}
                      </p>
                    </div>
                    <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                      {s.workouts.length} pendente(s)
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {s.workouts.map((w) => (
                      <div key={w.id} className="flex items-center gap-1.5 text-[10px] text-[#6b6b6b]">
                        <span className="w-1 h-1 rounded-full bg-red-500/50" />
                        <span>{w.workoutPlan?.name || "Treino"}</span>
                        <span className="text-[#525252]">{new Date(w.date).toLocaleDateString("pt-BR")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DÚVIDAS SEM RESPOSTA */}
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">❓ Dúvidas sem resposta</h2>
            <span className="text-xs text-[#a1a1a1]">{trulyUnanswered.length} dúvida(s)</span>
          </div>
          {trulyUnanswered.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-green-400">✅ Todas as dúvidas foram respondidas!</p>
            </div>
          ) : (
            <div className="divide-y divide-[#ffffff05] max-h-80 overflow-y-auto">
              {trulyUnanswered.map((q) => (
                <div key={q.id} className="p-3 md:p-4 hover:bg-white/[0.02] transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/dashboard/aluno?id=${q.studentId}`} className="text-xs font-medium text-[#D4A373] hover:text-[#c49563] transition">
                          {q.student?.name || "Aluno"}
                        </Link>
                        <span className="text-[8px] text-[#525252] bg-[#ffffff08] px-1 py-0.5 rounded">
                          Prof: {q.student?.user?.name || "N/I"}
                        </span>
                      </div>
                      <p className="text-xs text-[#e5e5e5] mt-0.5 line-clamp-2">{q.content}</p>
                    </div>
                    <span className="text-[9px] text-[#525252] shrink-0">
                      {new Date(q.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PROFESSORES E SEUS ALUNOS */}
      <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#f5f5f5]">👨‍🏫 Professores e seus alunos</h2>
          <span className="text-xs text-[#a1a1a1]">{totalTeachers} professor(es)</span>
        </div>
        {allTeachers.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-xs text-[#6b6b6b]">Nenhum 

import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function GestorDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "GESTOR") redirect("/auth/signin");

  // 1. TODOS OS PROFESSORES
  const allTeachers = await prisma.user.findMany({
    where: { role: "PROFESSOR" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  // 2. TODOS OS ALUNOS
  const allStudents = await prisma.student.findMany({
    select: {
      id: true,
      name: true,
      userId: true,
      user: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  const allStudentIds = allStudents.map((s) => s.id);

  // 3. WORKOUTS PENDENTES (status = "PENDENTE") de TODOS os alunos
  const june2026 = new Date(2026, 5, 1);
  const july2026 = new Date(2026, 6, 1);

  const pendingWorkouts = await prisma.workout.findMany({
    where: {
      studentId: { in: allStudentIds },
      date: { gte: june2026, lt: july2026 },
      status: "PENDENTE",
    },
    select: {
      id: true,
      studentId: true,
      date: true,
      workoutPlan: { select: { name: true } },
      student: {
        select: { id: true, name: true, userId: true, user: { select: { name: true } } },
      },
    },
    orderBy: { date: "desc" },
  });

  const pendingByStudent = new Map<string, typeof pendingWorkouts>();
  for (const w of pendingWorkouts) {
    if (!pendingByStudent.has(w.studentId)) {
      pendingByStudent.set(w.studentId, []);
    }
    pendingByStudent.get(w.studentId)!.push(w);
  }

  const studentsWithPending = allStudents
    .map((student) => ({
      ...student,
      workouts: pendingByStudent.get(student.id) || [],
    }))
    .filter((s) => s.workouts.length > 0);

  // 4. TODOS OS AVISOS
  const allNotices = await prisma.notice.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, name: true, role: true } },
      student: { select: { id: true, name: true } },
      reads: {
        where: { studentId: { in: allStudentIds } },
        select: { studentId: true },
      },
    },
    take: 50,
  });

  // Avisos não lidos pelos alunos
  const unreadNotices = allNotices.filter((n) => {
    if (n.studentId) {
      const hasRead = n.reads.some((r) => r.studentId === n.studentId);
      return !hasRead;
    } else {
      return n.reads.length === 0;
    }
  });

  // 5. DÚVIDAS SEM RESPOSTA
  const allUnanswered = await prisma.question.findMany({
    where: { parentId: null, answer: null, answeredAt: null },
    include: {
      student: {
        select: { id: true, name: true, userId: true, user: { select: { name: true } } },
      },
      children: { select: { id: true, answer: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const trulyUnanswered = allUnanswered.filter((q) => {
    return !q.children.some((c) => c.answer !== null);
  });

  // Contagens
  const totalNotices = allNotices.length;
  const totalUnreadNotices = unreadNotices.length;
  const totalPendingWorkouts = studentsWithPending.reduce(
    (acc, s) => acc + s.workouts.length, 0
  );
  const totalUnansweredQuestions = trulyUnanswered.length;
  const totalTeachers = allTeachers.length;
  const totalStudents = allStudents.length;

  return (
    <div className="space-y-6 p-4 md:p-6 min-h-screen bg-[#0a0a0a]">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#f5f5f5]">
            Painel de Controle
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
            {totalTeachers} professor(es) | {totalStudents} aluno(s)
          </span>
        </div>
      </div>

      {/* CARDS KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Link href="/dashboard/mural" className="group">
          <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-[#ffffff10] rounded-xl p-4 md:p-5 hover:border-[#D4A373]/30 transition-all group-hover:shadow-lg group-hover:shadow-[#D4A373]/5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${totalUnreadNotices > 0 ? "bg-amber-500/20 text-amber-400" : "bg-[#525252]/20 text-[#525252]"}`}>
                {totalUnreadNotices} não lido(s)
              </span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">{totalNotices}</p>
            <p className="text-xs text-[#a1a1a1] mt-1">Total de avisos</p>
          </div>
        </Link>

        <Link href="/dashboard/gestor/alunos" className="group">
          <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-[#ffffff10] rounded-xl p-4 md:p-5 hover:border-[#D4A373]/30 transition-all group-hover:shadow-lg group-hover:shadow-[#D4A373]/5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 text-green-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${totalPendingWorkouts > 0 ? "bg-green-500/20 text-green-400" : "bg-[#525252]/20 text-[#525252]"}`}>
                {totalPendingWorkouts} pendente(s)
              </span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">{totalPendingWorkouts}</p>
            <p className="text-xs text-[#a1a1a1] mt-1">Treinos não concluídos</p>
          </div>
        </Link>

        <Link href="/dashboard/gestor/alunos" className="group">
          <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-[#ffffff10] rounded-xl p-4 md:p-5 hover:border-[#D4A373]/30 transition-all group-hover:shadow-lg group-hover:shadow-[#D4A373]/5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${totalUnansweredQuestions > 0 ? "bg-blue-500/20 text-blue-400" : "bg-[#525252]/20 text-[#525252]"}`}>
                {totalUnansweredQuestions} sem resposta
              </span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">{totalUnansweredQuestions}</p>
            <p className="text-xs text-[#a1a1a1] mt-1">Dúvidas aguardando resposta</p>
          </div>
        </Link>
      </div>

      {/* LISTAGENS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">Treinos pendentes</h2>
            <span className="text-xs text-[#a1a1a1]">{studentsWithPending.length} aluno(s)</span>
          </div>
          {studentsWithPending.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-green-400">Todos os treinos estão em dia!</p>
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
                      <p className="text-[9px] text-[#D4A373] mt-0.5">Prof: {s.user?.name || "Sem professor"}</p>
                    </div>
                    <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                      {s.workouts.length} pendente(s)
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {s.workouts.slice(0, 5).map((w, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[10px] text-[#6b6b6b]">
                        <span className="w-1 h-1 rounded-full bg-red-500/50" />
                        <span>{w.workoutPlan?.name || "Treino"}</span>
                        <span className="text-[#525252]">{new Date(w.date).toLocaleDateString("pt-BR")}</span>
                      </div>
                    ))}
                    {s.workouts.length > 5 && (
                      <span className="text-[9px] text-[#525252]">+{s.workouts.length - 5} treino(s)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">Dúvidas sem resposta</h2>
            <span className="text-xs text-[#a1a1a1]">{trulyUnanswered.length} dúvida(s)</span>
          </div>
          {trulyUnanswered.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-green-400">Todas as dúvidas foram respondidas!</p>
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

      {/* PROFESSORES E ALUNOS */}
      <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#f5f5f5]">Professores e seus alunos</h2>
          <span className="text-xs text-[#a1a1a1]">{totalTeachers} professor(es)</span>
        </div>
        {allTeachers.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-xs text-[#6b6b6b]">Nenhum professor cadastrado.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#ffffff05]">
            {allTeachers.map((teacher) => {
              const teacherStudents = allStudents.filter((s) => s.userId === teacher.id);
              const teacherPending = studentsWithPending.filter((s) => s.userId === teacher.id);
              const pendingCount = teacherPending.reduce((acc, s) => acc + s.workouts.length, 0);
              return (
                <div key={teacher.id} className="p-3 md:p-4 hover:bg-white/[0.02] transition">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#D4A373]/20 text-[#D4A373] flex items-center justify-center font-bold text-xs">
                        {teacher.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <span className="text-sm font-medium text-[#f5f5f5]">{teacher.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {pendingCount > 0 && (
                        <span className="text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                          {pendingCount} pendente(s)
                        </span>
                      )}
                      <span className="text-[10px] text-[#a1a1a1]">{teacherStudents.length} aluno(s)</span>
                    </div>
                  </div>
                  {teacherStudents.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 ml-9">
                      {teacherStudents.slice(0, 5).map((s) => {
                        const isPending = studentsWithPending.some((ps) => ps.id === s.id);
                        return (
                          <Link
                            key={s.id}
                            href={`/dashboard/aluno?id=${s.id}`}
                            className={`text-[9px] px-1.5 py-0.5 rounded transition ${isPending ? "text-red-400 bg-red-500/10 hover:text-red-300" : "text-[#6b6b6b] bg-[#ffffff08] hover:text-[#D4A373]"}`}
                          >
                            {s.name}
                          </Link>
                        );
                      })}
                      {teacherStudents.length > 5 && (
                        <span className="text-[8px] text-[#525252]">+{teacherStudents.length - 5}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AVISOS COM LEITURA PENDENTE */}
      {unreadNotices.length > 0 && (
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">Avisos com leitura pendente</h2>
            <span className="text-xs text-[#a1a1a1]">{unreadNotices.length} aviso(s)</span>
          </div>
          <div className="divide-y divide-[#ffffff05] max-h-60 overflow-y-auto">
            {unreadNotices.slice(0, 10).map((notice) => (
              <div key={notice.id} className="p-3 md:p-4 hover:bg-white/[0.02] transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-xs font-medium text-[#f5f5f5]">{notice.title}</span>
                      <span className="text-[8px] text-[#D4A373] bg-[#D4A373]/10 px-1 py-0.5 rounded-full">
                        {notice.type || "Aviso"}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#a1a1a1] mt-0.5 line-clamp-1">{notice.content}</p>
                    {notice.student && (
                      <p className="text-[8px] text-[#525252] mt-0.5">Para: {notice.student.name}</p>
                    )}
                  </div>
                  <span className="text-[8px] text-[#525252] shrink-0">
                    {new Date(notice.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center py-4">
        <p className="text-[10px] text-[#525252]">
          Dashboard atualizado em tempo real | {new Date().toLocaleString("pt-BR")}
        </p>
      </div>
    </div>
  );
}

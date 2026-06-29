import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

function IconAviso() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconTreino() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function IconDuvida() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");
  const userId = session.user.id;

  // ==================== CONSULTAS ====================

  // 1. AVISOS DO PROFESSOR
  const notices = await prisma.notice.findMany({
    where: { authorId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      reads: { select: { studentId: true } },
      author: { select: { name: true } },
      student: { select: { name: true } },
    },
  });

  const noticesWithUnread = notices.filter((n) => {
    if (n.studentId) {
      return n.reads.length === 0;
    }
    return false;
  });

  // 2. ALUNOS DO PROFESSOR
  const myStudents = await prisma.student.findMany({
    where: { userId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const myStudentIds = myStudents.map((s) => s.id);

  // 3. WORKOUTS NÃO CONCLUÍDOS DOS ALUNOS DO PROFESSOR
  // CORREÇÃO: busca todos os workouts e filtra quem NÃO está COMPLETED
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const allWorkouts = await prisma.workout.findMany({
    where: {
      studentId: { in: myStudentIds },
      date: { gte: sixtyDaysAgo },
    },
    select: {
      id: true,
      studentId: true,
      date: true,
      status: true,
      workoutPlan: { select: { name: true } },
    },
    orderBy: { date: "desc" },
    take: 200,
  });

  // Filtra em código: pendente = tudo que NÃO está COMPLETED
  const pendingWorkouts = allWorkouts.filter((w) => w.status !== "COMPLETED");

  // Agrupa por studentId
  const pendingByStudent = new Map<string, typeof pendingWorkouts>();
  for (const w of pendingWorkouts) {
    if (!pendingByStudent.has(w.studentId)) {
      pendingByStudent.set(w.studentId, []);
    }
    pendingByStudent.get(w.studentId)!.push(w);
  }

  const studentsWithPendingWorkouts = myStudents
    .map((s) => ({
      ...s,
      workouts: pendingByStudent.get(s.id) || [],
    }))
    .filter((s) => s.workouts.length > 0);

  const totalPendingWorkouts = studentsWithPendingWorkouts.reduce(
    (acc, s) => acc + s.workouts.length, 0
  );

  // 4. DÚVIDAS SEM RESPOSTA
  const unansweredQuestions = await prisma.question.findMany({
    where: { parentId: null, answer: null, answeredAt: null },
    include: {
      student: { select: { id: true, name: true } },
      children: { select: { id: true, answer: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const trulyUnanswered = unansweredQuestions.filter((q) => {
    const hasAnswerInChildren = q.children.some((c) => c.answer !== null);
    return !hasAnswerInChildren;
  });

  // Contagens
  const totalUnreadNotices = noticesWithUnread.length;
  const totalUnansweredQuestions = trulyUnanswered.length;
  const totalStudents = myStudents.length;

  const noticeTypes = notices.reduce((acc: Record<string, number>, n) => {
    const type = n.type || "AVISO";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6 p-4 md:p-6 min-h-screen bg-[#0a0a0a]">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#f5f5f5]">
            Olá, {session.user.name ?? "Personal"} 👋
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
          <span className="text-[10px] md:text-xs bg-[#D4A373]/10 text-[#D4A373] px-3 py-1 rounded-full border border-[#D4A373]/20">
            Professor
          </span>
          <span className="text-[10px] md:text-xs text-[#525252]">
            {totalStudents} aluno(s)
          </span>
        </div>
      </div>

      {/* CARDS DE KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Link href="/dashboard/mural" className="group">
          <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-[#ffffff10] rounded-xl p-4 md:p-5 hover:border-[#D4A373]/30 transition-all group-hover:shadow-lg group-hover:shadow-[#D4A373]/5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <IconAviso />
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                totalUnreadNotices > 0 ? "bg-amber-500/20 text-amber-400" : "bg-[#525252]/20 text-[#525252]"
              }`}>
                {totalUnreadNotices} não lido(s)
              </span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">{notices.length}</p>
            <p className="text-xs text-[#a1a1a1] mt-1">Total de avisos enviados</p>
            {Object.keys(noticeTypes).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {Object.entries(noticeTypes).slice(0, 3).map(([type, count]) => (
                  <span key={type} className="text-[9px] bg-[#ffffff08] text-[#6b6b6b] px-1.5 py-0.5 rounded">
                    {type}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Link>

        <Link href="/dashboard/montar-treino" className="group">
          <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-[#ffffff10] rounded-xl p-4 md:p-5 hover:border-[#D4A373]/30 transition-all group-hover:shadow-lg group-hover:shadow-[#D4A373]/5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 text-green-400 flex items-center justify-center">
                <IconTreino />
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                totalPendingWorkouts > 0 ? "bg-green-500/20 text-green-400" : "bg-[#525252]/20 text-[#525252]"
              }`}>
                {totalPendingWorkouts} pendente(s)
              </span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">{totalPendingWorkouts}</p>
            <p className="text-xs text-[#a1a1a1] mt-1">Treinos não concluídos</p>
            {studentsWithPendingWorkouts.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {studentsWithPendingWorkouts.slice(0, 3).map((s) => (
                  <div key={s.id} className="flex items-center gap-1.5 text-[9px] text-[#6b6b6b]">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
                    <span>{s.name}</span>
                    <span className="text-[#525252]">({s.workouts.length} treinos)</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Link>

        <Link href="/dashboard/students" className="group">
          <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-[#ffffff10] rounded-xl p-4 md:p-5 hover:border-[#D4A373]/30 transition-all group-hover:shadow-lg group-hover:shadow-[#D4A373]/5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <IconDuvida />
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                totalUnansweredQuestions > 0 ? "bg-blue-500/20 text-blue-400" : "bg-[#525252]/20 text-[#525252]"
              }`}>
                {totalUnansweredQuestions} sem resposta
              </span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">{totalUnansweredQuestions}</p>
            <p className="text-xs text-[#a1a1a1] mt-1">Dúvidas aguardando resposta</p>
            {trulyUnanswered.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {trulyUnanswered.slice(0, 3).map((q) => (
                  <div key={q.id} className="flex items-center gap-1.5 text-[9px] text-[#6b6b6b]">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                    <span className="truncate max-w-[120px]">{q.student?.name || "Aluno"}</span>
                    <span className="text-[#525252] truncate max-w-[100px]">"{q.content.substring(0, 30)}..."</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#ffffff10] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">Alunos com treinos pendentes</h2>
            <span className="text-xs text-[#a1a1a1]">{studentsWithPendingWorkouts.length} aluno(s)</span>
          </div>
          {studentsWithPendingWorkouts.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-green-400">Todos os treinos estão em dia!</p>
            </div>
          ) : (
            <div className="divide-y divide-[#ffffff05] max-h-80 overflow-y-auto">
              {studentsWithPendingWorkouts.map((s) => (
                <div key={s.id} className="p-3 md:p-4 hover:bg-white/[0.02] transition">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <Link href={`/dashboard/aluno?id=${s.id}`} className="text-sm font-medium text-[#f5f5f5] hover:text-[#D4A373] transition">
                        {s.name}
                      </Link>
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
            <div className="divide-y divide-[#ffffff05]">
              {trulyUnanswered.map((q) => (
                <div key={q.id} className="p-3 md:p-4 hover:bg-white/[0.02] transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <Link href={`/dashboard/aluno?id=${q.studentId}`} className="text-xs font-medium text-[#D4A373] hover:text-[#c49563] transition">
                        {q.student?.name || "Aluno"}
                      </Link>
                      <p className="text-xs text-[#e5e5e5] mt-0.5 line-clamp-2">{q.content}</p>
                    </div>
                    <span className="text-[9px] text-[#525252] shrink-0">
                      {new Date(q.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Link href={`/dashboard/aluno?id=${q.studentId}`} className="text-[9px] text-blue-400 hover:text-blue-300 underline">
                      Responder dúvida →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="text-center py-4">
        <p className="text-[10px] text-[#525252]">
          Dashboard atualizado em tempo real | {new Date().toLocaleString("pt-BR")}
        </p>
      </div>
    </div>
  );
}

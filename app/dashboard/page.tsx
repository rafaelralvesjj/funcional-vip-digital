import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getDashboardData(userId: string) {
  const [
    newStudentsThisMonth,
    totalStudents,
    workoutsThisWeek,
    checkinsPending,
    feedbacksPending,
    topStudents,
    recentActivities,
    activeWorkouts,
    inactiveWorkouts,
  ] = await Promise.all([
    prisma.student.count({
      where: { userId, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
    }),
    prisma.student.count({ where: { userId } }),
    prisma.workoutPlan.count({
      where: { student: { userId }, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.checkIn.count({
      where: { student: { userId }, present: false, date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.weeklyFeedback.count({
      where: { student: { userId }, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.student.findMany({
      where: { userId },
      include: { _count: { select: { checkIns: true } } },
      orderBy: { checkIns: { _count: "desc" } },
      take: 5,
    }),
    prisma.workoutPlan.findMany({
      where: { student: { userId } },
      include: { student: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.workoutPlan.count({ where: { student: { userId }, active: true } }),
    prisma.workoutPlan.count({ where: { student: { userId }, active: false } }),
  ]);

  // Check-in evolution for last 6 months
  const checkinEvolution = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const count = await prisma.checkIn.count({
      where: { student: { userId }, date: { gte: start, lte: end }, present: true },
    });
    checkinEvolution.push({
      month: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      count,
    });
  }

  return {
    newStudentsThisMonth, totalStudents,
    workoutsThisWeek, checkinsPending, feedbacksPending,
    topStudents, recentActivities,
    activeWorkouts, inactiveWorkouts, checkinEvolution,
  };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const data = await getDashboardData(session.user.id);

  const kpis = [
    { label: "Total de alunos", value: data.totalStudents },
    { label: "Treinos na semana", value: data.workoutsThisWeek },
    { label: "Check-ins pendentes", value: data.checkinsPending },
    { label: "Feedbacks pendentes", value: data.feedbacksPending },
    { label: "Novos alunos (mês)", value: data.newStudentsThisMonth },
  ];

  // Donut chart SVG functions
  const totalWorkouts = data.activeWorkouts + data.inactiveWorkouts;
  const circumference = 2 * Math.PI * 50;

  // Bar chart
  const maxC = Math.max(...data.checkinEvolution.map((c) => c.count), 1);
  const barGap = (300 - data.checkinEvolution.length * 32) / (data.checkinEvolution.length + 1);

  function getInitials(name: string | null) {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  }

  function timeAgo(date: Date) {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return "agora";
    if (s < 3600) return `há ${Math.floor(s / 60)} min`;
    if (s < 86400) return `há ${Math.floor(s / 3600)}h`;
    if (s < 604800) return `há ${Math.floor(s / 86400)}d`;
    return `há ${Math.floor(s / 604800)}sem`;
  }

  return (
    <div className="space-y-6 p-6 min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#f5f5f5]">Dashboard</h1>
        <p className="text-sm text-[#a1a1a1]">Bem-vindo de volta, {session.user.name}!</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-4">
            <p className="text-xs text-[#a1a1a1] mb-1">{kpi.label}</p>
            <p className="text-3xl font-bold text-white">{kpi.value}</p>
            {kpi.sub && <p className="text-xs text-[#D4A373] mt-1">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alunos em destaque */}
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">Alunos em destaque</h2>
          {data.topStudents.length === 0 ? (
            <p className="text-sm text-[#a1a1a1]">Nenhum aluno encontrado.</p>
          ) : (
            <div className="space-y-1">
              {data.topStudents.map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-3 border-b border-[#ffffff10] last:border-b-0">
                  <div className="w-10 h-10 rounded-full bg-[#D4A373] flex items-center justify-center text-[#0a0a0a] font-bold text-sm">
                    {getInitials(s.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#f5f5f5] truncate">{s.name}</p>
                    <p className="text-xs text-[#a1a1a1]">Aluno</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#D4A373]">{s._count.checkIns}</p>
                    <p className="text-xs text-[#a1a1a1]">check-ins</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Atividades recentes */}
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">Atividades recentes</h2>
          {data.recentActivities.length === 0 ? (
            <p className="text-sm text-[#a1a1a1]">Nenhuma atividade.</p>
          ) : (
            <div className="space-y-1">
              {data.recentActivities.map((a) => (
                <div key={a.id} className="flex items-start gap-3 py-3 border-b border-[#ffffff10] last:border-b-0">
                  <div className="w-8 h-8 rounded-full bg-[#ffffff10] flex items-center justify-center shrink-0 text-sm">
                    🏋️
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#f5f5f5]">
                      Treino <span className="font-medium text-[#D4A373]">{a.name}</span> criado para{" "}
                      <span className="font-medium text-white">{a.student.name}</span>
                    </p>
                    <p className="text-xs text-[#a1a1a1]">{timeAgo(a.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status dos treinos (Donut) */}
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">Status dos treinos</h2>
          <div className="flex items-center justify-center gap-6">
            <svg viewBox="0 0 120 120" className="w-40 h-40 -rotate-90">
              <circle cx="60" cy="60" r="50" fill="none" stroke="#1f1f1f" strokeWidth="12" />
              {totalWorkouts > 0 && data.activeWorkouts > 0 && (
                <circle cx="60" cy="60" r="50" fill="none" stroke="#22c55e" strokeWidth="12"
                  strokeDasharray={`${(data.activeWorkouts / totalWorkouts) * circumference} ${circumference}`}
                  strokeDashoffset="0" strokeLinecap="butt" />
              )}
              {totalWorkouts > 0 && data.inactiveWorkouts > 0 && (
                <circle cx="60" cy="60" r="50" fill="none" stroke="#ef4444" strokeWidth="12"
                  strokeDasharray={`${(data.inactiveWorkouts / totalWorkouts) * circumference} ${circumference}`}
                  strokeDashoffset={`${-(data.activeWorkouts / totalWorkouts) * circumference}`}
                  strokeLinecap="butt" />
              )}
            </svg>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm text-[#a1a1a1]">Ativos</span>
                <span className="text-sm font-bold text-[#f5f5f5]">{data.activeWorkouts}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm text-[#a1a1a1]">Inativos</span>
                <span className="text-sm font-bold text-[#f5f5f5]">{data.inactiveWorkouts}</span>
              </div>
            </div>
          </div>
          {totalWorkouts === 0 && <p className="mt-4 text-center text-sm text-[#a1a1a1]">Nenhum treino.</p>}
        </div>

        {/* Evolução de check-ins (Bar chart) */}
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">Evolução de check-ins</h2>
          <svg viewBox="0 0 300 170" className="w-full h-48">
            {data.checkinEvolution.map((item, i) => {
              const h = (item.count / maxC) * 120;
              const x = barGap + i * (32 + barGap);
              const y = 140 - h;
              return (
                <g key={i}>
                  <rect x={x} y={y} width={32} height={h} rx="4" fill="#D4A373" />
                  <text x={x + 16} y={y - 6} textAnchor="middle" fill="#f5f5f5" fontSize="10" fontWeight="600">
                    {item.count}
                  </text>
                  <text x={x + 16} y="158" textAnchor="middle" fill="#a1a1a1" fontSize="10">
                    {item.month}
                  </text>
                </g>
              );
            })}
          </svg>
          {data.checkinEvolution.every((c) => c.count === 0) && (
            <p className="text-center text-sm text-[#a1a1a1]">Sem check-ins recentes.</p>
          )}
        </div>
      </div>
    </div>
  );
}

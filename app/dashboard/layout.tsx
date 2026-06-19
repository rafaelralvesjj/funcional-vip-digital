import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  const userId = session.user.id;

  const [activeStudents, newStudentsThisMonth] = await Promise.all([
    prisma.student.count({ where: { userId, active: true } }),
    prisma.student.count({
      where: {
        userId,
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
  ]);

  const totalStudents = await prisma.student.count({ where: { userId } });

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const workoutsThisWeek = await prisma.workoutPlan.count({
    where: { student: { userId }, createdAt: { gte: weekAgo } },
  });

  const checkinsPending = await prisma.checkIn.count({
    where: { student: { userId }, date: { gte: weekAgo }, present: false },
  });

  const feedbacksPending = await prisma.weeklyFeedback.count({
    where: { student: { userId }, createdAt: { gte: weekAgo } },
  });

  const topStudents = await prisma.student.findMany({
    where: { userId, active: true },
    include: { _count: { select: { checkIns: true } } },
    orderBy: { checkIns: { _count: "desc" } },
    take: 5,
  });

  const recentActivities = await prisma.workoutPlan.findMany({
    where: { student: { userId } },
    include: { student: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const workoutStatusDistribution = [
    {
      name: "Ativos",
      value: await prisma.workoutPlan.count({
        where: { student: { userId }, active: true },
      }),
      color: "#22c55e",
    },
    {
      name: "Inativos",
      value: await prisma.workoutPlan.count({
        where: { student: { userId }, active: false },
      }),
      color: "#ef4444",
    },
  ];

  const checkinEvolution: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const month = new Date();
    month.setMonth(month.getMonth() - i);
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const count = await prisma.checkIn.count({
      where: {
        student: { userId },
        date: { gte: monthStart, lte: monthEnd },
        present: true,
      },
    });
    checkinEvolution.push({
      month: month.toLocaleString("pt-BR", { month: "short" }),
      count,
    });
  }

  const totalWorkouts = workoutStatusDistribution.reduce((a, b) => a + b.value, 0);
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  const maxCheckins = Math.max(...checkinEvolution.map((item) => item.count), 1);
  const barWidth = 32;
  const gap = (300 - checkinEvolution.length * barWidth) / (checkinEvolution.length + 1);

  function relativeTime(date: Date): string {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return "há menos de um minuto";
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `há ${Math.floor(diff / 86400)} dias`;
    return `há ${Math.floor(diff / 604800)} sem`;
  }

  function getInitials(name: string | null): string {
    if (!name) return "??";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  const kpiCards = [
    { label: "Alunos ativos", value: activeStudents, emoji: "👥", total: totalStudents },
    { label: "Treinos na semana", value: workoutsThisWeek, emoji: "💪" },
    { label: "Check-ins pendentes", value: checkinsPending, emoji: "⏳" },
    { label: "Feedbacks pendentes", value: feedbacksPending, emoji: "💬" },
    { label: "Novos alunos (mês)", value: newStudentsThisMonth, emoji: "✨" },
  ];

  return (
    <div className="space-y-6 p-6 min-h-screen bg-[#0a0a0a]">
      <div>
        <h1 className="text-2xl font-bold text-[#f5f5f5]">Dashboard</h1>
        <p className="text-sm text-[#a1a1a1]">
          Bem-vindo de volta, {session.user.name}!
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map((kpi, index) => (
          <div
            key={index}
            className="bg-[#111111] border border-[#ffffff10] rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg text-[#a1a1a1]">{kpi.emoji}</span>
              <span className="text-xs text-[#a1a1a1]">{kpi.label}</span>
            </div>
            <div className="text-3xl font-bold text-white">{kpi.value}</div>
            {kpi.total !== undefined && (
              <div className="mt-1 text-xs text-[#D4A373]">
                de {kpi.total} total
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
            Alunos em destaque
          </h2>
          <div className="space-y-1">
            {topStudents.length === 0 && (
              <p className="text-sm text-[#a1a1a1]">
                Nenhum aluno ativo encontrado.
              </p>
            )}
            {topStudents.map((student) => (
              <div
                key={student.id}
                className="flex items-center gap-3 py-3 border-b border-[#ffffff10] last:border-b-0"
              >
                <div className="w-10 h-10 rounded-full bg-[#D4A373] flex items-center justify-center text-[#0a0a0a] font-bold text-sm">
                  {getInitials(student.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#f5f5f5] truncate">
                    {student.name}
                  </p>
                  <p className="text-xs text-[#a1a1a1]">
                    {student.active ? "Ativo" : "Inativo"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#D4A373]">
                    {student._count.checkIns}
                  </p>
                  <p className="text-xs text-[#a1a1a1]">check-ins</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
            Atividades recentes
          </h2>
          <div className="space-y-1">
            {recentActivities.length === 0 && (
              <p className="text-sm text-[#a1a1a1]">
                Nenhuma atividade recente.
              </p>
            )}
            {recentActivities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 py-3 border-b border-[#ffffff10] last:border-b-0"
              >
                <div className="w-8 h-8 rounded-full bg-[#ffffff10] flex items-center justify-center text-[#D4A373] text-xs shrink-0">
                  🏋️
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f5f5f5]">
                    Treino <span className="font-medium text-[#D4A373]">{activity.name}</span>{" "}
                    criado para{" "}
                    <span className="font-medium text-white">
                      {activity.student.name}
                    </span>
                  </p>
                  <p className="text-xs text-[#a1a1a1]">
                    {relativeTime(activity.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
            Status dos treinos
          </h2>
          <div className="flex items-center justify-center gap-6">
            <svg
              viewBox="0 0 120 120"
              className="w-40 h-40 -rotate-90"
              role="img"
              aria-label="Distribuição de status dos treinos"
            >
              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke="#1f1f1f"
                strokeWidth="12"
              />
              {workoutStatusDistribution.map((item, index) => {
                const segmentLength = totalWorkouts
                  ? (item.value / totalWorkouts) * circumference
                  : 0;
                const offset = cumulativeOffset;
                cumulativeOffset += segmentLength;
                return (
                  <circle
                    key={index}
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke={item.color}
                    strokeWidth="12"
                    strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                  />
                );
              })}
            </svg>
            <div className="space-y-2">
              {workoutStatusDistribution.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-[#a1a1a1]">{item.name}</span>
                  <span className="text-sm font-bold text-[#f5f5f5]">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {totalWorkouts === 0 && (
            <p className="mt-4 text-center text-sm text-[#a1a1a1]">
              Nenhum treino cadastrado.
            </p>
          )}
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
            Evolução de check-ins
          </h2>
          <svg
            viewBox="0 0 300 170"
            className="w-full h-48"
            role="img"
            aria-label="Evolução de check-ins dos últimos 6 meses"
          >
            {checkinEvolution.map((item, index) => {
              const height = (item.count / maxCheckins) * 120;
              const x = gap + index * (barWidth + gap);
              const y = 140 - height;
              return (
                <g key={index}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={height}
                    rx="4"
                    fill="#D4A373"
                  />
                  <text
                    x={x + barWidth / 2}
                    y={y - 6}
                    textAnchor="middle"
                    fill="#f5f5f5"
                    fontSize="10"
                    fontWeight="600"
                  >
                    {item.count}
                  </text>
                  <text
                    x={x + barWidth / 2}
                    y="158"
                    textAnchor="middle"
                    fill="#a1a1a1"
                    fontSize="10"
                  >
                    {item.month}
                  </text>
                </g>
              );
            })}
          </svg>
          {checkinEvolution.every((item) => item.count === 0) && (
            <p className="text-center text-sm text-[#a1a1a1]">
              Sem check-ins nos últimos 6 meses.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) redirect("/auth/signin");

  const userId = session.user.id;

  // Contagens básicas - apenas campos que SABEMOS que existem
  const [totalStudents, totalAccounts, totalSessions] = await Promise.all([
    prisma.student.count({ where: { userId } }),
    prisma.account.count({ where: { userId } }),
    prisma.session.count({ where: { userId } }),
  ]);

  const kpis = [
    { label: "Total de alunos", value: totalStudents },
    { label: "Contas vinculadas", value: totalAccounts },
    { label: "Sessões ativas", value: totalSessions },
    { label: "Check-ins pendentes", value: 0 },
    { label: "Feedbacks pendentes", value: 0 },
  ];

  return (
    <div className="space-y-6 p-6 min-h-screen bg-[#0a0a0a]">
      <div>
        <h1 className="text-2xl font-bold text-[#f5f5f5]">Dashboard</h1>
        <p className="text-sm text-[#a1a1a1]">
          Bem-vindo de volta, {session.user.name ?? "Personal Trainer"}!
        </p>
      </div>

      {/* Botões de navegação */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/auth/register"
          className="bg-[#D4A373] text-[#0a0a0a] font-semibold rounded-lg px-5 py-3 text-sm transition hover:bg-[#b88a5e]"
        >
          + Cadastrar Professor
        </Link>
        <Link
          href="/auth/register"
          className="bg-[#111111] border border-[#D4A373] text-[#D4A373] font-semibold rounded-lg px-5 py-3 text-sm transition hover:bg-[#D4A373] hover:text-[#0a0a0a]"
        >
          + Cadastrar Gestor
        </Link>
        <Link
          href="/dashboard/exercicios"
          className="bg-[#111111] border border-[#ffffff10] text-[#f5f5f5] font-semibold rounded-lg px-5 py-3 text-sm transition hover:bg-[#1a1a1a]"
        >
          📚 Biblioteca de Exercícios
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-4">
            <p className="text-xs text-[#a1a1a1] mb-1">{kpi.label}</p>
            <p className="text-3xl font-bold text-white">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
        <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
          Seu dashboard
        </h2>
        <p className="text-sm text-[#a1a1a1]">
          Você tem {totalStudents} aluno(s) cadastrado(s) até o momento.
        </p>
      </div>
    </div>
  );
}

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { StudentDashboardStatusCard } from "@/components/aluno/StudentDashboardStatusCard";
import { getStudentDashboardSummaryForSessionUser } from "@/lib/student-dashboard-summary";

export const dynamic = "force-dynamic";

export default async function AlunoDashboardPage() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; email?: string | null } | undefined;

  if (!sessionUser?.id && !sessionUser?.email) {
    redirect("/login");
  }

  const summary = await getStudentDashboardSummaryForSessionUser({
    userId: sessionUser?.id,
    email: sessionUser?.email,
  });

  if (!summary) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-zinc-950">
            Cadastro de aluno não encontrado
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Não encontramos um cadastro de aluno vinculado ao seu usuário. Fale com a equipe para regularizar o acesso.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <StudentDashboardStatusCard summary={summary} />
    </main>
  );
}

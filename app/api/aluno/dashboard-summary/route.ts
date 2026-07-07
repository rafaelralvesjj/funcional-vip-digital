import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { getStudentDashboardSummaryForSessionUser } from "@/lib/student-dashboard-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as { id?: string; email?: string | null } | undefined;

    if (!sessionUser?.id && !sessionUser?.email) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const summary = await getStudentDashboardSummaryForSessionUser({
      userId: sessionUser.id,
      email: sessionUser.email,
    });

    if (!summary) {
      return NextResponse.json(
        {
          ok: false,
          error: "Aluno não encontrado para o usuário autenticado.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("Erro ao carregar resumo do painel do aluno", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Erro ao carregar resumo do painel do aluno.",
      },
      { status: 500 }
    );
  }
}

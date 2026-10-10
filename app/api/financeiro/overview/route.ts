import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import {
  resolveStudentCommercialRow,
  aggregateCommercialStatusCounts,
  COMMERCIAL_STATUS_CATEGORIES,
  COMMERCIAL_STATUS_CATEGORY_LABELS,
} from "@/lib/commercial-status-resolver";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();
  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";
  return value;
}

function canManage(role: string): boolean {
  return role === "GESTOR" || role === "ADMIN";
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const role = normalizeRole(user?.role);

    if (!user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (!canManage(role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    // Nunca filtra por active: true — um aluno inativo (ex.: contrato
    // encerrado há tempo) precisa continuar aparecendo no histórico
    // financeiro, senão o card ENCERRADOS fica incorreto. Só exclui quem
    // nunca teve contrato nenhum (nada a mostrar no Financeiro mesmo).
    const students = await prisma.student.findMany({
      where: { contracts: { some: {} } },
      select: {
        id: true,
        name: true,
        contracts: {
          orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
          include: {
            plan: { select: { id: true, name: true } },
            billingOption: { select: { id: true, billingCycle: true, amountCents: true } },
            payments: {
              orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const rows = students
      .map((student) => resolveStudentCommercialRow(student))
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const counts = aggregateCommercialStatusCounts(rows);

    const cards = COMMERCIAL_STATUS_CATEGORIES.map((category) => ({
      category,
      label: COMMERCIAL_STATUS_CATEGORY_LABELS[category],
      count: counts[category],
    }));

    return NextResponse.json({
      cards,
      rows: rows.map((row) => ({
        ...row,
        nextDate: row.nextDate ? row.nextDate.toISOString() : null,
      })),
    });
  } catch (error: any) {
    console.error("GET /api/financeiro/overview error:", error);
    return NextResponse.json({ error: "Erro ao carregar o Financeiro." }, { status: 500 });
  }
}

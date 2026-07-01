import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const role = ((session?.user as any)?.role || "").toUpperCase();

  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    let where: any;

    if (role === "TEACHER" || role === "PROFESSOR") {
      where = { userId };
    } else if (role === "GESTOR" || role === "ADMIN") {
      where = {};
    } else {
      return NextResponse.json([]);
    }

    const students = await prisma.student.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(students);
  } catch (error) {
    console.error("Erro ao buscar alunos:", error);
    return NextResponse.json({ error: "Erro ao buscar alunos" }, { status: 500 });
  }
}

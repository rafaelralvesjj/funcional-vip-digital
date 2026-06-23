import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const student = await prisma.student.findFirst({
      where: { email: session.user.email },
      select: { id: true, name: true, email: true },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    return NextResponse.json(student);
  } catch (error) {
    console.error("GET /api/student/me error:", error);
    return NextResponse.json({ error: "Erro ao buscar aluno" }, { status: 500 });
  }
}

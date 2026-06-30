import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const teachers = await prisma.user.findMany({
      where: { role: "PROFESSOR" },
      select: {
        id: true,
        name: true,
        email: true,
        _count: {
          select: { students: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(teachers);
  } catch (error) {
    console.error("GET /api/teachers error:", error);
    return NextResponse.json({ error: "Erro ao buscar professores" }, { status: 500 });
  }
}

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const professores = await prisma.user.findMany({
      where: { role: "PROFESSOR" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json(professores);
  } catch (error) {
    console.error("Erro ao buscar professores:", error);
    return NextResponse.json({ error: "Erro ao buscar professores" }, { status: 500 });
  }
}

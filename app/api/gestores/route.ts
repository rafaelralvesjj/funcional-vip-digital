import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const gestores = await prisma.user.findMany({
      where: { role: "GESTOR" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(gestores);
  } catch (error) {
    console.error("Erro ao buscar gestores:", error);
    return NextResponse.json({ error: "Erro ao buscar gestores" }, { status: 500 });
  }
}

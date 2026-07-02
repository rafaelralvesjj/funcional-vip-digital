import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function normalizeTeacher(user: {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  createdAt?: Date;
}) {
  return {
    id: user.id,
    name: user.name || user.email || "Professor",
    email: user.email,
    role: user.role,
    createdAt: user.createdAt ? user.createdAt.toISOString() : null,
  };
}

export async function GET() {
  try {
    /*
     * Importante:
     * No projeto, professor pode estar salvo como PROFESSOR ou TEACHER.
     * A tela de Gestão usa esta rota para montar o select de professores.
     */
    const teachers = await prisma.user.findMany({
      where: {
        role: {
          in: ["PROFESSOR", "TEACHER"],
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    const normalizedTeachers = teachers.map(normalizeTeacher);

    return NextResponse.json(
      {
        teachers: normalizedTeachers,
        professores: normalizedTeachers,
        items: normalizedTeachers,
        data: normalizedTeachers,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("GET /api/teachers error:", error);

    return NextResponse.json(
      {
        error: "Erro ao buscar professores",
        teachers: [],
        professores: [],
        items: [],
        data: [],
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}

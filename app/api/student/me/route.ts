import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { getStudentDisplayName } from "@/lib/display-name";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as
      | { id?: string | null; email?: string | null }
      | undefined;
    const userId = String(sessionUser?.id || "").trim();
    const email = String(sessionUser?.email || "").trim();

    if (!userId && !email) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const student = await prisma.student.findFirst({
      where: {
        active: true,
        OR: [
          ...(userId ? [{ userAuthId: userId }] : []),
          ...(email
            ? [
                { email: { equals: email, mode: "insensitive" as const } },
                {
                  userAuth: {
                    email: { equals: email, mode: "insensitive" as const },
                  },
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        name: true,
        preferredName: true,
        email: true,
        image: true,
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      ...student,
      displayName: getStudentDisplayName(student),
    });
  } catch (error) {
    console.error("GET /api/student/me error:", error);
    return NextResponse.json({ error: "Erro ao buscar aluno" }, { status: 500 });
  }
}

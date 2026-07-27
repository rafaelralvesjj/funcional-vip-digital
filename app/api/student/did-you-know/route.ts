import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

async function getAuthenticatedStudent() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as
    | { id?: string; email?: string | null; role?: string | null }
    | undefined;

  if (!sessionUser?.id && !sessionUser?.email) {
    return {
      error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
      student: null,
    };
  }

  const email = normalizeEmail(sessionUser.email);
  const student = await prisma.student.findFirst({
    where: {
      OR: [
        ...(sessionUser.id
          ? [{ userAuthId: sessionUser.id }, { userId: sessionUser.id }]
          : []),
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
      ],
    },
    select: {
      id: true,
      active: true,
    },
  });

  if (!student) {
    return {
      error: NextResponse.json(
        { error: "Aluno autenticado não encontrado" },
        { status: 404 }
      ),
      student: null,
    };
  }

  return { error: null, student };
}

async function findNextContent(studentId: string) {
  const deliveries = await prisma.didYouKnowDelivery.findMany({
    where: { studentId },
    select: { contentId: true },
  });

  const deliveredIds = deliveries.map((delivery) => delivery.contentId);

  return prisma.didYouKnowContent.findFirst({
    where: {
      active: true,
      ...(deliveredIds.length > 0 ? { id: { notIn: deliveredIds } } : {}),
    },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
}

export async function GET() {
  try {
    const auth = await getAuthenticatedStudent();

    if (auth.error) return auth.error;
    if (!auth.student) {
      return NextResponse.json(
        { error: "Aluno autenticado não encontrado" },
        { status: 404 }
      );
    }

    const content = await findNextContent(auth.student.id);

    return NextResponse.json({ content });
  } catch (error) {
    console.error("GET /api/student/did-you-know error:", error);
    return NextResponse.json(
      { error: "Erro ao carregar o conteúdo Você Sabia" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedStudent();

    if (auth.error) return auth.error;
    if (!auth.student) {
      return NextResponse.json(
        { error: "Aluno autenticado não encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const contentId =
      typeof body.contentId === "string" ? body.contentId.trim() : "";

    if (!contentId) {
      return NextResponse.json(
        { error: "contentId é obrigatório" },
        { status: 400 }
      );
    }

    const content = await prisma.didYouKnowContent.findFirst({
      where: {
        id: contentId,
        active: true,
      },
      select: { id: true },
    });

    if (!content) {
      return NextResponse.json(
        { error: "Conteúdo não encontrado ou inativo" },
        { status: 404 }
      );
    }

    const previousDelivery = await prisma.didYouKnowDelivery.findFirst({
      where: {
        studentId: auth.student.id,
        contentId,
      },
      select: { id: true },
    });

    if (!previousDelivery) {
      await prisma.didYouKnowDelivery.create({
        data: {
          studentId: auth.student.id,
          contentId,
          weekKey: `DASHBOARD:${contentId}`,
          channel: "DASHBOARD",
        },
      });
    }

    const nextContent = await findNextContent(auth.student.id);

    return NextResponse.json({ success: true, content: nextContent });
  } catch (error: any) {
    if (error?.code === "P2002") {
      const auth = await getAuthenticatedStudent();

      if (auth.student) {
        const nextContent = await findNextContent(auth.student.id);
        return NextResponse.json({ success: true, content: nextContent });
      }
    }

    console.error("POST /api/student/did-you-know error:", error);
    return NextResponse.json(
      { error: "Erro ao registrar o conteúdo Você Sabia" },
      { status: 500 }
    );
  }
}

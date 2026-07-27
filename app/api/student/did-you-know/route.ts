import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function normalizeEmail(value?: string | null): string | null {
  return value?.trim().toLowerCase() || null;
}

async function findStudentForSession() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as
    | { id?: string; email?: string | null; role?: string | null }
    | undefined;

  if (!sessionUser?.id && !sessionUser?.email) {
    return null;
  }

  const email = normalizeEmail(sessionUser.email);
  const orWhere: any[] = [];

  if (sessionUser.id) {
    orWhere.push({ userAuthId: sessionUser.id });
    orWhere.push({ userId: sessionUser.id });
  }

  if (email) {
    orWhere.push({ email: { equals: email, mode: "insensitive" } });
    orWhere.push({ userAuth: { email: { equals: email, mode: "insensitive" } } });
  }

  if (!orWhere.length) return null;

  return prisma.student.findFirst({
    where: {
      active: true,
      OR: orWhere,
    },
    select: {
      id: true,
    },
  });
}

export async function GET() {
  try {
    const student = await findStudentForSession();

    if (!student) {
      return NextResponse.json(
        { error: "Aluno não encontrado para o usuário conectado." },
        { status: 404 }
      );
    }

    const acknowledgedDeliveries = await prisma.didYouKnowDelivery.findMany({
      where: {
        studentId: student.id,
        channel: "CARD_ENTENDI",
      },
      select: {
        contentId: true,
      },
    });

    const acknowledgedContentIds = acknowledgedDeliveries.map(
      (delivery) => delivery.contentId
    );

    const content = await prisma.didYouKnowContent.findFirst({
      where: {
        active: true,
        ...(acknowledgedContentIds.length
          ? { id: { notIn: acknowledgedContentIds } }
          : {}),
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
      },
    });

    return NextResponse.json({ content: content || null });
  } catch (error) {
    console.error("Erro ao buscar conteúdo Você Sabia:", error);

    return NextResponse.json(
      { error: "Não foi possível carregar o conteúdo Você Sabia." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const student = await findStudentForSession();

    if (!student) {
      return NextResponse.json(
        { error: "Aluno não encontrado para o usuário conectado." },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const contentId = String(body?.contentId || "").trim();

    if (!contentId) {
      return NextResponse.json(
        { error: "Conteúdo não informado." },
        { status: 400 }
      );
    }

    const content = await prisma.didYouKnowContent.findFirst({
      where: {
        id: contentId,
        active: true,
      },
      select: {
        id: true,
      },
    });

    if (!content) {
      return NextResponse.json(
        { error: "Conteúdo não encontrado ou inativo." },
        { status: 404 }
      );
    }

    await prisma.didYouKnowDelivery.upsert({
      where: {
        studentId_weekKey: {
          studentId: student.id,
          weekKey: `CARD:${content.id}`,
        },
      },
      update: {
        contentId: content.id,
        channel: "CARD_ENTENDI",
        sentAt: new Date(),
      },
      create: {
        studentId: student.id,
        contentId: content.id,
        weekKey: `CARD:${content.id}`,
        channel: "CARD_ENTENDI",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao confirmar conteúdo Você Sabia:", error);

    return NextResponse.json(
      { error: "Não foi possível registrar a confirmação da dica." },
      { status: 500 }
    );
  }
}

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const INITIAL_CONTENTS = [
  {
    title: "Consistência vale mais que pressa",
    content:
      "Resultados duradouros vêm da regularidade. Fazer o treino com atenção e manter a rotina é mais importante do que tentar compensar tudo em um único dia.",
    category: "MOTIVACAO",
    priority: 10,
  },
  {
    title: "Dor não é sinal de treino melhor",
    content:
      "Desconforto intenso, dor aguda ou piora de uma dor anterior não devem ser ignorados. Pare o exercício e avise seu professor pelo chat para receber orientação.",
    category: "SEGURANCA",
    priority: 20,
  },
  {
    title: "A execução vem antes da velocidade",
    content:
      "Movimentos controlados ajudam você a aproveitar melhor o exercício e reduzem o risco de compensações. Confira as orientações e as imagens antes de começar.",
    category: "TREINO",
    priority: 30,
  },
  {
    title: "Descanso também faz parte do treino",
    content:
      "O corpo precisa de recuperação para se adaptar. Sono, hidratação e intervalos adequados ajudam no desempenho e na evolução ao longo das semanas.",
    category: "RECUPERACAO",
    priority: 40,
  },
  {
    title: "Seu feedback melhora o próximo treino",
    content:
      "Conte ao professor como você se sentiu, quais exercícios foram fáceis ou difíceis e se houve qualquer incômodo. Essas informações ajudam a personalizar os próximos treinos.",
    category: "ACOMPANHAMENTO",
    priority: 50,
  },
] as const;

async function findStudentForSession() {
  const session = await getServerSession();
  const email = session?.user?.email?.trim();

  if (!email) return null;

  return prisma.student.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    select: { id: true },
  });
}

async function ensureInitialContents() {
  const totalContents = await prisma.didYouKnowContent.count();

  if (totalContents > 0) return;

  await prisma.didYouKnowContent.createMany({
    data: INITIAL_CONTENTS.map((item) => ({ ...item, active: true })),
    skipDuplicates: true,
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

    await ensureInitialContents();

    const acknowledgedDeliveries = await prisma.didYouKnowDelivery.findMany({
      where: {
        studentId: student.id,
        channel: "CARD_ENTENDI",
      },
      select: { contentId: true },
    });

    const acknowledgedContentIds = acknowledgedDeliveries.map(
      (delivery) => delivery.contentId
    );

    const content = await prisma.didYouKnowContent.findFirst({
      where: {
        active: true,
        ...(acknowledgedContentIds.length > 0
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

    return NextResponse.json({ content: content ?? null });
  } catch (error) {
    console.error("GET /api/student/did-you-know error:", error);

    return NextResponse.json(
      { error: "Não foi possível carregar o Você Sabia." },
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
    const contentId = String(body?.contentId ?? "").trim();

    if (!contentId) {
      return NextResponse.json(
        { error: "Conteúdo não informado." },
        { status: 400 }
      );
    }

    const content = await prisma.didYouKnowContent.findFirst({
      where: { id: contentId, active: true },
      select: { id: true },
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
    console.error("POST /api/student/did-you-know error:", error);

    return NextResponse.json(
      { error: "Não foi possível registrar a confirmação da dica." },
      { status: 500 }
    );
  }
}

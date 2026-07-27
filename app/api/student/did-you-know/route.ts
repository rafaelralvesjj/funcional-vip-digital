import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { classifyCareSignal, normalizeTrainingPreferenceText } from "@/lib/student-training-preferences";

export const dynamic = "force-dynamic";

type ChatTipCategory =
  | "CHAT_FIRST_USE"
  | "CHAT_VIDEO"
  | "CHAT_PHOTO"
  | "CHAT_DOCUMENT"
  | "CHAT_OBJECTIVE"
  | "CHAT_EQUIPMENT"
  | "CHAT_PAIN";

type ChatUsageProfile = {
  hasUsedChat: boolean;
  hasSentVideo: boolean;
  hasSentPhoto: boolean;
  hasSentDocument: boolean;
  hasSharedObjectiveChange: boolean;
  hasSharedEquipmentChange: boolean;
  hasSharedPainOrDiscomfort: boolean;
};

const CHAT_CONTENTS: Array<{
  title: string;
  content: string;
  category: ChatTipCategory;
  priority: number;
}> = [
  {
    title: "Seu professor está no chat",
    content:
      "O chat é o canal oficial do seu acompanhamento. Use sempre que tiver dúvida, precisar explicar uma dificuldade ou quiser contar algo que possa melhorar seus próximos treinos.",
    category: "CHAT_FIRST_USE",
    priority: 10,
  },
  {
    title: "Envie um vídeo da sua execução",
    content:
      "Você pode gravar um vídeo curto fazendo o exercício e enviar pelo chat. Assim, o professor consegue observar sua execução e orientar ajustes de postura, ritmo e movimento.",
    category: "CHAT_VIDEO",
    priority: 20,
  },
  {
    title: "Uma foto também ajuda muito",
    content:
      "Envie uma foto pelo chat quando quiser mostrar o espaço de treino, um equipamento, a posição de um exercício ou qualquer detalhe que seja difícil explicar somente por mensagem.",
    category: "CHAT_PHOTO",
    priority: 30,
  },
  {
    title: "Laudos e prescrições podem direcionar seu treino",
    content:
      "Exames, laudos, atestados e prescrições médicas podem ser enviados como documento pelo chat. O professor poderá considerar essas informações na montagem do treino, sem substituir a orientação do profissional de saúde.",
    category: "CHAT_DOCUMENT",
    priority: 40,
  },
  {
    title: "Seu objetivo mudou? Conte pelo chat",
    content:
      "Avise quando surgir uma nova meta, como começar a correr, fortalecer uma região, melhorar a mobilidade ou se preparar para uma prova. Seu treino pode ser ajustado para acompanhar essa mudança.",
    category: "CHAT_OBJECTIVE",
    priority: 50,
  },
  {
    title: "Avise quando tiver novos equipamentos",
    content:
      "Comprou elástico, halteres, bicicleta ou começou a treinar em outro lugar? Conte pelo chat. Saber quais equipamentos estão disponíveis aumenta as possibilidades dos seus próximos treinos.",
    category: "CHAT_EQUIPMENT",
    priority: 60,
  },
  {
    title: "Dor ou desconforto precisam ser informados",
    content:
      "Não espere o próximo treino para avisar. Se sentir dor, desconforto ou alguma limitação, pare o movimento e fale com o professor pelo chat antes de continuar.",
    category: "CHAT_PAIN",
    priority: 70,
  },
];

const CHAT_CATEGORIES = CHAT_CONTENTS.map((item) => item.category);

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function buildUsageProfile(
  messages: Array<{
    content: string;
    imageUrl: string | null;
    videoUrl: string | null;
    documentUrl: string | null;
  }>
): ChatUsageProfile {
  const normalizedMessages = messages.map((message) => ({
    ...message,
    normalizedContent: normalizeTrainingPreferenceText(message.content),
  }));

  const objectiveTerms = [
    "meu objetivo mudou",
    "mudei meu objetivo",
    "nova meta",
    "novo objetivo",
    "quero emagrecer",
    "quero correr",
    "quero comecar a correr",
    "quero fortalecer",
    "quero ganhar massa",
    "quero melhorar",
    "vou fazer uma prova",
    "maratona",
    "meia maratona",
  ];

  const equipmentTerms = [
    "novo equipamento",
    "novos equipamentos",
    "comprei um",
    "comprei uma",
    "agora tenho",
    "nao tenho mais",
    "troquei de academia",
    "comecei na academia",
    "halter",
    "kettlebell",
    "elastico",
    "miniband",
    "esteira",
    "bicicleta",
    "equipamento",
  ];

  return {
    hasUsedChat: messages.length > 0,
    hasSentVideo: messages.some((message) => Boolean(message.videoUrl)),
    hasSentPhoto: messages.some((message) => Boolean(message.imageUrl)),
    hasSentDocument: messages.some((message) => Boolean(message.documentUrl)),
    hasSharedObjectiveChange: normalizedMessages.some((message) =>
      includesAny(message.normalizedContent, objectiveTerms)
    ),
    hasSharedEquipmentChange: normalizedMessages.some((message) =>
      includesAny(message.normalizedContent, equipmentTerms)
    ),
    hasSharedPainOrDiscomfort: messages.some((message) =>
      classifyCareSignal(message.content).hasSignal
    ),
  };
}

function getPersonalizedCategoryOrder(profile: ChatUsageProfile): ChatTipCategory[] {
  if (!profile.hasUsedChat) {
    return [
      "CHAT_FIRST_USE",
      "CHAT_VIDEO",
      "CHAT_PHOTO",
      "CHAT_DOCUMENT",
      "CHAT_OBJECTIVE",
      "CHAT_EQUIPMENT",
      "CHAT_PAIN",
    ];
  }

  const order: ChatTipCategory[] = [];

  if (!profile.hasSentVideo) order.push("CHAT_VIDEO");
  if (!profile.hasSentPhoto) order.push("CHAT_PHOTO");
  if (!profile.hasSentDocument) order.push("CHAT_DOCUMENT");
  if (!profile.hasSharedObjectiveChange) order.push("CHAT_OBJECTIVE");
  if (!profile.hasSharedEquipmentChange) order.push("CHAT_EQUIPMENT");
  if (!profile.hasSharedPainOrDiscomfort) order.push("CHAT_PAIN");

  order.push("CHAT_FIRST_USE");

  for (const category of CHAT_CATEGORIES) {
    if (!order.includes(category)) order.push(category);
  }

  return order;
}

async function findStudentForSession() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as
    | { id?: string | null; email?: string | null }
    | undefined;
  const userId = String(sessionUser?.id || "").trim();
  const email = String(sessionUser?.email || "").trim();

  if (!userId && !email) return null;

  return prisma.student.findFirst({
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
    select: { id: true },
  });
}

async function ensureChatContents() {
  await prisma.didYouKnowContent.createMany({
    data: CHAT_CONTENTS.map((item) => ({ ...item, active: true })),
    skipDuplicates: true,
  });
}

async function getNextContent(studentId: string) {
  await ensureChatContents();

  const [contents, messages] = await Promise.all([
    prisma.didYouKnowContent.findMany({
      where: {
        active: true,
        category: { in: CHAT_CATEGORIES },
      },
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        priority: true,
      },
    }),
    prisma.question.findMany({
      where: {
        studentId,
        senderRole: { in: ["STUDENT", "ALUNO"] },
      },
      select: {
        content: true,
        imageUrl: true,
        videoUrl: true,
        documentUrl: true,
      },
    }),
  ]);

  if (contents.length === 0) return null;

  const deliveries = await prisma.didYouKnowDelivery.findMany({
    where: {
      studentId,
      channel: "CARD_ENTENDI",
      contentId: { in: contents.map((content) => content.id) },
    },
    select: {
      contentId: true,
      sentAt: true,
    },
  });

  const profile = buildUsageProfile(messages);
  const categoryOrder = getPersonalizedCategoryOrder(profile);
  const categoryRank = new Map(
    categoryOrder.map((category, index) => [category, index])
  );
  const deliveryByContentId = new Map(
    deliveries.map((delivery) => [delivery.contentId, delivery.sentAt])
  );

  const personalizedContents = [...contents].sort((first, second) => {
    const firstRank = categoryRank.get(first.category as ChatTipCategory) ?? 999;
    const secondRank = categoryRank.get(second.category as ChatTipCategory) ?? 999;

    if (firstRank !== secondRank) return firstRank - secondRank;
    return first.priority - second.priority;
  });

  const neverSeen = personalizedContents.find(
    (content) => !deliveryByContentId.has(content.id)
  );

  const selected =
    neverSeen ||
    [...personalizedContents].sort((first, second) => {
      const firstSeenAt = deliveryByContentId.get(first.id)?.getTime() ?? 0;
      const secondSeenAt = deliveryByContentId.get(second.id)?.getTime() ?? 0;

      if (firstSeenAt !== secondSeenAt) return firstSeenAt - secondSeenAt;

      const firstRank = categoryRank.get(first.category as ChatTipCategory) ?? 999;
      const secondRank = categoryRank.get(second.category as ChatTipCategory) ?? 999;
      return firstRank - secondRank;
    })[0];

  return selected
    ? {
        id: selected.id,
        title: selected.title,
        content: selected.content,
        category: selected.category,
        actionLabel: "Ir para o chat",
        actionHref: "/aluno#conversas-aluno",
      }
    : null;
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

    const content = await getNextContent(student.id);

    return NextResponse.json({ content });
  } catch (error) {
    console.error("GET /api/student/did-you-know error:", error);

    return NextResponse.json(
      { error: "Não foi possível carregar a dica do chat." },
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
      where: {
        id: contentId,
        active: true,
        category: { in: CHAT_CATEGORIES },
      },
      select: { id: true },
    });

    if (!content) {
      return NextResponse.json(
        { error: "Dica não encontrada ou inativa." },
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

    const nextContent = await getNextContent(student.id);

    return NextResponse.json({ ok: true, content: nextContent });
  } catch (error) {
    console.error("POST /api/student/did-you-know error:", error);

    return NextResponse.json(
      { error: "Não foi possível avançar para a próxima dica." },
      { status: 500 }
    );
  }
}

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { sendEmail } from "@/lib/sendEmail";
import { resolveStudentProfessor } from "@/lib/student-professor";
import { getStudentDisplayName } from "@/lib/display-name";
import { consolidateActiveCareEvents } from "@/lib/student-care-event-consolidation";
import { notifyStudentAboutChatReply } from "@/lib/chat-communications";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "ALUNO") return "STUDENT";
  if (value === "PROFESSOR") return "TEACHER";

  return value;
}

function getAppAlunoUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/aluno`;
}

function getAppCareUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/dashboard/cuidado-aluno`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 59, 999);

  return date;
}

function getWeekRange(referenceDate: Date): { startOfWeek: Date; endOfWeek: Date } {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);

  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() + diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  return { startOfWeek, endOfWeek };
}

function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function addDaysToDate(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function calculatePauseDays(start: Date, end: Date): number {
  const startDate = startOfDay(start);
  const endDate = startOfDay(end);
  const diff = endDate.getTime() - startDate.getTime();

  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

async function registerContractLifecycleEventSafe({
  contractId,
  studentId,
  eventType,
  eventKey,
  channel = "SISTEMA",
}: {
  contractId: string;
  studentId: string;
  eventType: string;
  eventKey: string;
  channel?: string;
}) {
  try {
    await prisma.contractLifecycleEvent.create({
      data: {
        contractId,
        studentId,
        eventType,
        eventKey,
        channel,
      },
    });
  } catch (error: any) {
    if (error?.code !== "P2002") {
      throw error;
    }
  }
}

async function applyCommercialAdjustmentOnCareResolution({
  event,
  resolvedAt,
}: {
  event: {
    id: string;
    studentId: string;
    contractId?: string | null;
    eventType: string;
    createdAt: Date;
    contract?: {
      id: string;
      type: string;
      status: string;
      endDate: Date;
    } | null;
  };
  resolvedAt: Date;
}) {
  if (event.eventType !== "PAUSA_POR_CUIDADO") {
    return null;
  }

  const contract = event.contract || (await prisma.studentContract.findFirst({
    where: {
      studentId: event.studentId,
      ...(event.contractId ? { id: event.contractId } : {}),
    },
    select: {
      id: true,
      type: true,
      status: true,
      endDate: true,
    },
    orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
  }));

  if (!contract) {
    return {
      status: "SEM_CONTRATO",
      message: "Pausa resolvida, mas não havia contrato/experiência vinculado para ajuste comercial automático.",
    };
  }

  const pauseDays = calculatePauseDays(event.createdAt, resolvedAt);

  if (contract.type === "TRIAL") {
    const newEndDate = addDaysToDate(contract.endDate, pauseDays);

    await prisma.studentContract.update({
      where: {
        id: contract.id,
      },
      data: {
        endDate: newEndDate,
      },
    });

    await registerContractLifecycleEventSafe({
      contractId: contract.id,
      studentId: event.studentId,
      eventType: "TRIAL_EXTENDED_BY_CARE_PAUSE",
      eventKey: `care_pause_${event.id}`,
    });

    return {
      status: "EXPERIENCIA_PRORROGADA",
      contractId: contract.id,
      pauseDays,
      previousEndDate: contract.endDate.toISOString(),
      newEndDate: newEndDate.toISOString(),
      message: `Experiência prorrogada em ${pauseDays} dia(s) por pausa de cuidado.`,
    };
  }

  await registerContractLifecycleEventSafe({
    contractId: contract.id,
    studentId: event.studentId,
    eventType: "PAID_CARE_PAUSE_COMPENSATION_REVIEW",
    eventKey: `care_pause_${event.id}`,
  });

  return {
    status: "COMPENSACAO_COMERCIAL_PENDENTE",
    contractId: contract.id,
    pauseDays,
    message: "Pausa de cuidado registrada para avaliação comercial da gestão. Não contar como falta, baixa adesão comum ou treino realizado.",
  };
}

async function getNoticeAuthorId(fallbackUserId?: string | null): Promise<string> {
  if (fallbackUserId) return fallbackUserId;

  const gestor = await prisma.user.findFirst({
    where: {
      role: {
        in: ["GESTOR", "ADMIN"],
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!gestor?.id) {
    throw new Error("Nenhum gestor/admin encontrado para ser autor do aviso.");
  }

  return gestor.id;
}

function normalizeEventType(value?: string | null): string {
  const type = String(value || "").toUpperCase().trim();

  const allowed = new Set([
    "FALTA_TEMPO",
    "EXERCICIO_DIFICIL",
    "DOR_DESCONFORTO",
    "RELATO_DOR_DUVIDA",
    "PAUSA_POR_CUIDADO",
    "NAO_ENTENDI",
    "DESMOTIVACAO",
    "BAIXA_ADERENCIA",
    "PAUSA_BAIXA_ADERENCIA",
    "OUTRO",
  ]);

  return allowed.has(type) ? type : "OUTRO";
}

function getCareCopy({
  eventType,
  studentName,
  description,
}: {
  eventType: string;
  studentName: string;
  description?: string | null;
}) {
  const detail = String(description || "").trim();

  const copies: Record<
    string,
    {
      severity: string;
      status: string;
      title: string;
      studentMessage: string;
      professorMessage: string;
      shouldEmailStudent: boolean;
      shouldEmailProfessor: boolean;
    }
  > = {
    FALTA_TEMPO: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Vamos adaptar o treino à sua rotina",
      studentMessage:
        "Obrigado por contar como sua semana está. Tem períodos em que a rotina aperta, e isso não significa que você perdeu o caminho. Seu professor recebeu essa informação e poderá ajustar a próxima programação para algo mais possível, objetivo e alinhado ao seu momento.",
      professorMessage:
        `${studentName} relatou dificuldade para encaixar os treinos na rotina. Antes de montar a próxima semana, faça uma abordagem pelo chat e avalie uma proposta mais curta, simples e possível de cumprir.`,
      shouldEmailStudent: false,
      shouldEmailProfessor: false,
    },
    EXERCICIO_DIFICIL: {
      severity: "REVISAO",
      status: "REQUER_REVISAO",
      title: "Você fez certo em avisar",
      studentMessage:
        "Obrigado por contar que o exercício ou treino ficou difícil. O treino precisa desafiar na medida certa, sem deixar você inseguro ou travar sua evolução. Seu professor foi avisado e vai revisar carga, volume, explicação ou uma variação mais adequada para você.",
      professorMessage:
        `${studentName} relatou dificuldade com um exercício ou com o treino. Revise complexidade, carga, volume, variação regressiva e clareza das instruções. Responda pelo chat para que a orientação fique registrada.`,
      shouldEmailStudent: false,
      shouldEmailProfessor: true,
    },
    DOR_DESCONFORTO: {
      severity: "CUIDADO",
      status: "REQUER_REVISAO",
      title: "Você fez certo em parar e avisar",
      studentMessage:
        "Obrigado por nos avisar sobre a dor ou o desconforto. Sua segurança vem primeiro: não insista no exercício que provocou o incômodo. Seu professor recebeu o alerta e precisa revisar sua programação antes de qualquer progressão. Se a dor persistir, piorar ou limitar seus movimentos, procure avaliação de um profissional de saúde habilitado.",
      professorMessage:
        `${studentName} relatou dor, desconforto ou possível lesão. Não faça progressão automática. Revise o exercício envolvido, intensidade, volume e necessidade de adaptação. Converse com o aluno pelo chat e, quando necessário, oriente avaliação com profissional de saúde habilitado.`,
      shouldEmailStudent: true,
      shouldEmailProfessor: true,
    },
    RELATO_DOR_DUVIDA: {
      severity: "CUIDADO",
      status: "REQUER_REVISAO",
      title: "Seu relato foi encaminhado ao professor",
      studentMessage:
        "Obrigado por avisar pelo chat. Dor ou desconforto não devem ser ignorados. Seu professor recebeu o relato e precisa revisar a próxima programação antes de evoluir carga, impacto, volume ou complexidade. Se a dor persistir, piorar ou limitar movimentos, procure avaliação de um profissional de saúde habilitado.",
      professorMessage:
        `${studentName} relatou dor ou desconforto no chat. Revise a conversa e a programação antes de liberar, repetir ou evoluir a próxima semana. Registre a orientação e os ajustes pelo chat da plataforma.`,
      shouldEmailStudent: true,
      shouldEmailProfessor: true,
    },
    PAUSA_POR_CUIDADO: {
      severity: "CUIDADO",
      status: "REQUER_REVISAO",
      title: "Sua pausa por cuidado foi registrada",
      studentMessage:
        "Registramos uma pausa por cuidado porque você informou que não está em condição de treinar agora. Não insista nos exercícios. Seu professor foi avisado e os treinos normais ficam bloqueados até uma revisão segura. Quando se sentir apto para retomar, envie a solicitação pelo sistema. Se houver dor persistente, piora ou limitação de movimento, procure avaliação de um profissional de saúde habilitado.",
      professorMessage:
        `${studentName} sinalizou que está sem condição de treinar. Não libere treino normal enquanto este evento estiver aberto. Faça contato pelo chat, oriente avaliação profissional quando necessário e revise uma retomada segura somente depois que o aluno informar aptidão.`,
      shouldEmailStudent: true,
      shouldEmailProfessor: true,
    },
    NAO_ENTENDI: {
      severity: "ATENCAO",
      status: "REQUER_REVISAO",
      title: "Vamos deixar esse treino mais claro",
      studentMessage:
        "Você fez certo em perguntar. Quando uma orientação não fica clara, o melhor caminho é não tentar adivinhar. Seu professor recebeu o aviso e poderá explicar ou ajustar o exercício pelo chat para você executar com mais segurança.",
      professorMessage:
        `${studentName} informou que não entendeu parte do treino. Revise descrição, observações, nomes dos exercícios e recursos visuais. Responda pelo chat com uma orientação simples e registrada.`,
      shouldEmailStudent: false,
      shouldEmailProfessor: false,
    },
    DESMOTIVACAO: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Vamos encontrar uma forma possível de continuar",
      studentMessage:
        "Obrigado por falar com sinceridade. A motivação pode oscilar, e você não precisa enfrentar isso sozinho nem recomeçar do zero. Seu professor poderá usar esse relato para deixar a próxima semana mais leve, possível e conectada ao seu momento.",
      professorMessage:
        `${studentName} sinalizou desmotivação. Faça uma abordagem acolhedora pelo chat e considere uma semana de retomada com metas curtas, exercícios simples e reforço positivo.`,
      shouldEmailStudent: false,
      shouldEmailProfessor: false,
    },
    BAIXA_ADERENCIA: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Queremos entender como foi sua semana",
      studentMessage:
        "Percebemos que ficou mais difícil manter os treinos nesta semana. Isso não é uma cobrança. Queremos entender o que aconteceu para que seu professor consiga ajustar a próxima programação à sua rotina, sem culpa e com mais chance de continuidade.",
      professorMessage:
        `${studentName} apresentou baixa aderência recente. Antes de progredir o treino, converse pelo chat para entender as barreiras e avalie retomada, volume, duração e complexidade.`,
      shouldEmailStudent: false,
      shouldEmailProfessor: false,
    },
    OUTRO: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Obrigado por compartilhar com a gente",
      studentMessage:
        "Obrigado por compartilhar essa informação. Seu relato ajuda o professor a compreender melhor sua rotina e a ajustar o acompanhamento de forma mais próxima, segura e realista.",
      professorMessage:
        `${studentName} registrou uma observação sobre o treino. Leia o contexto e, quando necessário, converse pelo chat antes de montar ou liberar a próxima programação.`,
      shouldEmailStudent: false,
      shouldEmailProfessor: false,
    },
  };

  const selected = copies[eventType] || copies.OUTRO;

  if (!detail) return selected;

  return {
    ...selected,
    professorMessage: `${selected.professorMessage}\n\nRelato do aluno: ${detail}`,
  };
}

async function getStudentForAccess(studentId: string) {
  return prisma.student.findUnique({
    where: {
      id: studentId,
    },
    select: {
      id: true,
      name: true,
      preferredName: true,
      email: true,
      userId: true,
      userAuthId: true,
      contractedTrainingDaysPerMonth: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      userAuth: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

function getStudentEmail(student: any): string | null {
  return student.email || student.userAuth?.email || null;
}

async function canAccessStudent({
  userId,
  role,
  student,
}: {
  userId: string;
  role: string;
  student: any;
}) {
  if (role === "GESTOR" || role === "ADMIN") return true;
  if (role === "TEACHER") return student.userId === userId;
  if (role === "STUDENT") return student.userAuthId === userId;

  return false;
}

function getCarePermissions(role: string) {
  const canManageEvents = role === "TEACHER";

  return {
    role,
    canManageEvents,
    readOnly: !canManageEvents,
    label: canManageEvents
      ? "Professor: você pode marcar em revisão e resolver eventos dos seus alunos."
      : "Gestão: visualização geral dos eventos. Somente o professor responsável altera status e resolução.",
  };
}

function buildCommercialImpact(event: any) {
  if (event.eventType !== "PAUSA_POR_CUIDADO") {
    return {
      applies: false,
      status: "SEM_IMPACTO_ESPECIFICO",
      label: "Sem impacto comercial específico",
      message: "Evento de cuidado sem regra comercial automática específica.",
      countsAsCompletedWorkout: null,
      countsAsAbsence: null,
      countsAsLowAdherence: null,
      shouldBlockTrainingUntilResolved: false,
    };
  }

  const contract = event.contract || null;
  const pauseStartedAt = event.createdAt ? new Date(event.createdAt) : new Date();
  const pauseResolvedAt = event.resolvedAt ? new Date(event.resolvedAt) : null;
  const referenceEnd = pauseResolvedAt || new Date();
  const pauseDays = calculatePauseDays(pauseStartedAt, referenceEnd);
  const isResolved = event.status === "RESOLVIDO" || Boolean(event.resolvedAt);

  const base = {
    applies: true,
    eventType: event.eventType,
    pauseStartedAt: pauseStartedAt.toISOString(),
    pauseResolvedAt: pauseResolvedAt ? pauseResolvedAt.toISOString() : null,
    pauseDays,
    shouldBlockTrainingUntilResolved: !isResolved,
    countsAsCompletedWorkout: false,
    countsAsAbsence: false,
    countsAsLowAdherence: false,
    contractId: contract?.id || null,
    contractType: contract?.type || null,
    contractStatus: contract?.status || null,
    contractCommercialStatus: contract?.commercialStatus || null,
    contractStartDate: contract?.startDate || null,
    contractEndDate: contract?.endDate || null,
    contractPriceCents: typeof contract?.priceCents === "number" ? contract.priceCents : null,
    workoutsPerWeek: typeof contract?.workoutsPerWeek === "number" ? contract.workoutsPerWeek : null,
    workoutsPerMonth: typeof contract?.workoutsPerMonth === "number" ? contract.workoutsPerMonth : null,
    totalContractedWorkouts: typeof contract?.totalContractedWorkouts === "number" ? contract.totalContractedWorkouts : null,
    planName: contract?.plan?.name || null,
  };

  if (!contract) {
    return {
      ...base,
      status: "SEM_CONTRATO_VINCULADO",
      label: "Sem contrato vinculado",
      message:
        "Pausa por cuidado registrada sem contrato/experiência vinculado. Gestão deve avaliar manualmente se há impacto comercial.",
      managementAction: "Avaliar manualmente se existe ciclo comercial associado ao período pausado.",
    };
  }

  if (contract.type === "TRIAL") {
    return {
      ...base,
      status: isResolved ? "EXPERIENCIA_PRORROGADA" : "EXPERIENCIA_A_PRORROGAR",
      label: isResolved ? "Experiência prorrogada" : "Experiência a preservar",
      message: isResolved
        ? `Experiência gratuita preservada por pausa de cuidado. O ciclo foi ajustado em ${pauseDays} dia(s) quando o professor liberou a retomada.`
        : `Experiência gratuita em pausa por cuidado. Ao resolver/liberar retomada, o sistema deve preservar aproximadamente ${pauseDays} dia(s) de experiência.`,
      managementAction: isResolved
        ? "Conferir se a nova data de vencimento ficou coerente com o período pausado."
        : "Aguardar professor liberar retomada; ao resolver, o sistema prorroga a experiência pelo período pausado.",
    };
  }

  return {
    ...base,
    status: isResolved ? "COMPENSACAO_COMERCIAL_REGISTRADA" : "COMPENSACAO_COMERCIAL_PENDENTE",
    label: isResolved ? "Avaliação comercial registrada" : "Avaliação comercial pendente",
    message: isResolved
      ? `Plano pago teve pausa por cuidado resolvida. O sistema registrou ${pauseDays} dia(s) para avaliação comercial, sem desconto automático.`
      : `Plano pago em pausa por cuidado. Até agora são ${pauseDays} dia(s) sem treino normal; não contar como falta, baixa adesão comum ou treino feito.`,
    managementAction: isResolved
      ? "Gestão decide se haverá compensação, crédito ou prorrogação conforme política comercial."
      : "Gestão acompanha impacto potencial; professor só libera retomada quando houver segurança.",
  };
}

function extractConversationId(value?: string | null): string | null {
  const match = String(value || "").match(/Conversa:\s*([0-9a-fA-F-]{36})/);
  return match?.[1] || null;
}

const RETURN_CONFIRMATION_MARKER = "[CONFIRMACAO_RETORNADA_ENVIADA]";
const RETURN_AWAITING_WORKOUT_MARKER = "[RETOMADA_AGUARDANDO_NOVO_TREINO]";
const CARE_INTERRUPTABLE_WORKOUT_STATUSES = ["PENDENTE", "PRE_PLANEJADO", "PRECISA_REVISAO"];


function normalizeEvent(event: any) {
  return {
    id: event.id,
    studentId: event.studentId,
    studentName: event.student?.name || "Aluno",
    studentEmail: event.student?.email || event.student?.userAuth?.email || null,
    professorId: event.professorId,
    professorName: event.professor?.name || event.student?.user?.name || "Sem professor",
    eventType: event.eventType,
    severity: event.severity,
    status: event.status,
    source: event.source,
    title: event.title,
    description: event.description,
    studentMessage: event.studentMessage,
    professorMessage: event.professorMessage,
    relatedWorkoutPlanId: event.relatedWorkoutPlanId,
    relatedWorkoutPlanName: event.relatedWorkoutPlan?.name || null,
    relatedWorkoutDate: event.relatedWorkoutPlan?.date || event.relatedWorkout?.date || null,
    weekStart: event.weekStart,
    weekEnd: event.weekEnd,
    resolvedAt: event.resolvedAt,
    resolutionNotes: event.resolutionNotes,
    returnConfirmationSent: String(event.resolutionNotes || "").includes(RETURN_CONFIRMATION_MARKER),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    commercialImpact: buildCommercialImpact(event),
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const studentIdParam = request.nextUrl.searchParams.get("studentId");
    const statusParam = request.nextUrl.searchParams.get("status");

    const where: any = {};

    if (statusParam && statusParam !== "TODOS") {
      where.status = statusParam;
    }

    if (studentIdParam) {
      const student = await getStudentForAccess(studentIdParam);

      if (!student) {
        return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
      }

      const hasAccess = await canAccessStudent({ userId, role, student });

      if (!hasAccess) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
      }

      where.studentId = studentIdParam;
    } else if (role === "TEACHER") {
      where.OR = [
        {
          professorId: userId,
        },
        {
          student: {
            userId,
          },
        },
      ];
    } else if (role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: {
          userAuthId: userId,
        },
        select: {
          id: true,
        },
      });

      if (!student) {
        return NextResponse.json({ events: [] });
      }

      where.studentId = student.id;
    } else if (role !== "GESTOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    await consolidateActiveCareEvents({
      studentIds: studentIdParam ? [studentIdParam] : undefined,
    });

    const events = await prisma.studentCareEvent.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            userAuth: {
              select: {
                email: true,
              },
            },
          },
        },
        professor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        relatedWorkoutPlan: {
          select: {
            id: true,
            name: true,
            date: true,
          },
        },
        relatedWorkout: {
          select: {
            id: true,
            date: true,
            status: true,
          },
        },
        contract: {
          select: {
            id: true,
            type: true,
            status: true,
            commercialStatus: true,
            startDate: true,
            endDate: true,
            priceCents: true,
            workoutsPerWeek: true,
            workoutsPerMonth: true,
            totalContractedWorkouts: true,
            plan: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          status: "asc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: 100,
    });

    return NextResponse.json({
      events: events.map(normalizeEvent),
      permissions: getCarePermissions(role),
    });
  } catch (error: any) {
    console.error("GET /api/student-care-events error:", error);

    return NextResponse.json(
      {
        error: "Erro ao buscar eventos de cuidado.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const studentId = String(body?.studentId || "").trim();
    const eventType = normalizeEventType(body?.eventType);
    const description = String(body?.description || "").trim() || null;
    const relatedWorkoutPlanId = String(body?.relatedWorkoutPlanId || "").trim() || null;
    const relatedWorkoutId = String(body?.relatedWorkoutId || "").trim() || null;
    const source = String(body?.source || "APP_ALUNO").trim() || "APP_ALUNO";
    const referenceDate = body?.workoutDate ? new Date(body.workoutDate) : new Date();

    if (!studentId) {
      return NextResponse.json({ error: "ID do aluno é obrigatório." }, { status: 400 });
    }

    const student = await getStudentForAccess(studentId);

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });
    }

    const hasAccess = await canAccessStudent({ userId, role, student });

    if (!hasAccess) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const studentDisplayName = getStudentDisplayName(student);

    const copy = getCareCopy({
      eventType,
      studentName: studentDisplayName,
      description,
    });

    const week = getWeekRange(referenceDate);
    const authorId = await getNoticeAuthorId(userId);
    const resolvedProfessor = await resolveStudentProfessor(studentId);
    const professorId = resolvedProfessor?.id || null;

    const activeContract = await prisma.studentContract.findFirst({
      where: {
        studentId,
        status: "ACTIVE",
        startDate: {
          lte: referenceDate,
        },
        endDate: {
          gte: referenceDate,
        },
      },
      orderBy: {
        endDate: "desc",
      },
      select: {
        id: true,
      },
    });

    const careEvent = await prisma.studentCareEvent.create({
      data: {
        studentId,
        professorId,
        authorId,
        contractId: activeContract?.id || null,
        eventType,
        severity: copy.severity,
        status: copy.status,
        source,
        title: copy.title,
        description,
        studentMessage: copy.studentMessage,
        professorMessage: copy.professorMessage,
        relatedWorkoutPlanId,
        relatedWorkoutId,
        weekStart: week.startOfWeek,
        weekEnd: week.endOfWeek,
      },
    });

    let studentNoticeId: string | null = null;
    let professorNoticeId: string | null = null;
    let studentEmailSentAt: Date | null = null;
    let professorEmailSentAt: Date | null = null;

    const professorName = resolvedProfessor?.name || "seu professor";
    const studentNoticeContent = [
      `Oi, ${studentDisplayName}!`,
      "",
      copy.studentMessage,
      "",
      "Para manter seu acompanhamento organizado e registrado, converse com o professor pelo chat da plataforma. O WhatsApp fica reservado para contatos específicos da gestão.",
    ].join("\n");

    const studentNotice = await prisma.notice.create({
      data: {
        title: copy.title,
        content: studentNoticeContent,
        type: "CUIDADO_ALUNO",
        authorId,
        studentId,
        targetRole: "ALUNO",
        expiresAt: addDays(eventType === "DOR_DESCONFORTO" ? 30 : 14),
      },
      select: {
        id: true,
      },
    });

    studentNoticeId = studentNotice.id;

    if (professorId) {
      const professorNotice = await prisma.notice.create({
        data: {
          title:
            copy.severity === "CUIDADO"
              ? `Atenção prioritária para ${student.name}`
              : `Revisão necessária no acompanhamento de ${student.name}`,
          content: [
            `Olá, ${professorName}.`,
            "",
            copy.professorMessage,
            "",
            "Acesse a Central de Cuidado, revise o contexto e registre a orientação ao aluno pelo chat da plataforma.",
          ].join("\n"),
          type: "CUIDADO_ALUNO",
          authorId,
          studentId,
          professorId,
          targetRole: "TEACHER",
          expiresAt: addDays(21),
        },
        select: {
          id: true,
        },
      });

      professorNoticeId = professorNotice.id;
    }

    if (copy.shouldEmailStudent) {
      const email = getStudentEmail(student);

      if (email) {
        await sendEmail({
          to: email,
          subject: `${studentDisplayName}, ${copy.title.toLowerCase()}`,
          eventType: "STUDENT_CARE_EVENT",
          recipientType: "STUDENT",
          contextId: studentId,
          text: [
            `Oi, ${studentDisplayName}!`,
            "",
            copy.studentMessage,
            "",
            `${professorName} foi avisado e poderá acompanhar você pelo chat da plataforma.`,
            "Para manter as orientações registradas, use o chat para falar sobre treino e cuidado. O WhatsApp fica reservado para contatos específicos da gestão.",
            "",
            `Acessar minha área: ${getAppAlunoUrl()}`,
            "",
            "Em caso de dor persistente, piora ou limitação de movimento, procure avaliação de um profissional de saúde habilitado.",
            "",
            "Funcional UP Digital",
            "Mensagem automática de cuidado enviada para apoiar seu acompanhamento.",
          ].join("\n"),
          html: `
            <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
              <div style="max-width:560px;margin:0 auto;background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
                <h2 style="color:#00A19C;margin:0 0 16px;">${escapeHtml(copy.title)}</h2>
                <p style="color:#f5f5f5;font-size:15px;line-height:1.6;">Oi, <strong>${escapeHtml(studentDisplayName)}</strong>!</p>
                <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">${escapeHtml(copy.studentMessage)}</p>
                <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">
                  <strong style="color:#f5f5f5;">${escapeHtml(professorName)}</strong> foi avisado e poderá acompanhar você pelo chat da plataforma.
                </p>
                <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">
                  Para manter as orientações registradas, use o chat para falar sobre treino e cuidado. O WhatsApp fica reservado para contatos específicos da gestão.
                </p>
                <a href="${getAppAlunoUrl()}" style="display:inline-block;background:#00A19C;color:#0a0a0a;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:10px;">Abrir meu acompanhamento</a>
                <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin-top:20px;">
                  Em caso de dor persistente, piora ou limitação de movimento, procure avaliação de um profissional de saúde habilitado.
                </p>
                <p style="color:#6b7280;font-size:11px;line-height:1.5;margin-top:18px;">
                  Mensagem automática de cuidado enviada pelo Funcional UP Digital para apoiar seu acompanhamento.
                </p>
              </div>
            </div>
          `,
        });

        studentEmailSentAt = new Date();
      }
    }

    if (copy.shouldEmailProfessor && resolvedProfessor?.email) {
      await sendEmail({
        to: resolvedProfessor.email,
        eventType: "STUDENT_CARE_EVENT_TEACHER",
        recipientType: "TEACHER",
        contextId: studentId,
        subject:
          copy.severity === "CUIDADO"
            ? `Atenção prioritária: ${student.name}`
            : `Revisão necessária: ${student.name}`,
        text: [
          `Olá, ${resolvedProfessor.name || "professor(a)"}!`,
          "",
          copy.professorMessage,
          "",
          "Acesse a Central de Cuidado, revise o contexto antes de liberar ou evoluir a programação e registre sua orientação pelo chat.",
          getAppCareUrl(),
          "",
          "Funcional UP Digital",
          "Mensagem automática de acompanhamento enviada ao professor responsável.",
        ].join("\n"),
        html: `
          <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
            <div style="max-width:560px;margin:0 auto;background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
              <h2 style="color:#00A19C;margin:0 0 16px;">Acompanhamento de ${escapeHtml(student.name)}</h2>
              <p style="color:#f5f5f5;font-size:15px;line-height:1.6;">Olá, ${escapeHtml(resolvedProfessor.name || "professor(a)")}!</p>
              <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">${escapeHtml(copy.professorMessage).replaceAll("\n", "<br />")}</p>
              <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Revise o contexto antes de liberar ou evoluir a programação e registre sua orientação pelo chat.</p>
              <a href="${getAppCareUrl()}" style="display:inline-block;background:#00A19C;color:#0a0a0a;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:10px;">Abrir Central de Cuidado</a>
              <p style="color:#6b7280;font-size:11px;line-height:1.5;margin-top:18px;">Mensagem automática de acompanhamento enviada ao professor responsável.</p>
            </div>
          </div>
        `,
      });

      professorEmailSentAt = new Date();
    }

    const updatedEvent = await prisma.studentCareEvent.update({
      where: {
        id: careEvent.id,
      },
      data: {
        studentNoticeId,
        professorNoticeId,
        studentEmailSentAt,
        professorEmailSentAt,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            userAuth: {
              select: {
                email: true,
              },
            },
          },
        },
        professor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        relatedWorkoutPlan: {
          select: {
            id: true,
            name: true,
            date: true,
          },
        },
        relatedWorkout: {
          select: {
            id: true,
            date: true,
            status: true,
          },
        },
        contract: {
          select: {
            id: true,
            type: true,
            status: true,
            commercialStatus: true,
            startDate: true,
            endDate: true,
            priceCents: true,
            workoutsPerWeek: true,
            workoutsPerMonth: true,
            totalContractedWorkouts: true,
            plan: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      event: normalizeEvent(updatedEvent),
      message: copy.studentMessage,
    });
  } catch (error: any) {
    console.error("POST /api/student-care-events error:", error);

    return NextResponse.json(
      {
        error: "Erro ao registrar cuidado do aluno.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const id = String(body?.id || "").trim();
    const action = String(body?.action || "").trim().toUpperCase();

    if (!id) {
      return NextResponse.json({ error: "ID do evento é obrigatório." }, { status: 400 });
    }

    if (action === "SEND_RETURN_CONFIRMATION") {
      if (role !== "TEACHER") {
        return NextResponse.json(
          { error: "Somente o professor responsável pode confirmar as condições de retomada." },
          { status: 403 }
        );
      }

      const existing = await prisma.studentCareEvent.findUnique({
        where: { id },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              preferredName: true,
              email: true,
              userId: true,
              userAuthId: true,
              user: { select: { id: true, name: true, email: true } },
              userAuth: { select: { id: true, name: true, email: true } },
            },
          },
          professor: { select: { id: true, name: true, email: true } },
        },
      });

      if (!existing) {
        return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
      }

      if (existing.student.userId !== userId && existing.professorId !== userId) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
      }

      if (existing.eventType !== "PAUSA_POR_CUIDADO" || existing.status !== "EM_REVISAO") {
        return NextResponse.json(
          { error: "A confirmação só pode ser enviada depois que o aluno solicitar a retomada." },
          { status: 400 }
        );
      }

      if (String(existing.resolutionNotes || "").includes(RETURN_CONFIRMATION_MARKER)) {
        return NextResponse.json({
          ok: true,
          alreadySent: true,
          message: "A confirmação de retomada já foi enviada ao aluno.",
        });
      }

      const studentDisplayName = getStudentDisplayName(existing.student);
      const professorName = String(existing.professor?.name || user?.name || "Professor").trim() || "Professor";
      const confirmationMessage = [
        `${studentDisplayName}, que bom que você sinalizou que está se sentindo bem para voltar.`,
        "Antes de retomarmos, preciso confirmar como você está hoje em relação à situação que motivou a pausa: ainda existe dor, inchaço ou alguma limitação?",
        "Você consegue realizar seus movimentos normalmente? Teve alguma orientação de um profissional de saúde?",
        "Com sua resposta, reviso sua retomada e preparo os próximos treinos com segurança.",
      ].join(" ");

      let rootConversationId = extractConversationId(existing.description);

      if (rootConversationId) {
        const rootConversation = await prisma.question.findUnique({
          where: { id: rootConversationId },
          select: { id: true, studentId: true, parentId: true },
        });

        if (!rootConversation || rootConversation.studentId !== existing.studentId) {
          rootConversationId = null;
        } else if (rootConversation.parentId) {
          rootConversationId = rootConversation.parentId;
        }
      }

      const now = new Date();
      const result = await prisma.$transaction(async (tx) => {
        const chatMessage = await tx.question.create({
          data: {
            content: confirmationMessage,
            parentId: rootConversationId,
            studentId: existing.studentId,
            teacherId: existing.professorId || userId,
            senderRole: "TEACHER",
            answeredById: userId,
            answer: confirmationMessage,
            answeredAt: now,
          },
          select: { id: true, parentId: true },
        });

        const conversationId = rootConversationId || chatMessage.id;
        const note = [
          RETURN_CONFIRMATION_MARKER,
          `[${formatDatePtBr(now)}] Confirmação de condições para retomada enviada pelo chat e encaminhada por e-mail.`,
          `Mensagem: ${confirmationMessage}`,
          `Conversa: ${conversationId}`,
        ].join("\n");

        const resolutionNotes = [existing.resolutionNotes, note]
          .filter(Boolean)
          .join("\n\n");

        const updatedEvent = await tx.studentCareEvent.update({
          where: { id: existing.id },
          data: {
            status: "EM_REVISAO",
            resolutionNotes,
            resolvedAt: null,
            resolvedById: null,
          },
        });

        return { conversationId, updatedEvent };
      });

      const communication = await notifyStudentAboutChatReply({
        studentId: existing.studentId,
        authorId: userId,
        senderName: professorName,
        conversationId: result.conversationId,
        replyText: confirmationMessage,
        includeReplyTextInEmail: true,
      });

      return NextResponse.json({
        ok: true,
        event: normalizeEvent({
          ...result.updatedEvent,
          student: existing.student,
          professor: existing.professor,
        }),
        conversationId: result.conversationId,
        emailSent: communication.emailSent,
        noticeCreated: communication.noticeCreated,
        message: communication.emailSent
          ? "Mensagem enviada no chat e por e-mail. Aguarde a resposta do aluno antes de liberar a retomada."
          : "Mensagem enviada no chat. O e-mail não pôde ser confirmado, mas o aluno recebeu o aviso na plataforma.",
      });
    }

    if (action === "ACTIVATE_CARE_PAUSE") {
      if (role !== "TEACHER") {
        return NextResponse.json(
          { error: "Somente o professor responsável pode pausar treinos por cuidado." },
          { status: 403 }
        );
      }

      const existing = await prisma.studentCareEvent.findUnique({
        where: {
          id,
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              userId: true,
              userAuthId: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              userAuth: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          professor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          relatedWorkoutPlan: {
            select: {
              id: true,
              name: true,
              date: true,
            },
          },
          relatedWorkout: {
            select: {
              id: true,
              date: true,
              status: true,
            },
          },
          contract: {
            select: {
              id: true,
              type: true,
              status: true,
              commercialStatus: true,
              startDate: true,
              endDate: true,
              priceCents: true,
              workoutsPerWeek: true,
              workoutsPerMonth: true,
              totalContractedWorkouts: true,
              plan: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!existing) {
        return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
      }

      if (existing.student.userId !== userId && existing.professorId !== userId) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
      }

      if (existing.status === "RESOLVIDO") {
        return NextResponse.json(
          { error: "Este evento já foi resolvido e não pode ser pausado novamente." },
          { status: 400 }
        );
      }

      if (existing.eventType === "PAUSA_POR_CUIDADO") {
        return NextResponse.json(
          { error: "Este caso já está em pausa por cuidado." },
          { status: 400 }
        );
      }

      const studentName = existing.student.name || "Aluno";
      const originalDescription = String(existing.description || "").trim();
      const pauseDescription = String(body?.pauseReason || "").trim();
      const notePrefix = `[${formatDatePtBr(new Date())}] Treinos pausados por cuidado pelo professor.`;
      const noteToAdd = pauseDescription
        ? `${notePrefix}
Motivo registrado: ${pauseDescription}`
        : notePrefix;
      const resolutionNotes = [existing.resolutionNotes, noteToAdd]
        .filter(Boolean)
        .join("\n\n");

      const copy = getCareCopy({
        eventType: "PAUSA_POR_CUIDADO",
        studentName,
        description: originalDescription || pauseDescription || null,
      });

      let contractId = existing.contractId || null;
      if (!contractId) {
        const activeContract = await prisma.studentContract.findFirst({
          where: {
            studentId: existing.studentId,
            status: "ACTIVE",
            startDate: {
              lte: new Date(),
            },
            endDate: {
              gte: new Date(),
            },
          },
          orderBy: {
            endDate: "desc",
          },
          select: {
            id: true,
          },
        });
        contractId = activeContract?.id || null;
      }

      const pauseWeek = getWeekRange(existing.createdAt || new Date());
      const pauseFrom = existing.weekStart || pauseWeek.startOfWeek;

      const updated = await prisma.$transaction(async (tx) => {
        const interruptedWorkouts = await tx.workout.findMany({
          where: {
            studentId: existing.studentId,
            status: { in: CARE_INTERRUPTABLE_WORKOUT_STATUSES },
            date: { gte: pauseFrom },
          },
          select: {
            id: true,
            workoutPlanId: true,
          },
        });

        if (interruptedWorkouts.length > 0) {
          await tx.workout.updateMany({
            where: {
              id: { in: interruptedWorkouts.map((workout) => workout.id) },
            },
            data: {
              status: "INTERROMPIDO_CUIDADO",
            },
          });

          const workoutPlanIds = Array.from(
            new Set(
              interruptedWorkouts
                .map((workout) => workout.workoutPlanId)
                .filter((workoutPlanId): workoutPlanId is string => Boolean(workoutPlanId))
            )
          );

          if (workoutPlanIds.length > 0) {
            await tx.workoutPlan.updateMany({
              where: { id: { in: workoutPlanIds } },
              data: { active: false },
            });
          }
        }

        return tx.studentCareEvent.update({
          where: {
            id,
          },
          data: {
            eventType: "PAUSA_POR_CUIDADO",
            severity: copy.severity,
            status: copy.status,
            title: copy.title,
            description: originalDescription || pauseDescription || null,
            studentMessage: copy.studentMessage,
            professorMessage: copy.professorMessage,
            resolutionNotes,
            contractId,
            resolvedAt: null,
            resolvedById: null,
          },
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
                userAuth: {
                  select: {
                    email: true,
                  },
                },
              },
            },
            professor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            relatedWorkoutPlan: {
              select: {
                id: true,
                name: true,
                date: true,
              },
            },
            relatedWorkout: {
              select: {
                id: true,
                date: true,
                status: true,
              },
            },
            contract: {
              select: {
                id: true,
                type: true,
                status: true,
                commercialStatus: true,
                startDate: true,
                endDate: true,
                priceCents: true,
                workoutsPerWeek: true,
                workoutsPerMonth: true,
                totalContractedWorkouts: true,
                plan: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        });
      });

      const currentProfessor = await resolveStudentProfessor(existing.studentId);
      const professorId = currentProfessor?.id || existing.professorId || null;
      const professorEmail = currentProfessor?.email || existing.professor?.email || null;
      const professorName = currentProfessor?.name || existing.professor?.name || "professor(a)";
      const studentEmail = getStudentEmail(existing.student);
      const authorId = await getNoticeAuthorId(userId);

      const studentNoticeContent = [
        `Oi, ${studentName}!`,
        "",
        copy.studentMessage,
        "",
        pauseDescription ? `Motivo registrado: ${pauseDescription}` : "",
        "Quando se sentir apto(a) para retomar, use o botão da sua área de aluno para sinalizar a retomada.",
      ].filter(Boolean).join("\n");

      await prisma.notice.create({
        data: {
          title: copy.title,
          content: studentNoticeContent,
          type: "CUIDADO_ALUNO",
          authorId,
          studentId: existing.studentId,
          targetRole: "ALUNO",
          expiresAt: addDays(21),
        },
      });

      if (professorId) {
        await prisma.notice.create({
          data: {
            title: `Pausa por cuidado ativada para ${studentName}`,
            content: [
              `Olá, ${professorName}.`,
              "",
              `${studentName} foi colocado(a) em pausa por cuidado.`,
              pauseDescription ? `Motivo registrado: ${pauseDescription}` : "",
              "Não libere treino normal enquanto o evento estiver aberto. Aguarde o aluno sinalizar aptidão para retomar e resolva o evento somente após revisar a retomada com segurança.",
            ].filter(Boolean).join("\n"),
            type: "CUIDADO_ALUNO",
            authorId,
            studentId: existing.studentId,
            professorId,
            targetRole: "TEACHER",
            expiresAt: addDays(21),
          },
        });
      }

      if (studentEmail) {
        try {
          await sendEmail({
            to: studentEmail,
            subject: `${studentName}, seus treinos foram pausados por cuidado`,
            eventType: "CARE_PAUSE_STUDENT",
            recipientType: "STUDENT",
            contextId: existing.studentId,
            text: [
              `Oi, ${studentName}!`,
              "",
              copy.studentMessage,
              "",
              pauseDescription ? `Motivo registrado: ${pauseDescription}` : "",
              "Quando se sentir apto(a) para retomar, entre na sua área de aluno e use o botão de retomada.",
              `Acessar minha área: ${getAppAlunoUrl()}`,
              "",
              "Funcional UP Digital",
            ].filter(Boolean).join("\n"),
            html: `
              <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
                <div style="max-width:560px;margin:0 auto;background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
                  <h2 style="color:#00A19C;margin:0 0 16px;">Treinos pausados por cuidado</h2>
                  <p style="color:#f5f5f5;font-size:15px;line-height:1.6;">Oi, <strong>${escapeHtml(studentName)}</strong>!</p>
                  <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">${escapeHtml(copy.studentMessage)}</p>
                  ${pauseDescription ? `<p style="color:#d4d4d4;font-size:14px;line-height:1.6;"><strong>Motivo registrado:</strong> ${escapeHtml(pauseDescription)}</p>` : ""}
                  <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Quando se sentir apto(a) para retomar, entre na sua área e use o botão de retomada.</p>
                  <a href="${getAppAlunoUrl()}" style="display:inline-block;background:#00A19C;color:#0a0a0a;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:10px;">Abrir minha área</a>
                </div>
              </div>
            `,
          });
        } catch (error) {
          console.error("Erro ao enviar e-mail de pausa por cuidado para o aluno:", error);
        }
      }

      if (professorEmail) {
        try {
          await sendEmail({
            to: professorEmail,
            subject: `Pausa por cuidado ativada para ${studentName}`,
            eventType: "CARE_PAUSE_TEACHER",
            recipientType: "TEACHER",
            contextId: existing.studentId,
            text: [
              `Olá, ${professorName}!`,
              "",
              `${studentName} foi colocado(a) em pausa por cuidado.`,
              pauseDescription ? `Motivo registrado: ${pauseDescription}` : "",
              "Aguarde o aluno sinalizar aptidão para retomar. Depois revise o caso e resolva o evento quando for seguro liberar a retomada.",
              getAppCareUrl(),
            ].filter(Boolean).join("\n"),
            html: `
              <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
                <div style="max-width:560px;margin:0 auto;background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
                  <h2 style="color:#00A19C;margin:0 0 16px;">Pausa por cuidado ativada</h2>
                  <p style="color:#f5f5f5;font-size:15px;line-height:1.6;">Olá, ${escapeHtml(professorName)}!</p>
                  <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">${escapeHtml(studentName)} foi colocado(a) em pausa por cuidado.</p>
                  ${pauseDescription ? `<p style="color:#d4d4d4;font-size:14px;line-height:1.6;"><strong>Motivo registrado:</strong> ${escapeHtml(pauseDescription)}</p>` : ""}
                  <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Aguarde o aluno sinalizar aptidão para retomar. Depois revise o caso e resolva o evento quando for seguro liberar a retomada.</p>
                  <a href="${getAppCareUrl()}" style="display:inline-block;background:#00A19C;color:#0a0a0a;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:10px;">Abrir Central de Cuidado</a>
                </div>
              </div>
            `,
          });
        } catch (error) {
          console.error("Erro ao enviar e-mail de pausa por cuidado para o professor:", error);
        }
      }

      return NextResponse.json({
        ok: true,
        event: normalizeEvent(updated),
        message: "Treinos pausados por cuidado. O aluno foi avisado e poderá sinalizar a retomada quando estiver apto(a).",
      });
    }

    if (action === "REQUEST_RETURN") {
      if (role !== "STUDENT") {
        return NextResponse.json(
          { error: "Somente o aluno pode sinalizar aptidão de retomada." },
          { status: 403 }
        );
      }

      const existing = await prisma.studentCareEvent.findUnique({
        where: {
          id,
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              userId: true,
              userAuthId: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              userAuth: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          professor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          relatedWorkoutPlan: {
            select: {
              id: true,
              name: true,
              date: true,
            },
          },
          relatedWorkout: {
            select: {
              id: true,
              date: true,
              status: true,
            },
          },
        },
      });

      if (!existing) {
        return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
      }

      const hasAccess = await canAccessStudent({
        userId,
        role,
        student: existing.student,
      });

      if (!hasAccess) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
      }

      if (!["PAUSA_POR_CUIDADO", "PAUSA_BAIXA_ADERENCIA"].includes(existing.eventType)) {
        return NextResponse.json(
          { error: "A retomada só pode ser solicitada para eventos de pausa ativa." },
          { status: 400 }
        );
      }

      if (existing.status === "RESOLVIDO") {
        return NextResponse.json(
          { error: "Este evento já foi resolvido pelo professor." },
          { status: 400 }
        );
      }

      const returnMessage = String(
        body?.returnMessage ||
          (existing.eventType === "PAUSA_BAIXA_ADERENCIA"
            ? "Quero retomar meus treinos e estou disponível para combinar com o professor uma programação possível para minha rotina."
            : "Confirmo que me sinto apto(a) para retomar os treinos. Entendo que, caso ainda exista dor, limitação ou orientação médica pendente, devo informar o professor antes de voltar.")
      ).trim();
      const now = new Date();
      const noteToAdd = `[${formatDatePtBr(now)}] Aluno sinalizou aptidão de retomada: ${returnMessage}`;
      const resolutionNotes = [existing.resolutionNotes, noteToAdd]
        .filter(Boolean)
        .join("\n\n");

      const updated = await prisma.studentCareEvent.update({
        where: {
          id,
        },
        data: {
          status: "EM_REVISAO",
          resolutionNotes,
          resolvedAt: null,
          resolvedById: null,
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              userAuth: {
                select: {
                  email: true,
                },
              },
            },
          },
          professor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          relatedWorkoutPlan: {
            select: {
              id: true,
              name: true,
              date: true,
            },
          },
          relatedWorkout: {
            select: {
              id: true,
              date: true,
              status: true,
            },
          },
        },
      });

      const currentProfessor = await resolveStudentProfessor(existing.studentId);
      const professorId = currentProfessor?.id || null;
      const professorEmail = currentProfessor?.email || null;
      const professorName = currentProfessor?.name || "professor(a)";
      const studentName = existing.student.name || "Aluno";
      const professorContent = [
        `Olá, ${professorName}!`,
        "",
        existing.eventType === "PAUSA_BAIXA_ADERENCIA"
          ? `${studentName} pediu para retomar os treinos após uma pausa por baixa adesão.`
          : `${studentName} informou que se sente apto(a) para retomar os treinos e pediu uma nova avaliação do acompanhamento.`,
        "",
        existing.eventType === "PAUSA_BAIXA_ADERENCIA"
          ? "A retomada não é liberada automaticamente. Converse com o aluno pelo chat, entenda as barreiras e combine uma semana de retorno possível. Resolva o evento somente quando estiver pronto para voltar a montar os treinos."
          : "A retomada não é liberada automaticamente. Revise o evento de cuidado, converse com o aluno pelo chat e confirme se a programação pode voltar com segurança. Resolva o evento somente depois dessa revisão.",
        "",
        `Mensagem do aluno: ${returnMessage}`,
      ].join("\n");

      if (professorId) {
        await prisma.notice.create({
          data: {
            title: `${studentName} pediu revisão para retomar`,
            content: professorContent,
            type: "CUIDADO_ALUNO",
            authorId: userId,
            studentId: existing.studentId,
            professorId,
            targetRole: "TEACHER",
            expiresAt: addDays(21),
          },
        });
      }

      await prisma.notice.create({
        data: {
          title: "Recebemos seu pedido de retomada",
          content: [
            `Oi, ${studentName}!`,
            "",
            "Que bom que você nos contou como está se sentindo. Seu pedido foi encaminhado ao professor responsável.",
            "",
            "Antes de voltar aos treinos, aguarde a revisão e a liberação pelo sistema. Se precisar complementar alguma informação, use o chat da plataforma para manter o acompanhamento registrado.",
          ].join("\n"),
          type: "CUIDADO_ALUNO",
          authorId: userId,
          studentId: existing.studentId,
          targetRole: "ALUNO",
          expiresAt: addDays(14),
        },
      });

      if (professorEmail) {
        try {
          await sendEmail({
            to: professorEmail,
            subject: `${studentName} pediu revisão para retomar os treinos`,
            eventType: "CARE_RETURN_REVIEW_TEACHER",
            recipientType: "TEACHER",
            contextId: existing.studentId,
            text: [
              professorContent,
              "",
              "Acesse a Central de Cuidado para revisar:",
              getAppCareUrl(),
              "",
              "Funcional UP Digital",
              "Mensagem automática de acompanhamento enviada ao professor responsável.",
            ].join("\n"),
            html: `
              <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
                <div style="max-width:560px;margin:0 auto;background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
                  <h2 style="color:#00A19C;margin:0 0 16px;">Pedido de retomada de ${escapeHtml(studentName)}</h2>
                  <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">${escapeHtml(professorContent).replaceAll("\n", "<br />")}</p>
                  <a href="${getAppCareUrl()}" style="display:inline-block;background:#00A19C;color:#0a0a0a;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:10px;">Revisar retomada</a>
                  <p style="color:#6b7280;font-size:11px;line-height:1.5;margin-top:18px;">Mensagem automática de acompanhamento enviada ao professor responsável.</p>
                </div>
              </div>
            `,
          });
        } catch (error) {
          console.error("Erro ao enviar e-mail de solicitação de retomada:", error);
        }
      }

      return NextResponse.json({
        ok: true,
        event: normalizeEvent(updated),
        message: "Recebemos seu pedido e avisamos o professor. Aguarde a revisão e a liberação no sistema antes de voltar aos treinos.",
      });
    }

    if (role !== "TEACHER") {
      return NextResponse.json(
        { error: "Somente o professor responsável pode alterar eventos de cuidado. A gestão visualiza e acompanha em modo leitura." },
        { status: 403 }
      );
    }

    const status = String(body?.status || "").trim().toUpperCase();
    const requestedResolutionNotes = String(body?.resolutionNotes || "").trim() || null;

    if (!["ABERTO", "EM_REVISAO", "REQUER_REVISAO", "RESOLVIDO"].includes(status)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }

    const existing = await prisma.studentCareEvent.findUnique({
      where: {
        id,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        contract: {
          select: {
            id: true,
            type: true,
            status: true,
            endDate: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    }

    if (role === "TEACHER" && existing.student.userId !== userId && existing.professorId !== userId) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const resolvedAt = status === "RESOLVIDO" ? new Date() : null;
    let commercialAdjustment: any = null;
    const isCareReturnRelease =
      Boolean(resolvedAt) &&
      existing.eventType === "PAUSA_POR_CUIDADO" &&
      existing.status !== "RESOLVIDO";

    let resolutionNotes = requestedResolutionNotes;

    if (isCareReturnRelease && !String(resolutionNotes || existing.resolutionNotes || "").includes(RETURN_AWAITING_WORKOUT_MARKER)) {
      const markerNote = [
        RETURN_AWAITING_WORKOUT_MARKER,
        `[${formatDatePtBr(resolvedAt as Date)}] Retomada liberada para preparação de uma nova programação. Os treinos interrompidos pela pausa permanecem arquivados e não voltam ao calendário do aluno.`,
      ].join("\n");

      resolutionNotes = [resolutionNotes || existing.resolutionNotes, markerNote]
        .filter(Boolean)
        .join("\n\n");
    }

    const data: any = {
      status,
      resolutionNotes,
    };

    if (resolvedAt) {
      data.resolvedAt = resolvedAt;
      data.resolvedById = userId;
    } else {
      data.resolvedAt = null;
      data.resolvedById = null;
    }

    if (resolvedAt && existing.status !== "RESOLVIDO") {
      commercialAdjustment = await applyCommercialAdjustmentOnCareResolution({
        event: existing,
        resolvedAt,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (isCareReturnRelease) {
        const returnWeek = getWeekRange(existing.createdAt || new Date());
        const interruptFrom = existing.weekStart || returnWeek.startOfWeek;
        const remainingWorkouts = await tx.workout.findMany({
          where: {
            studentId: existing.studentId,
            status: { in: CARE_INTERRUPTABLE_WORKOUT_STATUSES },
            date: { gte: interruptFrom },
          },
          select: {
            id: true,
            workoutPlanId: true,
          },
        });

        if (remainingWorkouts.length > 0) {
          await tx.workout.updateMany({
            where: { id: { in: remainingWorkouts.map((workout) => workout.id) } },
            data: { status: "INTERROMPIDO_CUIDADO" },
          });

          const workoutPlanIds = Array.from(
            new Set(
              remainingWorkouts
                .map((workout) => workout.workoutPlanId)
                .filter((workoutPlanId): workoutPlanId is string => Boolean(workoutPlanId))
            )
          );

          if (workoutPlanIds.length > 0) {
            await tx.workoutPlan.updateMany({
              where: { id: { in: workoutPlanIds } },
              data: { active: false },
            });
          }
        }
      }

      return tx.studentCareEvent.update({
      where: {
        id,
      },
      data,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            userAuth: {
              select: {
                email: true,
              },
            },
          },
        },
        professor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        relatedWorkoutPlan: {
          select: {
            id: true,
            name: true,
            date: true,
          },
        },
        relatedWorkout: {
          select: {
            id: true,
            date: true,
            status: true,
          },
        },
        contract: {
          select: {
            id: true,
            type: true,
            status: true,
            commercialStatus: true,
            startDate: true,
            endDate: true,
            priceCents: true,
            workoutsPerWeek: true,
            workoutsPerMonth: true,
            totalContractedWorkouts: true,
            plan: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      });
    });

    return NextResponse.json({
      ok: true,
      event: normalizeEvent(updated),
      commercialAdjustment,
      returnPreparationRequired: isCareReturnRelease,
      message: isCareReturnRelease
        ? "Retomada liberada para preparação. Monte uma nova programação; os treinos interrompidos pela pausa não voltarão ao calendário do aluno."
        : undefined,
    });
  } catch (error: any) {
    console.error("PUT /api/student-care-events error:", error);

    return NextResponse.json(
      {
        error: "Erro ao atualizar evento de cuidado.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

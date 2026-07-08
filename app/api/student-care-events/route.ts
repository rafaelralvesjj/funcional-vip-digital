import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { sendEmail } from "@/lib/sendEmail";

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
    "https://funcional-vip-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/aluno`;
}

function getAppCareUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-vip-digital.vercel.app";

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
    "NAO_ENTENDI",
    "DESMOTIVACAO",
    "BAIXA_ADERENCIA",
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
      title: "Entendemos que sua rotina apertou",
      studentMessage:
        "Obrigado por avisar. Rotina corrida acontece, e o mais importante é não transformar uma semana difícil em desistência. Vamos usar essa informação para o professor ajustar sua próxima semana com mais aderência e realidade.",
      professorMessage:
        `${studentName} informou dificuldade por falta de tempo. Antes de montar a próxima semana, avalie uma estratégia mais simples, objetiva e possível de cumprir.`,
      shouldEmailStudent: false,
      shouldEmailProfessor: false,
    },
    EXERCICIO_DIFICIL: {
      severity: "REVISAO",
      status: "REQUER_REVISAO",
      title: "Vamos ajustar esse treino juntos",
      studentMessage:
        "Obrigado por contar. Treino bom não é o treino impossível; é o treino que desafia na medida certa e permite evolução com segurança. Já sinalizamos o professor para revisar carga, exercício, volume ou uma variação mais adequada para você.",
      professorMessage:
        `${studentName} relatou que o exercício ou treino está difícil. Revise complexidade, carga, volume, variação regressiva e clareza das instruções antes da próxima montagem.`,
      shouldEmailStudent: false,
      shouldEmailProfessor: true,
    },
    DOR_DESCONFORTO: {
      severity: "CUIDADO",
      status: "REQUER_REVISAO",
      title: "Sua segurança vem primeiro",
      studentMessage:
        "Sentimos muito que você tenha sentido dor ou desconforto. Sua segurança vem em primeiro lugar. Evite insistir no exercício que gerou desconforto. Se a dor persistir, piorar ou limitar seus movimentos, procure orientação de um profissional de saúde ou fisioterapia. Já sinalizamos o professor para revisar sua programação antes de qualquer progressão.",
      professorMessage:
        `${studentName} relatou dor, desconforto ou possível lesão. Não seguir com progressão automática. Revise o treino, o exercício envolvido, intensidade e necessidade de adaptação. Se necessário, oriente avaliação com profissional de saúde.`,
      shouldEmailStudent: true,
      shouldEmailProfessor: true,
    },
    NAO_ENTENDI: {
      severity: "ATENCAO",
      status: "REQUER_REVISAO",
      title: "Vamos deixar o treino mais claro",
      studentMessage:
        "Obrigado por avisar. Quando uma orientação não fica clara, o melhor caminho é perguntar mesmo. Já sinalizamos o professor para revisar a explicação e te ajudar a executar com mais segurança.",
      professorMessage:
        `${studentName} informou que não entendeu parte do treino. Revise a descrição, observações, nomes dos exercícios e, se possível, simplifique a próxima orientação.`,
      shouldEmailStudent: false,
      shouldEmailProfessor: false,
    },
    DESMOTIVACAO: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Vamos retomar sem culpa",
      studentMessage:
        "Obrigado por ser sincero. A motivação oscila, mas você não precisa recomeçar do zero. Vamos usar essa informação para tornar a próxima semana mais leve, possível e consistente.",
      professorMessage:
        `${studentName} sinalizou desmotivação. Considere uma semana de retomada com metas curtas, exercícios simples e reforço positivo.`,
      shouldEmailStudent: false,
      shouldEmailProfessor: false,
    },
    BAIXA_ADERENCIA: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Vamos entender sua semana",
      studentMessage:
        "Percebemos que sua semana ficou mais difícil para manter os treinos. Queremos entender o que aconteceu para ajustar melhor sua próxima programação, sem culpa e com mais aderência.",
      professorMessage:
        `${studentName} teve baixa aderência recente. Antes de progredir treino, avalie retomada, volume, complexidade e possíveis barreiras.`,
      shouldEmailStudent: false,
      shouldEmailProfessor: false,
    },
    OUTRO: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Obrigado por avisar",
      studentMessage:
        "Obrigado por compartilhar. Sua resposta ajuda o professor a cuidar melhor da sua rotina e ajustar o treino de forma mais humana e realista.",
      professorMessage:
        `${studentName} registrou uma observação sobre o treino. Revise o contexto antes da próxima montagem.`,
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
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
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

    const copy = getCareCopy({
      eventType,
      studentName: student.name,
      description,
    });

    const week = getWeekRange(referenceDate);
    const authorId = await getNoticeAuthorId(userId);
    const professorId = student.userId || null;

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

    const studentNotice = await prisma.notice.create({
      data: {
        title: copy.title,
        content: copy.studentMessage,
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
              ? `Cuidado urgente: ${student.name}`
              : `Revisar cuidado do aluno: ${student.name}`,
          content: copy.professorMessage,
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
          subject: "Sua segurança vem primeiro",
          text: [
            `Oi, ${student.name}.`,
            "",
            copy.studentMessage,
            "",
            `Acesse sua área do aluno: ${getAppAlunoUrl()}`,
            "",
            "Esta é uma orientação de cuidado e acompanhamento. Em caso de dor persistente, piora ou limitação de movimento, procure avaliação de um profissional habilitado.",
          ].join("\n"),
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
              <p>Oi, ${escapeHtml(student.name)}.</p>
              <p>${escapeHtml(copy.studentMessage)}</p>
              <p>Você pode acessar sua área para consultar seus treinos e avisos:</p>
              <p><a href="${getAppAlunoUrl()}">Abrir minha área do aluno</a></p>
              <p style="font-size:12px;color:#6b7280">
                Esta é uma orientação de cuidado e acompanhamento. Em caso de dor persistente, piora ou limitação de movimento, procure avaliação de um profissional habilitado.
              </p>
            </div>
          `,
        });

        studentEmailSentAt = new Date();
      }
    }

    if (copy.shouldEmailProfessor && student.user?.email) {
      await sendEmail({
        to: student.user.email,
        subject:
          copy.severity === "CUIDADO"
            ? `Cuidado do aluno: ${student.name}`
            : `Revisão de treino solicitada: ${student.name}`,
        text: [
          `Olá, ${student.user?.name || "professor(a)"}.`,
          "",
          copy.professorMessage,
          "",
          "Antes de montar a próxima semana, revise a Central de Cuidado do Aluno.",
          getAppCareUrl(),
        ].join("\n"),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
            <p>Olá, ${escapeHtml(student.user?.name || "professor(a)")}.</p>
            <p>${escapeHtml(copy.professorMessage).replaceAll("\n", "<br />")}</p>
            <p>Antes de montar a próxima semana, revise a Central de Cuidado do Aluno.</p>
            <p><a href="${getAppCareUrl()}">Abrir Central de Cuidado</a></p>
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

    if (role !== "TEACHER") {
      return NextResponse.json(
        { error: "Somente o professor responsável pode alterar eventos de cuidado. A gestão visualiza e acompanha em modo leitura." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const id = String(body?.id || "").trim();
    const status = String(body?.status || "").trim().toUpperCase();
    const resolutionNotes = String(body?.resolutionNotes || "").trim() || null;

    if (!id) {
      return NextResponse.json({ error: "ID do evento é obrigatório." }, { status: 400 });
    }

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
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    }

    if (role === "TEACHER" && existing.student.userId !== userId && existing.professorId !== userId) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const data: any = {
      status,
      resolutionNotes,
    };

    if (status === "RESOLVIDO") {
      data.resolvedAt = new Date();
      data.resolvedById = userId;
    } else {
      data.resolvedAt = null;
      data.resolvedById = null;
    }

    const updated = await prisma.studentCareEvent.update({
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
      },
    });

    return NextResponse.json({
      ok: true,
      event: normalizeEvent(updated),
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

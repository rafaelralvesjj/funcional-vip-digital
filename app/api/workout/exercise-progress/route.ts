import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import {
  canValidateWorkoutCivilDate,
  formatCivilKeyPtBr,
  getCurrentValidationDeadlineCivilKey,
  workoutDateToCivilKey,
} from "@/lib/workout-validation-window";

function normalizeDay(value: string | Date): Date {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  return date;
}

function getWeekRange(referenceDate: Date): { startOfWeek: Date; endOfWeek: Date } {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() + diffToMonday);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  return { startOfWeek, endOfWeek };
}

function addDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 59, 999);
  return date;
}

async function getStudentForSession() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim().toLowerCase();
  if (!session?.user || !email) return null;

  return prisma.student.findFirst({
    where: {
      OR: [
        { email: { equals: email, mode: "insensitive" } },
        { userAuth: { email: { equals: email, mode: "insensitive" } } },
      ],
    },
    select: {
      id: true,
      name: true,
      userId: true,
      userAuthId: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

function classifySkippedExercise(reason: string) {
  const normalized = reason.toLowerCase();

  if (normalized.includes("dor") || normalized.includes("desconforto")) {
    return {
      eventType: "DOR_DESCONFORTO",
      severity: "CUIDADO",
      title: "Dor ou desconforto durante exercício",
      professorTitle: "Atenção prioritária: exercício interrompido por dor",
      professorMessage: "O aluno não realizou um exercício por dor ou desconforto. Revise o relato antes de manter, evoluir ou repetir esse movimento.",
      studentMessage: "Seu relato de dor ou desconforto foi registrado e encaminhado ao professor. Não force o movimento e converse pelo chat antes de tentar novamente.",
      notifyProfessor: true,
    };
  }

  if (normalized.includes("muito difícil")) {
    return {
      eventType: "EXERCICIO_DIFICIL",
      severity: "ATENCAO",
      title: "Exercício considerado muito difícil",
      professorTitle: "Revisar intensidade de exercício",
      professorMessage: "O aluno pulou um exercício por considerá-lo muito difícil. Avalie regressão, volume, carga, descanso e clareza da orientação.",
      studentMessage: "Registramos que o exercício estava muito difícil. O professor poderá ajustar a próxima orientação.",
      notifyProfessor: true,
    };
  }

  if (normalized.includes("não entendi")) {
    return {
      eventType: "DUVIDA_EXECUCAO",
      severity: "ATENCAO",
      title: "Dúvida sobre execução do exercício",
      professorTitle: "Aluno precisa de orientação de execução",
      professorMessage: "O aluno não realizou um exercício porque não entendeu como executar. Oriente pelo chat e revise imagem, vídeo ou instrução do movimento.",
      studentMessage: "Registramos que você precisa de ajuda para executar esse exercício. Use o chat para falar com o professor antes de tentar novamente.",
      notifyProfessor: true,
    };
  }

  if (normalized.includes("equipamento")) {
    return {
      eventType: "AJUSTE_EQUIPAMENTO",
      severity: "ATENCAO",
      title: "Exercício não realizado por falta de equipamento",
      professorTitle: "Ajuste de exercício por equipamento indisponível",
      professorMessage: "O aluno não realizou um exercício porque o equipamento não estava disponível. Considere uma alternativa compatível com o ambiente de treino.",
      studentMessage: "Registramos que o equipamento não estava disponível. O professor poderá considerar uma alternativa nos próximos treinos.",
      notifyProfessor: true,
    };
  }

  if (normalized.includes("tempo")) {
    return {
      eventType: "FALTA_TEMPO",
      severity: "INFO",
      title: "Exercício não realizado por falta de tempo",
      professorTitle: "Sinal de falta de tempo no treino",
      professorMessage: "O aluno pulou um exercício por falta de tempo. Considere duração, ordem dos exercícios e possibilidade de uma versão mais curta.",
      studentMessage: "Registramos que faltou tempo. Essa informação ajudará o professor a acompanhar a duração e a aderência do treino.",
      notifyProfessor: false,
    };
  }

  return {
    eventType: "ADESAO_TREINO",
    severity: "INFO",
    title: "Exercício não realizado",
    professorTitle: "Revisar exercício não realizado",
    professorMessage: "O aluno informou que não realizou um exercício. Considere esse registro na próxima montagem.",
    studentMessage: "O motivo foi registrado e ficará disponível no acompanhamento do professor.",
    notifyProfessor: false,
  };
}

async function createCareEventForSkippedExercise({
  student,
  plan,
  exercise,
  workoutDate,
  skipReason,
}: {
  student: NonNullable<Awaited<ReturnType<typeof getStudentForSession>>>;
  plan: { id: string; name: string; contractId: string | null };
  exercise: { id: string; name: string };
  workoutDate: Date;
  skipReason: string;
}) {
  const classification = classifySkippedExercise(skipReason);
  const description = [
    `Exercício: ${exercise.name}`,
    `Motivo informado: ${skipReason}`,
    `Data do treino: ${workoutDate.toLocaleDateString("pt-BR")}`,
    `Identificador do exercício: ${exercise.id}`,
  ].join("\n");

  const duplicate = await prisma.studentCareEvent.findFirst({
    where: {
      studentId: student.id,
      relatedWorkoutPlanId: plan.id,
      eventType: classification.eventType,
      description,
      status: { not: "RESOLVIDO" },
    },
    select: { id: true },
  });

  if (duplicate) return duplicate;

  const week = getWeekRange(workoutDate);
  const authorId = student.userId || student.userAuthId;
  const event = await prisma.studentCareEvent.create({
    data: {
      studentId: student.id,
      professorId: student.userId || null,
      authorId: authorId || null,
      contractId: plan.contractId,
      eventType: classification.eventType,
      severity: classification.severity,
      status: "ABERTO",
      source: "APP_ALUNO_EXERCICIO_NAO_REALIZADO",
      title: classification.title,
      description,
      studentMessage: classification.studentMessage,
      professorMessage: `${classification.professorMessage}\n\n${description}`,
      relatedWorkoutPlanId: plan.id,
      weekStart: week.startOfWeek,
      weekEnd: week.endOfWeek,
    },
    select: { id: true, eventType: true, severity: true },
  });

  if (classification.notifyProfessor && student.userId && authorId) {
    await prisma.notice.create({
      data: {
        title: classification.professorTitle,
        content: `${classification.professorMessage}\n\nAluno: ${student.name}\nTreino: ${plan.name}\n${description}`,
        type: "CUIDADO_ALUNO",
        authorId,
        studentId: student.id,
        professorId: student.userId,
        targetRole: "TEACHER",
        expiresAt: addDays(classification.severity === "CUIDADO" ? 30 : 21),
      },
    });
  }

  return event;
}

export async function GET(request: NextRequest) {
  const student = await getStudentForSession();
  if (!student) return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });

  const workoutPlanId = String(request.nextUrl.searchParams.get("workoutPlanId") || "").trim();
  const dateValue = String(request.nextUrl.searchParams.get("date") || "").trim();
  if (!workoutPlanId || !dateValue) {
    return NextResponse.json({ error: "Treino e data são obrigatórios." }, { status: 400 });
  }

  const workoutDate = normalizeDay(dateValue);
  const items = await prisma.workoutExerciseProgress.findMany({
    where: { studentId: student.id, workoutPlanId, workoutDate },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const student = await getStudentForSession();
  if (!student) return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const workoutPlanId = String(body?.workoutPlanId || "").trim();
  const exerciseId = String(body?.exerciseId || "").trim();
  const status = String(body?.status || "").trim().toUpperCase();
  const effort = body?.effort ? String(body.effort).trim().toUpperCase() : null;
  const skipReason = body?.skipReason ? String(body.skipReason).trim() : null;
  const dateValue = String(body?.date || "").trim();

  if (!workoutPlanId || !exerciseId || !dateValue || !["CONCLUIDO", "PULADO", "PENDENTE"].includes(status)) {
    return NextResponse.json({ error: "Dados inválidos para registrar o exercício." }, { status: 400 });
  }
  if (status === "PULADO" && !skipReason) {
    return NextResponse.json({ error: "Informe por que o exercício não foi realizado." }, { status: 400 });
  }
  if (effort && !["FACIL", "NA_MEDIDA", "DIFICIL"].includes(effort)) {
    return NextResponse.json({ error: "Avaliação de esforço inválida." }, { status: 400 });
  }

  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, workoutPlanId, workoutPlan: { studentId: student.id } },
    select: {
      id: true,
      name: true,
      workoutPlan: { select: { id: true, name: true, contractId: true, date: true } },
    },
  });
  if (!exercise) return NextResponse.json({ error: "Exercício não encontrado." }, { status: 404 });

  const officialWorkoutDate = exercise.workoutPlan.date || normalizeDay(dateValue);
  const officialWorkoutCivilKey = workoutDateToCivilKey(officialWorkoutDate);

  if (!canValidateWorkoutCivilDate(officialWorkoutCivilKey)) {
    return NextResponse.json(
      {
        error: `Este treino só pode receber registros na semana vigente, até sexta-feira, 23h59 (${formatCivilKeyPtBr(getCurrentValidationDeadlineCivilKey())}).`,
        code: "VALIDATION_WINDOW_CLOSED",
      },
      { status: 403 }
    );
  }

  const workoutDate = normalizeDay(officialWorkoutDate);
  const item = await prisma.workoutExerciseProgress.upsert({
    where: {
      studentId_exerciseId_workoutDate: {
        studentId: student.id,
        exerciseId,
        workoutDate,
      },
    },
    create: {
      studentId: student.id,
      workoutPlanId,
      exerciseId,
      workoutDate,
      status,
      effort: status === "CONCLUIDO" ? effort : null,
      skipReason: status === "PULADO" ? skipReason : null,
      completedAt: status === "PENDENTE" ? null : new Date(),
    },
    update: {
      status,
      effort: status === "CONCLUIDO" ? effort : null,
      skipReason: status === "PULADO" ? skipReason : null,
      completedAt: status === "PENDENTE" ? null : new Date(),
    },
  });

  let careEvent = null;
  if (status === "PULADO" && skipReason) {
    careEvent = await createCareEventForSkippedExercise({
      student,
      plan: exercise.workoutPlan,
      exercise,
      workoutDate,
      skipReason,
    });
  }

  return NextResponse.json({ ok: true, item, careEvent });
}

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/auth";
import { sendEmail } from "@/lib/sendEmail";

function normalizeRole(role?: string | null) {
  return String(role || "").toUpperCase();
}

function parseOptionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function getAppLoginUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-vip-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/auth/signin`;
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

async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;

  if (!sessionUser?.id && !sessionUser?.email) {
    return null;
  }

  if (sessionUser?.id) {
    const userById = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, role: true, email: true, name: true },
    });

    if (userById) return userById;
  }

  if (sessionUser?.email) {
    return prisma.user.findUnique({
      where: { email: sessionUser.email },
      select: { id: true, role: true, email: true, name: true },
    });
  }

  return null;
}

function getWeeklyWorkoutLimit(contractedTrainingDaysPerMonth?: number | null): number | null {
  const contracted = Number(contractedTrainingDaysPerMonth || 0);

  if (!Number.isFinite(contracted) || contracted <= 0) {
    return null;
  }

  if (contracted <= 4) return 1;
  if (contracted <= 8) return 2;
  if (contracted <= 16) return 3;

  return Math.ceil(contracted / 4);
}

async function notifyProfessorAboutNewStudent({
  professor,
  student,
  authorId,
}: {
  professor: {
    id: string;
    name: string | null;
    email: string | null;
  };
  student: {
    id: string;
    name: string;
    contractedTrainingDaysPerMonth: number | null;
  };
  authorId: string;
}) {
  const professorName = professor.name || "Professor";
  const studentName = student.name || "Aluno";
  const loginUrl = getAppLoginUrl();
  const weeklyLimit = getWeeklyWorkoutLimit(student.contractedTrainingDaysPerMonth);

  const title = "Novo aluno vinculado a você";

  const weeklyText = weeklyLimit
    ? `Quantidade contratada: ${student.contractedTrainingDaysPerMonth} treino(s)/dia(s) no mês. Para esta semana, prepare ${weeklyLimit} treino(s).`
    : "A quantidade contratada de treinos/dias no mês ainda não foi informada.";

  const content = [
    `O aluno ${studentName} foi vinculado ao seu acompanhamento.`,
    "",
    "Você já pode acessar o painel e montar os treinos da semana desse aluno.",
    "",
    weeklyText,
  ].join("\n");

  const notificationTasks: Promise<unknown>[] = [];

  notificationTasks.push(
    prisma.notice.create({
      data: {
        title,
        content,
        type: "MANAGEMENT",
        targetRole: "TEACHER",
        professorId: professor.id,
        authorId,
        expiresAt: addDays(30),
      },
    })
  );

  if (professor.email) {
    const safeProfessorName = escapeHtml(professorName);
    const safeStudentName = escapeHtml(studentName);
    const safeWeeklyText = escapeHtml(weeklyText);

    const text = [
      `Olá, ${professorName}!`,
      "",
      `O aluno ${studentName} foi vinculado ao seu acompanhamento no Funcional Vip Digital.`,
      "",
      "Você já pode acessar o painel e montar os treinos da semana desse aluno.",
      "",
      weeklyText,
      "",
      `Entrar no sistema: ${loginUrl}`,
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
        <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
          <h2 style="color:#D4A373; margin:0 0 16px;">Novo aluno vinculado</h2>

          <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
            Olá, <strong>${safeProfessorName}</strong>!
          </p>

          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            O aluno <strong style="color:#f5f5f5;">${safeStudentName}</strong> foi vinculado ao seu acompanhamento no Funcional Vip Digital.
          </p>

          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            Você já pode acessar o painel e montar os treinos da semana desse aluno.
          </p>

          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            ${safeWeeklyText}
          </p>

          <a href="${loginUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px;">
            Acessar painel
          </a>

          <p style="color:#6b6b6b; font-size:11px; margin-top:20px;">
            Este é um aviso automático do Funcional Vip Digital.
          </p>
        </div>
      </div>
    `;

    notificationTasks.push(
      sendEmail({
        to: professor.email,
        subject: title,
        text,
        html,
      })
    );
  }

  await Promise.allSettled(notificationTasks);
}

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const role = normalizeRole(currentUser.role);

  if (role !== "GESTOR" && role !== "ADMIN") {
    return NextResponse.json(
      { error: "Apenas gestores podem vincular alunos" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const studentId = String(body.studentId || "").trim();
    const professorId = String(body.professorId || "").trim();
    const contractedTrainingDaysPerMonth = parseOptionalInt(
      body.contractedTrainingDaysPerMonth ?? body.trainingDaysPerMonth ?? body.daysPerMonth
    );

    if (!studentId || !professorId) {
      return NextResponse.json(
        { error: "studentId e professorId são obrigatórios" },
        { status: 400 }
      );
    }

    if (
      (body.contractedTrainingDaysPerMonth !== undefined ||
        body.trainingDaysPerMonth !== undefined ||
        body.daysPerMonth !== undefined) &&
      contractedTrainingDaysPerMonth === undefined
    ) {
      return NextResponse.json(
        { error: "Informe uma quantidade válida de dias contratados por mês." },
        { status: 400 }
      );
    }

    const professor = await prisma.user.findFirst({
      where: {
        id: professorId,
        role: { in: ["PROFESSOR", "TEACHER"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (!professor) {
      return NextResponse.json(
        { error: "Professor não encontrado" },
        { status: 404 }
      );
    }

    const previousStudent = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        userId: true,
        contractedTrainingDaysPerMonth: true,
      },
    });

    if (!previousStudent) {
      return NextResponse.json(
        { error: "Aluno não encontrado" },
        { status: 404 }
      );
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: {
        userId: professor.id,
        ...(contractedTrainingDaysPerMonth !== undefined && {
          contractedTrainingDaysPerMonth,
        }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        userId: true,
        active: true,
        contractedTrainingDaysPerMonth: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    const professorChanged = previousStudent.userId !== professor.id;

    if (professorChanged) {
      try {
        await notifyProfessorAboutNewStudent({
          professor,
          student: {
            id: updated.id,
            name: updated.name,
            contractedTrainingDaysPerMonth: updated.contractedTrainingDaysPerMonth,
          },
          authorId: currentUser.id,
        });
      } catch (notificationError) {
        console.error(
          "Erro ao notificar professor sobre novo aluno vinculado:",
          notificationError
        );
      }
    }

    return NextResponse.json({ success: true, student: updated });
  } catch (error) {
    console.error("Erro ao vincular aluno:", error);
    return NextResponse.json({ error: "Erro ao vincular aluno" }, { status: 500 });
  }
}

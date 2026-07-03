import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { sendEmail } from "@/lib/sendEmail";

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

async function getStudentEmail(student: {
  email?: string | null;
  userAuthId?: string | null;
}): Promise<string | null> {
  if (student.email) return student.email;

  if (!student.userAuthId) return null;

  const userAuth = await prisma.user.findUnique({
    where: { id: student.userAuthId },
    select: { email: true },
  });

  return userAuth?.email || null;
}

async function getFallbackNoticeAuthorId(studentProfessorId?: string | null): Promise<string | null> {
  if (studentProfessorId) return studentProfessorId;

  const gestor = await prisma.user.findFirst({
    where: {
      role: {
        in: ["GESTOR", "ADMIN"],
      },
    },
    select: {
      id: true,
    },
  });

  return gestor?.id || null;
}

async function notifyWorkoutAvailable({
  studentId,
  planName,
  isFirstWorkoutPlan,
  authorId,
}: {
  studentId: string;
  planName: string;
  isFirstWorkoutPlan: boolean;
  authorId: string | null;
}) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      email: true,
      userAuthId: true,
    },
  });

  if (!student) return;

  const studentName = student.name || "Aluno";
  const studentEmail = await getStudentEmail(student);
  const loginUrl = getAppLoginUrl();

  const title = isFirstWorkoutPlan
    ? "Seu primeiro treino está disponível"
    : "Seu treino da semana está disponível";

  const content = isFirstWorkoutPlan
    ? [
        "Seu primeiro treino já está disponível no painel do aluno.",
        "",
        "Antes de começar, separe uns 10 minutinhos para olhar o treino com calma.",
        "Veja os exercícios, imagens e orientações. Se surgir alguma dúvida, envie uma mensagem pelo chat antes de executar.",
      ].join("\n")
    : [
        "Seu treino da semana está disponível no painel do aluno.",
        "",
        "Acesse o sistema para visualizar as orientações e seguir sua programação.",
      ].join("\n");

  const notificationTasks: Promise<unknown>[] = [];

  if (authorId) {
    notificationTasks.push(
      prisma.notice.create({
        data: {
          title,
          content,
          type: "WORKOUT",
          targetRole: "STUDENT",
          studentId,
          authorId,
        },
      })
    );
  }

  if (studentEmail) {
    const safeStudentName = escapeHtml(studentName);
    const safePlanName = escapeHtml(planName);

    const subject = title;

    const text = isFirstWorkoutPlan
      ? [
          `Olá, ${studentName}!`,
          "",
          `Seu primeiro treino (${planName}) está disponível no Funcional Vip Digital.`,
          "",
          "Antes de começar, separe uns 10 minutinhos para olhar o treino com calma.",
          "Veja os exercícios, imagens e orientações. Se surgir alguma dúvida, envie uma mensagem pelo chat antes de executar.",
          "",
          `Acessar o sistema: ${loginUrl}`,
        ].join("\n")
      : [
          `Olá, ${studentName}!`,
          "",
          `Seu treino da semana (${planName}) está disponível no Funcional Vip Digital.`,
          "",
          "Acesse seu painel do aluno para visualizar as orientações e seguir sua programação.",
          "",
          `Acessar o sistema: ${loginUrl}`,
        ].join("\n");

    const introHtml = isFirstWorkoutPlan
      ? `
          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            Seu primeiro treino, <strong style="color:#f5f5f5;">${safePlanName}</strong>, está disponível no Funcional Vip Digital.
          </p>

          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            Antes de começar, separe uns 10 minutinhos para olhar o treino com calma.
            Veja os exercícios, imagens e orientações. Se surgir alguma dúvida, envie uma mensagem pelo chat antes de executar.
          </p>
        `
      : `
          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            Seu treino da semana, <strong style="color:#f5f5f5;">${safePlanName}</strong>, está disponível no Funcional Vip Digital.
          </p>

          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            Acesse seu painel do aluno para visualizar as orientações e seguir sua programação.
          </p>
        `;

    const html = `
      <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
        <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
          <h2 style="color:#D4A373; margin:0 0 16px;">${escapeHtml(title)}</h2>

          <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
            Olá, <strong>${safeStudentName}</strong>!
          </p>

          ${introHtml}

          <a href="${loginUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px;">
            Acessar meu treino
          </a>

          <p style="color:#6b6b6b; font-size:11px; margin-top:20px;">
            Este é um aviso automático do Funcional Vip Digital.
          </p>
        </div>
      </div>
    `;

    notificationTasks.push(
      sendEmail({
        to: studentEmail,
        subject,
        text,
        html,
      })
    );
  }

  if (notificationTasks.length > 0) {
    await Promise.allSettled(notificationTasks);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const currentUserId = sessionUser?.id ? String(sessionUser.id) : null;

    const body = await req.json();
    const { studentId, name, description, date, notes, exercises = [] } = body;

    if (!studentId || typeof studentId !== "string") {
      return NextResponse.json(
        { error: "studentId is required and must be a string" },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "name is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!Array.isArray(exercises)) {
      return NextResponse.json(
        { error: "exercises must be an array" },
        { status: 400 }
      );
    }

    const studentExists = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        email: true,
        userId: true,
        userAuthId: true,
      },
    });

    if (!studentExists) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    const existingWorkoutPlanCount = await prisma.workoutPlan.count({
      where: { studentId },
    });

    const isFirstWorkoutPlan = existingWorkoutPlanCount === 0;

    const normalizedExercises = exercises.map((ex: any, index: number) => ({
      name: ex.name,
      description: ex.description,
      series: ex.series,
      reps: ex.reps,
      weight: ex.weight,
      restTime: ex.restTime,
      notes: ex.notes,
      order: typeof ex.order === "number" ? ex.order : index,
      videoUrl: ex.videoUrl,
      imageUrl: ex.imageUrl,
    }));

    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.workoutPlan.create({
        data: {
          studentId,
          name: name.trim(),
          description: description?.trim() || null,
          date: date ? new Date(date + "T12:00:00") : null,
          notes: notes?.trim() || null,
          exercises: {
            create: normalizedExercises,
          },
        },
        include: {
          exercises: {
            orderBy: { order: "asc" },
          },
        },
      });

      // CRIAR TAMBÉM UM Workout COM status "PENDENTE"
      // para que o dashboard possa contabilizar os treinos pendentes
      await tx.workout.create({
        data: {
          studentId,
          workoutPlanId: plan.id,
          date: date ? new Date(date + "T12:00:00") : new Date(),
          status: "PENDENTE",
        },
      });

      return plan;
    });

    try {
      const fallbackAuthorId = await getFallbackNoticeAuthorId(studentExists.userId);
      const authorId = currentUserId || fallbackAuthorId;

      await notifyWorkoutAvailable({
        studentId,
        planName: result.name,
        isFirstWorkoutPlan,
        authorId,
      });
    } catch (notificationError) {
      console.error("Erro ao notificar aluno sobre novo treino:", notificationError);
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const studentId = searchParams.get("studentId");

    if (id) {
      const plan = await prisma.workoutPlan.findUnique({
        where: { id },
        include: {
          exercises: {
            orderBy: { order: "asc" },
          },
        },
      });
      if (!plan) {
        return NextResponse.json(
          { error: "Workout plan not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(plan);
    }

    if (studentId) {
      const plans = await prisma.workoutPlan.findMany({
        where: { studentId },
        include: {
          exercises: {
            orderBy: { order: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(plans);
    }

    return NextResponse.json(
      { error: "Provide either id or studentId query parameter" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("GET /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, description, notes } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (notes !== undefined) data.notes = notes;

    const plan = await prisma.workoutPlan.update({
      where: { id },
      data,
      include: {
        exercises: {
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json(plan);
  } catch (error: any) {
    console.error("PUT /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const planExists = await prisma.workoutPlan.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!planExists) {
      return NextResponse.json(
        { error: "Workout plan not found" },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.exercise.deleteMany({
        where: { workoutPlanId: id },
      });
      await tx.workout.deleteMany({
        where: { workoutPlanId: id },
      });
      await tx.workoutPlan.delete({
        where: { id },
      });
    });

    return NextResponse.json({ success: true, deleted: id });
  } catch (error: any) {
    console.error("DELETE /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PackageStatus, Prisma, TaskStatus } from "@prisma/client";
import { readSmartPlanData } from "@/lib/task-plan";
import { taskWeekIsLocked } from "@/lib/week-preview";


function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function validYmd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00.000Z`).getTime());
}

function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function dayOfWeekFromYmd(ymd: string): number {
  return new Date(`${ymd}T12:00:00.000Z`).getUTCDay();
}

function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const total = (hours * 60 + mins + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function durationMinutes(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return duration > 0 ? duration : 30;
}

function updatePlanSchedule(value: unknown, ymd: string, time: string) {
  const plan = readSmartPlanData(value);
  if (!plan) return value;
  const destinations = plan.destinations?.map((destination) => ({
    ...destination,
    scheduledAt: `${ymd}T${time}:00-03:00`,
  }));
  return {
    ...plan,
    destinations,
    publicationInstruction: plan.stage === "PUBLICATION"
      ? `Esta publicação foi reagendada para ${ymd.split("-").reverse().join("/")} às ${time}. Use somente os arquivos aprovados em Pacotes da IA.`
      : plan.publicationInstruction,
  };
}


async function updateVideoWorkflow(taskId: string, body: Record<string, unknown>) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  const plan = readSmartPlanData(task.planData);
  if (!plan || plan.stage !== "PRODUCTION") {
    return NextResponse.json({ error: "Esta tarefa não possui um fluxo de produção de vídeo." }, { status: 400 });
  }

  const currentWorkflow = plan.videoWorkflow || {};
  const nextWorkflow = { ...currentWorkflow };
  if (typeof body.productionMode === "string" && ["AI", "RECORDED", "MIXED", "ZSKY_CAPCUT", "RECORDED_CAPCUT"].includes(body.productionMode)) {
    nextWorkflow.productionMode = body.productionMode as "AI" | "RECORDED" | "MIXED" | "ZSKY_CAPCUT" | "RECORDED_CAPCUT";
  }
  if (typeof body.finalAssetId === "string") nextWorkflow.finalAssetId = body.finalAssetId;
  if (typeof body.finalFileName === "string") nextWorkflow.finalFileName = body.finalFileName;
  if (typeof body.finalDurationSeconds === "number" && Number.isFinite(body.finalDurationSeconds)) nextWorkflow.finalDurationSeconds = body.finalDurationSeconds;
  if (Number.isInteger(body.finalWidth)) nextWorkflow.finalWidth = body.finalWidth as number;
  if (Number.isInteger(body.finalHeight)) nextWorkflow.finalHeight = body.finalHeight as number;
  if (typeof body.finalOrientation === "string" && ["vertical", "horizontal", "square"].includes(body.finalOrientation)) {
    nextWorkflow.finalOrientation = body.finalOrientation as "vertical" | "horizontal" | "square";
  }
  if (typeof body.validatedAt === "string") nextWorkflow.validatedAt = body.validatedAt;

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { planData: json({ ...plan, videoWorkflow: nextWorkflow }) },
    include: { subtasks: true },
  });
  return NextResponse.json(updated);
}


async function markPublicationPublished(taskId: string) {
  const publicationTask = await prisma.task.findUnique({
    where: { id: taskId },
    include: { subtasks: true },
  });
  if (!publicationTask) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  const plan = readSmartPlanData(publicationTask.planData);
  if (!plan || plan.stage !== "PUBLICATION") {
    return NextResponse.json({ error: "Esta tarefa não é uma publicação agendada." }, { status: 400 });
  }
  if (publicationTask.status !== TaskStatus.READY_TO_PUBLISH && publicationTask.status !== TaskStatus.DONE) {
    return NextResponse.json({ error: "O conteúdo ainda não foi marcado como pronto para publicação." }, { status: 409 });
  }

  const sourceTask = plan.sourcePlanKey
    ? await prisma.task.findUnique({
        where: { planKey: plan.sourcePlanKey },
        include: {
          aiJobs: {
            orderBy: { createdAt: "desc" },
            include: { packages: { orderBy: { createdAt: "desc" }, include: { items: true } } },
          },
        },
      })
    : null;

  const packages = (sourceTask?.aiJobs.flatMap((job) => job.packages) || [])
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const itemPackage = packages.find(
    (item) => item.status === PackageStatus.APPROVED || item.status === PackageStatus.PUBLISHED,
  );
  if (!itemPackage) {
    return NextResponse.json({ error: "Não foi encontrado um pacote aprovado para registrar esta publicação." }, { status: 409 });
  }

  const publishedAt = new Date();
  const updatedTask = await prisma.$transaction(async (tx) => {
    await tx.contentItem.updateMany({
      where: { packageId: itemPackage.id },
      data: { publishedAt },
    });
    await tx.aiPackage.update({
      where: { id: itemPackage.id },
      data: { status: "PUBLISHED" },
    });
    if (sourceTask) {
      await tx.task.update({
        where: { id: sourceTask.id },
        data: { status: TaskStatus.DONE, contentReadyAt: sourceTask.contentReadyAt || publishedAt },
      });
      await tx.subtask.updateMany({ where: { taskId: sourceTask.id }, data: { completed: true } });
    }
    await tx.subtask.updateMany({ where: { taskId: publicationTask.id }, data: { completed: true } });
    return tx.task.update({
      where: { id: publicationTask.id },
      data: { status: TaskStatus.DONE, reminderSentAt: null },
      include: { subtasks: true },
    });
  });

  return NextResponse.json({ task: updatedTask, packageId: itemPackage.id, publishedAt });
}

async function reschedulePublication(taskId: string, body: Record<string, unknown>) {
  if (!validYmd(body.plannedDate) || !validTime(body.startTime)) {
    return NextResponse.json({ error: "Informe uma data e um horário válidos." }, { status: 400 });
  }

  const newDateYmd = body.plannedDate;
  const newStartTime = body.startTime;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
  const plan = readSmartPlanData(task.planData);
  if (plan?.stage !== "PUBLICATION") {
    return NextResponse.json({ error: "Esta tarefa não é uma publicação agendada." }, { status: 400 });
  }

  const plannedDate = new Date(`${newDateYmd}T12:00:00.000Z`);
  const duration = durationMinutes(task.startTime, task.endTime);
  const endTime = addMinutes(newStartTime, duration);
  const updatedPlan = updatePlanSchedule(task.planData, newDateYmd, newStartTime);
  const scheduledAt = new Date(`${newDateYmd}T${newStartTime}:00-03:00`);

  const sourceTask = plan.sourcePlanKey
    ? await prisma.task.findUnique({
        where: { planKey: plan.sourcePlanKey },
        include: {
          aiJobs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { packages: { orderBy: { createdAt: "desc" }, take: 1 } },
          },
        },
      })
    : null;
  const packageId = sourceTask?.aiJobs[0]?.packages[0]?.id;

  const updated = await prisma.$transaction(async (tx) => {
    const publicationTask = await tx.task.update({
      where: { id: task.id },
      data: {
        plannedDate,
        dayOfWeek: dayOfWeekFromYmd(newDateYmd),
        startTime: newStartTime,
        endTime,
        planData: json(updatedPlan),
        placements: json(readSmartPlanData(updatedPlan)?.destinations || []),
        reminderSentAt: null,
      },
      include: { subtasks: true },
    });

    if (sourceTask) {
      const sourcePlan = updatePlanSchedule(sourceTask.planData, newDateYmd, newStartTime);
      await tx.task.update({
        where: { id: sourceTask.id },
        data: {
          planData: json(sourcePlan),
          placements: json(readSmartPlanData(sourcePlan)?.destinations || []),
        },
      });
    }

    if (packageId) {
      await tx.contentItem.updateMany({
        where: { packageId },
        data: { scheduledAt },
      });
    }

    return publicationTask;
  });

  return NextResponse.json(updated);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession();
    const body = await request.json();
    const executionTarget = await prisma.task.findUnique({ where: { id: params.id }, select: { plannedDate: true } });
    if (executionTarget && taskWeekIsLocked(executionTarget.plannedDate)) {
      return NextResponse.json(
        { error: "Esta tarefa pertence à próxima semana. No domingo ela fica disponível somente para consulta e a execução é liberada na segunda-feira." },
        { status: 409 },
      );
    }

    if (body.action === "reschedulePublication") {
      return reschedulePublication(params.id, body);
    }
    if (body.action === "markPublicationPublished") {
      return markPublicationPublished(params.id);
    }
    if (body.action === "updateVideoWorkflow") {
      return updateVideoWorkflow(params.id, body);
    }

    const data: Record<string, unknown> = {};
    if (typeof body.title === "string") data.title = body.title;
    if (typeof body.description === "string" || body.description === null) data.description = body.description;
    if (typeof body.status === "string" && (Object.values(TaskStatus) as string[]).includes(body.status)) {
      data.status = body.status as TaskStatus;
    }
    if (typeof body.startTime === "string") data.startTime = body.startTime;
    if (typeof body.endTime === "string") data.endTime = body.endTime;
    if (Number.isInteger(body.dayOfWeek)) data.dayOfWeek = body.dayOfWeek;
    const task = await prisma.task.update({ where: { id: params.id }, data, include: { subtasks: true } });
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    console.error("Erro ao atualizar tarefa:", error);
    return NextResponse.json({ error: "Erro ao atualizar tarefa." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession();
    await prisma.task.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    return NextResponse.json({ error: "Erro ao excluir tarefa." }, { status: 500 });
  }
}

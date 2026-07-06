import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const configuredSecret =
    process.env.CRON_SECRET ||
    process.env.VERCEL_CRON_SECRET ||
    process.env.NEXT_PUBLIC_CRON_SECRET;

  if (!configuredSecret) {
    return true;
  }

  const headerSecret = request.headers.get("x-cron-secret");
  const querySecret = request.nextUrl.searchParams.get("secret");

  return headerSecret === configuredSecret || querySecret === configuredSecret;
}

async function refreshStudent(studentId: string) {
  const now = new Date();

  const activeContract = await prisma.studentContract.findFirst({
    where: {
      studentId,
      status: "ACTIVE",
      startDate: {
        lte: now,
      },
      endDate: {
        gte: now,
      },
    },
    orderBy: {
      endDate: "desc",
    },
  });

  if (activeContract) {
    await prisma.student.update({
      where: {
        id: studentId,
      },
      data: {
        commercialStatus:
          activeContract.type === "TRIAL" ? "EXPERIENCIA_ATIVA" : "CONTRATO_ATIVO",
        contractedTrainingDaysPerMonth: activeContract.workoutsPerMonth,
        ...(activeContract.professorId ? { userId: activeContract.professorId } : {}),
      },
    });

    return;
  }

  const suspendedContract = await prisma.studentContract.findFirst({
    where: {
      studentId,
      status: "SUSPENDED",
    },
    select: {
      id: true,
    },
  });

  await prisma.student.update({
    where: {
      id: studentId,
    },
    data: {
      commercialStatus: suspendedContract ? "SUSPENSO_POR_PAGAMENTO" : "SEM_CONTRATO_ATIVO",
      contractedTrainingDaysPerMonth: suspendedContract ? undefined : null,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const now = new Date();

    const expiredContracts = await prisma.studentContract.findMany({
      where: {
        status: "ACTIVE",
        endDate: {
          lt: now,
        },
      },
      select: {
        id: true,
        studentId: true,
      },
    });

    if (expiredContracts.length) {
      await prisma.studentContract.updateMany({
        where: {
          id: {
            in: expiredContracts.map((contract) => contract.id),
          },
        },
        data: {
          status: "FINALIZED",
          commercialStatus: "FINALIZADO",
          finalizedAt: now,
        },
      });
    }

    const affectedStudentIds = Array.from(
      new Set(expiredContracts.map((contract) => contract.studentId))
    );

    for (const studentId of affectedStudentIds) {
      await refreshStudent(studentId);
    }

    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);

    const endingSoon = await prisma.studentContract.count({
      where: {
        status: "ACTIVE",
        endDate: {
          gte: now,
          lte: in7Days,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      finalizedContracts: expiredContracts.length,
      refreshedStudents: affectedStudentIds.length,
      endingSoonContracts: endingSoon,
    });
  } catch (error: any) {
    console.error("GET /api/cron/contracts error:", error);

    return NextResponse.json(
      {
        error: "Erro ao atualizar contratos.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

import { prisma } from "@/lib/prisma";

const ACTIVE_STATUSES = ["ABERTO", "REQUER_REVISAO", "EM_REVISAO"];
const MERGEABLE_CARE_TYPES = ["PAUSA_POR_CUIDADO", "RELATO_DOR_DUVIDA", "DOR_DESCONFORTO"];

function appendUniqueSection(base: string | null | undefined, section: string): string {
  const current = String(base || "").trim();
  const next = String(section || "").trim();

  if (!next) return current;
  if (current.includes(next)) return current;

  return [current, next].filter(Boolean).join("\n\n");
}

export async function consolidateActiveCareEvents({
  studentIds,
}: {
  studentIds?: string[];
} = {}): Promise<{ pausesReviewed: number; duplicatesResolved: number }> {
  const normalizedStudentIds = Array.from(
    new Set((studentIds || []).map((id) => String(id || "").trim()).filter(Boolean))
  );

  const activePauses = await prisma.studentCareEvent.findMany({
    where: {
      eventType: "PAUSA_POR_CUIDADO",
      status: { in: ACTIVE_STATUSES },
      ...(normalizedStudentIds.length ? { studentId: { in: normalizedStudentIds } } : {}),
    },
    select: {
      id: true,
      studentId: true,
      description: true,
      studentMessage: true,
      professorMessage: true,
      resolutionNotes: true,
      professorId: true,
      authorId: true,
      contractId: true,
      weekStart: true,
      weekEnd: true,
      createdAt: true,
    },
    orderBy: [{ studentId: "asc" }, { createdAt: "desc" }],
  });

  const canonicalPauses = activePauses.filter(
    (pause, index, list) => list.findIndex((item) => item.studentId === pause.studentId) === index
  );

  let duplicatesResolved = 0;

  for (const pause of canonicalPauses) {
    const duplicates = await prisma.studentCareEvent.findMany({
      where: {
        studentId: pause.studentId,
        id: { not: pause.id },
        eventType: { in: MERGEABLE_CARE_TYPES },
        status: { in: ACTIVE_STATUSES },
      },
      select: {
        id: true,
        eventType: true,
        description: true,
        studentMessage: true,
        professorMessage: true,
        resolutionNotes: true,
        professorId: true,
        authorId: true,
        contractId: true,
        weekStart: true,
        weekEnd: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (!duplicates.length) continue;

    let mergedDescription = String(pause.description || "").trim();
    let mergedResolutionNotes = String(pause.resolutionNotes || "").trim();
    let latestStudentMessage = pause.studentMessage || null;
    let latestProfessorMessage = pause.professorMessage || null;
    let professorId = pause.professorId || null;
    let authorId = pause.authorId || null;
    let contractId = pause.contractId || null;
    let weekStart = pause.weekStart || null;
    let weekEnd = pause.weekEnd || null;

    for (const duplicate of duplicates) {
      const duplicateDescription = String(duplicate.description || "").trim();
      if (duplicateDescription) {
        mergedDescription = appendUniqueSection(
          mergedDescription,
          `--- Atualização incorporada ao evento de pausa ---\n${duplicateDescription}`
        );
      }

      const duplicateNotes = String(duplicate.resolutionNotes || "").trim();
      if (duplicateNotes) {
        mergedResolutionNotes = appendUniqueSection(
          mergedResolutionNotes,
          `--- Anotação incorporada do evento ${duplicate.id} ---\n${duplicateNotes}`
        );
      }

      if (duplicate.studentMessage) latestStudentMessage = duplicate.studentMessage;
      if (duplicate.professorMessage) latestProfessorMessage = duplicate.professorMessage;
      professorId = professorId || duplicate.professorId || null;
      authorId = authorId || duplicate.authorId || null;
      contractId = contractId || duplicate.contractId || null;
      weekStart = weekStart || duplicate.weekStart || null;
      weekEnd = weekEnd || duplicate.weekEnd || null;
    }

    const resolvedAt = new Date();

    await prisma.$transaction([
      prisma.studentCareEvent.update({
        where: { id: pause.id },
        data: {
          description: mergedDescription || pause.description,
          resolutionNotes: mergedResolutionNotes || pause.resolutionNotes,
          studentMessage: latestStudentMessage,
          professorMessage: latestProfessorMessage,
          professorId,
          authorId,
          contractId,
          weekStart,
          weekEnd,
        },
      }),
      ...duplicates.map((duplicate) =>
        prisma.studentCareEvent.update({
          where: { id: duplicate.id },
          data: {
            status: "RESOLVIDO",
            resolvedAt,
            resolutionNotes: appendUniqueSection(
              duplicate.resolutionNotes,
              `Evento encerrado automaticamente por duplicidade. O acompanhamento permanece no evento de pausa por cuidado ${pause.id}.`
            ),
          },
        })
      ),
    ]);

    duplicatesResolved += duplicates.length;
  }

  return {
    pausesReviewed: canonicalPauses.length,
    duplicatesResolved,
  };
}

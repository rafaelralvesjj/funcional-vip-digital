import { prisma } from "@/lib/prisma";

const STAFF_ROLES = new Set(["GESTOR", "ADMIN", "PROFESSOR", "TEACHER"]);
const STUDENT_ROLES = new Set(["ALUNO", "STUDENT"]);

function normalizeEmail(value: string | null | undefined): string | null {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

export async function resolveStudentRecipientEmail(input: {
  studentId?: string | null;
  studentEmail?: string | null;
  userAuthId?: string | null;
}): Promise<string | null> {
  const directEmail = normalizeEmail(input.studentEmail);

  if (input.userAuthId) {
    const linkedUser = await prisma.user.findUnique({
      where: { id: input.userAuthId },
      select: { id: true, email: true, role: true, active: true },
    });

    if (linkedUser?.active !== false && STUDENT_ROLES.has(String(linkedUser?.role || "").toUpperCase())) {
      const linkedEmail = normalizeEmail(linkedUser?.email);
      if (linkedEmail) return linkedEmail;
    }

    if (linkedUser && STAFF_ROLES.has(String(linkedUser.role || "").toUpperCase())) {
      console.error("E-mail de aluno bloqueado: userAuthId aponta para usuário interno", {
        studentId: input.studentId || null,
        userAuthId: input.userAuthId,
        role: linkedUser.role,
      });
      return null;
    }
  }

  if (!directEmail) return null;

  const internalOwner = await prisma.user.findFirst({
    where: {
      email: { equals: directEmail, mode: "insensitive" },
      active: true,
      role: { in: ["GESTOR", "ADMIN", "PROFESSOR", "TEACHER"] },
    },
    select: { id: true, role: true },
  });

  if (internalOwner) {
    console.error("E-mail de aluno bloqueado: endereço pertence a usuário interno", {
      studentId: input.studentId || null,
      email: directEmail,
      internalUserId: internalOwner.id,
      internalRole: internalOwner.role,
    });
    return null;
  }

  return directEmail;
}

export function uniqueValidEmails(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map(normalizeEmail).filter((value): value is string => Boolean(value)))
  );
}

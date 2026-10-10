/**
 * Controle de acesso da rota self-service de modo de treino (POST
 * /api/aluno/workout-method-mode) — exclusiva do próprio aluno autenticado.
 * Nunca usa Student.userId para localizar o aluno-alvo: esse campo é o
 * professor responsável em vários fluxos do projeto (ver
 * app/api/student-care-events/route.ts, app/api/workout/mark-complete/
 * route.ts, app/api/workouts/manage/route.ts etc.), então um professor
 * autenticado jamais pode ser resolvido como o aluno dono da sessão por
 * esta rota.
 */

/** Mesmo mapeamento de app/api/students/ai-summary/route.ts — "ALUNO" -> "STUDENT", "PROFESSOR" -> "TEACHER". */
export function normalizeStudentSelfServiceRole(role: unknown): string {
  const value = String(role || "").trim().toUpperCase();

  if (value === "ALUNO") return "STUDENT";
  if (value === "PROFESSOR") return "TEACHER";

  return value;
}

/** Só o próprio aluno (role STUDENT/ALUNO) pode usar a rota self-service — qualquer outro papel é 403. */
export function isStudentSelfServiceRole(role: unknown): boolean {
  return normalizeStudentSelfServiceRole(role) === "STUDENT";
}

export type StudentSelfServiceWhereClause =
  | { userAuthId: string }
  | { email: { equals: string; mode: "insensitive" } }
  | { userAuth: { email: { equals: string; mode: "insensitive" } } };

/**
 * Filtro Prisma para localizar o PRÓPRIO aluno autenticado. Só aceita
 * userAuthId (o vínculo de login do aluno) e, como fallback só para contas
 * legadas sem userAuthId preenchido, o e-mail do próprio aluno — nunca
 * `Student.userId` (professor responsável, não o aluno da sessão).
 */
export function buildStudentSelfServiceWhere(params: {
  sessionUserId?: string | null;
  sessionEmail?: string | null;
}): StudentSelfServiceWhereClause[] {
  const orWhere: StudentSelfServiceWhereClause[] = [];
  const normalizedEmail = params.sessionEmail?.trim().toLowerCase() || null;

  if (params.sessionUserId) {
    orWhere.push({ userAuthId: params.sessionUserId });
  }

  if (normalizedEmail) {
    orWhere.push({ email: { equals: normalizedEmail, mode: "insensitive" } });
    orWhere.push({ userAuth: { email: { equals: normalizedEmail, mode: "insensitive" } } });
  }

  return orWhere;
}

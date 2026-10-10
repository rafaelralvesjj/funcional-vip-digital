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

export class AmbiguousStudentSelfServiceMatchError extends Error {
  constructor(count: number) {
    super(
      `Encontrados ${count} alunos legados com o mesmo e-mail — resolução ambígua, não é seguro escolher um automaticamente.`
    );
    this.name = "AmbiguousStudentSelfServiceMatchError";
  }
}

/**
 * Decide o aluno a partir de uma lista de candidatos já filtrada pelo
 * chamador (ex.: fallback por e-mail). Zero candidatos: ninguém encontrado.
 * Um candidato: esse é o aluno. Mais de um: a resolução é ambígua — NUNCA
 * escolhe um arbitrariamente (Student.email não é unique), rejeita.
 */
export function resolveStudentSelfServiceMatch<T>(candidates: T[]): T | null {
  if (candidates.length === 0) return null;
  if (candidates.length > 1) throw new AmbiguousStudentSelfServiceMatchError(candidates.length);
  return candidates[0];
}

/**
 * Resolução do aluno dono da sessão em duas etapas, nunca num único OR:
 *
 * 1. Se há session.user.id, procura EXCLUSIVAMENTE por
 *    userAuthId === session.user.id (campo @unique no schema — no máximo um
 *    resultado possível). Encontrando, o e-mail nunca é consultado.
 * 2. Só na ausência de aluno por userAuthId, cai para compatibilidade
 *    legada por e-mail. O chamador (findLegacyByEmail) é responsável por
 *    filtrar só alunos com userAuthId = null — um aluno já vinculado a um
 *    login nunca pode ser "reencontrado" por e-mail. Se mais de um aluno
 *    legado ativo compartilha o e-mail, rejeita como ambíguo (ver
 *    resolveStudentSelfServiceMatch) em vez de usar findFirst arbitrário.
 */
export async function resolveStudentSelfService<T>(params: {
  sessionUserId?: string | null;
  sessionEmail?: string | null;
  findByUserAuthId: (userAuthId: string) => Promise<T | null>;
  findLegacyCandidatesByEmail: (normalizedEmail: string) => Promise<T[]>;
}): Promise<T | null> {
  if (params.sessionUserId) {
    const studentByAuth = await params.findByUserAuthId(params.sessionUserId);
    if (studentByAuth) return studentByAuth;
  }

  const normalizedEmail = params.sessionEmail?.trim().toLowerCase() || null;
  if (!normalizedEmail) return null;

  const legacyCandidates = await params.findLegacyCandidatesByEmail(normalizedEmail);
  return resolveStudentSelfServiceMatch(legacyCandidates);
}

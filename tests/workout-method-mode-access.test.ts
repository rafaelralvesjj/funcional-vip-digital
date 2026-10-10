import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStudentSelfServiceRole,
  isStudentSelfServiceRole,
  buildStudentSelfServiceWhere,
} from '../lib/workout-method-mode-access.ts';

// REVISÃO (PR #13, item 1): POST /api/aluno/workout-method-mode é exclusiva
// do próprio aluno. Student.userId é o professor responsável em vários
// fluxos do projeto — nunca pode ser usado para localizar o aluno-alvo
// desta rota self-service.

test('STUDENT (normalizado a partir de "ALUNO") pode usar a rota self-service', () => {
  assert.equal(isStudentSelfServiceRole('ALUNO'), true);
  assert.equal(isStudentSelfServiceRole('aluno'), true);
  assert.equal(isStudentSelfServiceRole('STUDENT'), true);
});

test('TEACHER/PROFESSOR nunca pode usar a rota self-service (403)', () => {
  assert.equal(isStudentSelfServiceRole('PROFESSOR'), false);
  assert.equal(isStudentSelfServiceRole('TEACHER'), false);
});

test('GESTOR/ADMIN nunca pode usar a rota self-service (403)', () => {
  assert.equal(isStudentSelfServiceRole('GESTOR'), false);
  assert.equal(isStudentSelfServiceRole('ADMIN'), false);
});

test('papel ausente/desconhecido nunca é tratado como STUDENT', () => {
  assert.equal(isStudentSelfServiceRole(null), false);
  assert.equal(isStudentSelfServiceRole(undefined), false);
  assert.equal(isStudentSelfServiceRole(''), false);
  assert.equal(isStudentSelfServiceRole('QUALQUER_COISA'), false);
});

test('normalizeStudentSelfServiceRole mantém o mesmo mapeamento usado no resto do app (ALUNO->STUDENT, PROFESSOR->TEACHER)', () => {
  assert.equal(normalizeStudentSelfServiceRole('ALUNO'), 'STUDENT');
  assert.equal(normalizeStudentSelfServiceRole('PROFESSOR'), 'TEACHER');
  assert.equal(normalizeStudentSelfServiceRole('GESTOR'), 'GESTOR');
});

test('buildStudentSelfServiceWhere NUNCA inclui Student.userId', () => {
  const orWhere = buildStudentSelfServiceWhere({
    sessionUserId: 'qualquer-id-de-sessao',
    sessionEmail: 'aluno@example.com',
  });

  for (const clause of orWhere) {
    assert.ok(!('userId' in clause), 'cláusula não pode conter userId (professor responsável, não o aluno da sessão)');
  }
});

test('buildStudentSelfServiceWhere usa userAuthId quando há sessionUserId', () => {
  const orWhere = buildStudentSelfServiceWhere({ sessionUserId: 'auth-123', sessionEmail: null });

  assert.deepEqual(orWhere, [{ userAuthId: 'auth-123' }]);
});

test('buildStudentSelfServiceWhere cai para e-mail (normalizado) só como fallback legado', () => {
  const orWhere = buildStudentSelfServiceWhere({ sessionUserId: null, sessionEmail: 'Aluno@Example.com ' });

  assert.deepEqual(orWhere, [
    { email: { equals: 'aluno@example.com', mode: 'insensitive' } },
    { userAuth: { email: { equals: 'aluno@example.com', mode: 'insensitive' } } },
  ]);
});

test('sem sessionUserId nem sessionEmail, o filtro fica vazio (rota deve recusar, nunca casar com qualquer aluno)', () => {
  assert.deepEqual(buildStudentSelfServiceWhere({ sessionUserId: null, sessionEmail: null }), []);
});

/**
 * Simula o casamento OR do Prisma contra uma "base" de alunos realista: um
 * professor com vários alunos vinculados por Student.userId (igual ao
 * schema real — ver prisma/schema.prisma). Antes da correção, a rota
 * incluía `{ userId: sessionUserId }` no OR, então logar como esse
 * professor "encontrava" qualquer um desses alunos. Aqui provamos que,
 * usando só o filtro desta lib, nenhum deles nunca casa.
 */
function matchesClause(student: Record<string, unknown>, clause: Record<string, any>): boolean {
  return Object.entries(clause).every(([key, condition]) => {
    const value = student[key];
    if (condition && typeof condition === 'object' && 'equals' in condition) {
      return typeof value === 'string' && value.toLowerCase() === String(condition.equals).toLowerCase();
    }
    if (key === 'userAuth' && condition && typeof condition === 'object') {
      const nested = (student.userAuth as Record<string, unknown> | null) || {};
      return Object.entries(condition).every(([nestedKey, nestedCondition]: [string, any]) =>
        matchesClause(nested, { [nestedKey]: nestedCondition })
      );
    }
    return value === condition;
  });
}

function findMatchingStudent(students: Array<Record<string, unknown>>, orWhere: Record<string, any>[]) {
  return students.find((student) => orWhere.some((clause) => matchesClause(student, clause)));
}

test('professor com vários alunos vinculados por Student.userId nunca consegue alterar nenhum deles por esta rota', () => {
  const professorSessionId = 'professor-1';

  const studentsLinkedToProfessor = [
    { id: 'aluno-a', userId: professorSessionId, userAuthId: 'auth-aluno-a', email: 'a@example.com', userAuth: null },
    { id: 'aluno-b', userId: professorSessionId, userAuthId: 'auth-aluno-b', email: 'b@example.com', userAuth: null },
    { id: 'aluno-c', userId: professorSessionId, userAuthId: null, email: 'c@example.com', userAuth: null },
  ];

  const orWhere = buildStudentSelfServiceWhere({ sessionUserId: professorSessionId, sessionEmail: null });
  const match = findMatchingStudent(studentsLinkedToProfessor, orWhere);

  assert.equal(match, undefined, 'nenhum aluno vinculado por userId pode casar com o filtro self-service');
});

test('o próprio aluno (userAuthId === id da sessão) é encontrado normalmente', () => {
  const sessionUserId = 'auth-aluno-a';
  const students = [
    { id: 'aluno-a', userId: 'professor-1', userAuthId: 'auth-aluno-a', email: 'a@example.com', userAuth: null },
    { id: 'aluno-b', userId: 'professor-1', userAuthId: 'auth-aluno-b', email: 'b@example.com', userAuth: null },
  ];

  const orWhere = buildStudentSelfServiceWhere({ sessionUserId, sessionEmail: null });
  const match = findMatchingStudent(students, orWhere);

  assert.equal((match as any)?.id, 'aluno-a');
});

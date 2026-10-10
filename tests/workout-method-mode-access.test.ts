import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStudentSelfServiceRole,
  isStudentSelfServiceRole,
  resolveStudentSelfService,
  resolveStudentSelfServiceMatch,
  AmbiguousStudentSelfServiceMatchError,
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

// --- resolveStudentSelfServiceMatch -----------------------------------------

test('resolveStudentSelfServiceMatch: zero candidatos -> null (ninguém encontrado)', () => {
  assert.equal(resolveStudentSelfServiceMatch([]), null);
});

test('resolveStudentSelfServiceMatch: um candidato -> esse é o aluno', () => {
  const candidate = { id: 'aluno-1' };
  assert.equal(resolveStudentSelfServiceMatch([candidate]), candidate);
});

test('dois alunos legados com o mesmo e-mail -> rejeita ambiguidade, nunca escolhe um aleatoriamente', () => {
  assert.throws(
    () => resolveStudentSelfServiceMatch([{ id: 'aluno-1' }, { id: 'aluno-2' }]),
    AmbiguousStudentSelfServiceMatchError
  );
});

// --- resolveStudentSelfService (resolução em duas etapas) -------------------

test('sessão com id + email: encontrando por userAuthId, o e-mail NUNCA é consultado', async () => {
  const studentByAuth = { id: 'aluno-1', via: 'userAuthId' };
  let emailLookupCalls = 0;

  const result = await resolveStudentSelfService({
    sessionUserId: 'auth-123',
    sessionEmail: 'aluno@example.com',
    findByUserAuthId: async (userAuthId) => {
      assert.equal(userAuthId, 'auth-123');
      return studentByAuth;
    },
    findLegacyCandidatesByEmail: async () => {
      emailLookupCalls += 1;
      return [];
    },
  });

  assert.equal(result, studentByAuth);
  assert.equal(emailLookupCalls, 0, 'o fallback por e-mail nunca deveria ser chamado');
});

test('userAuthId não encontra ninguém: cai para o fallback por e-mail', async () => {
  const legacyStudent = { id: 'aluno-legado' };

  const result = await resolveStudentSelfService({
    sessionUserId: 'auth-sem-aluno',
    sessionEmail: 'legado@example.com',
    findByUserAuthId: async () => null,
    findLegacyCandidatesByEmail: async (email) => {
      assert.equal(email, 'legado@example.com');
      return [legacyStudent];
    },
  });

  assert.equal(result, legacyStudent);
});

test('e-mail é normalizado (trim + lowercase) antes do fallback legado', async () => {
  let receivedEmail: string | null = null;

  await resolveStudentSelfService({
    sessionUserId: null,
    sessionEmail: '  Aluno@Example.com ',
    findByUserAuthId: async () => null,
    findLegacyCandidatesByEmail: async (email) => {
      receivedEmail = email;
      return [];
    },
  });

  assert.equal(receivedEmail, 'aluno@example.com');
});

test('sem sessionUserId nem sessionEmail: nunca consulta nada, devolve null', async () => {
  let authCalls = 0;
  let emailCalls = 0;

  const result = await resolveStudentSelfService({
    sessionUserId: null,
    sessionEmail: null,
    findByUserAuthId: async () => {
      authCalls += 1;
      return null;
    },
    findLegacyCandidatesByEmail: async () => {
      emailCalls += 1;
      return [];
    },
  });

  assert.equal(result, null);
  assert.equal(authCalls, 0);
  assert.equal(emailCalls, 0);
});

test('dois alunos legados com o mesmo e-mail (via resolveStudentSelfService) rejeita ambiguidade, nunca escolhe um aleatoriamente', async () => {
  await assert.rejects(
    () =>
      resolveStudentSelfService({
        sessionUserId: 'auth-sem-aluno',
        sessionEmail: 'duplicado@example.com',
        findByUserAuthId: async () => null,
        findLegacyCandidatesByEmail: async () => [{ id: 'aluno-1' }, { id: 'aluno-2' }],
      }),
    AmbiguousStudentSelfServiceMatchError
  );
});

/**
 * REVISÃO (rodada anterior do PR #13): antes, o self-service montava um OR
 * único com userAuthId + e-mail no mesmo findFirst. Aqui provamos, com uma
 * base de alunos realista (um professor com vários alunos vinculados por
 * Student.userId, igual ao schema real), que a resolução em duas etapas
 * nunca "encontra" nenhum desses alunos a partir do id de sessão do
 * professor — porque a etapa 1 só olha userAuthId, e esses alunos não têm
 * userAuthId igual ao id do professor.
 */
test('professor com vários alunos vinculados por Student.userId nunca consegue alterar nenhum deles por esta rota', async () => {
  const professorSessionId = 'professor-1';

  const studentsLinkedToProfessor = [
    { id: 'aluno-a', userId: professorSessionId, userAuthId: 'auth-aluno-a' },
    { id: 'aluno-b', userId: professorSessionId, userAuthId: 'auth-aluno-b' },
    { id: 'aluno-c', userId: professorSessionId, userAuthId: null },
  ];

  const result = await resolveStudentSelfService({
    sessionUserId: professorSessionId,
    sessionEmail: null,
    // Simula prisma.student.findFirst({ where: { userAuthId: professorSessionId } })
    findByUserAuthId: async (userAuthId) =>
      studentsLinkedToProfessor.find((student) => student.userAuthId === userAuthId) || null,
    findLegacyCandidatesByEmail: async () => [],
  });

  assert.equal(result, null, 'nenhum aluno vinculado por userId pode ser resolvido pelo id do professor');
});

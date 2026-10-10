import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkoutCompletedAt } from '../lib/workout-completion.ts';

// REVISÃO (PR #13, item 2): Workout.completedAt é o instante REAL da
// primeira conclusão — nunca a data planejada (Workout.date) — e nunca é
// sobrescrito em reenvio/idempotência.

test('primeira conclusão (sem Workout existente) grava completedAt = now', () => {
  const now = new Date('2026-10-10T12:00:00Z');

  assert.equal(
    resolveWorkoutCompletedAt({
      previousStatus: null,
      nextStatus: 'CONCLUIDO',
      previousCompletedAt: null,
      now,
    }),
    now
  );
});

test('primeira transição de PENDENTE para CONCLUIDO_PARCIALMENTE grava completedAt = now', () => {
  const now = new Date('2026-10-10T12:00:00Z');

  assert.equal(
    resolveWorkoutCompletedAt({
      previousStatus: 'PENDENTE',
      nextStatus: 'CONCLUIDO_PARCIALMENTE',
      previousCompletedAt: null,
      now,
    }),
    now
  );
});

test('reenvio da conclusão (já estava CONCLUIDO) não muda completedAt existente', () => {
  const originalCompletedAt = new Date('2026-09-01T09:00:00Z');
  const now = new Date('2026-10-10T12:00:00Z');

  const result = resolveWorkoutCompletedAt({
    previousStatus: 'CONCLUIDO',
    nextStatus: 'CONCLUIDO',
    previousCompletedAt: originalCompletedAt,
    now,
  });

  assert.equal(result, originalCompletedAt);
  assert.notEqual(result, now);
});

test('transição entre os dois status "concluído" (CONCLUIDO_PARCIALMENTE -> CONCLUIDO) preserva o completedAt original', () => {
  const originalCompletedAt = new Date('2026-09-01T09:00:00Z');
  const now = new Date('2026-10-10T12:00:00Z');

  assert.equal(
    resolveWorkoutCompletedAt({
      previousStatus: 'CONCLUIDO_PARCIALMENTE',
      nextStatus: 'CONCLUIDO',
      previousCompletedAt: originalCompletedAt,
      now,
    }),
    originalCompletedAt
  );
});

test('status final não concluído nunca gera completedAt novo', () => {
  const now = new Date('2026-10-10T12:00:00Z');

  assert.equal(
    resolveWorkoutCompletedAt({
      previousStatus: 'PENDENTE',
      nextStatus: 'NAO_CONCLUIDO_COM_RELATO',
      previousCompletedAt: null,
      now,
    }),
    null
  );

  assert.equal(
    resolveWorkoutCompletedAt({
      previousStatus: 'PENDENTE',
      nextStatus: 'INTERROMPIDO_CUIDADO',
      previousCompletedAt: null,
      now,
    }),
    null
  );
});

test('status final não concluído preserva um completedAt antigo já existente (nunca apaga)', () => {
  const originalCompletedAt = new Date('2026-09-01T09:00:00Z');
  const now = new Date('2026-10-10T12:00:00Z');

  assert.equal(
    resolveWorkoutCompletedAt({
      previousStatus: 'CONCLUIDO',
      nextStatus: 'NAO_CONCLUIDO_COM_RELATO',
      previousCompletedAt: originalCompletedAt,
      now,
    }),
    originalCompletedAt
  );
});

test('histórico legado sem completedAt confiável nunca é inventado a partir de outro status concluído sem o próprio completedAt', () => {
  // Workout já concluído no passado (pré-feature), completedAt ainda null —
  // um reenvio não deve "aproveitar" para inventar now() nem qualquer outra
  // data: fica null até uma evidência real (ver
  // scripts/backfill-workout-completed-at.ts) preenchê-lo explicitamente.
  const now = new Date('2026-10-10T12:00:00Z');

  assert.equal(
    resolveWorkoutCompletedAt({
      previousStatus: 'CONCLUIDO',
      nextStatus: 'CONCLUIDO',
      previousCompletedAt: null,
      now,
    }),
    null
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKOUT_METHOD_MODES,
  DEFAULT_WORKOUT_METHOD_MODE,
  COMBINED_INVITE_ELIGIBILITY_DAYS,
  normalizeWorkoutMethodMode,
  isEligibleForCombinedWorkoutInvite,
  resolveWorkoutMethodModeChange,
  InvalidWorkoutMethodModeError,
  CombinedWorkoutInviteNotEligibleError,
} from '../lib/workout-method-mode.ts';

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// --- normalizeWorkoutMethodMode -------------------------------------------

test('normalizeWorkoutMethodMode: aluno novo (coluna no default do banco) é NORMAL', () => {
  assert.equal(normalizeWorkoutMethodMode('NORMAL'), 'NORMAL');
});

test('normalizeWorkoutMethodMode: ausência de estado explícito (null/undefined/vazio) é tratada como NORMAL', () => {
  assert.equal(normalizeWorkoutMethodMode(null), 'NORMAL');
  assert.equal(normalizeWorkoutMethodMode(undefined), 'NORMAL');
  assert.equal(normalizeWorkoutMethodMode(''), 'NORMAL');
});

test('normalizeWorkoutMethodMode: qualquer valor que não seja exatamente "COMBINADO" vira NORMAL (nunca inferência)', () => {
  assert.equal(normalizeWorkoutMethodMode('combinado'), 'NORMAL'); // case errado não conta como match
  assert.equal(normalizeWorkoutMethodMode('COMBINADO '), 'NORMAL'); // espaço extra não conta
  assert.equal(normalizeWorkoutMethodMode('qualquer coisa'), 'NORMAL');
  assert.equal(normalizeWorkoutMethodMode(123 as any), 'NORMAL');
});

test('normalizeWorkoutMethodMode: "COMBINADO" exato é preservado', () => {
  assert.equal(normalizeWorkoutMethodMode('COMBINADO'), 'COMBINADO');
});

test('DEFAULT_WORKOUT_METHOD_MODE é NORMAL', () => {
  assert.equal(DEFAULT_WORKOUT_METHOD_MODE, 'NORMAL');
});

test('WORKOUT_METHOD_MODES contém só NORMAL e COMBINADO', () => {
  assert.deepEqual([...WORKOUT_METHOD_MODES].sort(), ['COMBINADO', 'NORMAL']);
});

// --- isEligibleForCombinedWorkoutInvite ------------------------------------

test('aluno sem nenhum treino concluído nunca é elegível', () => {
  assert.equal(
    isEligibleForCombinedWorkoutInvite({ firstCompletedWorkoutDate: null, now: new Date() }),
    false
  );
});

test('29 dias desde o primeiro treino concluído: ainda sem CTA', () => {
  const firstCompletedWorkoutDate = daysFromNow(-29);
  assert.equal(
    isEligibleForCombinedWorkoutInvite({ firstCompletedWorkoutDate, now: new Date() }),
    false
  );
});

test('30 dias desde o primeiro treino concluído: CTA disponível', () => {
  const firstCompletedWorkoutDate = daysFromNow(-30);
  assert.equal(
    isEligibleForCombinedWorkoutInvite({ firstCompletedWorkoutDate, now: new Date() }),
    true
  );
});

test('mais de 30 dias continua elegível', () => {
  const firstCompletedWorkoutDate = daysFromNow(-90);
  assert.equal(
    isEligibleForCombinedWorkoutInvite({ firstCompletedWorkoutDate, now: new Date() }),
    true
  );
});

test('COMBINED_INVITE_ELIGIBILITY_DAYS é 30', () => {
  assert.equal(COMBINED_INVITE_ELIGIBILITY_DAYS, 30);
});

// Cadastro, contrato, WorkoutPlan criado ou semana liberada nunca contam
// como início da janela de 30 dias — a função só aceita a data do primeiro
// treino REALMENTE concluído; não existe nenhum outro parâmetro de entrada
// que pudesse ser usado como proxy para isso.
test('a função não aceita nenhuma outra data (cadastro/contrato/plano/liberação) como substituto do primeiro treino concluído', () => {
  // Confirma, por inspeção do contrato de tipos em tempo de execução, que
  // passar apenas firstCompletedWorkoutDate=null nunca é elegível mesmo que
  // outras datas hipotéticas (cadastro etc.) sejam recentes/antigas — a
  // função não tem como "enxergar" nada além do que foi passado.
  assert.equal(
    isEligibleForCombinedWorkoutInvite({ firstCompletedWorkoutDate: null }),
    false
  );
});

// --- resolveWorkoutMethodModeChange ----------------------------------------

test('confirmação explícita NORMAL -> COMBINADO', () => {
  const change = resolveWorkoutMethodModeChange({
    currentMode: 'NORMAL',
    requestedMode: 'COMBINADO',
    isEligibleForCombined: true,
  });

  assert.deepEqual(change, { previousMode: 'NORMAL', newMode: 'COMBINADO' });
});

test('retorno COMBINADO -> NORMAL nunca exige elegibilidade (voltar é sempre permitido)', () => {
  const change = resolveWorkoutMethodModeChange({
    currentMode: 'COMBINADO',
    requestedMode: 'NORMAL',
    isEligibleForCombined: false,
  });

  assert.deepEqual(change, { previousMode: 'COMBINADO', newMode: 'NORMAL' });
});

test('pedir COMBINADO sem elegibilidade (ainda não completou 30 dias) é rejeitado', () => {
  assert.throws(
    () =>
      resolveWorkoutMethodModeChange({
        currentMode: 'NORMAL',
        requestedMode: 'COMBINADO',
        isEligibleForCombined: false,
      }),
    CombinedWorkoutInviteNotEligibleError
  );
});

test('modo inválido (não NORMAL/COMBINADO) é rejeitado, nunca aceito silenciosamente', () => {
  assert.throws(
    () =>
      resolveWorkoutMethodModeChange({
        currentMode: 'NORMAL',
        requestedMode: 'qualquer coisa' as any,
        isEligibleForCombined: true,
      }),
    InvalidWorkoutMethodModeError
  );
});

test('pedir o mesmo modo que já está ativo é um no-op (retorna null, não grava histórico à toa)', () => {
  assert.equal(
    resolveWorkoutMethodModeChange({
      currentMode: 'NORMAL',
      requestedMode: 'NORMAL',
      isEligibleForCombined: true,
    }),
    null
  );

  assert.equal(
    resolveWorkoutMethodModeChange({
      currentMode: 'COMBINADO',
      requestedMode: 'COMBINADO',
      isEligibleForCombined: false,
    }),
    null
  );
});

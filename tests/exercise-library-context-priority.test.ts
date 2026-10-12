import test from 'node:test';
import assert from 'node:assert/strict';
import * as priority from '../lib/exercise-library-priority.ts';

test('envia até 96 opções oficiais para ampliar a variedade sem despejar a biblioteca inteira', () => {
  assert.equal((priority as any).PROMPT_EXERCISE_LIBRARY_LIMIT, 96);
});

test('remove TRX da seleção quando o aluno informa que a academia não tem TRX', () => {
  const fn = (priority as any).shouldExcludeExerciseFromPrompt;
  assert.equal(typeof fn, 'function');
  assert.equal(fn({ id: '1', name: 'Remada no TRX' }, 'na academia não tem trx, use máquina ou polia'), true);
  assert.equal(fn({ id: '2', name: 'Remada no TRX', equipmentTags: 'TRX ou fita de suspensão' }, 'na academia não tem trx, use máquina ou polia'), true);
  assert.equal(fn({ id: '3', name: 'Remada baixa na polia', equipmentTags: 'Polia' }, 'na academia não tem trx, use máquina ou polia'), false);
});

test('pedido de posterior em academia coloca máquina flexora acima de extensora', () => {
  const fn = (priority as any).getExerciseContextScoreAdjustment;
  assert.equal(typeof fn, 'function');
  const context = 'vou para academia com equipamentos modernos. sinto falta de posterior de coxa. use máquinas para posterior de coxa';
  const flexora = fn({ id: '1', name: 'Cadeira flexora', muscleGroup: 'Pernas', equipmentTags: 'Cadeira flexora, Máquinas guiadas' }, context);
  const extensora = fn({ id: '2', name: 'Cadeira extensora', muscleGroup: 'Pernas', equipmentTags: 'Cadeira extensora, Máquinas guiadas' }, context);
  assert.ok(flexora > extensora, `esperava flexora (${flexora}) > extensora (${extensora})`);
});

test('pedido de glúteo em pé favorece equivalentes em pé/polia e reduz cadeira abdutora já repetida', () => {
  const fn = (priority as any).getExerciseContextScoreAdjustment;
  assert.equal(typeof fn, 'function');
  const context = 'equipamento moderno para glúteo que parece com adutora em pé. já fiz muito cadeira adutora e abdutora';
  const abducaoEmPe = fn({ id: '1', name: 'Abdução de quadril em pé com caneleira', muscleGroup: 'Glúteos', equipmentTags: 'Caneleiras' }, context);
  const extensaoPolia = fn({ id: '2', name: 'Extensão de quadril na polia', muscleGroup: 'Glúteos', equipmentTags: 'Polia, Caneleira de polia' }, context);
  const cadeiraAbdutora = fn({ id: '3', name: 'Cadeira abdutora', muscleGroup: 'Glúteos', equipmentTags: 'Cadeira abdutora, Máquinas guiadas' }, context);
  assert.ok(abducaoEmPe > cadeiraAbdutora, `esperava abdução em pé (${abducaoEmPe}) > cadeira abdutora (${cadeiraAbdutora})`);
  assert.ok(extensaoPolia > cadeiraAbdutora, `esperava extensão na polia (${extensaoPolia}) > cadeira abdutora (${cadeiraAbdutora})`);
});

test('reclamação de repetição com elástico reduz prioridade de exercícios com elástico', () => {
  const fn = (priority as any).getExerciseContextScoreAdjustment;
  assert.equal(typeof fn, 'function');
  const context = 'o treino está repetindo exercícios com elástico e cadeira; quero equipamentos modernos da academia';
  const elastico = fn({ id: '1', name: 'Remada com elástico', muscleGroup: 'Costas', equipmentTags: 'Elástico longo' }, context);
  const polia = fn({ id: '2', name: 'Remada baixa na polia', muscleGroup: 'Costas', equipmentTags: 'Polia, Remada baixa' }, context);
  assert.ok(polia > elastico, `esperava polia (${polia}) > elástico (${elastico})`);
});

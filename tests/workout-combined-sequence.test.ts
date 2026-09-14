import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupCombinedSequenceExercises,
  getCombinedSequenceInstruction,
} from '../lib/workout-combined-sequence.ts';

test('agrupa 2 ou 3 exercícios consecutivos do mesmo combinado pelo rótulo A1/A2/A3', () => {
  const exercises = [
    { id: '1', name: 'Agachamento Smith', notes: 'A1 — primeiro', order: 0 },
    { id: '2', name: 'Afundo assistido', notes: 'A2 — segundo', order: 1 },
    { id: '3', name: 'Extensão de quadril', notes: 'A3 — terceiro', order: 2 },
    { id: '4', name: 'Cadeira extensora', notes: 'Exercício isolado conforme protocolo.', order: 3 },
  ];

  const groups = groupCombinedSequenceExercises(exercises);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].type, 'combined');
  assert.equal(groups[0].label, 'A');
  assert.deepEqual(groups[0].exercises.map((item: any) => item.id), ['1', '2', '3']);
  assert.equal(groups[1].type, 'single');
  assert.equal(groups[1].exercises[0].id, '4');
});

test('gera instrução simples: fazer todos direto, descansar só no fim e repetir', () => {
  const text = getCombinedSequenceInstruction({
    label: 'B',
    exercises: [
      { id: '1', name: 'Leg press', series: 3, restTime: 'sem descanso até B2', notes: 'B1 — ...' },
      { id: '2', name: 'Elevação lateral', series: 3, restTime: '45s após o combinado B', notes: 'B2 — ...' },
    ],
  });

  assert.match(text, /1\. Leg press/i);
  assert.match(text, /2\. Elevação lateral/i);
  assert.match(text, /sem descanso/i);
  assert.match(text, /45s/i);
  assert.match(text, /3 voltas/i);
});

test('agrupa o formato real salvo no treino: COMBINADO A — 3 VOLTAS | A1 ...', () => {
  const exercises = [
    {
      id: '1',
      name: 'Agachamento no Smith',
      notes: 'COMBINADO A — 3 VOLTAS | A1 Agachamento no Smith. Faça a série e vá DIRETO para A2.',
      restTime: 'SEM DESCANSO → A2',
      order: 0,
      series: 3,
    },
    {
      id: '2',
      name: 'Afundo búlgaro assistido',
      notes: 'COMBINADO A — A2 Afundo búlgaro assistido. Ao terminar, DESCANSE 60s e repita A1→A2.',
      restTime: 'DESCANSE 60s → volte ao A1',
      order: 1,
      series: 3,
    },
    {
      id: '3',
      name: 'Cadeira flexora',
      notes: 'EXERCÍCIO ISOLADO TÉCNICO — Cadeira flexora.',
      restTime: '45s',
      order: 2,
      series: 3,
    },
  ];

  const groups = groupCombinedSequenceExercises(exercises);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].type, 'combined');
  assert.equal(groups[0].label, 'A');
  assert.deepEqual(groups[0].exercises.map((item: any) => item.id), ['1', '2']);
  assert.equal(groups[1].type, 'single');
});

test('extrai o descanso final mesmo no formato DESCANSE 60s → volte ao A1', () => {
  const text = getCombinedSequenceInstruction({
    type: 'combined',
    label: 'A',
    exercises: [
      { id: '1', name: 'Smith', series: 3, restTime: 'SEM DESCANSO → A2', notes: 'COMBINADO A — 3 VOLTAS | A1 Smith' },
      { id: '2', name: 'Búlgaro', series: 3, restTime: 'DESCANSE 60s → volte ao A1', notes: 'COMBINADO A — A2 Búlgaro' },
    ],
  });

  assert.match(text, /descanse 60s/i);
  assert.doesNotMatch(text, /DESCANSE DESCANSE/i);
});

test('classifica exercícios isolados técnicos e finalizações para a tela do aluno', async () => {
  const module = await import('../lib/workout-combined-sequence.ts');
  assert.equal(module.getStandaloneExerciseKind('EXERCÍCIO ISOLADO TÉCNICO — Cadeira flexora.'), 'technical');
  assert.equal(module.getStandaloneExerciseKind('FINALIZAÇÃO DE MENOR INTENSIDADE — Bird dog.'), 'finisher');
  assert.equal(module.getStandaloneExerciseKind('EXERCÍCIO ISOLADO — Cadeira adutora.'), 'single');
});

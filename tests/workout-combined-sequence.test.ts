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

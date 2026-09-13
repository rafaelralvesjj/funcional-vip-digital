import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkoutGenerationStrategy,
  getRecentlyUsedExerciseNames,
  rotateRecentlyUsedExercises,
} from '../lib/workout-generation-strategy.ts';

test('detecta pedido de treino combinado/dinâmico e exige blocos A1/A2 com descanso após a dupla', () => {
  const strategy = buildWorkoutGenerationStrategy({
    summaryText: 'Aluno treina em academia e prefere máquinas.',
    openQuestions: [
      { content: 'Preciso de sequência metabólica de combinado' },
      { content: 'Quero um treino dinâmico, um exercício intercalado com outro e depois descanso' },
    ],
    recentExerciseNames: [],
    librarySize: 127,
  });

  assert.equal(strategy.dynamicPairedSetsRequested, true);
  assert.match(strategy.promptLines.join('\n'), /A1.*A2.*descans/i);
  assert.match(strategy.promptLines.join('\n'), /60.*90/);
});

test('prioriza exercícios ainda não usados recentemente e mantém os recentes disponíveis no fim', () => {
  const exercises = [
    { id: '1', name: 'Agachamento no Smith' },
    { id: '2', name: 'Remada baixa na polia' },
    { id: '3', name: 'Leg press 45°' },
    { id: '4', name: 'Puxada frontal na polia' },
  ];

  const rotated = rotateRecentlyUsedExercises(
    exercises,
    ['Agachamento no Smith', 'Remada baixa na polia']
  );

  assert.deepEqual(rotated.map((item) => item.id), ['3', '4', '1', '2']);
});

test('motor orienta variedade sistemática sem proibir exercícios âncora', () => {
  const strategy = buildWorkoutGenerationStrategy({
    summaryText: 'Histórico recente com musculação em academia.',
    openQuestions: [],
    recentExerciseNames: ['Agachamento no Smith', 'Remada baixa na polia'],
    librarySize: 127,
  });

  const prompt = strategy.promptLines.join('\n');
  assert.match(prompt, /evite repetir/i);
  assert.match(prompt, /mesmo padr[aã]o.*muscular|mesmo objetivo muscular/i);
  assert.match(prompt, /âncora|ancora/i);
  assert.match(prompt, /127/);
});


test('extrai exercícios usados nos últimos planos a partir do resumo do aluno', () => {
  const summaryText = `3) Histórico de treino e adesão
Últimos planos de treino com exercícios:
- Treino A
  Exercícios:
      0. Agachamento no Smith — 3 séries
      1. Remada baixa na polia — 3 séries

4) Execução por exercício e percepção de esforço
- outro texto`;
  const library = [
    { id: '1', name: 'Agachamento no Smith' },
    { id: '2', name: 'Remada baixa na polia' },
    { id: '3', name: 'Leg press 45°' },
  ];

  assert.deepEqual(getRecentlyUsedExerciseNames(summaryText, library), [
    'Agachamento no Smith',
    'Remada baixa na polia',
  ]);
});

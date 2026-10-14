import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkoutGenerationStrategy,
  getRecentlyUsedExerciseNames,
  rotateRecentlyUsedExercises,
} from '../lib/workout-generation-strategy.ts';

test('workoutMethodMode=COMBINADO gera as instruções de sequência A1/A2 com descanso após o combinado', () => {
  const strategy = buildWorkoutGenerationStrategy({
    workoutMethodMode: 'COMBINADO',
    summaryText: 'Aluno treina em academia e prefere máquinas.',
    recentExerciseNames: [],
    librarySize: 127,
  });

  assert.equal(strategy.dynamicPairedSetsRequested, true);
  assert.equal(strategy.combinedSequenceRequested, true);
  assert.match(strategy.promptLines.join('\n'), /A1.*A2.*descans/i);
  assert.match(strategy.promptLines.join('\n'), /45.*60/);
});

test('workoutMethodMode=NORMAL nunca gera instrução de combinado, mesmo sem nenhum texto de contexto', () => {
  const strategy = buildWorkoutGenerationStrategy({
    workoutMethodMode: 'NORMAL',
    recentExerciseNames: [],
    librarySize: 127,
  });

  assert.equal(strategy.combinedSequenceRequested, false);
  assert.equal(strategy.dynamicPairedSetsRequested, false);
  assert.match(strategy.promptLines.join('\n'), /FORMATO PADR[ÃA]O NORMAL/i);
});

// REVISÃO: regra absoluta — nunca inferir NORMAL/COMBINADO por texto. A
// palavra "combinado" (e sinônimos como "dinâmico"/"sequência metabólica")
// aparecendo em objetivo, histórico (summaryText) ou mensagem
// (openQuestions/activePreferences) NUNCA pode alterar nem influenciar a
// decisão — só o workoutMethodMode estruturado decide.
test('REVISÃO: texto contendo "combinado" em resumo/histórico/mensagem não altera nem influencia o modo', () => {
  const textLadenWithCombinado = {
    workoutMethodMode: 'NORMAL' as const,
    summaryText:
      'Histórico: aluno já treinou combinado antes, adora sequência metabólica e superset. Objetivo: treino combinado dinâmico.',
    openQuestions: [
      { content: 'Quero um treino combinado, com A1 e A2 e descanso só no final, por favor' },
    ],
    activePreferences: [
      { originalMessage: 'Prefiro sempre treino combinado e bi-set, é meu método favorito' },
    ],
    recentExerciseNames: [],
    librarySize: 127,
  };

  const strategy = buildWorkoutGenerationStrategy(textLadenWithCombinado);

  // Mesmo com "combinado"/"sequência metabólica"/"bi-set"/A1/A2 em todo
  // lugar no texto, o modo estruturado NORMAL prevalece sempre.
  assert.equal(strategy.combinedSequenceRequested, false);
  assert.equal(strategy.dynamicPairedSetsRequested, false);
  assert.match(strategy.promptLines.join('\n'), /FORMATO PADR[ÃA]O NORMAL/i);
  assert.doesNotMatch(strategy.promptLines.join('\n'), /M[ÉE]TODO COMBINADO SOLICITADO/i);

  // E o inverso: modo estruturado COMBINADO, nenhum texto mencionando a
  // palavra em lugar nenhum — ainda assim gera as instruções de combinado,
  // porque a decisão não depende do texto.
  const noTextMentioningCombinado = {
    workoutMethodMode: 'COMBINADO' as const,
    summaryText: 'Histórico: aluno treina academia, foco em pernas e costas.',
    recentExerciseNames: [],
    librarySize: 127,
  };

  const strategyFromStructuredFlag = buildWorkoutGenerationStrategy(noTextMentioningCombinado);
  assert.equal(strategyFromStructuredFlag.combinedSequenceRequested, true);
  assert.match(strategyFromStructuredFlag.promptLines.join('\n'), /M[ÉE]TODO COMBINADO SOLICITADO/i);
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
    workoutMethodMode: 'NORMAL',
    summaryText: 'Histórico recente com musculação em academia.',
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

test('pedido estruturado de COMBINADO permite 2 ou 3 exercícios e descanso só ao final', () => {
  const strategy = buildWorkoutGenerationStrategy({
    workoutMethodMode: 'COMBINADO',
    summaryText: 'A aluna já corre em dias separados.',
    recentExerciseNames: [],
    librarySize: 127,
  });

  const prompt = strategy.promptLines.join('\n');
  assert.equal(strategy.combinedSequenceRequested, true);
  assert.match(prompt, /2 ou 3 exerc[ií]cios/i);
  assert.match(prompt, /sem descanso entre/i);
  assert.match(prompt, /30-60s|45-60s/i);
  assert.match(prompt, /A1.*A2.*A3/i);
  assert.match(prompt, /n[aã]o precisam obrigatoriamente trabalhar o mesmo m[uú]sculo/i);
});

test('quando contexto diz que cardio já é feito na corrida, o treino de academia fica só musculação (preferência de conteúdo, não de modo)', () => {
  const strategy = buildWorkoutGenerationStrategy({
    workoutMethodMode: 'COMBINADO',
    summaryText: 'A aluna já corre e agora faz somente musculação na academia. Cardio fica nos dias de corrida.',
    recentExerciseNames: [],
    librarySize: 127,
  });

  const prompt = strategy.promptLines.join('\n');
  assert.equal(strategy.strengthOnlyBecauseRuns, true);
  assert.match(prompt, /não adicionar cardio|nao adicionar cardio/i);
  assert.match(prompt, /muscula[cç][aã]o/i);
});

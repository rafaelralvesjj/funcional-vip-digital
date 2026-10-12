import test from 'node:test';
import assert from 'node:assert/strict';
import { prioritizeExplicitExerciseMentions } from '../lib/exercise-library-priority.ts';

test('fluxos que antes pediam 56 ou 64 opções recebem até 96 opções oficiais', () => {
  const exercises = Array.from({ length: 110 }, (_, index) => ({ id: String(index + 1), name: `Exercício ${index + 1}` }));
  const batch = prioritizeExplicitExerciseMentions({ rankedExercises: exercises, eligibleExercises: exercises, explicitContext: '', limit: 56 });
  const individual = prioritizeExplicitExerciseMentions({ rankedExercises: exercises, eligibleExercises: exercises, explicitContext: '', limit: 64 });
  assert.equal(batch.length, 96);
  assert.equal(individual.length, 96);
});

test('feedback negativo não transforma exercício citado em prioridade e remove TRX indisponível', () => {
  const exercises = [
    { id: '1', name: 'Cadeira extensora', muscleGroup: 'Pernas', equipmentTags: 'Cadeira extensora, Máquinas guiadas' },
    { id: '2', name: 'Cadeira flexora', muscleGroup: 'Pernas', equipmentTags: 'Cadeira flexora, Máquinas guiadas' },
    { id: '3', name: 'Remada com elástico', muscleGroup: 'Costas', equipmentTags: 'Elástico longo' },
    { id: '4', name: 'Extensão de quadril na polia', muscleGroup: 'Glúteos', equipmentTags: 'Polia, Caneleira de polia' },
    { id: '5', name: 'Abdução de quadril em pé com caneleira', muscleGroup: 'Glúteos', equipmentTags: 'Caneleiras' },
    { id: '6', name: 'Cadeira abdutora', muscleGroup: 'Glúteos', equipmentTags: 'Cadeira abdutora, Máquinas guiadas' },
    { id: '7', name: 'Remada no TRX', muscleGroup: 'Costas', equipmentTags: 'TRX ou fita de suspensão' },
  ];
  const context = 'O treino está repetindo cadeira extensora e exercícios com elástico. Vou para academia com equipamentos modernos para glúteo, parecido com adutora em pé. Sinto falta de posterior de coxa; use máquinas. Já fiz muito cadeira adutora e abdutora. Na academia não tem TRX.';
  const selected = prioritizeExplicitExerciseMentions({ rankedExercises: exercises, eligibleExercises: exercises, explicitContext: context, limit: 64 });
  const names = selected.map((item) => item.name);

  assert.equal(names.includes('Remada no TRX'), false);
  assert.ok(names.indexOf('Cadeira flexora') < names.indexOf('Cadeira extensora'));
  assert.ok(names.indexOf('Extensão de quadril na polia') < names.indexOf('Cadeira abdutora'));
  assert.ok(names.indexOf('Abdução de quadril em pé com caneleira') < names.indexOf('Cadeira abdutora'));
  assert.ok(names.indexOf('Remada com elástico') > names.indexOf('Cadeira flexora'));
});

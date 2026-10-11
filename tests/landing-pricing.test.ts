import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const landing = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

test('landing publica exibe apenas a oferta comercial vigente', () => {
  assert.match(landing, /price: "9,90"/);
  assert.match(landing, /price: "99,90"/);
  assert.match(landing, /period: "\/mês"/);
  assert.match(landing, /period: "\/ano"/);
  assert.equal((landing.match(/frequency: "3 treinos por semana"/g) || []).length, 2);

  assert.doesNotMatch(landing, /49,90|79,90/);
  assert.doesNotMatch(landing, /2 treinos por semana|4 treinos por semana/);
  assert.doesNotMatch(landing, /asaas\.com\/c\//);
  assert.doesNotMatch(landing, /Funcional UP Essencial|Funcional UP Evolução|shortName: "Essencial"|shortName: "Evolução"/);
});

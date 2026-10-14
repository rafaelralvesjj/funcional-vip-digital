import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readPageSource(): string {
  const path = fileURLToPath(
    new URL('../app/auth/aluno-registro/page.tsx', import.meta.url)
  );
  return readFileSync(path, 'utf8');
}

test('cadastro usa a duração comercial compartilhada e não comunica mais experiência de 1 mês', () => {
  const source = readPageSource();

  assert.match(source, /from ["']@\/lib\/commercial-offer-config["']/);
  assert.match(source, /COMMERCIAL_OFFER_TRIAL_DAYS/);
  assert.doesNotMatch(source, /Experiência gratuita de 1 mês/i);
  assert.match(
    source,
    /Experiência gratuita de\s*\{COMMERCIAL_OFFER_TRIAL_DAYS\}\s*dias/i
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const privacyPagePath = new URL('../app/privacidade/page.tsx', import.meta.url);
const homePagePath = new URL('../app/page.tsx', import.meta.url);

test('public privacy policy covers Garmin integration and LGPD essentials', () => {
  const source = readFileSync(privacyPagePath, 'utf8');

  for (const requiredText of [
    'Política de Privacidade',
    'LGPD',
    'Garmin Connect',
    'OAuth',
    'Activity API',
    'Health API',
    'Training API',
    'revogar',
    'exclusão',
    'não vendemos',
  ]) {
    assert.match(source, new RegExp(requiredText, 'i'));
  }
});

test('public home links to the privacy policy', () => {
  const source = readFileSync(homePagePath, 'utf8');
  assert.match(source, /href=["']\/privacidade["']/);
});

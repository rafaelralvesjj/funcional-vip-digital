import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const privacyPagePath = path.join(repoRoot, 'app', 'privacidade', 'page.tsx');
const homePagePath = path.join(repoRoot, 'app', 'page.tsx');

test('public privacy policy page exists and covers Garmin/LGPD essentials', () => {
  assert.equal(fs.existsSync(privacyPagePath), true, 'app/privacidade/page.tsx must exist');

  const source = fs.readFileSync(privacyPagePath, 'utf8');
  for (const requiredText of [
    'Política de Privacidade',
    'LGPD',
    'Garmin Connect',
    'Activity API',
    'Health API',
    'Training API',
    'OAuth',
    'exclusão',
    'revogar',
  ]) {
    assert.match(source, new RegExp(requiredText, 'i'));
  }
});

test('public home links to the privacy policy', () => {
  const source = fs.readFileSync(homePagePath, 'utf8');
  assert.match(source, /href=["']\/privacidade["']/);
});

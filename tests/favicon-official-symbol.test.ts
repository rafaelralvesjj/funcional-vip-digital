import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('browser favicon references the same official SVG used by the brand logo', () => {
  const layout = fs.readFileSync(path.join(root, 'app', 'layout.tsx'), 'utf8');
  const brandLogo = fs.readFileSync(path.join(root, 'components', 'BrandLogo.tsx'), 'utf8');
  const officialSymbol = path.join(root, 'public', 'branding', 'icon-funcional-up.svg');

  assert.equal(fs.existsSync(officialSymbol), true);
  assert.match(brandLogo, /\/branding\/icon-funcional-up\.svg/);
  assert.match(layout, /\/branding\/icon-funcional-up\.svg\?v=20261104/);
  assert.match(layout, /image\/svg\+xml/);
  assert.doesNotMatch(layout, /\/branding\/favicon-(32|64)\.png/);

  // File-based app/icon.png metadata overrides layout metadata in Next.js.
  assert.equal(fs.existsSync(path.join(root, 'app', 'icon.png')), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readPageSource(): string {
  const path = fileURLToPath(new URL('../app/page.tsx', import.meta.url));
  return readFileSync(path, 'utf8');
}

// REVISÃO (ponto 4): a landing pública não pode mais enviar direto para um
// link de checkout genérico/hardcoded da Asaas — nem o link em si, nem
// qualquer outra URL da Asaas (ex.: sandbox) pode aparecer na página. O CTA
// público leva ao cadastro/login/teste; o checkout de verdade (dinâmico, com
// a BillingOption real) só existe depois do aluno identificado, em
// /aluno/contratar (Fase 3).
test('REVISÃO (ponto 4): landing pública não contém nenhum link estático/hardcoded da Asaas', () => {
  const source = readPageSource();
  assert.doesNotMatch(source, /asaas\.com/i);
});

test('REVISÃO (ponto 4): os CTAs dos planos levam ao cadastro (primaryCta), nunca a um link externo de checkout', () => {
  const source = readPageSource();

  // Os dois cards de plano usam o mesmo Link interno (primaryCta) — não
  // existe mais um campo `href` por plano apontando para fora do site.
  assert.doesNotMatch(source, /href:\s*["']https?:\/\//);
  assert.match(source, /<Link\s+href=\{primaryCta\}/);
});

test('REVISÃO (ponto 4): nenhum preço/link de checkout é duplicado fora do que já existe (plans é só copy, sem href fixo)', () => {
  const source = readPageSource();
  // O array `plans` descreve preço/frequência só como texto de marketing —
  // nenhuma propriedade `href` nele apontando para uma página de cobrança.
  const plansBlockMatch = source.match(/const plans = \[([\s\S]*?)\n\];/);
  assert.ok(plansBlockMatch, 'esperava encontrar o array plans');
  assert.doesNotMatch(plansBlockMatch![1], /href:/);
});

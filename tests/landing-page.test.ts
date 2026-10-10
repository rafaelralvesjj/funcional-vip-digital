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

test('REVISÃO (ponto 4): nenhum preço/link de checkout é duplicado fora do que já existe (billingChoices é só copy, sem href fixo)', () => {
  const source = readPageSource();
  // O array `billingChoices` descreve preço/cobrança só como texto de
  // marketing — nenhuma propriedade `href` nele apontando para uma página
  // de cobrança.
  const blockMatch = source.match(/const billingChoices = \[([\s\S]*?)\n\];/);
  assert.ok(blockMatch, 'esperava encontrar o array billingChoices');
  assert.doesNotMatch(blockMatch![1], /href:/);
});

// REVISÃO (segunda rodada, ponto 2): a landing precisa refletir a oferta
// comercial real — um único produto (3 treinos/semana, 7 dias de teste,
// mensal R$9,90/anual R$99,90 recomendado) — em vez dos dois planos antigos
// (Essencial R$49,90/2x semana, Evolução R$79,90/4x semana).
test('REVISÃO: os dois planos antigos (Essencial/Evolução, R$49,90/R$79,90, 2x/4x por semana) não existem mais', () => {
  const source = readPageSource();
  assert.doesNotMatch(source, /49,90/);
  assert.doesNotMatch(source, /79,90/);
  assert.doesNotMatch(source, /2 treinos por semana/);
  assert.doesNotMatch(source, /4 treinos por semana/);
  assert.doesNotMatch(source, /Essencial/);
  assert.doesNotMatch(source, /Funcional UP Evolução/);
});

test('REVISÃO: a landing consome a configuração comercial compartilhada (lib/commercial-offer-config), nunca um número solto', () => {
  const source = readPageSource();
  assert.match(source, /from ["']\.\.\/lib\/commercial-offer-config["']/);
  assert.match(source, /COMMERCIAL_OFFER_WORKOUTS_PER_WEEK/);
  assert.match(source, /COMMERCIAL_OFFER_TRIAL_DAYS/);
  assert.match(source, /formatCommercialOfferMonthlyPrice/);
  assert.match(source, /formatCommercialOfferAnnualPrice/);
  // Nenhum preço hardcoded tomando o lugar das funções do config.
  assert.doesNotMatch(source, /price:\s*["']\d/);
});

test('REVISÃO: a landing mostra mensal e anual (anual recomendado) para o mesmo produto de 3 treinos/semana', () => {
  const source = readPageSource();
  assert.match(source, /COMMERCIAL_OFFER_ANNUAL_RECOMMENDED/);
  assert.match(source, /cycle:\s*["']MONTHLY["']/);
  assert.match(source, /cycle:\s*["']ANNUAL["']/);
  assert.match(source, /\{COMMERCIAL_OFFER_WORKOUTS_PER_WEEK\}\s*treinos por semana/);
  assert.match(source, /\{COMMERCIAL_OFFER_TRIAL_DAYS\}\s*dias de teste/);
});

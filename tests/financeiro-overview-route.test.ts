import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Comportamento real (consulta ao banco + sessão) não é testável sem banco
// neste ambiente — a lógica de negócio em si (resolveStudentCommercialRow,
// aggregateCommercialStatusCounts, formatBillingLabel) já está coberta por
// tests/commercial-status-resolver.test.ts com fixtures puras. Aqui
// fixamos, por leitura do código-fonte, que as rotas realmente delegam a
// esse resolvedor central em vez de reimplementar a lógica de status, e que
// nunca expõem um link Asaas estático/inventado.
function readSource(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
}

test('rota de overview do Financeiro usa o resolvedor central, não reimplementa a lógica de status', () => {
  const source = readSource('../app/api/financeiro/overview/route.ts');
  assert.match(source, /from ["']@\/lib\/commercial-status-resolver["']/);
  assert.match(source, /resolveStudentCommercialRow\(/);
  assert.match(source, /aggregateCommercialStatusCounts\(/);
});

test('rota de overview do Financeiro exige GESTOR/ADMIN', () => {
  const source = readSource('../app/api/financeiro/overview/route.ts');
  assert.match(source, /canManage\(role\)/);
  assert.match(source, /status: 403/);
});

test('rota de detalhe do aluno usa o mesmo resolvedor central (currentRow)', () => {
  const source = readSource('../app/api/financeiro/overview/[studentId]/route.ts');
  assert.match(source, /from ["']@\/lib\/commercial-status-resolver["']/);
  assert.match(source, /resolveStudentCommercialRow\(/);
});

test('rota de detalhe do aluno exige GESTOR/ADMIN', () => {
  const source = readSource('../app/api/financeiro/overview/[studentId]/route.ts');
  assert.match(source, /canManage\(role\)/);
  assert.match(source, /status: 403/);
});

// REVISÃO: "nenhum link Asaas estático" — nem a rota de overview nem a de
// detalhe podem conter uma URL hardcoded da Asaas (ex.: o link genérico que
// existe na landing page pública, fora do escopo desta fase). O único link
// exibido é o paymentLinkUrl real daquele ContractPayment específico, ou
// null quando não existe.
test('nenhuma das rotas do Financeiro contém uma URL estática da Asaas', () => {
  const overviewSource = readSource('../app/api/financeiro/overview/route.ts');
  const detailSource = readSource('../app/api/financeiro/overview/[studentId]/route.ts');

  for (const source of [overviewSource, detailSource]) {
    assert.doesNotMatch(source, /https:\/\/(www\.)?asaas\.com\/c\//);
    assert.doesNotMatch(source, /sandbox\.asaas\.com/);
  }
});

test('rota de detalhe do aluno só expõe paymentLinkUrl real do ContractPayment, nunca um valor fixo', () => {
  const source = readSource('../app/api/financeiro/overview/[studentId]/route.ts');
  assert.match(source, /paymentLinkUrl:\s*payment\.paymentLinkUrl\s*\|\|\s*null/);
});

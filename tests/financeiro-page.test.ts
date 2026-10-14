import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readPageSource(): string {
  const path = fileURLToPath(new URL('../app/dashboard/financeiro/page.tsx', import.meta.url));
  return readFileSync(path, 'utf8');
}

test('Financeiro busca a nova rota de overview (cards + tabela única)', () => {
  const source = readPageSource();
  assert.match(source, /fetch\(["']\/api\/financeiro\/overview["']/);
  assert.match(source, /fetch\(`\/api\/financeiro\/overview\/\$\{targetStudentId\}`/);
});

test('Financeiro renderiza a tabela única com as 6 colunas pedidas', () => {
  const source = readPageSource();
  for (const column of ['Aluno', 'Situação', 'Plano', 'Cobrança', 'Próxima data', 'Ação']) {
    assert.match(source, new RegExp(`>${column}<`));
  }
});

test('Financeiro não reimplementa a lógica de status comercial no cliente (sem filtro de data ad-hoc para cards)', () => {
  const source = readPageSource();
  // A versão anterior calculava "vencendo"/"vencidos" no cliente com
  // new Date() + setDate(+7) — isso não pode voltar: a categoria de cada
  // aluno vem pronta da API (resolveStudentCommercialRow no servidor).
  assert.doesNotMatch(source, /setDate\(.*getDate\(\)\s*\+\s*7\)/);
});

test('Financeiro preserva os 3 formulários legados (criar contrato, converter experiência, registrar pagamento)', () => {
  const source = readPageSource();
  assert.match(source, /handleCreateContract/);
  assert.match(source, /handleConvertTrial/);
  assert.match(source, /handleCreatePayment/);
  assert.match(source, /handleRenewContract/);
});

test('Financeiro nunca contém uma URL estática/hardcoded da Asaas', () => {
  const source = readPageSource();
  assert.doesNotMatch(source, /https:\/\/(www\.)?asaas\.com\/c\//);
  assert.doesNotMatch(source, /sandbox\.asaas\.com/);
});

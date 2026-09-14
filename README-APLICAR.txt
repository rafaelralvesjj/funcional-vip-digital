CORREÇÃO VISUAL — TELA DO ALUNO — TREINOS COMBINADOS
Data: 14/09/2026

OBJETIVO
Deixar a dinâmica do treino combinada clara para o aluno.

SUBSTITUIR SOMENTE ESTES 2 ARQUIVOS NO REPOSITÓRIO:
1. app/aluno/page.tsx
2. lib/workout-combined-sequence.ts

O arquivo tests/workout-combined-sequence.test.ts é o teste de regressão e pode ser enviado também.

O QUE MUDA NA TELA DO ALUNO
- Reconhece o formato real salvo atualmente:
  "COMBINADO A — 3 VOLTAS | A1 ..."
  "COMBINADO A — A2 ..."
  "COMBINADO B — 3 VOLTAS | B1 ..."
- Agrupa visualmente os exercícios dentro de COMBINADO A/B/C.
- Mostra claramente entre os exercícios:
  ↓ VÁ DIRETO — SEM DESCANSO ↓
- Depois do último exercício mostra um cartão destacado:
  AGORA DESCANSE 45s/60s
  volte ao A1/B1 e repita o bloco.
- Exercícios fora dos combinados aparecem separados como:
  EXERCÍCIO TÉCNICO — FAÇA COM ATENÇÃO
  EXERCÍCIO ISOLADO
  FINALIZAÇÃO — RITMO MAIS CONTROLADO
- Corrige também a leitura do descanso para não aparecer texto duplicado como
  "descanse DESCANSE 60s".

NÃO ALTERA
- Treinos salvos.
- Banco/Prisma.
- package.json.
- Motor de geração.
- Cargas, séries ou repetições.

VALIDAÇÃO LOCAL
- Testes do agrupamento: 5/5 passaram.
- app/aluno/page.tsx e lib/workout-combined-sequence.ts passaram no transpile/syntax check do TypeScript.
- Teste com o treino atual da Denize reconheceu corretamente os blocos A/B e exercícios isolados/finalizações.

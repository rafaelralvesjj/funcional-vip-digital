CORREÇÃO — MOTOR DE MONTAGEM DINÂMICA / VARIAÇÃO DE EXERCÍCIOS
Data: 13/09/2026

OBJETIVO
1. Usar melhor a biblioteca ativa de exercícios.
2. Evitar repetição automática de exercícios usados recentemente quando houver equivalente seguro.
3. Preservar 1–2 exercícios âncora quando houver pedido explícito, motivo técnico/médico ou necessidade de acompanhamento.
4. Quando o aluno pedir treino dinâmico/combinado/metabólico, estruturar como pares A1/A2, B1/B2, C1/C2: faz o primeiro, faz o segundo e só então descansa.
5. Aplicar a mesma regra tanto no fluxo individual quanto no Montar treinos em lote.

ARQUIVOS
SUBSTITUIR:
- app/dashboard/resumo-aluno/page.tsx

CRIAR:
- lib/workout-generation-strategy.ts

TESTE OPCIONAL (recomendado manter no repositório):
- tests/workout-generation-strategy.test.ts

IMPORTANTE
- Este pacote NÃO altera package.json.
- Este pacote NÃO executa Prisma, NÃO faz db push e NÃO altera banco de dados.
- Não apague outros arquivos do projeto.

COMO TESTAR DEPOIS DO DEPLOY
1. Gerar novamente o pacote/Prompt JSON da Denize.
2. Confirmar que o prompt mostra REGRA DE VARIEDADE SISTEMÁTICA.
3. Confirmar que aparece MÉTODO DINÂMICO SOLICITADO com A1/A2.
4. Conferir que exercícios usados recentemente são de-priorizados.
5. Gerar treino e verificar notes com A1 -, A2 -, B1 -, B2 -.
6. Fazer um teste no modo lote para confirmar que as mesmas regras aparecem por aluno.

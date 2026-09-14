CORREÇÃO — MOTOR + TELA DE SEQUÊNCIA COMBINADA — 14/09/2026

OBJETIVO
1. O motor deixa de tratar "combinado" apenas como dupla A1/A2.
2. Passa a aceitar COMBINADOS de 2 ou 3 exercícios: A1/A2 ou A1/A2/A3.
3. Regra: 1 série de cada exercício direto, sem descanso entre eles; descanso apenas após o último e depois repetir a sequência.
4. Nem todo exercício precisa estar em combinado: protocolos clínicos/técnicos podem ficar isolados.
5. Se o contexto disser que o aluno já corre e quer academia só para musculação, o motor NÃO adiciona cardio/HIIT/bike/esteira/escada/elíptico.
6. Mantém variedade sistemática: prioriza exercícios não usados recentemente, preservando âncoras quando necessário.
7. Na tela do aluno, exercícios marcados A1/A2/A3 passam a aparecer agrupados como COMBINADO A/B/C, com instrução visual clara:
   EXERCÍCIO 1 → SEM DESCANSO → EXERCÍCIO 2/3 → DESCANSO NO FINAL → REPETIR.

ARQUIVOS PARA SUBSTITUIR/CRIAR NO REPOSITÓRIO
- SUBSTITUIR: lib/workout-generation-strategy.ts
- CRIAR:      lib/workout-combined-sequence.ts
- SUBSTITUIR: app/aluno/page.tsx

TESTES INCLUÍDOS (opcional subir, recomendado)
- tests/workout-generation-strategy.test.ts
- tests/workout-combined-sequence.test.ts

NÃO ALTERA
- package.json
- schema.prisma
- banco de dados
- rotas de API

IMPORTANTE
Envie os 3 arquivos de produção juntos. app/aluno/page.tsx importa lib/workout-combined-sequence.ts; se o helper novo não for criado, o build falhará.

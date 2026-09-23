CORREÇÃO URGENTE — DENIZE DEVE CONTINUAR NO TREINO COMBINADO

Arquivos deste pacote:
- app/api/workout-plan/route.ts
- lib/workout-format-consistency.ts

O que esta correção faz:
1. O sistema passa a decidir o formato do treino pelo último pedido explícito de MÉTODO
   encontrado no histórico recente do aluno, e não apenas nas preferências ACTIVE.
2. Assim, uma preferência posterior sobre aparelhos/equipamentos não apaga o pedido
   anterior de treino COMBINADO.
3. Resultado esperado:
   - Rafael: NORMAL (porque houve pedido explícito de voltar ao normal)
   - Denize: COMBINADO (porque o pedido explícito dela continua válido)

Como aplicar:
1. Abra a raiz do projeto.
2. Arraste as pastas "app" e "lib" deste pacote por cima do projeto.
3. Confirme substituição dos arquivos.
4. Faça novo deploy.

Depois do deploy:
- testar Rafael: deve abrir treino normal
- testar Denize: deve abrir treino combinado

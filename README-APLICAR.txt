CORREÇÃO — REVISÃO PROFUNDA SEM TREINO FUTURO

Base:
- aplicar sobre o main atual enviado em 13/09/2026
- recomendado criar a branch:
  fix/revisao-profunda-sem-treino-futuro

Causa raiz:
- "Gerar revisão profunda do treino" chamava o mesmo endpoint de adaptação
  e herdava a trava que exige treino pendente/futuro elegível.
- Quando o aluno não tinha treino elegível, o backend respondia 409:
  "Não há treinos pendentes ou futuros elegíveis para adaptação."

Nova regra:
1. "Alterar treino com IA"
   - continua exigindo treino existente e elegível;
   - sem treino elegível continua retornando 409.

2. "Gerar revisão profunda do treino"
   - quando existem treinos elegíveis, mantém o fluxo atual de auditoria/adaptação;
   - quando NÃO existem treinos elegíveis, gera um pacote de REVISÃO/PLANEJAMENTO.

O pacote de revisão sem treino futuro inclui:
- conversa atual;
- conversas abertas recentes do aluno;
- perfil básico do aluno;
- memória técnica;
- orientações médicas ativas;
- eventos de cuidado;
- até 12 treinos recentes com exercícios;
- biblioteca ativa de exercícios;
- modelo de resposta para recomendação de nova programação.

Segurança do fluxo:
- o pacote de planejamento deixa workouts vazio, porque não existe workoutId elegível;
- a IA é instruída a não afirmar que alterou/publicou treinos;
- a recomendação deve ser revisada pelo professor antes de criar novos treinos;
- o front-end identifica X-Review-Only e não mostra "Validar adaptação" /
  "Aplicar alterações" quando não existe treino a editar.

Validação executada:
- TDD: o teste novo falhou antes da implementação porque o helper ainda não existia.
- Depois da correção:
  node --experimental-strip-types --test tests/workout-adjustment-review-mode.test.ts
  Resultado: 5 testes aprovados, 0 falhas.

- Checagem TypeScript dos arquivos alterados:
  não foram detectados erros locais/sintáticos.
  O comando não consegue resolver Next/React/JSZip porque o ZIP do repositório
  não traz node_modules neste sandbox.

Build:
- build completo NÃO foi executado neste ambiente por ausência das dependências instaladas.
- depois de aplicar na branch de desenvolvimento, confirmar o build verde da Vercel
  antes de fazer merge no main.

Teste funcional esperado depois do deploy DEV:
A) Denize sem treino futuro + "Gerar revisão profunda" -> baixa ZIP normalmente.
B) Denize sem treino futuro + "Alterar treino com IA" -> continua bloqueado.
C) Aluno com treino futuro + ambos os botões -> fluxo atual continua funcionando.

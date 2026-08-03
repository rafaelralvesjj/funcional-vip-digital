# Auditoria rápida — e-mails e alertas do chat

## Problema encontrado
A tela do professor responde por `POST /api/questions`.
Essa rota só disparava e-mail quando `parentId` estava vazio, ou seja, apenas na abertura da conversa.
As respostas do professor possuem `parentId`, por isso eram salvas no chat, mas não geravam e-mail nem aviso para o aluno.

## Correções aplicadas
- Toda mensagem do aluno gera aviso no painel e e-mail para o professor responsável.
- Toda resposta do professor ou da gestão gera aviso no painel e e-mail para o aluno.
- O e-mail do aluno é resolvido por `userAuthId` e pelo e-mail cadastrado no aluno.
- Logs claros foram adicionados para sucesso, ausência de destinatário e falha.
- Foi criada a rota dinâmica correta `/api/questions/[id]/answer` para o fluxo legado da gestão.
- A rota `/api/aluno/questions` passou a usar a mesma função central de comunicação.

## Logs esperados
- `STUDENT_CHAT_NOTICE_CREATED`
- `EMAIL_SENT` com `eventType: STUDENT_CHAT_MESSAGE`
- `CHAT_REPLY_NOTICE_CREATED`
- `EMAIL_SENT` com `eventType: TEACHER_CHAT_REPLY`
- Em falhas: `CHAT_REPLY_EMAIL_SKIPPED_NO_RECIPIENT`, `CHAT_REPLY_EMAIL_FAILED` ou `STUDENT_CHAT_EMAIL_FAILED`

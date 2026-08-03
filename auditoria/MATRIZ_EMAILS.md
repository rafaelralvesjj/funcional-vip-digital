# Matriz de e-mails — Funcional UP Digital

| Evento | Destinatário | Regra |
|---|---|---|
| Aluno envia mensagem ou nova dúvida | Professor responsável | Sempre que o aluno enviar mensagem ao professor, inclusive continuação de conversa |
| Aluno envia mensagem à gestão | Gestão | Somente quando o destino escolhido for gestão |
| Professor responde no chat | Aluno | Sempre que o professor responder uma conversa do aluno |
| Treino liberado ou adaptado | Aluno | Nunca enviar para gestão/professor usando e-mail cadastrado como aluno |
| Evento de cuidado | Professor responsável | Gestão acompanha no painel; e-mail apenas quando a regra do evento exigir escalonamento |
| Aviso direcionado | Papel definido no aviso | Respeitar targetRole e destinatário específico |
| Prazo de planejamento | Professor responsável | Não enviar ao aluno ou à gestão como substituição do professor |

## Proteções

- E-mail de aluno é validado por `resolveStudentRecipientEmail` e bloqueado se pertencer a usuário interno.
- E-mail de professor é resolvido por `resolveProfessorRecipientEmail`, considerando vínculo e contrato ativo.
- Todos os envios geram logs `EMAIL_SENT` ou `EMAIL_FAILED` com tipo do evento, destinatário e contexto.

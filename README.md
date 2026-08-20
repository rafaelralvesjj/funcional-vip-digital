# Funcional UP Digital

Sistema web de gestão de treinos funcionais, construído com Next.js 14 (App Router), TypeScript, Prisma, NextAuth e PostgreSQL. Permite que professores montem e acompanhem treinos, alunos registrem sua evolução e execução dos treinos, e gestores administrem alunos, professores e a operação do serviço.

## Primeiros passos

1. Copie `.env.example` para `.env.local` e preencha suas credenciais.
2. Rode `npm install`.
3. Prepare o banco com `npm run db:prepare`.
4. Alimente o banco com `npm run db:seed`.
5. Inicie o servidor com `npm run dev`.

## Scripts úteis

- `npm run dev` — inicia o servidor de desenvolvimento.
- `npm run build` — gera a build de produção.
- `npm run health` — verifica a saúde básica do projeto.
- `npm run reset:local` — reseta o banco local (cuidado!).

# Coach de Inglês Diário

App web (PWA) para uma aula de inglês de ~20 minutos por dia, pensado para ser usado
de fone de ouvido durante o trajeto até o trabalho — sem precisar mexer na tela.

## Como funciona

- **100% estático**, sem servidor, sem banco de dados, sem chave de API. Roda inteiro
  no navegador do celular.
- A voz do professor usa a **Web Speech API** do navegador (grátis, nativa).
- O reconhecimento de fala (para corrigir a pronúncia) também usa a Web Speech API.
  Ele funciona bem no **Chrome/Android**. Em navegadores sem suporte (ex.: Safari/iOS),
  o app cai automaticamente em modo "repita comigo", sem correção automática — a aula
  nunca trava.
- O progresso (dias concluídos, sequência de dias, repetição espaçada do vocabulário)
  fica salvo no `localStorage` do próprio celular.
- Cada dia tem: aquecimento (revisão do que já foi visto), aula nova (vocabulário +
  diálogo, cenários de RH executivo), prática falada, e um resumo.

## Rodar localmente

Não precisa de `npm install`. Basta servir os arquivos estáticos:

```bash
cd english-coach
python3 -m http.server 8080
# abra http://localhost:8080
```

## Publicar de graça

Qualquer uma dessas opções funciona no plano gratuito, sem cartão de crédito:

- **Vercel**: `vercel deploy` apontando para a pasta `english-coach/` (ou conectar o
  repositório e configurar "Root Directory" = `english-coach`).
- **Netlify**: arrastar a pasta `english-coach/` em [app.netlify.com/drop](https://app.netlify.com/drop),
  ou conectar o repositório com "Base directory" = `english-coach`.
- **GitHub Pages**: ativar Pages apontando para a pasta `english-coach/` na branch
  desejada.

Depois de publicado, abra o link no celular dela e use "Adicionar à tela de início"
(Chrome/Android) para instalar como app.

## Adicionar mais dias

O currículo fica em `js/curriculum.js`, um array simples. Cada dia segue o mesmo
formato (vocabulário, diálogo, frases de prática, resumo). Para adicionar o dia 11
em diante, é só copiar a estrutura de um dia existente.

## Próximos passos possíveis

- Mais dias de currículo (o motor já suporta quantos dias forem adicionados).
- Módulo de francês, reaproveitando o mesmo motor de aula e repetição espaçada.
- Ajuste fino de voz/velocidade depois do primeiro uso real no trânsito.

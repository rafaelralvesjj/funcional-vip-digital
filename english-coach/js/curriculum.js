// Currículo do Coach de Inglês — 10 dias, focado em rotina de liderança em RH
// (reuniões, feedback, e-mails, apresentações, comunicação com matriz internacional).
// Cada item de vocab/practice carrega um id estável, usado pela repetição espaçada (srs.js).

export const TEACHER_NAME = "Sophie";

export const CURRICULUM = [
  {
    id: 1,
    title: "Abrindo uma reunião com confiança",
    theme: "Reuniões",
    intro_pt: "Hoje a gente trabalha como abrir uma reunião em inglês soando segura e no controle, do jeito que você já faz em português.",
    vocab: [
      { id: "d1-v1", en: "Let's get started.", pt: "Vamos começar.", note_pt: "Abertura clássica, direta." },
      { id: "d1-v2", en: "Thanks everyone for joining.", pt: "Obrigada a todos por participarem.", note_pt: "Agradecimento inicial." },
      { id: "d1-v3", en: "Today's agenda has three points.", pt: "A pauta de hoje tem três pontos.", note_pt: "Apresentar a pauta." },
      { id: "d1-v4", en: "Let's dive right in.", pt: "Vamos direto ao assunto.", note_pt: "Expressão informal e confiante." },
      { id: "d1-v5", en: "I'll keep this brief.", pt: "Vou ser breve.", note_pt: "Sinaliza objetividade, muito usado por líderes." }
    ],
    dialogue: [
      { speaker: "teacher", en: "Good morning, everyone. Thanks for joining.", pt: "Bom dia a todos. Obrigada por participarem." },
      { speaker: "colleague", en: "Morning, Sophie. Happy to be here.", pt: "Bom dia, Sophie. Feliz em estar aqui." },
      { speaker: "teacher", en: "Let's get started. Today's agenda has three points.", pt: "Vamos começar. A pauta de hoje tem três pontos." },
      { speaker: "teacher", en: "I'll keep this brief so we have time for questions.", pt: "Vou ser breve para termos tempo para perguntas." }
    ],
    practice: [
      { id: "d1-p1", prompt_pt: "Diga que a reunião vai começar.", target_en: "Let's get started." },
      { id: "d1-p2", prompt_pt: "Agradeça a todos por participarem.", target_en: "Thanks everyone for joining." },
      { id: "d1-p3", prompt_pt: "Diga que a pauta de hoje tem três pontos.", target_en: "Today's agenda has three points." },
      { id: "d1-p4", prompt_pt: "Diga que você vai ser breve.", target_en: "I'll keep this brief." }
    ],
    recap_pt: "Hoje você aprendeu a abrir uma reunião com confiança em inglês. Amanhã: como dar um feedback construtivo."
  },
  {
    id: 2,
    title: "Dando feedback construtivo",
    theme: "Liderança",
    intro_pt: "Feedback é o coração do seu trabalho em RH. Hoje você aprende frases para dar feedback de forma clara e gentil em inglês.",
    vocab: [
      { id: "d2-v1", en: "I wanted to share some feedback.", pt: "Eu queria compartilhar um feedback.", note_pt: "Abertura suave." },
      { id: "d2-v2", en: "What went well was...", pt: "O que funcionou bem foi...", note_pt: "Começa pelo positivo." },
      { id: "d2-v3", en: "One area to improve is...", pt: "Um ponto a melhorar é...", note_pt: "Mais suave que 'problem'." },
      { id: "d2-v4", en: "How do you see it?", pt: "Como você vê isso?", note_pt: "Convida o outro a participar." },
      { id: "d2-v5", en: "Let's set a plan going forward.", pt: "Vamos definir um plano daqui para frente.", note_pt: "Fecha com ação." }
    ],
    dialogue: [
      { speaker: "teacher", en: "Do you have a minute? I wanted to share some feedback.", pt: "Você tem um minuto? Eu queria compartilhar um feedback." },
      { speaker: "colleague", en: "Sure, go ahead.", pt: "Claro, pode falar." },
      { speaker: "teacher", en: "What went well was your presentation last week.", pt: "O que funcionou bem foi sua apresentação semana passada." },
      { speaker: "teacher", en: "One area to improve is response time on emails. How do you see it?", pt: "Um ponto a melhorar é o tempo de resposta nos e-mails. Como você vê isso?" }
    ],
    practice: [
      { id: "d2-p1", prompt_pt: "Diga que você quer compartilhar um feedback.", target_en: "I wanted to share some feedback." },
      { id: "d2-p2", prompt_pt: "Comece elogiando algo que funcionou bem.", target_en: "What went well was..." },
      { id: "d2-p3", prompt_pt: "Aponte um ponto a melhorar, com gentileza.", target_en: "One area to improve is..." },
      { id: "d2-p4", prompt_pt: "Pergunte como a pessoa vê a situação.", target_en: "How do you see it?" }
    ],
    recap_pt: "Você já sabe estruturar um feedback em inglês: positivo, ponto de melhoria, e escuta. Amanhã: small talk com colegas internacionais."
  },
  {
    id: 3,
    title: "Small talk com colegas internacionais",
    theme: "Relacionamento",
    intro_pt: "Antes de qualquer reunião importante, tem o small talk. Hoje você aprende a puxar assunto de forma natural.",
    vocab: [
      { id: "d3-v1", en: "How was your weekend?", pt: "Como foi seu fim de semana?", note_pt: "Clássico para começar." },
      { id: "d3-v2", en: "How's everything going on your end?", pt: "Como estão as coisas aí do seu lado?", note_pt: "Bom para times remotos." },
      { id: "d3-v3", en: "I hope you're doing well.", pt: "Espero que você esteja bem.", note_pt: "Ótimo para abrir e-mails também." },
      { id: "d3-v4", en: "Same here!", pt: "Aqui também! / Comigo também!", note_pt: "Resposta rápida e natural." },
      { id: "d3-v5", en: "It was great, thanks for asking.", pt: "Foi ótimo, obrigada por perguntar.", note_pt: "Resposta educada padrão." }
    ],
    dialogue: [
      { speaker: "colleague", en: "Hi Sophie, how was your weekend?", pt: "Oi Sophie, como foi seu fim de semana?" },
      { speaker: "teacher", en: "It was great, thanks for asking! How about you?", pt: "Foi ótimo, obrigada por perguntar! E o seu?" },
      { speaker: "colleague", en: "Same here, very relaxing.", pt: "Aqui também, bem tranquilo." },
      { speaker: "teacher", en: "Nice. How's everything going on your end this week?", pt: "Que bom. Como estão as coisas aí do seu lado essa semana?" }
    ],
    practice: [
      { id: "d3-p1", prompt_pt: "Pergunte como foi o fim de semana da pessoa.", target_en: "How was your weekend?" },
      { id: "d3-p2", prompt_pt: "Diga que espera que a pessoa esteja bem.", target_en: "I hope you're doing well." },
      { id: "d3-p3", prompt_pt: "Responda dizendo que foi ótimo, agradecendo a pergunta.", target_en: "It was great, thanks for asking." },
      { id: "d3-p4", prompt_pt: "Pergunte como as coisas estão do lado da pessoa.", target_en: "How's everything going on your end?" }
    ],
    recap_pt: "Small talk vira rapport, e rapport abre portas. Amanhã: escrever e-mails corporativos com clareza."
  },
  {
    id: 4,
    title: "E-mails corporativos claros",
    theme: "Comunicação escrita",
    intro_pt: "E-mail em inglês precisa ser claro e educado ao mesmo tempo. Hoje você aprende as estruturas que mais usam executivos.",
    vocab: [
      { id: "d4-v1", en: "I'm writing to follow up on...", pt: "Estou escrevendo para dar seguimento a...", note_pt: "Abertura de follow-up." },
      { id: "d4-v2", en: "Could you please confirm by Friday?", pt: "Você poderia confirmar até sexta-feira?", note_pt: "Pedido educado com prazo." },
      { id: "d4-v3", en: "Please let me know if you have any questions.", pt: "Por favor, me avise se tiver alguma dúvida.", note_pt: "Fechamento padrão." },
      { id: "d4-v4", en: "Looking forward to your reply.", pt: "Aguardo seu retorno.", note_pt: "Encerramento cordial." },
      { id: "d4-v5", en: "Apologies for the delay.", pt: "Peço desculpas pela demora.", note_pt: "Para responder e-mails atrasados." }
    ],
    dialogue: [
      { speaker: "teacher", en: "Hi Marie, I'm writing to follow up on our meeting.", pt: "Oi Marie, estou escrevendo para dar seguimento à nossa reunião." },
      { speaker: "teacher", en: "Could you please confirm the new dates by Friday?", pt: "Você poderia confirmar as novas datas até sexta-feira?" },
      { speaker: "teacher", en: "Please let me know if you have any questions.", pt: "Por favor, me avise se tiver alguma dúvida." },
      { speaker: "teacher", en: "Looking forward to your reply.", pt: "Aguardo seu retorno." }
    ],
    practice: [
      { id: "d4-p1", prompt_pt: "Diga que está escrevendo para dar seguimento a algo.", target_en: "I'm writing to follow up on..." },
      { id: "d4-p2", prompt_pt: "Peça uma confirmação até sexta-feira.", target_en: "Could you please confirm by Friday?" },
      { id: "d4-p3", prompt_pt: "Encerre pedindo para avisarem se houver dúvidas.", target_en: "Please let me know if you have any questions." },
      { id: "d4-p4", prompt_pt: "Diga que aguarda o retorno da pessoa.", target_en: "Looking forward to your reply." }
    ],
    recap_pt: "Suas próximas mensagens para a matriz já saem mais claras. Amanhã: apresentar uma ideia com segurança."
  },
  {
    id: 5,
    title: "Apresentando uma ideia com segurança",
    theme: "Apresentações",
    intro_pt: "Toda executiva de RH precisa vender uma ideia de vez em quando. Hoje: como estruturar isso em inglês.",
    vocab: [
      { id: "d5-v1", en: "I'd like to walk you through...", pt: "Eu gostaria de apresentar a vocês...", note_pt: "Abertura de apresentação." },
      { id: "d5-v2", en: "The main goal here is...", pt: "O objetivo principal aqui é...", note_pt: "Contextualiza logo de cara." },
      { id: "d5-v3", en: "This would allow us to...", pt: "Isso nos permitiria...", note_pt: "Mostra benefício." },
      { id: "d5-v4", en: "Any thoughts on this?", pt: "Alguma opinião sobre isso?", note_pt: "Abre para discussão." },
      { id: "d5-v5", en: "Happy to answer any questions.", pt: "Fico feliz em responder perguntas.", note_pt: "Fechamento receptivo." }
    ],
    dialogue: [
      { speaker: "teacher", en: "I'd like to walk you through our new onboarding process.", pt: "Eu gostaria de apresentar a vocês nosso novo processo de onboarding." },
      { speaker: "teacher", en: "The main goal here is reducing time to productivity.", pt: "O objetivo principal aqui é reduzir o tempo até a produtividade." },
      { speaker: "teacher", en: "This would allow us to cut ramp-up time by 30%.", pt: "Isso nos permitiria reduzir o tempo de adaptação em 30%." },
      { speaker: "teacher", en: "Any thoughts on this?", pt: "Alguma opinião sobre isso?" }
    ],
    practice: [
      { id: "d5-p1", prompt_pt: "Diga que vai apresentar algo para o grupo.", target_en: "I'd like to walk you through..." },
      { id: "d5-p2", prompt_pt: "Explique qual é o objetivo principal.", target_en: "The main goal here is..." },
      { id: "d5-p3", prompt_pt: "Diga o que essa ideia permitiria fazer.", target_en: "This would allow us to..." },
      { id: "d5-p4", prompt_pt: "Pergunte se alguém tem alguma opinião.", target_en: "Any thoughts on this?" }
    ],
    recap_pt: "Você já tem a estrutura para vender qualquer ideia em inglês. Amanhã: discordar com diplomacia."
  },
  {
    id: 6,
    title: "Discordando com diplomacia",
    theme: "Negociação",
    intro_pt: "Discordar em inglês corporativo tem um jeito próprio — direto, mas nunca rude. Vamos praticar.",
    vocab: [
      { id: "d6-v1", en: "I see your point, but...", pt: "Eu entendo seu ponto, mas...", note_pt: "Valida antes de discordar." },
      { id: "d6-v2", en: "I'm not sure I fully agree.", pt: "Não tenho certeza se concordo totalmente.", note_pt: "Discordância suave." },
      { id: "d6-v3", en: "Could we consider another option?", pt: "Poderíamos considerar outra opção?", note_pt: "Propõe alternativa." },
      { id: "d6-v4", en: "From my perspective...", pt: "Da minha perspectiva...", note_pt: "Introduz seu ponto de vista." },
      { id: "d6-v5", en: "Let's find a middle ground.", pt: "Vamos encontrar um meio-termo.", note_pt: "Sinaliza colaboração." }
    ],
    dialogue: [
      { speaker: "colleague", en: "I think we should cut the training budget.", pt: "Acho que deveríamos cortar o orçamento de treinamento." },
      { speaker: "teacher", en: "I see your point, but I'm not sure I fully agree.", pt: "Eu entendo seu ponto, mas não tenho certeza se concordo totalmente." },
      { speaker: "teacher", en: "From my perspective, training is critical this quarter.", pt: "Da minha perspectiva, treinamento é crítico neste trimestre." },
      { speaker: "teacher", en: "Could we consider another option? Let's find a middle ground.", pt: "Poderíamos considerar outra opção? Vamos encontrar um meio-termo." }
    ],
    practice: [
      { id: "d6-p1", prompt_pt: "Valide o ponto do outro antes de discordar.", target_en: "I see your point, but..." },
      { id: "d6-p2", prompt_pt: "Diga que não tem certeza se concorda totalmente.", target_en: "I'm not sure I fully agree." },
      { id: "d6-p3", prompt_pt: "Proponha considerar outra opção.", target_en: "Could we consider another option?" },
      { id: "d6-p4", prompt_pt: "Proponha encontrar um meio-termo.", target_en: "Let's find a middle ground." }
    ],
    recap_pt: "Discordar bem é uma habilidade de liderança — e agora você tem as frases certas. Amanhã: falar sobre números e resultados."
  },
  {
    id: 7,
    title: "Falando sobre números e resultados",
    theme: "Dados e KPIs",
    intro_pt: "RH também é dado. Hoje você aprende a apresentar números com autoridade em inglês.",
    vocab: [
      { id: "d7-v1", en: "Turnover dropped by 12% this quarter.", pt: "O turnover caiu 12% neste trimestre.", note_pt: "Estrutura de variação percentual." },
      { id: "d7-v2", en: "We're currently at 85% retention.", pt: "Estamos atualmente com 85% de retenção.", note_pt: "Mostrar status atual." },
      { id: "d7-v3", en: "Compared to last year, engagement is up.", pt: "Comparado ao ano passado, o engajamento aumentou.", note_pt: "Comparação temporal." },
      { id: "d7-v4", en: "These numbers show a clear trend.", pt: "Esses números mostram uma tendência clara.", note_pt: "Interpretação de dados." },
      { id: "d7-v5", en: "Let's break this down by department.", pt: "Vamos detalhar isso por departamento.", note_pt: "Aprofundar a análise." }
    ],
    dialogue: [
      { speaker: "teacher", en: "Turnover dropped by 12% this quarter.", pt: "O turnover caiu 12% neste trimestre." },
      { speaker: "teacher", en: "We're currently at 85% retention, up from last year.", pt: "Estamos atualmente com 85% de retenção, acima do ano passado." },
      { speaker: "colleague", en: "That's great news. What's driving it?", pt: "Ótima notícia. O que está impulsionando isso?" },
      { speaker: "teacher", en: "These numbers show a clear trend. Let's break this down by department.", pt: "Esses números mostram uma tendência clara. Vamos detalhar isso por departamento." }
    ],
    practice: [
      { id: "d7-p1", prompt_pt: "Diga que o turnover caiu 12% no trimestre.", target_en: "Turnover dropped by 12% this quarter." },
      { id: "d7-p2", prompt_pt: "Diga que a retenção está em 85% atualmente.", target_en: "We're currently at 85% retention." },
      { id: "d7-p3", prompt_pt: "Diga que os números mostram uma tendência clara.", target_en: "These numbers show a clear trend." },
      { id: "d7-p4", prompt_pt: "Proponha detalhar os dados por departamento.", target_en: "Let's break this down by department." }
    ],
    recap_pt: "Apresentar dados em inglês já não é mais um bicho de sete cabeças. Amanhã: marcar e remarcar reuniões."
  },
  {
    id: 8,
    title: "Marcando e remarcando reuniões",
    theme: "Agenda",
    intro_pt: "Coordenar agenda com um time internacional é rotina sua. Hoje: frases prontas para isso.",
    vocab: [
      { id: "d8-v1", en: "Does this time work for you?", pt: "Esse horário funciona para você?", note_pt: "Propor horário." },
      { id: "d8-v2", en: "Could we push it to next week?", pt: "Poderíamos adiar para semana que vem?", note_pt: "Remarcar." },
      { id: "d8-v3", en: "I'm available anytime after 2pm.", pt: "Estou disponível a qualquer hora depois das 14h.", note_pt: "Dar disponibilidade." },
      { id: "d8-v4", en: "Let's lock this in for Thursday.", pt: "Vamos confirmar isso para quinta-feira.", note_pt: "Fechar o horário." },
      { id: "d8-v5", en: "Something came up, can we reschedule?", pt: "Surgiu um imprevisto, podemos remarcar?", note_pt: "Cancelamento educado." }
    ],
    dialogue: [
      { speaker: "colleague", en: "Does this time work for you, 10am on Thursday?", pt: "Esse horário funciona para você, 10h de quinta?" },
      { speaker: "teacher", en: "Something came up, can we reschedule?", pt: "Surgiu um imprevisto, podemos remarcar?" },
      { speaker: "teacher", en: "Could we push it to next week? I'm available anytime after 2pm.", pt: "Poderíamos adiar para semana que vem? Estou disponível a qualquer hora depois das 14h." },
      { speaker: "colleague", en: "Sure, let's lock this in for Thursday at 3pm.", pt: "Claro, vamos confirmar isso para quinta-feira às 15h." }
    ],
    practice: [
      { id: "d8-p1", prompt_pt: "Pergunte se um horário funciona para a pessoa.", target_en: "Does this time work for you?" },
      { id: "d8-p2", prompt_pt: "Peça para adiar a reunião para semana que vem.", target_en: "Could we push it to next week?" },
      { id: "d8-p3", prompt_pt: "Diga que está disponível a partir das 14h.", target_en: "I'm available anytime after 2pm." },
      { id: "d8-p4", prompt_pt: "Diga que surgiu um imprevisto e pergunte se podem remarcar.", target_en: "Something came up, can we reschedule?" }
    ],
    recap_pt: "Agenda internacional resolvida com frases naturais. Amanhã: conduzir uma entrevista com candidatos."
  },
  {
    id: 9,
    title: "Conduzindo uma entrevista",
    theme: "Recrutamento",
    intro_pt: "Entrevistar em inglês é diferente de conversar em inglês. Hoje você aprende as perguntas-chave.",
    vocab: [
      { id: "d9-v1", en: "Tell me about your experience with...", pt: "Me conte sobre sua experiência com...", note_pt: "Pergunta aberta clássica." },
      { id: "d9-v2", en: "Can you walk me through a time when...", pt: "Você pode me contar sobre uma vez em que...", note_pt: "Pergunta comportamental (STAR)." },
      { id: "d9-v3", en: "What are you looking for in your next role?", pt: "O que você busca na sua próxima posição?", note_pt: "Entende motivação." },
      { id: "d9-v4", en: "Do you have any questions for me?", pt: "Você tem alguma pergunta para mim?", note_pt: "Encerramento padrão." },
      { id: "d9-v5", en: "We'll follow up within a week.", pt: "Daremos um retorno em até uma semana.", note_pt: "Fecha com expectativa clara." }
    ],
    dialogue: [
      { speaker: "teacher", en: "Tell me about your experience with remote teams.", pt: "Me conte sobre sua experiência com times remotos." },
      { speaker: "colleague", en: "Sure, I led a team of eight across three countries.", pt: "Claro, eu liderei um time de oito pessoas em três países." },
      { speaker: "teacher", en: "Can you walk me through a time when you handled a conflict?", pt: "Você pode me contar sobre uma vez em que lidou com um conflito?" },
      { speaker: "teacher", en: "Great. Do you have any questions for me? We'll follow up within a week.", pt: "Ótimo. Você tem alguma pergunta para mim? Daremos um retorno em até uma semana." }
    ],
    practice: [
      { id: "d9-p1", prompt_pt: "Peça para o candidato contar sobre a experiência dele com algo.", target_en: "Tell me about your experience with..." },
      { id: "d9-p2", prompt_pt: "Peça um exemplo comportamental de uma situação.", target_en: "Can you walk me through a time when..." },
      { id: "d9-p3", prompt_pt: "Pergunte se o candidato tem perguntas para você.", target_en: "Do you have any questions for me?" },
      { id: "d9-p4", prompt_pt: "Diga que vocês darão um retorno em uma semana.", target_en: "We'll follow up within a week." }
    ],
    recap_pt: "Suas entrevistas em inglês agora têm estrutura e confiança. Amanhã: pedir esclarecimentos em reuniões."
  },
  {
    id: 10,
    title: "Pedindo esclarecimentos sem perder a pose",
    theme: "Reuniões",
    intro_pt: "Último dia desta primeira semana e meia! Hoje: como pedir para repetirem ou explicarem algo, com naturalidade — sem parecer que você não entendeu o inglês.",
    vocab: [
      { id: "d10-v1", en: "Could you say that again, please?", pt: "Você poderia repetir, por favor?", note_pt: "Pedido simples e educado." },
      { id: "d10-v2", en: "Sorry, could you clarify what you mean by...?", pt: "Desculpe, você poderia esclarecer o que quer dizer com...?", note_pt: "Soa analítico, não perdido." },
      { id: "d10-v3", en: "Just to make sure I understood...", pt: "Só para ter certeza de que entendi...", note_pt: "Ótimo para confirmar antes de agir." },
      { id: "d10-v4", en: "Could you give an example?", pt: "Você poderia dar um exemplo?", note_pt: "Pede concretude." },
      { id: "d10-v5", en: "Let me repeat that back to you.", pt: "Deixa eu repetir de volta para você.", note_pt: "Confirma entendimento, muito usado por líderes." }
    ],
    dialogue: [
      { speaker: "colleague", en: "We need to align the headcount plan with the new budget envelope.", pt: "Precisamos alinhar o plano de headcount com o novo envelope orçamentário." },
      { speaker: "teacher", en: "Sorry, could you clarify what you mean by 'budget envelope'?", pt: "Desculpe, você poderia esclarecer o que quer dizer com 'envelope orçamentário'?" },
      { speaker: "colleague", en: "Sure, it's the total amount approved for the year.", pt: "Claro, é o valor total aprovado para o ano." },
      { speaker: "teacher", en: "Just to make sure I understood — let me repeat that back to you.", pt: "Só para ter certeza de que entendi — deixa eu repetir de volta para você." }
    ],
    practice: [
      { id: "d10-p1", prompt_pt: "Peça para a pessoa repetir o que disse.", target_en: "Could you say that again, please?" },
      { id: "d10-p2", prompt_pt: "Peça para esclarecerem o que quiseram dizer com algo.", target_en: "Could you clarify what you mean by...?" },
      { id: "d10-p3", prompt_pt: "Diga que quer confirmar se entendeu direito.", target_en: "Just to make sure I understood..." },
      { id: "d10-p4", prompt_pt: "Peça um exemplo.", target_en: "Could you give an example?" }
    ],
    recap_pt: "Dez dias, dez situações reais resolvidas em inglês. Você já pode revisar e pedir mais dias quando quiser."
  }
];

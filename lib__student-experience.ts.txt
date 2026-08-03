export type WorkoutCompletionExperience = {
  title: string;
  summary: string;
  motivation: string;
  nextStep: string;
  badge: string;
};

function firstName(value?: string | null): string {
  const normalized = String(value || "").trim();
  return normalized ? normalized.split(/\s+/)[0] : "você";
}

export function buildWorkoutCompletionExperience(input: {
  studentName?: string | null;
  partial: boolean;
  done: number;
  skipped: number;
  completedCount: number;
  weekCompleted?: boolean;
}): WorkoutCompletionExperience {
  const name = firstName(input.studentName);
  const totalResolved = input.done + input.skipped;

  if (input.weekCompleted) {
    return {
      title: `Semana concluída, ${name}! 🎉`,
      summary: `Você fechou a semana com ${input.done} exercício(s) realizado(s) neste treino${input.skipped ? ` e ${input.skipped} registrado(s) como não realizado(s)` : ""}.`,
      motivation: "Consistência não é fazer tudo perfeito. É continuar aparecendo, aprendendo e cuidando de você. Hoje você fez exatamente isso.",
      nextStep: "Agora é hora de se hidratar, descansar e registrar qualquer facilidade, dificuldade ou desconforto. Seu professor usará esse retorno nos próximos treinos.",
      badge: "SEMANA CONCLUÍDA",
    };
  }

  if (input.partial) {
    return {
      title: `Treino registrado, ${name}! 👏`,
      summary: `Você realizou ${input.done} de ${Math.max(totalResolved, input.done)} exercício(s) e deixou ${input.skipped} relato(s) para o professor acompanhar.`,
      motivation: "Treino adaptado também é treino feito com consciência. Respeitar o corpo e registrar o que aconteceu ajuda a construir uma evolução mais segura.",
      nextStep: "Descanse, hidrate-se e fique de olho no chat. Seu professor poderá usar seus relatos para ajustar as próximas sessões.",
      badge: "PASSO CONCLUÍDO",
    };
  }

  if (input.completedCount <= 1) {
    return {
      title: `Primeiro passo concluído, ${name}! 🚀`,
      summary: `Você realizou ${input.done} exercício(s) e concluiu seu primeiro treino registrado na plataforma.`,
      motivation: "Começar é uma conquista importante. Resultado vem de um treino de cada vez, e hoje você já colocou esse movimento em prática.",
      nextStep: "Hidrate-se, descanse e conte no chat como se sentiu. Esse retorno ajuda seu professor a conhecer melhor você.",
      badge: "PRIMEIRO TREINO",
    };
  }

  const options = [
    {
      title: `Mandou bem, ${name}! 💪`,
      motivation: "Mais um treino concluído e mais um compromisso cumprido com você. É essa soma de pequenos passos que constrói uma rotina forte.",
    },
    {
      title: `Boa, ${name}! ✨`,
      motivation: "Você não precisava fazer um treino perfeito; precisava fazer o treino de hoje. E fez. Celebre essa constância.",
    },
    {
      title: `Treino na conta, ${name}! 👊`,
      motivation: "Seu esforço de hoje já faz parte da sua evolução. Continue avançando no seu ritmo, com técnica e consistência.",
    },
    {
      title: `Mais um passo, ${name}! 🌟`,
      motivation: "Cada sessão concluída reforça uma escolha importante: cuidar da sua saúde e seguir em direção ao seu objetivo.",
    },
  ];
  const selected = options[input.completedCount % options.length];

  return {
    title: selected.title,
    summary: `Você realizou ${input.done} exercício(s) e concluiu seu ${input.completedCount}º treino registrado.`,
    motivation: selected.motivation,
    nextStep: "Agora se hidrate, recupere bem e marque como se sentiu nos exercícios. Seu professor acompanha essas informações.",
    badge: "TREINO CONCLUÍDO",
  };
}

export function humanizeStudentEmail(input: {
  studentName?: string | null;
  senderName?: string | null;
  headline: string;
  message: string;
  nextStep?: string | null;
  automaticDisclosure?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
}) {
  const student = firstName(input.studentName);
  const sender = String(input.senderName || "Equipe Funcional UP Digital").trim();
  const nextStep = String(input.nextStep || "").trim();
  const disclosure =
    String(input.automaticDisclosure || "").trim() ||
    `Mensagem automática de acompanhamento enviada em nome de ${sender}.`;

  const text = [
    `Oi, ${student}!`,
    "",
    input.headline,
    "",
    input.message,
    nextStep ? "" : null,
    nextStep || null,
    "",
    "Conte com a gente nessa caminhada.",
    sender,
    "Funcional UP Digital",
    "",
    disclosure,
    input.actionUrl ? `Acesse: ${input.actionUrl}` : null,
  ].filter(Boolean).join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:18px;padding:26px">
        <p style="margin:0 0 8px;color:#f5f5f5;font-size:15px">Oi, <strong>${student}</strong>!</p>
        <h2 style="margin:0 0 16px;color:#00A19C;font-size:22px">${input.headline}</h2>
        <p style="margin:0;color:#d4d4d4;font-size:15px;line-height:1.65">${input.message.replaceAll("\n","<br />")}</p>
        ${nextStep ? `<div style="margin-top:18px;padding:14px;border-radius:12px;background:#00A19C12;border:1px solid #00A19C35;color:#d4d4d4;font-size:14px;line-height:1.6"><strong style="color:#00A19C">Próximo passo:</strong><br />${nextStep}</div>` : ""}
        ${input.actionUrl ? `<a href="${input.actionUrl}" style="display:inline-block;margin-top:20px;background:#00A19C;color:#081312;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">${input.actionLabel || "Acessar plataforma"}</a>` : ""}
        <p style="margin:22px 0 0;color:#f5f5f5;font-size:14px">Conte com a gente nessa caminhada.<br /><strong>${sender}</strong><br /><span style="color:#00A19C">Funcional UP Digital</span></p>
        <p style="margin:18px 0 0;color:#6b6b6b;font-size:11px">${disclosure}</p>
      </div>
    </div>`;

  return { text, html };
}

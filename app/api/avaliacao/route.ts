import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";

function getAppBaseUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return appUrl.replace(/\/$/, "");
}

function getAppLoginUrl(): string {
  return `${getAppBaseUrl()}/auth/signin`;
}

function getVincularAlunosUrl(): string {
  return `${getAppBaseUrl()}/dashboard/gestor/vincular-alunos`;
}

function addDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 59, 999);

  return date;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getNoticeAuthorId(): Promise<string | null> {
  const gestor = await prisma.user.findFirst({
    where: {
      role: {
        in: ["GESTOR", "ADMIN"],
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return gestor?.id || null;
}

async function notifyInitialEvaluationCompleted(alunoId: string) {
  const student = await prisma.student.findUnique({
    where: { id: alunoId },
    select: {
      id: true,
      name: true,
      email: true,
      userAuthId: true,
    },
  });

  if (!student) return;

  let studentEmail = student.email || null;
  let studentName = student.name || "Aluno";

  if (!studentEmail && student.userAuthId) {
    const userAuth = await prisma.user.findUnique({
      where: { id: student.userAuthId },
      select: {
        name: true,
        email: true,
      },
    });

    studentEmail = userAuth?.email || null;
    studentName = student.name || userAuth?.name || "Aluno";
  }

  const gestores = await prisma.user.findMany({
    where: {
      role: {
        in: ["GESTOR", "ADMIN"],
      },
      email: {
        not: null,
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  const loginUrl = getAppLoginUrl();
  const vincularAlunosUrl = getVincularAlunosUrl();
  const safeStudentName = escapeHtml(studentName);

  const emailTasks: Promise<unknown>[] = [];

  const welcomeTitle = `${studentName}, recebemos sua avaliação inicial`;

  const welcomeContent = [
    `Oi, ${studentName}!`,
    "",
    "Seu cadastro e sua avaliação inicial foram concluídos. Essas informações serão usadas para que o acompanhamento comece com mais contexto e cuidado.",
    "",
    "Agora a gestão vai organizar o vínculo com o professor responsável e a preparação dos seus primeiros treinos. Acompanhe o mural e o e-mail para não perder as próximas orientações.",
    "",
    "Quando o professor estiver vinculado, use o chat da plataforma para dúvidas sobre treino e evolução. Assim, as conversas ficam registradas. O WhatsApp fica reservado para contatos específicos da gestão.",
  ].join("\n");

  const gestorNoticeTitle = `Novo aluno pronto para vínculo: ${studentName}`;

  const gestorNoticeContent = [
    `Olá, gestão! ${studentName} concluiu o cadastro e a avaliação inicial.`,
    "",
    "Próxima ação: revisar os dados, vincular o professor responsável e confirmar a quantidade contratada de treinos/dias no mês.",
    "",
    "Depois do vínculo, o professor deverá receber o contexto necessário para iniciar o acompanhamento.",
    "",
    `Abrir vínculo de alunos: ${vincularAlunosUrl}`,
  ].join("\n");

  try {
    const noticeAuthorId = await getNoticeAuthorId();

    if (noticeAuthorId) {
      emailTasks.push(
        prisma.notice.create({
          data: {
            title: welcomeTitle,
            content: welcomeContent,
            type: "WELCOME",
            targetRole: "STUDENT",
            studentId: student.id,
            authorId: noticeAuthorId,
            expiresAt: addDays(30),
          },
        })
      );

      emailTasks.push(
        prisma.notice.create({
          data: {
            title: gestorNoticeTitle,
            content: gestorNoticeContent,
            type: "GESTAO_PENDENCIA",
            targetRole: "GESTOR",
            studentId: student.id,
            authorId: noticeAuthorId,
          },
        })
      );
    } else {
      console.warn(
        "Avisos automáticos não criados: nenhum usuário GESTOR/ADMIN encontrado para ser authorId."
      );
    }
  } catch (noticeError) {
    console.error("Erro ao preparar avisos automáticos no mural:", noticeError);
  }

  if (studentEmail) {
    const subject = `${studentName}, sua avaliação inicial foi recebida`;

    const text = [
      `Oi, ${studentName}!`,
      "",
      "Recebemos seu cadastro e sua avaliação inicial. Obrigado por compartilhar essas informações com a gente.",
      "",
      "Elas serão usadas para que seu acompanhamento comece com mais contexto, cuidado e segurança.",
      "",
      "Agora a gestão vai organizar o vínculo com o professor responsável e a preparação dos seus primeiros treinos. Acompanhe o mural e seus e-mails para não perder as próximas orientações.",
      "",
      "Quando o professor estiver vinculado, use o chat da plataforma para dúvidas sobre treino e evolução. Assim, as conversas ficam registradas. O WhatsApp fica reservado para contatos específicos da gestão.",
      "",
      `Acessar meu painel: ${loginUrl}`,
      "",
      "Equipe Funcional UP Digital",
      "Mensagem automática de boas-vindas e acompanhamento.",
    ].join("\n");

    const html = `
      <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
          <h2 style="color:#22D3EE;margin:0 0 16px;">Recebemos sua avaliação inicial</h2>
          <p style="color:#f5f5f5;font-size:15px;line-height:1.6;">Oi, <strong>${safeStudentName}</strong>!</p>
          <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Recebemos seu cadastro e sua avaliação inicial. Obrigado por compartilhar essas informações com a gente.</p>
          <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Elas serão usadas para que seu acompanhamento comece com mais contexto, cuidado e segurança.</p>
          <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Agora a gestão vai organizar o vínculo com o professor responsável e a preparação dos seus primeiros treinos. Acompanhe o mural e seus e-mails para não perder as próximas orientações.</p>
          <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Quando o professor estiver vinculado, use o chat da plataforma para dúvidas sobre treino e evolução. Assim, as conversas ficam registradas. O WhatsApp fica reservado para contatos específicos da gestão.</p>
          <a href="${loginUrl}" style="display:inline-block;background:#22D3EE;color:#0a0a0a;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:10px;">Acessar meu painel</a>
          <p style="color:#6b7280;font-size:11px;line-height:1.5;margin-top:18px;">Mensagem automática de boas-vindas e acompanhamento enviada pela equipe Funcional UP Digital.</p>
        </div>
      </div>
    `;

    emailTasks.push(
      sendEmail({
        to: studentEmail,
        subject,
        text,
        html,
      })
    );
  }

  gestores
    .filter((gestor) => Boolean(gestor.email))
    .forEach((gestor) => {
      const gestorName = gestor.name || "Gestão";
      const subject = `Novo aluno pronto para vínculo: ${studentName}`;

      const text = [
        `Oi, ${gestorName}!`,
        "",
        `${studentName} concluiu o cadastro e a avaliação inicial.`,
        "",
        "Próxima ação: revisar os dados, vincular o professor responsável e confirmar a quantidade contratada de treinos/dias no mês.",
        "",
        "Depois do vínculo, confira se o professor recebeu o contexto necessário para iniciar o acompanhamento.",
        "",
        `Abrir vínculo de alunos: ${vincularAlunosUrl}`,
        "",
        "Funcional UP Digital",
        "Aviso automático de pendência operacional para a gestão.",
      ].join("\n");

      const html = `
        <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
          <div style="max-width:560px;margin:0 auto;background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
            <h2 style="color:#22D3EE;margin:0 0 16px;">Novo aluno pronto para vínculo</h2>
            <p style="color:#f5f5f5;font-size:15px;line-height:1.6;">Oi, <strong>${escapeHtml(gestorName)}</strong>!</p>
            <p style="color:#d4d4d4;font-size:14px;line-height:1.6;"><strong style="color:#f5f5f5;">${safeStudentName}</strong> concluiu o cadastro e a avaliação inicial.</p>
            <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Próxima ação: revisar os dados, vincular o professor responsável e confirmar a quantidade contratada de treinos/dias no mês.</p>
            <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Depois do vínculo, confira se o professor recebeu o contexto necessário para iniciar o acompanhamento.</p>
            <a href="${vincularAlunosUrl}" style="display:inline-block;background:#22D3EE;color:#0a0a0a;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:10px;">Organizar vínculo</a>
            <p style="color:#6b7280;font-size:11px;line-height:1.5;margin-top:18px;">Aviso automático de pendência operacional para a gestão.</p>
          </div>
        </div>
      `;

      emailTasks.push(
        sendEmail({
          to: gestor.email as string,
          subject,
          text,
          html,
        })
      );
    });

  if (emailTasks.length > 0) {
    await Promise.allSettled(emailTasks);
  }
}

// GET /api/avaliacao?alunoId=xxx&tipo=INICIAL
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const alunoId = searchParams.get("alunoId");
    const tipo = searchParams.get("tipo");

    if (!alunoId) {
      return NextResponse.json({ error: "alunoId é obrigatório" }, { status: 400 });
    }

    const where: any = { alunoId };
    if (tipo) where.tipo = tipo;

    const avaliacoes = await prisma.avaliacao.findMany({
      where,
      orderBy: { mesReferencia: "desc" },
    });

    return NextResponse.json(avaliacoes);
  } catch (error) {
    console.error("Erro ao buscar avaliações:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// POST /api/avaliacao
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      alunoId,
      tipo,
      mesReferencia,
      objetivo,
      metaEspecifica,
      peso,
      altura,
      abdomen,
      quadril,
      braco,
      coxa,
      gluteo,
      preferencia,
      equipamentos,
      frequencia,
      nivelAtividade,
      lesoes,
      fotoUrl,
    } = body;

    if (!alunoId || !tipo || !mesReferencia) {
      return NextResponse.json(
        { error: "alunoId, tipo e mesReferencia são obrigatórios" },
        { status: 400 }
      );
    }

    const tipoNormalizado = String(tipo || "").toUpperCase();

    const avaliacaoInicialExistente =
      tipoNormalizado === "INICIAL"
        ? await prisma.avaliacao.findFirst({
            where: {
              alunoId,
              tipo: "INICIAL",
            },
            select: {
              id: true,
            },
          })
        : null;

    // Cria a avaliação
    const avaliacao = await prisma.avaliacao.create({
      data: {
        alunoId,
        tipo: tipoNormalizado,
        mesReferencia,
        objetivo,
        metaEspecifica,
        peso: peso ? parseFloat(peso) : null,
        altura: altura ? parseFloat(altura) : null,
        abdomen: abdomen ? parseFloat(abdomen) : null,
        quadril: quadril ? parseFloat(quadril) : null,
        braco: braco ? parseFloat(braco) : null,
        coxa: coxa ? parseFloat(coxa) : null,
        gluteo: gluteo ? parseFloat(gluteo) : null,
        preferencia,
        equipamentos: equipamentos || null,
        frequencia: frequencia ? parseInt(frequencia) : null,
        nivelAtividade,
        lesoes,
        fotoUrl,
      },
    });

    // Se for avaliação INICIAL, marca o onboarding como completo
    if (tipoNormalizado === "INICIAL") {
      await prisma.student.update({
        where: { id: alunoId },
        data: { onboardingCompleto: true },
      });

      // Dispara e-mails e cria aviso no mural somente na primeira avaliação inicial.
      // Se o aluno editar/refizer depois, não reenvia e não recria aviso.
      if (!avaliacaoInicialExistente) {
        try {
          await notifyInitialEvaluationCompleted(alunoId);
        } catch (notificationError) {
          console.error(
            "Erro ao enviar notificações de conclusão da avaliação inicial:",
            notificationError
          );
        }
      }
    }

    return NextResponse.json(avaliacao, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar avaliação:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// GET /api/avaliacao/relatorio?alunoId=xxx
export async function PUT(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const alunoId = searchParams.get("alunoId");

    if (!alunoId) {
      return NextResponse.json({ error: "alunoId é obrigatório" }, { status: 400 });
    }

    // Busca a avaliação inicial e a última mensal
    const inicial = await prisma.avaliacao.findFirst({
      where: { alunoId, tipo: "INICIAL" },
    });

    const mensal = await prisma.avaliacao.findFirst({
      where: { alunoId, tipo: "MENSAL" },
      orderBy: { mesReferencia: "desc" },
    });

    if (!inicial) {
      return NextResponse.json({ error: "Avaliação inicial não encontrada" }, { status: 404 });
    }

    // Monta o relatório comparativo
    const relatorio: any = {
      alunoId,
      objetivo: inicial.objetivo,
      metaEspecifica: inicial.metaEspecifica,
      periodo: `Mês ${inicial.mesReferencia}`,
      comparativo: {},
    };

    const campos = [
      { nome: "peso", label: "Peso (kg)", menorMelhor: true },
      { nome: "abdomen", label: "Abdômen (cm)", menorMelhor: true },
      { nome: "quadril", label: "Quadril (cm)", menorMelhor: true },
      { nome: "braco", label: "Braço (cm)", menorMelhor: false },
      { nome: "coxa", label: "Coxa (cm)", menorMelhor: false },
      { nome: "gluteo", label: "Glúteo (cm)", menorMelhor: false },
    ];

    let progressosPositivos = 0;
    let totalComparaveis = 0;

    for (const campo of campos) {
      const valorInicial = (inicial as any)[campo.nome];
      const valorAtual = mensal ? (mensal as any)[campo.nome] : null;

      if (valorInicial != null) {
        const diferenca = valorAtual != null ? (valorAtual - valorInicial) : 0;
        const melhorou = campo.menorMelhor ? diferenca < 0 : diferenca > 0;

        if (valorAtual != null) {
          totalComparaveis++;
          if (melhorou || diferenca === 0) progressosPositivos++;
        }

        relatorio.comparativo[campo.nome] = {
          label: campo.label,
          inicial: valorInicial,
          atual: valorAtual,
          diferenca: valorAtual != null ? Math.round(diferenca * 100) / 100 : null,
          melhorou: valorAtual != null ? melhorou : null,
        };
      }
    }

    // Calcula score de evolução
    const scoreEvolucao = totalComparaveis > 0
      ? Math.round((progressosPositivos / totalComparaveis) * 100)
      : 0;

    relatorio.scoreEvolucao = scoreEvolucao;
    relatorio.altura = inicial.altura;

    // Calcula IMC se tiver peso e altura
    if (inicial.peso && inicial.altura) {
      const imcInicial = inicial.peso / Math.pow(inicial.altura / 100, 2);
      relatorio.imcInicial = Math.round(imcInicial * 100) / 100;

      if (mensal?.peso && inicial.altura) {
        const imcAtual = mensal.peso / Math.pow(inicial.altura / 100, 2);
        relatorio.imcAtual = Math.round(imcAtual * 100) / 100;
      }
    }

    return NextResponse.json(relatorio);
  } catch (error) {
    console.error("Erro ao gerar relatório:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

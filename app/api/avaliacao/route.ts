import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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
      equipamentos, // 🔥 NOVO: campo de equipamentos para treino em casa
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

    // Cria a avaliação
    const avaliacao = await prisma.avaliacao.create({
      data: {
        alunoId,
        tipo,
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
        equipamentos: equipamentos || null, // 🔥 NOVO: salva os equipamentos selecionados
        frequencia: frequencia ? parseInt(frequencia) : null,
        nivelAtividade,
        lesoes,
        fotoUrl,
      },
    });

    // Se for avaliação INICIAL, marca o onboarding como completo
    if (tipo === "INICIAL") {
      await prisma.student.update({
        where: { id: alunoId },
        data: { onboardingCompleto: true },
      });
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

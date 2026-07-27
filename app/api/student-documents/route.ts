import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

function normalizeRole(value?: string | null): string {
  const role = String(value || "").toUpperCase();
  if (role === "PROFESSOR") return "TEACHER";
  if (role === "ALUNO") return "STUDENT";
  return role;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseJson(raw: unknown): any {
  const text = cleanText(raw)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Cole um JSON válido.");
  return JSON.parse(text.slice(start, end + 1));
}

async function getAccessibleQuestion(questionId: string, userId: string, role: string) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      student: { select: { id: true, name: true, userId: true } },
    },
  });

  if (!question?.student || !question.documentUrl) return null;
  const allowed = role === "GESTOR" || role === "ADMIN" || (role === "TEACHER" && (question.teacherId === userId || question.student.userId === userId));
  return allowed ? question : null;
}

function buildPrompt(question: any): string {
  const model = {
    documentType: "LAUDO | EXAME | ATESTADO | ORIENTACAO_MEDICA | AVALIACAO | OUTRO",
    title: "Título objetivo",
    objectiveFindings: ["Informação literalmente presente no documento"],
    trainingRelevantInformation: ["Informação que pode influenciar o treino"],
    explicitRestrictions: ["Somente restrições explicitamente escritas"],
    recommendations: ["Somente recomendações explicitamente escritas"],
    bodyRegions: ["Regiões mencionadas"],
    validityOrDate: "Data/validade encontrada ou vazio",
    questionsForProfessor: ["Pontos que precisam ser confirmados"],
    summaryForTraining: "Resumo curto, objetivo e sem diagnóstico",
    requiresUrgentHumanReview: false,
  };

  return [
    "Você está apoiando um professor de educação física na leitura de um documento enviado por um aluno.",
    "Analise o ARQUIVO QUE SERÁ ANEXADO JUNTO COM ESTE PROMPT.",
    "Não dê diagnóstico, não interprete valores além do texto, não invente restrições e não substitua avaliação médica.",
    "Extraia somente informações objetivas que possam influenciar a prescrição ou segurança do treino.",
    "Quando algo não estiver claro, inclua em questionsForProfessor.",
    "Retorne SOMENTE JSON válido, sem markdown, comentários ou texto fora do JSON.",
    "O professor revisará o resultado antes de salvar na memória técnica do aluno.",
    "",
    `ALUNO: ${question.student.name}`,
    `ARQUIVO: ${question.documentName || "Documento sem nome"}`,
    `TIPO MIME: ${question.documentMimeType || "não informado"}`,
    `MENSAGEM DO ALUNO: ${question.content || ""}`,
    "",
    "MODELO OBRIGATÓRIO:",
    JSON.stringify(model, null, 2),
  ].join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : "";
    const role = normalizeRole(user?.role);
    if (!userId || !["GESTOR", "ADMIN", "TEACHER"].includes(role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = await request.json();
    const action = cleanText(body?.action).toUpperCase();
    const questionId = cleanText(body?.questionId);
    const question = await getAccessibleQuestion(questionId, userId, role);
    if (!question) return NextResponse.json({ error: "Documento não encontrado ou sem permissão." }, { status: 404 });

    if (action === "PREPARE_PROMPT") {
      return NextResponse.json({ ok: true, manualPrompt: buildPrompt(question) });
    }

    if (action === "SAVE_ANALYSIS") {
      let parsed: any;
      try { parsed = parseJson(body?.manualResponse); } catch (error: any) {
        return NextResponse.json({ error: error?.message || "JSON inválido." }, { status: 422 });
      }

      const summary = cleanText(parsed?.summaryForTraining);
      const title = cleanText(parsed?.title) || question.documentName || "Documento analisado";
      if (!summary) return NextResponse.json({ error: "O JSON precisa conter summaryForTraining." }, { status: 422 });

      const details = {
        documentType: cleanText(parsed?.documentType) || "OUTRO",
        summaryForTraining: summary,
        objectiveFindings: Array.isArray(parsed?.objectiveFindings) ? parsed.objectiveFindings : [],
        trainingRelevantInformation: Array.isArray(parsed?.trainingRelevantInformation) ? parsed.trainingRelevantInformation : [],
        explicitRestrictions: Array.isArray(parsed?.explicitRestrictions) ? parsed.explicitRestrictions : [],
        recommendations: Array.isArray(parsed?.recommendations) ? parsed.recommendations : [],
        bodyRegions: Array.isArray(parsed?.bodyRegions) ? parsed.bodyRegions : [],
        validityOrDate: cleanText(parsed?.validityOrDate),
        questionsForProfessor: Array.isArray(parsed?.questionsForProfessor) ? parsed.questionsForProfessor : [],
        requiresUrgentHumanReview: Boolean(parsed?.requiresUrgentHumanReview),
      };

      const memory = await prisma.studentTechnicalMemory.create({
        data: {
          studentId: question.student.id,
          sourceQuestionId: question.id,
          category: "DOCUMENT",
          title,
          summary: JSON.stringify(details, null, 2),
          sourceDocumentName: question.documentName,
          sourceDocumentUrl: question.documentUrl,
          status: "APPROVED",
          reviewedById: userId,
          reviewedAt: new Date(),
        },
      });

      return NextResponse.json({ ok: true, memoryId: memory.id, message: "Análise salva na memória técnica do aluno e pronta para entrar nos próximos prompts." });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("POST /api/student-documents error:", error);
    return NextResponse.json({ error: "Erro interno ao processar documento." }, { status: 500 });
  }
}

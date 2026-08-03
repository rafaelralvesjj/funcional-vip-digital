import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import JSZip from "jszip";
import { createHash, randomUUID } from "crypto";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { MANUAL_AI_EXECUTION_HEADER_LINES } from "@/lib/manual-ai-execution-header";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeRole(value?: string | null): string {
  const role = String(value || "").toUpperCase();
  if (role === "PROFESSOR") return "TEACHER";
  if (role === "ALUNO") return "STUDENT";
  return role;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripMarkdownFences(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:json|javascript|js|txt)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function findFirstValidJsonObject(text: string): any {
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;

      if (depth === 0) {
        const candidate = text.slice(start, index + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          break;
        }
      }
    }
  }

  throw new Error("Não foi possível localizar um objeto JSON válido na resposta da IA.");
}

function parseJson(raw: unknown): any {
  const text = stripMarkdownFences(cleanText(raw));
  if (!text) throw new Error("Cole ou importe a resposta produzida pela IA.");

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // A IA pode devolver uma introdução curta, bloco markdown ou texto após o JSON.
  }

  return findFirstValidJsonObject(text);
}

function firstNonEmptyText(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 50);
  }

  const text = cleanText(value);
  return text ? [text] : [];
}

function unwrapAnalysisPayload(parsed: any): any {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  for (const key of ["analysis", "result", "data", "response", "resposta"]) {
    const nested = parsed[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return { ...parsed, ...nested };
    }
  }

  return parsed;
}

function normalizeAnalysisResponse(parsedValue: any) {
  const parsed = unwrapAnalysisPayload(parsedValue);
  const trainingRelevantInformation = normalizeStringArray(
    parsed.trainingRelevantInformation ?? parsed.training_relevant_information ?? parsed.informacoesRelevantesTreino
  );
  const explicitRestrictions = normalizeStringArray(
    parsed.explicitRestrictions ?? parsed.explicit_restrictions ?? parsed.restricoesExplicitas
  );
  const recommendations = normalizeStringArray(parsed.recommendations ?? parsed.recomendacoes);
  const questionsForProfessor = normalizeStringArray(
    parsed.questionsForProfessor ?? parsed.questions_for_professor ?? parsed.perguntasParaProfessor
  );
  const limitations = normalizeStringArray(parsed.limitations ?? parsed.limits ?? parsed.limitacoes);

  const fallbackSummary = [
    ...trainingRelevantInformation,
    ...explicitRestrictions.map((item) => `Restrição explícita: ${item}`),
    ...recommendations.map((item) => `Recomendação registrada: ${item}`),
  ]
    .slice(0, 8)
    .join(" ");

  const summaryForTraining = firstNonEmptyText(
    parsed.summaryForTraining,
    parsed.summary_for_training,
    parsed.trainingSummary,
    parsed.summary,
    parsed.resumoParaTreino,
    parsed.resumo,
    fallbackSummary
  );

  const studentReplySuggestion = firstNonEmptyText(
    parsed.studentReplySuggestion,
    parsed.student_reply_suggestion,
    parsed.replySuggestion,
    parsed.suggestedStudentReply,
    parsed.respostaSugeridaAluno,
    parsed.sugestaoRespostaAluno
  );

  return {
    schemaVersion: "1.0",
    packageTitle: firstNonEmptyText(parsed.packageTitle, parsed.title, parsed.titulo) || "Análise de anexos do aluno",
    analyzedFiles: Array.isArray(parsed.analyzedFiles) ? parsed.analyzedFiles.slice(0, 50) : [],
    professorVideoReviews: Array.isArray(parsed.professorVideoReviews) ? parsed.professorVideoReviews.slice(0, 20) : [],
    trainingRelevantInformation,
    explicitRestrictions,
    recommendations,
    bodyRegions: normalizeStringArray(parsed.bodyRegions ?? parsed.body_regions ?? parsed.regioesDoCorpo),
    questionsForProfessor,
    limitations,
    summaryForTraining,
    studentReplySuggestion,
    requiresUrgentHumanReview: Boolean(
      parsed.requiresUrgentHumanReview ?? parsed.requires_urgent_human_review ?? parsed.requerRevisaoHumanaUrgente
    ),
    sourceResponse: parsed,
  };
}

function safeFileName(value: string, fallback: string): string {
  const cleaned = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

async function getAccessibleQuestion(questionId: string, userId: string, role: string) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      student: { select: { id: true, name: true, userId: true } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!question?.student) return null;
  const allowed = role === "GESTOR" || role === "ADMIN" || (role === "TEACHER" && question.teacherId === userId);
  return allowed ? question : null;
}

type PackageItem = {
  id: string;
  kind: "IMAGE" | "DOCUMENT" | "VIDEO";
  url: string;
  name: string;
  mimeType: string;
  videoReviewSummary?: string;
};

function collectItems(question: any): PackageItem[] {
  const items: PackageItem[] = (question.attachments || []).map((attachment: any, index: number) => ({
    id: attachment.id,
    kind: String(attachment.kind || "DOCUMENT").toUpperCase() as PackageItem["kind"],
    url: attachment.url,
    name: attachment.name || `arquivo-${index + 1}`,
    mimeType: attachment.mimeType || "application/octet-stream",
    videoReviewSummary: cleanText(attachment.videoReviewSummary),
  }));

  const urls = new Set(items.map((item) => item.url));
  if (question.imageUrl && !urls.has(question.imageUrl)) items.push({ id: "legacy-image", kind: "IMAGE", url: question.imageUrl, name: "imagem-enviada.jpg", mimeType: "image/jpeg" });
  if (question.documentUrl && !urls.has(question.documentUrl)) items.push({ id: "legacy-document", kind: "DOCUMENT", url: question.documentUrl, name: question.documentName || "documento-enviado", mimeType: question.documentMimeType || "application/octet-stream" });
  if (question.videoUrl && !urls.has(question.videoUrl)) items.push({ id: "legacy-video", kind: "VIDEO", url: question.videoUrl, name: "video-enviado.mp4", mimeType: "video/mp4", videoReviewSummary: "" });
  return items;
}

function buildPrompt(question: any, items: PackageItem[]): string {
  const documents = items.filter((item) => item.kind === "DOCUMENT");
  const images = items.filter((item) => item.kind === "IMAGE");
  const videos = items.filter((item) => item.kind === "VIDEO");
  const model = {
    packageTitle: "Título objetivo do conjunto analisado",
    analyzedFiles: [{ fileName: "arquivo.ext", fileType: "IMAGE | DOCUMENT", objectiveFindings: ["achado objetivo"] }],
    professorVideoReviews: [{ fileName: "video.mp4", summaryUsed: "resumo técnico informado pelo professor" }],
    trainingRelevantInformation: ["informação relevante para prescrição"],
    explicitRestrictions: ["somente restrições explicitamente presentes"],
    recommendations: ["somente recomendações explícitas"],
    bodyRegions: ["regiões mencionadas"],
    questionsForProfessor: ["pontos que precisam ser confirmados"],
    summaryForTraining: "Resumo curto, objetivo, sem diagnóstico e útil para a prescrição do treino",
    studentReplySuggestion: "Mensagem humana e cuidadosa para o professor revisar e enviar ao aluno no chat",
    limitations: ["arquivos ilegíveis, ambiguidades, conflitos ou limites da análise"],
    requiresUrgentHumanReview: false,
  };

  return [
    ...MANUAL_AI_EXECUTION_HEADER_LINES,
    "Analise integralmente o prompt.txt e todos os arquivos de imagem e documento deste pacote ZIP.",
    "Para vídeos, NÃO invente uma análise visual: use exclusivamente o resumo técnico escrito pelo professor no prompt.",
    "Não dê diagnóstico, não interprete além do conteúdo apresentado e não substitua avaliação médica.",
    "Extraia apenas informações objetivas que possam influenciar a segurança ou a prescrição de treino.",
    "Retorne somente JSON válido, sem markdown ou comentários. Salve ou entregue o resultado como arquivo TXT quando a plataforma permitir.",
    "Os campos summaryForTraining e studentReplySuggestion são obrigatórios e não podem ficar vazios.",
    "summaryForTraining deve resumir apenas implicações objetivas para o treino; studentReplySuggestion deve ser uma mensagem humana para o aluno, sem diagnóstico.",
    "O professor revisará o resultado antes de salvar na memória técnica do aluno e antes de responder no chat.",
    "",
    `ALUNO: ${question.student.name}`,
    `MENSAGEM DO ALUNO: ${question.content || ""}`,
    `IMAGENS NO PACOTE: ${images.map((item) => item.name).join(", ") || "nenhuma"}`,
    `DOCUMENTOS NO PACOTE: ${documents.map((item) => item.name).join(", ") || "nenhum"}`,
    "",
    "RESUMOS TÉCNICOS DOS VÍDEOS FEITOS PELO PROFESSOR:",
    ...(videos.length ? videos.map((item) => `- ${item.name}: ${item.videoReviewSummary || "SEM RESUMO — não utilizar este vídeo na análise"}`) : ["- Nenhum vídeo enviado."]),
    "",
    "MODELO OBRIGATÓRIO:",
    JSON.stringify(model, null, 2),
  ].join("\n");
}

async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Não foi possível baixar um anexo (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : "";
    const role = normalizeRole(user?.role);
    if (!userId || !["GESTOR", "ADMIN", "TEACHER"].includes(role)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

    const body = await request.json();
    const action = cleanText(body?.action).toUpperCase();
    const questionId = cleanText(body?.questionId);
    const question = await getAccessibleQuestion(questionId, userId, role);
    if (!question?.student) return NextResponse.json({ error: "Conversa não encontrada ou sem permissão." }, { status: 404 });

    if (action === "SAVE_VIDEO_REVIEW") {
      const attachmentId = cleanText(body?.attachmentId);
      const summary = cleanText(body?.summary);
      if (!attachmentId || !summary) return NextResponse.json({ error: "Informe o resumo técnico do vídeo." }, { status: 422 });
      const attachment = question.attachments.find((item: any) => item.id === attachmentId && String(item.kind).toUpperCase() === "VIDEO");
      if (!attachment) return NextResponse.json({ error: "Vídeo não encontrado nesta conversa." }, { status: 404 });
      await prisma.questionAttachment.update({
        where: { id: attachmentId },
        data: { videoReviewSummary: summary, videoReviewedById: userId, videoReviewedAt: new Date() },
      });
      return NextResponse.json({ ok: true, message: "Resumo técnico do vídeo salvo." });
    }

    const items = collectItems(question);
    const videosWithoutReview = items.filter((item) => item.kind === "VIDEO" && !item.videoReviewSummary);

    if (action === "PREPARE_PROMPT") {
      return NextResponse.json({ ok: true, manualPrompt: buildPrompt(question, items), videosWithoutReview: videosWithoutReview.map((item) => item.name) });
    }

    if (action === "DOWNLOAD_PACKAGE") {
      if (!items.some((item) => item.kind === "IMAGE" || item.kind === "DOCUMENT" || item.kind === "VIDEO")) return NextResponse.json({ error: "Não há anexos nesta conversa." }, { status: 422 });
      if (videosWithoutReview.length) return NextResponse.json({ error: `Preencha e salve o resumo técnico de todos os vídeos antes de gerar o pacote: ${videosWithoutReview.map((item) => item.name).join(", ")}.` }, { status: 422 });

      const zip = new JSZip();
      const prompt = buildPrompt(question, items);
      const generatedAt = new Date().toISOString();
      const packageId = randomUUID();
      const packageVersion = "3.0";
      const imageCount = items.filter((item) => item.kind === "IMAGE").length;
      const documentCount = items.filter((item) => item.kind === "DOCUMENT").length;
      const videoCount = items.filter((item) => item.kind === "VIDEO").length;

      zip.file(
        "INSTRUCOES/LEIA_PRIMEIRO.txt",
        [
          "LEIA ESTE ARQUIVO ANTES DE TUDO.",
          "",
          "ORDEM DE LEITURA OBRIGATÓRIA:",
          "1. prompt.txt",
          "2. RESUMO_DO_CASO.txt",
          "3. manifesto.json",
          "4. todos os arquivos existentes nas pastas imagens e documentos, seguindo analysisOrder do manifesto.json",
          "5. INSTRUCOES/ERROS_E_LIMITACOES.txt",
          "6. INSTRUCOES/MODELO_RESPOSTA.json",
          "7. produzir a resposta final em INSTRUCOES/RESPOSTA_AQUI.txt quando a plataforma permitir",
          "",
          "REGRAS:",
          "- Execute integralmente o arquivo prompt.txt.",
          "- Caso existam vídeos, não invente análise visual. Use somente os resumos técnicos escritos pelo professor no prompt.txt.",
          "- Relacione cada achado ao nome exato do arquivo correspondente.",
          "- Não faça diagnóstico, não extrapole o conteúdo e não substitua avaliação médica ou profissional.",
          "- Retorne somente o JSON solicitado, sem markdown ou explicações.",
          "- Se algum arquivo estiver ilegível, ambíguo ou incompleto, registre isso claramente no campo adequado da resposta.",
          "",
          "O manifesto.json informa a quantidade, o tipo, o caminho, a ordem de análise e a integridade dos arquivos incluídos neste pacote.",
        ].join("\n")
      );
      zip.file("prompt.txt", prompt);
      zip.file(
        "INSTRUCOES/VERSAO_DO_PACOTE.txt",
        [
          "FUNCIONAL UP DIGITAL",
          "Pacote IA",
          `Versão: ${packageVersion}`,
          "",
          "Compatível com:",
          "- ChatGPT",
          "- Microsoft Copilot",
          "- Gemini",
          "- Claude",
          "",
          `Gerado em: ${generatedAt}`,
          `PackageId: ${packageId}`,
        ].join("\n")
      );
      zip.file(
        "INSTRUCOES/RESPOSTA_AQUI.txt",
        [
          "Cole aqui exatamente a resposta produzida pela IA.",
          "",
          "Não altere o nome deste arquivo.",
          "Depois, envie este arquivo para o Funcional UP Digital.",
        ].join("\n")
      );
      zip.file(
        "INSTRUCOES/ERROS_E_LIMITACOES.txt",
        [
          "REGRAS DE SEGURANÇA E LIMITES",
          "",
          "- Não invente informações ausentes.",
          "- Não faça diagnóstico.",
          "- Não substitua avaliação médica ou profissional.",
          "- Se um arquivo estiver ilegível, informe isso claramente.",
          "- Se houver conflito entre arquivos, descreva o conflito sem escolher uma versão como verdadeira.",
          "- Para vídeos, use somente o resumo técnico informado pelo professor no prompt.txt.",
          "- Use somente evidências presentes no pacote.",
        ].join("\n")
      );
      zip.file(
        "INSTRUCOES/MODELO_RESPOSTA.json",
        JSON.stringify(
          {
            packageTitle: "Título objetivo do conjunto analisado",
            analyzedFiles: [
              {
                fileName: "arquivo.ext",
                fileType: "IMAGE | DOCUMENT",
                objectiveFindings: ["achado objetivo"],
              },
            ],
            professorVideoReviews: [
              {
                fileName: "video.mp4",
                summaryUsed: "resumo técnico informado pelo professor",
              },
            ],
            trainingRelevantInformation: ["informação relevante para prescrição"],
            explicitRestrictions: ["somente restrições explicitamente presentes"],
            recommendations: ["somente recomendações explícitas"],
            bodyRegions: ["regiões mencionadas"],
            questionsForProfessor: ["pontos que precisam ser confirmados"],
            summaryForTraining: "Resumo curto, objetivo e sem diagnóstico",
            studentReplySuggestion: "Mensagem humana, clara e cuidadosa para o professor revisar e enviar ao aluno no chat, sem diagnóstico e sem prometer resultado.",
            requiresUrgentHumanReview: false,
          },
          null,
          2
        )
      );
      zip.file(
        "RESUMO_DO_CASO.txt",
        [
          `Aluno: ${question.student.name}`,
          `StudentId: ${question.student.id}`,
          `QuestionId: ${question.id}`,
          `Mensagem original: ${question.content || ""}`,
          `Imagens: ${imageCount}`,
          `Documentos: ${documentCount}`,
          `Vídeos: ${videoCount}`,
          "",
          "Observação: vídeos devem ser considerados apenas por meio dos resumos técnicos escritos pelo professor no prompt.txt.",
        ].join("\n")
      );

      let sequence = 1;
      const manifestFiles: Array<{
        id: string;
        kind: PackageItem["kind"];
        name: string;
        mimeType: string;
        packagePath: string | null;
        includedAsBinary: boolean;
        sizeBytes: number | null;
        sha256: string | null;
        videoReviewSummary?: string;
      }> = [];

      for (const item of items) {
        if (item.kind === "VIDEO") {
          manifestFiles.push({
            id: item.id,
            kind: item.kind,
            name: item.name,
            mimeType: item.mimeType,
            packagePath: null,
            includedAsBinary: false,
            sizeBytes: null,
            sha256: null,
            videoReviewSummary: item.videoReviewSummary,
          });
          continue;
        }

        const folder = item.kind === "IMAGE" ? "imagens" : "documentos";
        const fileName = `${String(sequence).padStart(2, "0")}-${safeFileName(item.name, `arquivo-${sequence}`)}`;
        const packagePath = `${folder}/${fileName}`;
        const fileBuffer = await downloadFile(item.url);
        const sha256 = createHash("sha256").update(fileBuffer).digest("hex");
        zip.file(packagePath, fileBuffer);
        manifestFiles.push({
          id: item.id,
          kind: item.kind,
          name: item.name,
          mimeType: item.mimeType,
          packagePath,
          includedAsBinary: true,
          sizeBytes: fileBuffer.byteLength,
          sha256,
        });
        sequence += 1;
      }

      zip.file(
        "manifesto.json",
        JSON.stringify(
          {
            packageVersion,
            packageId,
            studentId: question.student.id,
            studentName: question.student.name,
            questionId: question.id,
            generatedAt,
            attachmentCount: items.length,
            containsImages: imageCount > 0,
            containsDocuments: documentCount > 0,
            containsVideos: videoCount > 0,
            imageCount,
            documentCount,
            videoCount,
            instructionsFile: "INSTRUCOES/LEIA_PRIMEIRO.txt",
            promptFile: "prompt.txt",
            versionFile: "INSTRUCOES/VERSAO_DO_PACOTE.txt",
            caseSummaryFile: "RESUMO_DO_CASO.txt",
            limitationsFile: "INSTRUCOES/ERROS_E_LIMITACOES.txt",
            responseModelFile: "INSTRUCOES/MODELO_RESPOSTA.json",
            responseExpected: "INSTRUCOES/RESPOSTA_AQUI.txt",
            recommendedModel: "Modelo multimodal capaz de ler imagens e documentos, como ChatGPT, Microsoft Copilot, Gemini ou Claude.",
            analysisOrder: [
              "INSTRUCOES/LEIA_PRIMEIRO.txt",
              "prompt.txt",
              "RESUMO_DO_CASO.txt",
              ...manifestFiles
                .filter((file) => file.includedAsBinary && file.packagePath)
                .map((file) => file.packagePath as string),
              "INSTRUCOES/ERROS_E_LIMITACOES.txt",
              "INSTRUCOES/MODELO_RESPOSTA.json",
              "INSTRUCOES/RESPOSTA_AQUI.txt",
            ],
            files: manifestFiles,
          },
          null,
          2
        )
      );
      const output = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const downloadName = `pacote-ia-${safeFileName(question.student.name, "aluno")}.zip`;
      return new NextResponse(output, { status: 200, headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${downloadName}"`, "Cache-Control": "no-store" } });
    }

    if (action === "SAVE_ANALYSIS") {
      let parsed: any;
      try {
        parsed = parseJson(body?.manualResponse);
      } catch (error: any) {
        return NextResponse.json(
          { error: error?.message || "A resposta não contém um JSON válido." },
          { status: 422 }
        );
      }

      const normalized = normalizeAnalysisResponse(parsed);
      if (!normalized.summaryForTraining) {
        return NextResponse.json(
          {
            error: "A resposta da IA não trouxe um resumo utilizável para o treino.",
            missingFields: ["summaryForTraining"],
            acceptedAliases: [
              "summaryForTraining",
              "summary_for_training",
              "trainingSummary",
              "summary",
              "resumoParaTreino",
              "resumo",
            ],
            guidance: "Gere novamente a resposta usando o MODELO_RESPOSTA.json do pacote ou preencha um resumo objetivo das implicações para o treino.",
          },
          { status: 422 }
        );
      }

      const firstDocument = items.find((item) => item.kind === "DOCUMENT");
      const details = {
        ...normalized,
        importedAt: new Date().toISOString(),
        reviewedPackageFiles: items.map((item) => ({ name: item.name, kind: item.kind })),
      };

      const memory = await prisma.studentTechnicalMemory.create({
        data: {
          studentId: question.student.id,
          sourceQuestionId: question.id,
          category: "DOCUMENT",
          title: normalized.packageTitle,
          summary: JSON.stringify(details, null, 2),
          sourceDocumentName: firstDocument?.name || "Pacote de anexos",
          sourceDocumentUrl: firstDocument?.url || null,
          status: "APPROVED",
          reviewedById: userId,
          reviewedAt: new Date(),
        },
      });

      return NextResponse.json({
        ok: true,
        memoryId: memory.id,
        normalizedAnalysis: {
          packageTitle: normalized.packageTitle,
          summaryForTraining: normalized.summaryForTraining,
          studentReplySuggestion: normalized.studentReplySuggestion,
          requiresUrgentHumanReview: normalized.requiresUrgentHumanReview,
          questionsForProfessor: normalized.questionsForProfessor,
          limitations: normalized.limitations,
        },
        studentReplySuggestion: normalized.studentReplySuggestion || null,
        warning: normalized.studentReplySuggestion
          ? null
          : "A análise foi salva, mas a IA não trouxe uma sugestão de resposta ao aluno. Escreva a resposta manualmente no chat.",
        message: "Análise validada, normalizada e salva na memória técnica do aluno.",
      });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("POST /api/student-documents error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno ao processar os anexos." }, { status: 500 });
  }
}

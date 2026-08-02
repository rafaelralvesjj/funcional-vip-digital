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

function parseJson(raw: unknown): any {
  const text = cleanText(raw).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Cole um JSON válido.");
  return JSON.parse(text.slice(start, end + 1));
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
  sizeBytes?: number | null;
};

function collectItems(question: any): PackageItem[] {
  const items: PackageItem[] = (question.attachments || []).map((attachment: any, index: number) => ({
    id: attachment.id,
    kind: String(attachment.kind || "DOCUMENT").toUpperCase() as PackageItem["kind"],
    url: attachment.url,
    name: attachment.name || `arquivo-${index + 1}`,
    mimeType: attachment.mimeType || "application/octet-stream",
    videoReviewSummary: cleanText(attachment.videoReviewSummary),
    sizeBytes: typeof attachment.sizeBytes === "number" ? attachment.sizeBytes : null,
  }));

  const urls = new Set(items.map((item) => item.url));
  if (question.imageUrl && !urls.has(question.imageUrl)) items.push({ id: "legacy-image", kind: "IMAGE", url: question.imageUrl, name: "imagem-enviada.jpg", mimeType: "image/jpeg", sizeBytes: null });
  if (question.documentUrl && !urls.has(question.documentUrl)) items.push({ id: "legacy-document", kind: "DOCUMENT", url: question.documentUrl, name: question.documentName || "documento-enviado", mimeType: question.documentMimeType || "application/octet-stream", sizeBytes: null });
  if (question.videoUrl && !urls.has(question.videoUrl)) items.push({ id: "legacy-video", kind: "VIDEO", url: question.videoUrl, name: "video-enviado.mp4", mimeType: "video/mp4", videoReviewSummary: "", sizeBytes: null });
  return items;
}

function buildResponseModel() {
  return {
    packageTitle: "Título objetivo do conjunto analisado",
    analyzedFiles: [
      {
        fileName: "arquivo.ext",
        fileType: "IMAGE | DOCUMENT",
        objectiveFindings: ["achado objetivo diretamente sustentado pelo arquivo"],
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
    recommendations: ["somente recomendações explicitamente presentes"],
    bodyRegions: ["regiões mencionadas"],
    questionsForProfessor: ["pontos que precisam ser confirmados"],
    summaryForTraining: "Resumo curto, objetivo, sem diagnóstico e pronto para revisão do professor",
    requiresUrgentHumanReview: false,
  };
}

function buildPrompt(question: any, items: PackageItem[], packageId: string): string {
  const documents = items.filter((item) => item.kind === "DOCUMENT");
  const images = items.filter((item) => item.kind === "IMAGE");
  const videos = items.filter((item) => item.kind === "VIDEO");

  return [
    ...MANUAL_AI_EXECUTION_HEADER_LINES,
    `PACOTE: ${packageId}`,
    "Leia primeiro LEIA_PRIMEIRO.txt, depois este prompt e todos os arquivos binários listados no manifesto.json.",
    "Analise integralmente as imagens e os documentos do pacote.",
    "Para vídeos, NÃO invente análise visual: use exclusivamente os resumos técnicos escritos pelo professor abaixo.",
    "Relacione cada achado ao nome exato do arquivo que o sustenta.",
    "Não dê diagnóstico, não extrapole o conteúdo e não substitua avaliação médica ou profissional.",
    "Extraia apenas informações objetivas que possam influenciar segurança, adaptação ou prescrição de treino.",
    "Quando um dado estiver ilegível, ausente ou ambíguo, registre em questionsForProfessor em vez de inferir.",
    "Retorne somente JSON válido seguindo MODELO_RESPOSTA.json, sem markdown, comentários ou texto adicional.",
    "Quando a plataforma permitir, entregue o resultado em resposta.txt.",
    "O professor revisará o resultado antes de salvar qualquer informação na memória técnica do aluno.",
    "",
    `ALUNO: ${question.student.name}`,
    `MENSAGEM DO ALUNO: ${question.content || ""}`,
    `IMAGENS: ${images.map((item) => item.name).join(", ") || "nenhuma"}`,
    `DOCUMENTOS: ${documents.map((item) => item.name).join(", ") || "nenhum"}`,
    "",
    "RESUMOS TÉCNICOS DOS VÍDEOS FEITOS PELO PROFESSOR:",
    ...(videos.length
      ? videos.map((item) => `- ${item.name}: ${item.videoReviewSummary || "SEM RESUMO — não utilizar este vídeo na análise"}`)
      : ["- Nenhum vídeo enviado."]),
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
      return NextResponse.json({ ok: true, manualPrompt: buildPrompt(question, items, randomUUID()), videosWithoutReview: videosWithoutReview.map((item) => item.name) });
    }

    if (action === "DOWNLOAD_PACKAGE") {
      if (!items.some((item) => item.kind === "IMAGE" || item.kind === "DOCUMENT" || item.kind === "VIDEO")) return NextResponse.json({ error: "Não há anexos nesta conversa." }, { status: 422 });
      if (videosWithoutReview.length) return NextResponse.json({ error: `Preencha e salve o resumo técnico de todos os vídeos antes de gerar o pacote: ${videosWithoutReview.map((item) => item.name).join(", ")}.` }, { status: 422 });

      const zip = new JSZip();
      const packageId = randomUUID();
      const generatedAt = new Date().toISOString();
      const prompt = buildPrompt(question, items, packageId);
      const responseModel = buildResponseModel();
      const imageCount = items.filter((item) => item.kind === "IMAGE").length;
      const documentCount = items.filter((item) => item.kind === "DOCUMENT").length;
      const videoCount = items.filter((item) => item.kind === "VIDEO").length;

      zip.file(
        "LEIA_PRIMEIRO.txt",
        [
          "LEIA ESTE ARQUIVO ANTES DE TUDO.",
          "",
          `Identificador do pacote: ${packageId}`,
          "",
          "ORDEM OBRIGATÓRIA:",
          "1. Leia manifesto.json para conhecer todos os arquivos e seus caminhos.",
          "2. Leia e execute integralmente prompt.txt.",
          "3. Analise todos os arquivos binários existentes nas pastas imagens e documentos.",
          "4. Para vídeos, use somente o resumo técnico do professor presente no prompt.txt; não invente análise visual.",
          "5. Relacione cada conclusão ao nome exato do arquivo que a sustenta.",
          "6. Quando algo estiver ilegível, ausente ou ambíguo, registre a dúvida; não complete por suposição.",
          "7. Não faça diagnóstico e não substitua avaliação médica ou profissional.",
          "8. Responda exatamente conforme MODELO_RESPOSTA.json, somente com JSON válido.",
          "9. Quando a plataforma permitir, entregue o resultado em resposta.txt.",
          "",
          "IMPORTANTE: o resultado será revisado por um professor antes de entrar na memória técnica do aluno.",
        ].join("\n")
      );
      zip.file("prompt.txt", prompt);
      zip.file("MODELO_RESPOSTA.json", JSON.stringify(responseModel, null, 2));

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
            sizeBytes: item.sizeBytes ?? null,
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
            packageVersion: "2.0",
            packageId,
            generatedAt,
            studentId: question.student.id,
            studentName: question.student.name,
            questionId: question.id,
            sourceMessage: question.content || "",
            attachmentCount: items.length,
            containsImages: imageCount > 0,
            containsDocuments: documentCount > 0,
            containsVideos: videoCount > 0,
            imageCount,
            documentCount,
            videoCount,
            instructionsFile: "LEIA_PRIMEIRO.txt",
            promptFile: "prompt.txt",
            responseModelFile: "MODELO_RESPOSTA.json",
            responseExpected: "resposta.txt",
            videoPolicy: "Vídeos não são enviados como binário. A IA deve usar apenas o resumo técnico do professor presente no prompt.txt.",
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
      try { parsed = parseJson(body?.manualResponse); } catch (error: any) { return NextResponse.json({ error: error?.message || "JSON inválido." }, { status: 422 }); }
      const summary = cleanText(parsed?.summaryForTraining);
      const title = cleanText(parsed?.packageTitle) || "Análise de anexos do aluno";
      if (!summary) return NextResponse.json({ error: "O JSON precisa conter summaryForTraining." }, { status: 422 });
      const firstDocument = items.find((item) => item.kind === "DOCUMENT");
      const details = { ...parsed, summaryForTraining: summary, reviewedPackageFiles: items.map((item) => ({ name: item.name, kind: item.kind })) };
      const memory = await prisma.studentTechnicalMemory.create({
        data: { studentId: question.student.id, sourceQuestionId: question.id, category: "DOCUMENT", title, summary: JSON.stringify(details, null, 2), sourceDocumentName: firstDocument?.name || "Pacote de anexos", sourceDocumentUrl: firstDocument?.url || null, status: "APPROVED", reviewedById: userId, reviewedAt: new Date() },
      });
      return NextResponse.json({ ok: true, memoryId: memory.id, message: "Análise aprovada e salva na memória técnica do aluno." });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("POST /api/student-documents error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno ao processar os anexos." }, { status: 500 });
  }
}

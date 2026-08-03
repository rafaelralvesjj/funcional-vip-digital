import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import JSZip from "jszip";
import { createHash, randomUUID } from "crypto";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { MANUAL_AI_EXECUTION_HEADER_LINES } from "@/lib/manual-ai-execution-header";
import { getStudentDisplayName } from "@/lib/display-name";
import { getStudentTechnicalContext, formatStudentTechnicalContext } from "@/lib/student-technical-memory";

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
  const availableEquipmentSummary = firstNonEmptyText(
    parsed.availableEquipmentSummary,
    parsed.available_equipment_summary,
    parsed.resumoEquipamentosDisponiveis,
    parsed.equipmentSummary
  );
  const trainingPlanningSuggestions = normalizeStringArray(
    parsed.trainingPlanningSuggestions ??
      parsed.training_planning_suggestions ??
      parsed.sugestoesPlanejamentoTreino ??
      parsed.planningSuggestions
  );
  const trainingOpportunities = normalizeStringArray(
    parsed.trainingOpportunities ??
      parsed.training_opportunities ??
      parsed.oportunidadesDeTreino
  );
  const missingEquipmentImpact = normalizeStringArray(
    parsed.missingEquipmentImpact ??
      parsed.missing_equipment_impact ??
      parsed.impactoEquipamentosAusentes
  );

  const rawTrainingEnvironment =
    parsed.trainingEnvironment &&
    typeof parsed.trainingEnvironment === "object" &&
    !Array.isArray(parsed.trainingEnvironment)
      ? parsed.trainingEnvironment
      : {};

  const trainingEnvironment = {
    type: firstNonEmptyText(
      rawTrainingEnvironment.type,
      rawTrainingEnvironment.environmentType,
      rawTrainingEnvironment.tipo
    ).toUpperCase(),
    equipmentLevel: firstNonEmptyText(
      rawTrainingEnvironment.equipmentLevel,
      rawTrainingEnvironment.level,
      rawTrainingEnvironment.nivelEquipamentos
    ).toUpperCase(),
    availableEquipment: normalizeStringArray(
      rawTrainingEnvironment.availableEquipment ??
        rawTrainingEnvironment.equipment ??
        rawTrainingEnvironment.equipamentosDisponiveis
    ),
    observations: normalizeStringArray(
      rawTrainingEnvironment.observations ??
        rawTrainingEnvironment.notes ??
        rawTrainingEnvironment.observacoes
    ),
    lastConfirmed: firstNonEmptyText(
      rawTrainingEnvironment.lastConfirmed,
      rawTrainingEnvironment.confirmedAt,
      rawTrainingEnvironment.ultimaConfirmacao
    ),
    confidence: firstNonEmptyText(
      rawTrainingEnvironment.confidence,
      rawTrainingEnvironment.confianca
    ).toUpperCase() || "NOT_INFORMED",
  };

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

  const rawMetadata =
    parsed.analysisMetadata && typeof parsed.analysisMetadata === "object" && !Array.isArray(parsed.analysisMetadata)
      ? parsed.analysisMetadata
      : {};

  const analysisMetadata = {
    modelUsed: firstNonEmptyText(rawMetadata.modelUsed, rawMetadata.model, rawMetadata.modeloUtilizado),
    analysisCompletedAt: firstNonEmptyText(
      rawMetadata.analysisCompletedAt,
      rawMetadata.completedAt,
      rawMetadata.dataConclusao
    ),
    usedImages: Boolean(rawMetadata.usedImages ?? rawMetadata.usouImagens),
    usedDocuments: Boolean(rawMetadata.usedDocuments ?? rawMetadata.usouDocumentos),
    usedProfessorVideoSummaries: Boolean(
      rawMetadata.usedProfessorVideoSummaries ?? rawMetadata.usouResumosDeVideoDoProfessor
    ),
    confidence: firstNonEmptyText(rawMetadata.confidence, rawMetadata.confianca) || "nao_informada",
  };

  return {
    schemaVersion: "1.0",
    packageTitle: firstNonEmptyText(parsed.packageTitle, parsed.title, parsed.titulo) || "Análise de anexos do aluno",
    analyzedFiles: Array.isArray(parsed.analyzedFiles) ? parsed.analyzedFiles.slice(0, 50) : [],
    professorVideoReviews: Array.isArray(parsed.professorVideoReviews) ? parsed.professorVideoReviews.slice(0, 20) : [],
    trainingRelevantInformation,
    explicitRestrictions,
    recommendations,
    availableEquipmentSummary,
    trainingPlanningSuggestions,
    trainingOpportunities,
    missingEquipmentImpact,
    trainingEnvironment,
    bodyRegions: normalizeStringArray(parsed.bodyRegions ?? parsed.body_regions ?? parsed.regioesDoCorpo),
    questionsForProfessor,
    limitations,
    summaryForTraining,
    studentReplySuggestion,
    analysisMetadata,
    requiresUrgentHumanReview: Boolean(
      parsed.requiresUrgentHumanReview ?? parsed.requires_urgent_human_review ?? parsed.requerRevisaoHumanaUrgente
    ),
    memoryUpdates: normalizeMemoryUpdates(
      parsed.memoryUpdates ?? parsed.memory_updates ?? parsed.atualizacoesDeMemoria
    ),
    sourceResponse: parsed,
  };
}


type MemoryUpdateCategory =
  | "HEALTH_PERMANENT"
  | "HEALTH_TEMPORARY"
  | "MEDICAL_GUIDANCE"
  | "PREFERENCE_POSITIVE"
  | "PREFERENCE_NEGATIVE"
  | "PERFORMANCE_SIGNAL"
  | "EXERCISE_AVOID"
  | "EXERCISE_PREFERRED"
  | "EQUIPMENT_AVAILABLE"
  | "TRAINING_ENVIRONMENT";

type NormalizedMemoryUpdate = {
  category: MemoryUpdateCategory;
  title: string;
  summary: string;
  permanence: "PERMANENT" | "TEMPORARY" | "UNTIL_UPDATED";
  validUntil: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  sourceEvidence: string[];
};

const ALLOWED_MEMORY_CATEGORIES = new Set<MemoryUpdateCategory>([
  "HEALTH_PERMANENT",
  "HEALTH_TEMPORARY",
  "MEDICAL_GUIDANCE",
  "PREFERENCE_POSITIVE",
  "PREFERENCE_NEGATIVE",
  "PERFORMANCE_SIGNAL",
  "EXERCISE_AVOID",
  "EXERCISE_PREFERRED",
  "EQUIPMENT_AVAILABLE",
  "TRAINING_ENVIRONMENT",
]);

function normalizeMemoryUpdates(value: unknown): NormalizedMemoryUpdate[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((raw): NormalizedMemoryUpdate | null => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const item = raw as Record<string, unknown>;
      const rawCategory = firstNonEmptyText(item.category, item.categoria).toUpperCase() as MemoryUpdateCategory;
      if (!ALLOWED_MEMORY_CATEGORIES.has(rawCategory)) return null;

      const title = firstNonEmptyText(item.title, item.titulo).slice(0, 180);
      const summary = firstNonEmptyText(item.summary, item.resumo, item.description, item.descricao).slice(0, 4000);
      if (!title || !summary) return null;

      const rawPermanence = firstNonEmptyText(item.permanence, item.permanencia).toUpperCase();
      const permanence: NormalizedMemoryUpdate["permanence"] =
        rawPermanence === "TEMPORARY" || rawPermanence === "TEMPORARIA" || rawPermanence === "TEMPORÁRIO"
          ? "TEMPORARY"
          : rawPermanence === "UNTIL_UPDATED" || rawPermanence === "ATE_ATUALIZACAO" || rawPermanence === "ATÉ_ATUALIZAÇÃO"
            ? "UNTIL_UPDATED"
            : "PERMANENT";

      const rawConfidence = firstNonEmptyText(item.confidence, item.confianca).toUpperCase();
      const confidence: NormalizedMemoryUpdate["confidence"] =
        rawConfidence === "LOW" || rawConfidence === "BAIXA"
          ? "LOW"
          : rawConfidence === "MEDIUM" || rawConfidence === "MEDIA" || rawConfidence === "MÉDIA"
            ? "MEDIUM"
            : "HIGH";

      const validUntilText = firstNonEmptyText(item.validUntil, item.valid_until, item.validoAte, item.válidoAté);
      const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(validUntilText) ? validUntilText : null;

      return {
        category: rawCategory,
        title,
        summary,
        permanence,
        validUntil: permanence === "TEMPORARY" ? validUntil : null,
        confidence,
        sourceEvidence: normalizeStringArray(item.sourceEvidence ?? item.source_evidence ?? item.evidencias).slice(0, 10),
      };
    })
    .filter((item): item is NormalizedMemoryUpdate => Boolean(item))
    .slice(0, 30);
}

function inferConservativeMemoryUpdates(normalized: ReturnType<typeof normalizeAnalysisResponse>): NormalizedMemoryUpdate[] {
  const inferred: NormalizedMemoryUpdate[] = [];

  for (const restriction of normalized.explicitRestrictions.slice(0, 10)) {
    inferred.push({
      category: "MEDICAL_GUIDANCE",
      title: restriction.slice(0, 120),
      summary: restriction,
      permanence: "UNTIL_UPDATED",
      validUntil: null,
      confidence: "HIGH",
      sourceEvidence: normalized.analyzedFiles.map((item: any) => cleanText(item?.fileName)).filter(Boolean).slice(0, 5),
    });
  }

  return inferred;
}

function parseMemoryValidUntil(item: NormalizedMemoryUpdate): Date | null {
  if (item.permanence !== "TEMPORARY" || !item.validUntil) return null;
  const date = new Date(`${item.validUntil}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
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
      student: {
        select: {
          id: true,
          name: true,
          preferredName: true,
          userId: true,
          avaliacoes: {
            select: { objetivo: true, equipamentos: true, lesoes: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
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

function buildPrompt(question: any, items: PackageItem[], technicalContextText: string, recentChatText: string): string {
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
    availableEquipmentSummary: "Resumo objetivo dos equipamentos disponíveis identificados nos anexos, ou texto vazio quando não houver equipamentos",
    trainingPlanningSuggestions: ["sugestões objetivas para o professor considerar na montagem do próximo treino, sem prescrever automaticamente"],
    trainingOpportunities: ["oportunidades de treino viáveis com os equipamentos confirmados e coerentes com o objetivo atual"],
    missingEquipmentImpact: ["impactos objetivos da ausência de equipamentos, sem inventar necessidade de compra"],
    trainingEnvironment: {
      type: "HOME|GYM_BASIC|GYM_COMPLETE|OUTDOOR|MIXED|UNKNOWN",
      equipmentLevel: "BASIC|INTERMEDIATE|ADVANCED|UNKNOWN",
      availableEquipment: ["equipamentos claramente identificados"],
      observations: ["limitações aparentes, espaço, necessidade de confirmação ou observações relevantes"],
      lastConfirmed: "YYYY-MM-DD ou texto vazio",
      confidence: "HIGH|MEDIUM|LOW|NOT_INFORMED"
    },
    bodyRegions: ["regiões mencionadas"],
    questionsForProfessor: ["somente perguntas ainda não respondidas no histórico"],
    conversationState: {
      previousQuestionsAnswered: ["perguntas anteriores do professor que já foram respondidas pelo aluno"],
      newFactsLearned: ["novas informações objetivas aprendidas nesta mensagem"],
      stillMissing: ["informações realmente ainda ausentes e relevantes"],
      repeatedQuestionsAvoided: ["perguntas que não foram repetidas porque já estavam respondidas"],
    },
    nextBestAction: {
      action: "ANSWER_AND_CONTINUE|ASK_MISSING_INFORMATION|READY_FOR_TRAINING|HUMAN_REVIEW",
      reason: "motivo objetivo baseado na conversa completa",
    },
    summaryForTraining: "Resumo curto, objetivo, sem diagnóstico e útil para a prescrição do treino",
    studentReplySuggestion: "Mensagem humana e cuidadosa para o professor revisar e enviar ao aluno no chat",
    memoryUpdates: [
      {
        category: "HEALTH_PERMANENT|HEALTH_TEMPORARY|MEDICAL_GUIDANCE|PREFERENCE_POSITIVE|PREFERENCE_NEGATIVE|PERFORMANCE_SIGNAL|EXERCISE_AVOID|EXERCISE_PREFERRED|EQUIPMENT_AVAILABLE|TRAINING_ENVIRONMENT",
        title: "Título curto e específico",
        summary: "Informação objetiva que deve ser lembrada nos próximos treinos",
        permanence: "PERMANENT|TEMPORARY|UNTIL_UPDATED",
        validUntil: "YYYY-MM-DD ou null",
        confidence: "HIGH|MEDIUM|LOW",
        sourceEvidence: ["nome do arquivo ou trecho que sustenta a informação"]
      }
    ],
    limitations: ["arquivos ilegíveis, ambiguidades, conflitos ou limites da análise"],
    analysisMetadata: {
      modelUsed: "nome da IA ou modelo utilizado",
      analysisCompletedAt: "data e hora ISO da conclusão, quando disponível",
      usedImages: true,
      usedDocuments: true,
      usedProfessorVideoSummaries: false,
      confidence: "alta | media | baixa",
    },
    requiresUrgentHumanReview: false,
  };

  return [
    ...MANUAL_AI_EXECUTION_HEADER_LINES,
    "Analise integralmente o prompt.txt e, quando existirem, todos os arquivos de imagem e documento deste pacote ZIP.",
    "Este pacote também pode conter somente uma mensagem de texto. Nesse caso, use o contexto técnico e o histórico recente para preparar uma resposta apropriada ao aluno.",
    "Para vídeos, NÃO invente uma análise visual: use exclusivamente o resumo técnico escrito pelo professor no prompt.",
    "Não dê diagnóstico, não interprete além do conteúdo apresentado e não substitua avaliação médica.",
    "Extraia apenas informações objetivas que possam influenciar a segurança, a resposta ao aluno ou a prescrição de treino.",
    "A resposta ao aluno deve ser humana, clara, acolhedora e coerente com o histórico já conhecido. Não prometa resultado rápido nem transforme objetivo em garantia.",
    "Antes de analisar os anexos, identifique o objetivo atual do aluno informado no contexto. Todas as oportunidades e sugestões devem ser coerentes com esse objetivo.",
    "Quando houver fotos ou documentos de equipamentos, identifique o que está disponível, para quais tipos de movimento pode ser útil, suas limitações aparentes e quais perguntas o professor ainda precisa fazer.",
    "Nesses casos, preencha availableEquipmentSummary, trainingPlanningSuggestions, trainingOpportunities, missingEquipmentImpact e trainingEnvironment.",
    "Não invente marca, capacidade, carga máxima, estado de conservação, segurança, equipamento oculto ou necessidade de compra que não estejam claramente sustentados.",
    "Equipamentos confirmados devem entrar em memoryUpdates como EQUIPMENT_AVAILABLE, com permanence UNTIL_UPDATED, confiança individual e evidência do arquivo correspondente.",
    "Quando houver dados suficientes, registre também uma memória consolidada TRAINING_ENVIRONMENT com permanence UNTIL_UPDATED, resumindo tipo de ambiente, nível aproximado de equipamentos, lista confirmada e pontos que ainda precisam de validação.",
    "Retorne somente JSON válido, sem markdown ou comentários. Salve ou entregue o resultado como arquivo TXT quando a plataforma permitir.",
    "Os campos summaryForTraining e studentReplySuggestion são obrigatórios e não podem ficar vazios.",
    "summaryForTraining deve resumir apenas implicações objetivas para o treino; studentReplySuggestion deve ser uma mensagem humana para o aluno, sem diagnóstico.",
    "Preencha memoryUpdates somente com informações úteis em treinos futuros e sustentadas pelos arquivos. Não transforme hipótese em fato.",
    "Use HEALTH_PERMANENT apenas para condição duradoura explicitamente documentada; HEALTH_TEMPORARY para situação atual com prazo; MEDICAL_GUIDANCE para orientação expressa; preferências e sinais de desempenho apenas quando houver evidência clara; EQUIPMENT_AVAILABLE somente para equipamentos realmente identificados nos anexos ou informados pelo aluno.",
    "Se não houver uma nova memória confiável, devolva memoryUpdates como lista vazia.",
    "Preencha analysisMetadata para registrar modelo utilizado, data da análise, fontes efetivamente usadas e nível de confiança. Não invente esses dados; deixe texto vazio ou confiança nao_informada quando não souber.",
    "REGRA CRÍTICA DE CONTINUIDADE: leia TODO o HISTÓRICO RECENTE DO CHAT em ordem cronológica antes de escrever qualquer resposta.",
    "Identifique quais perguntas anteriores do professor já foram respondidas pelo aluno. Nunca repita uma pergunta já respondida, mesmo que a resposta esteja em mensagem anterior e não na mensagem atual.",
    "A mensagem atual deve ser interpretada como continuação da conversa, não como uma conversa nova.",
    "Antes de finalizar studentReplySuggestion, confira se ela contém pergunta repetida, ignora fato já informado ou contradiz o histórico. Se contiver, reescreva.",
    "Preencha conversationState com perguntas já respondidas, novos fatos aprendidos, informações ainda ausentes e perguntas repetidas que foram evitadas.",
    "Em questionsForProfessor, inclua somente lacunas reais que ainda não estejam respondidas no histórico nem no contexto técnico.",
    "Quando a mensagem do aluno responder uma pergunta anterior, reconheça a resposta e avance a conversa de forma natural.",
    "Use nextBestAction para indicar se deve apenas responder e continuar, pedir informação realmente faltante, considerar o contexto pronto para treino ou exigir revisão humana.",
    "O professor revisará o resultado antes de salvar na memória técnica do aluno e antes de responder no chat.",
    "",
    `ALUNO: ${getStudentDisplayName(question.student)}`,
    `OBJETIVO ATUAL INFORMADO: ${question.student.avaliacoes?.[0]?.objetivo || "não informado"}`,
    `EQUIPAMENTOS JÁ INFORMADOS NO CADASTRO: ${question.student.avaliacoes?.[0]?.equipamentos || "não informado"}`,
    `LESÕES/OBSERVAÇÕES JÁ INFORMADAS: ${question.student.avaliacoes?.[0]?.lesoes || "não informado"}`,
    `MENSAGEM ATUAL DO ALUNO: ${question.content || ""}`,
    "",
    "CONTEXTO TÉCNICO CONSOLIDADO DO ALUNO:",
    technicalContextText || "Nenhum contexto técnico adicional disponível.",
    "",
    "HISTÓRICO RECENTE DO CHAT:",
    recentChatText || "Nenhuma mensagem anterior relevante disponível.",
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
    const studentId = question.student.id;

    const [technicalContext, recentChat] = await Promise.all([
      getStudentTechnicalContext(studentId),
      prisma.question.findMany({
        where: { studentId },
        select: {
          id: true,
          content: true,
          senderRole: true,
          createdAt: true,
          parentId: true,
          resolvedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
    ]);
    const technicalContextText = formatStudentTechnicalContext(technicalContext);
    const recentChatText = recentChat
      .slice()
      .reverse()
      .map((item: any) => `[${new Date(item.createdAt).toISOString()}] ${String(item.senderRole || "USUARIO")}: ${String(item.content || "").trim()}`)
      .join("\n");

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
      return NextResponse.json({ ok: true, manualPrompt: buildPrompt(question, items, technicalContextText, recentChatText), videosWithoutReview: videosWithoutReview.map((item) => item.name) });
    }

    if (action === "DOWNLOAD_PACKAGE") {
      if (videosWithoutReview.length) return NextResponse.json({ error: `Preencha e salve o resumo técnico de todos os vídeos antes de gerar o pacote: ${videosWithoutReview.map((item) => item.name).join(", ")}.` }, { status: 422 });

      const zip = new JSZip();
      const prompt = buildPrompt(question, items, technicalContextText, recentChatText);
      const generatedAt = new Date().toISOString();
      const packageId = randomUUID();
      const packageVersion = "5.0";
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
          "4. todos os arquivos existentes nas pastas imagens e documentos, quando houver, seguindo analysisOrder do manifesto.json",
          "5. INSTRUCOES/ERROS_E_LIMITACOES.txt",
          "6. INSTRUCOES/MODELO_RESPOSTA.json",
          "7. produzir a resposta final em INSTRUCOES/RESPOSTA_AQUI.txt quando a plataforma permitir",
          "",
          "REGRAS:",
          "- Execute integralmente o arquivo prompt.txt.",
          "- Leia o histórico recente em ordem cronológica e não repita perguntas que o aluno já respondeu.",
          "- Trate a mensagem atual como continuação natural da conversa.",
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
            questionsForProfessor: ["somente perguntas ainda não respondidas no histórico"],
            conversationState: {
              previousQuestionsAnswered: ["perguntas anteriores já respondidas"],
              newFactsLearned: ["novas informações objetivas aprendidas"],
              stillMissing: ["informações realmente ainda ausentes"],
              repeatedQuestionsAvoided: ["perguntas que não foram repetidas"],
            },
            nextBestAction: {
              action: "ANSWER_AND_CONTINUE|ASK_MISSING_INFORMATION|READY_FOR_TRAINING|HUMAN_REVIEW",
              reason: "motivo objetivo baseado na conversa completa",
            },
            summaryForTraining: "Resumo curto, objetivo, sem diagnóstico e útil para a prescrição do treino",
            studentReplySuggestion: "Mensagem humana e cuidadosa para o professor revisar e enviar ao aluno no chat",
            limitations: ["arquivos ilegíveis, ambiguidades, conflitos ou limites da análise"],
            analysisMetadata: {
              modelUsed: "nome da IA ou modelo utilizado",
              analysisCompletedAt: "data e hora ISO da conclusão, quando disponível",
              usedImages: true,
              usedDocuments: true,
              usedProfessorVideoSummaries: false,
              confidence: "alta | media | baixa | nao_informada",
            },
            requiresUrgentHumanReview: false,
          },
          null,
          2
        )
      );
      zip.file(
        "RESUMO_DO_CASO.txt",
        [
          `Aluno: ${getStudentDisplayName(question.student)}`,
          `StudentId: ${question.student.id}`,
          `QuestionId: ${question.id}`,
          `Mensagem atual: ${question.content || ""}`,
          "",
          "Contexto técnico e histórico recente já estão incluídos no prompt.txt.",
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
            studentId,
            studentName: getStudentDisplayName(question.student),
            questionId: question.id,
            generatedAt,
            packagePurpose: items.length ? "ANALISE_DE_MENSAGEM_COM_ANEXOS" : "APOIO_A_RESPOSTA_DE_MENSAGEM_TEXTUAL",
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

      const missingRequiredFields: string[] = [];
      if (!normalized.summaryForTraining) missingRequiredFields.push("summaryForTraining");
      if (!normalized.studentReplySuggestion) missingRequiredFields.push("studentReplySuggestion");

      if (missingRequiredFields.length > 0) {
        const pastedEmptyTemplate =
          typeof parsed === "object" &&
          parsed !== null &&
          (Object.prototype.hasOwnProperty.call(parsed, "summaryForTraining") ||
            Object.prototype.hasOwnProperty.call(parsed, "studentReplySuggestion")) &&
          !firstNonEmptyText(parsed.summaryForTraining, parsed.studentReplySuggestion);

        const fieldLabels: Record<string, string> = {
          summaryForTraining: "summaryForTraining — resumo técnico objetivo para o treino",
          studentReplySuggestion: "studentReplySuggestion — resposta humana para o aluno",
        };

        return NextResponse.json(
          {
            error: pastedEmptyTemplate
              ? `Você colou o MODELO_RESPOSTA.json ainda vazio. Preencha os campos obrigatórios antes de salvar: ${missingRequiredFields.map((field) => fieldLabels[field]).join("; ")}.`
              : `Não foi possível salvar a análise. Campo(s) obrigatório(s) ausente(s) ou vazio(s): ${missingRequiredFields.map((field) => fieldLabels[field]).join("; ")}.`,
            missingFields: missingRequiredFields,
            acceptedAliases: {
              summaryForTraining: [
                "summaryForTraining",
                "summary_for_training",
                "trainingSummary",
                "summary",
                "resumoParaTreino",
                "resumo",
              ],
              studentReplySuggestion: [
                "studentReplySuggestion",
                "student_reply_suggestion",
                "replySuggestion",
                "suggestedStudentReply",
                "respostaSugeridaAluno",
                "sugestaoRespostaAluno",
              ],
            },
            guidance: pastedEmptyTemplate
              ? "Envie o pacote ZIP para a IA externa e cole no sistema a resposta preenchida por ela, não o modelo em branco."
              : "Peça à IA para devolver novamente o JSON usando o MODELO_RESPOSTA.json do pacote e preenchendo os dois campos obrigatórios.",
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

      const explicitMemoryUpdates = normalized.memoryUpdates;
      const memoryUpdates = explicitMemoryUpdates.length
        ? [...explicitMemoryUpdates]
        : inferConservativeMemoryUpdates(normalized);

      const environment = normalized.trainingEnvironment;
      const hasEnvironmentProfile =
        Boolean(environment.type && environment.type !== "UNKNOWN") ||
        environment.availableEquipment.length > 0 ||
        environment.observations.length > 0;

      if (
        hasEnvironmentProfile &&
        !memoryUpdates.some((item) => item.category === "TRAINING_ENVIRONMENT")
      ) {
        memoryUpdates.push({
          category: "TRAINING_ENVIRONMENT",
          title: "Ambiente de treino atual",
          summary: JSON.stringify({
            type: environment.type || "UNKNOWN",
            equipmentLevel: environment.equipmentLevel || "UNKNOWN",
            availableEquipment: environment.availableEquipment,
            observations: environment.observations,
            lastConfirmed: environment.lastConfirmed || new Date().toISOString().slice(0, 10),
          }),
          permanence: "UNTIL_UPDATED",
          validUntil: null,
          confidence:
            environment.confidence === "LOW"
              ? "LOW"
              : environment.confidence === "MEDIUM"
                ? "MEDIUM"
                : "HIGH",
          sourceEvidence: normalized.analyzedFiles
            .map((item: any) => cleanText(item?.fileName))
            .filter(Boolean)
            .slice(0, 10),
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        await tx.studentTechnicalMemory.updateMany({
          where: {
            studentId,
            sourceQuestionId: question.id,
            status: "APPROVED",
          },
          data: { status: "SUPERSEDED" },
        });

        const analysisMemory = await tx.studentTechnicalMemory.create({
          data: {
            studentId,
            sourceQuestionId: question.id,
            category: "DOCUMENT_ANALYSIS",
            title: normalized.packageTitle,
            summary: JSON.stringify(details, null, 2),
            sourceDocumentName: firstDocument?.name || "Pacote de anexos",
            sourceDocumentUrl: firstDocument?.url || null,
            status: "APPROVED",
            reviewedById: userId,
            reviewedAt: new Date(),
          },
        });

        const createdMemories = [];
        for (const item of memoryUpdates) {
          await tx.studentTechnicalMemory.updateMany({
            where: {
              studentId,
              category: item.category,
              title: item.title,
              status: "APPROVED",
            },
            data: { status: "SUPERSEDED" },
          });

          const created = await tx.studentTechnicalMemory.create({
            data: {
              studentId,
              sourceQuestionId: question.id,
              category: item.category,
              title: item.title,
              summary: JSON.stringify({
                summary: item.summary,
                permanence: item.permanence,
                confidence: item.confidence,
                sourceEvidence: item.sourceEvidence,
              }),
              sourceDocumentName: firstDocument?.name || "Pacote de anexos",
              sourceDocumentUrl: firstDocument?.url || null,
              status: "APPROVED",
              validUntil: parseMemoryValidUntil(item),
              reviewedById: userId,
              reviewedAt: new Date(),
            },
          });
          createdMemories.push(created);
        }

        return { analysisMemory, createdMemories };
      });

      return NextResponse.json({
        ok: true,
        memoryId: result.analysisMemory.id,
        structuredMemoryCount: result.createdMemories.length,
        structuredMemories: memoryUpdates,
        normalizedAnalysis: {
          packageTitle: normalized.packageTitle,
          summaryForTraining: normalized.summaryForTraining,
          studentReplySuggestion: normalized.studentReplySuggestion,
          requiresUrgentHumanReview: normalized.requiresUrgentHumanReview,
          questionsForProfessor: normalized.questionsForProfessor,
          availableEquipmentSummary: normalized.availableEquipmentSummary,
          trainingPlanningSuggestions: normalized.trainingPlanningSuggestions,
          trainingOpportunities: normalized.trainingOpportunities,
          missingEquipmentImpact: normalized.missingEquipmentImpact,
          trainingEnvironment: normalized.trainingEnvironment,
          limitations: normalized.limitations,
        },
        studentReplySuggestion: normalized.studentReplySuggestion || null,
        warning: normalized.studentReplySuggestion
          ? null
          : "A análise foi salva, mas a IA não trouxe uma sugestão de resposta ao aluno. Escreva a resposta manualmente no chat.",
        message: `Análise salva. ${result.createdMemories.length} memória(s) estruturada(s) foram atualizadas para os próximos treinos.`,
      });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("POST /api/student-documents error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno ao processar os anexos." }, { status: 500 });
  }
}

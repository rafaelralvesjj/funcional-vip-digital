
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import JSZip from "jszip";
import path from "node:path";
import { promises as fs } from "node:fs";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EXERCISES_PER_ZIP = 10;
const MAX_BATCH_SIZE = 10;

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();
  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";
  return value;
}

function canExport(role?: string | null): boolean {
  return ["GESTOR", "ADMIN"].includes(normalizeRole(role));
}

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function slugify(value: string): string {
  return (
    String(value || "exercicio")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "exercicio"
  );
}

function csvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function getExtensionFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url, "http://local").pathname;
    const ext = path.extname(pathname).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)
      ? ext
      : null;
  } catch {
    return null;
  }
}

function getExtensionFromContentType(contentType: string | null): string {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  return ".jpg";
}

async function readImage(
  url: string,
  origin: string
): Promise<{ buffer: Buffer; extension: string }> {
  const normalized = String(url || "").trim();
  if (!normalized) throw new Error("Imagem não informada.");

  if (normalized.startsWith("/")) {
    const publicPath = path.join(
      process.cwd(),
      "public",
      normalized.replace(/^\/+/, "")
    );

    try {
      const buffer = await fs.readFile(publicPath);
      return {
        buffer,
        extension: getExtensionFromUrl(normalized) || ".jpg",
      };
    } catch {
      // Na Vercel, a imagem pode estar em uma URL persistente.
    }
  }

  const absoluteUrl =
    normalized.startsWith("http://") || normalized.startsWith("https://")
      ? normalized
      : new URL(normalized, origin).toString();

  const response = await fetch(absoluteUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const extension =
    getExtensionFromUrl(absoluteUrl) ||
    getExtensionFromContentType(response.headers.get("content-type"));

  return { buffer, extension };
}

function compactText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildNarration(exercise: {
  name: string;
  instructions: string | null;
  safetyNotes: string | null;
}): string {
  const instructions = compactText(exercise.instructions);
  const safety = compactText(exercise.safetyNotes);

  if (instructions && safety) return `${instructions} ${safety}`;
  if (instructions) return instructions;
  if (safety) return safety;

  return `Execute ${exercise.name} com postura estável, movimento controlado e respiração natural.`;
}

function buildVideoPrompt(exercise: {
  name: string;
  description: string;
  muscleGroup: string;
  equipmentTags: string | null;
  levelTags: string | null;
  instructions: string | null;
  commonMistakes: string | null;
  safetyNotes: string | null;
  contraindications: string | null;
  sequencePrompt: string | null;
}): string {
  const narration = buildNarration(exercise);

  return [
    `VÍDEO DO EXERCÍCIO: ${exercise.name}`,
    "",
    "Use a imagem principal como imagem de origem e a imagem de sequência apenas como referência técnica do movimento.",
    "Mantenha a mesma pessoa, roupa, equipamento, cenário, iluminação e identidade visual.",
    "Não altere anatomia, proporções corporais, mãos, pés, equipamento ou fundo.",
    "",
    "MOVIMENTO:",
    `- Exercício: ${exercise.name}`,
    `- Grupo muscular: ${compactText(exercise.muscleGroup) || "não informado"}`,
    `- Descrição: ${compactText(exercise.description) || "não informada"}`,
    `- Equipamento: ${compactText(exercise.equipmentTags) || "não informado"}`,
    `- Nível: ${compactText(exercise.levelTags) || "não informado"}`,
    `- Como executar: ${compactText(exercise.instructions) || "executar com controle"}`,
    `- Erros a evitar: ${compactText(exercise.commonMistakes) || "evitar compensações e movimentos bruscos"}`,
    `- Cuidados: ${compactText(exercise.safetyNotes) || "manter postura segura e amplitude confortável"}`,
    `- Atenções: ${compactText(exercise.contraindications) || "adaptar em caso de dor ou restrição individual"}`,
    "",
    "PADRÃO DO VÍDEO:",
    "- Duração entre 6 e 8 segundos.",
    "- Mostrar de 2 a 3 repetições controladas quando o exercício for dinâmico.",
    "- Para exercício isométrico, mostrar entrada segura, sustentação e saída controlada.",
    "- Câmera estável e corpo inteiro visível.",
    "- Sem texto, legendas, logotipo, música ou efeitos exagerados.",
    "",
    "NARRAÇÃO:",
    "- Voz em português brasileiro nativo, dicção clara e tom profissional.",
    `- Falar exatamente: "${narration}"`,
    "",
    exercise.sequencePrompt
      ? `REFERÊNCIA ADICIONAL:\n${compactText(exercise.sequencePrompt)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id || !canExport(sessionUser?.role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const includeInactive =
      req.nextUrl.searchParams.get("includeInactive") === "true";

    const requestedBatch = positiveInteger(
      req.nextUrl.searchParams.get("batch"),
      1
    );

    const requestedLimit = positiveInteger(
      req.nextUrl.searchParams.get("limit"),
      EXERCISES_PER_ZIP
    );

    const batchSize = Math.min(requestedLimit, MAX_BATCH_SIZE);
    const where = includeInactive ? {} : { active: true };

    const totalExercises = await prisma.exerciseLibrary.count({ where });
    const totalBatches = Math.max(1, Math.ceil(totalExercises / batchSize));
    const batch = Math.min(requestedBatch, totalBatches);
    const skip = (batch - 1) * batchSize;

    const exercises = await prisma.exerciseLibrary.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: batchSize,
      select: {
        id: true,
        name: true,
        description: true,
        muscleGroup: true,
        imageUrl: true,
        videoUrl: true,
        sequenceImageUrl: true,
        sequencePrompt: true,
        active: true,
        equipmentTags: true,
        levelTags: true,
        instructions: true,
        commonMistakes: true,
        safetyNotes: true,
        contraindications: true,
      },
    });

    if (exercises.length === 0) {
      return NextResponse.json(
        { error: "Nenhum exercício encontrado para este lote." },
        { status: 404 }
      );
    }

    const batchLabel = String(batch).padStart(2, "0");
    const totalLabel = String(totalBatches).padStart(2, "0");
    const zip = new JSZip();
    const root = zip.folder(
      `FUNCIONAL_VIP_EXPORT_IA_PARTE_${batchLabel}_DE_${totalLabel}`
    );
    const imagesFolder = root?.folder("imagens");
    const promptsFolder = root?.folder("prompts");

    const rows: string[][] = [
      [
        "ordem_geral",
        "id",
        "nome",
        "slug",
        "grupo_muscular",
        "arquivo_principal",
        "status_principal",
        "arquivo_sequencia",
        "status_sequencia",
        "arquivo_prompt",
        "status_video_no_sistema",
        "video_url",
      ],
    ];

    let principalExported = 0;
    let sequenceExported = 0;
    let failures = 0;

    for (let index = 0; index < exercises.length; index += 1) {
      const exercise = exercises[index];
      const globalOrder = skip + index + 1;
      const slug = slugify(exercise.name);

      let principalFileName = "";
      let principalStatus = "SEM_IMAGEM";

      if (exercise.imageUrl) {
        try {
          const image = await readImage(exercise.imageUrl, req.nextUrl.origin);
          principalFileName = `${slug}__principal${image.extension}`;
          imagesFolder?.file(principalFileName, image.buffer, {
            compression: "STORE",
          });
          principalExported += 1;
          principalStatus = "EXPORTADA";
        } catch (error: any) {
          failures += 1;
          principalStatus = `ERRO: ${String(error?.message || "falha")}`;
        }
      }

      let sequenceFileName = "";
      let sequenceStatus = "SEM_IMAGEM";

      if (exercise.sequenceImageUrl) {
        try {
          const image = await readImage(
            exercise.sequenceImageUrl,
            req.nextUrl.origin
          );
          sequenceFileName = `${slug}__sequencia${image.extension}`;
          imagesFolder?.file(sequenceFileName, image.buffer, {
            compression: "STORE",
          });
          sequenceExported += 1;
          sequenceStatus = "EXPORTADA";
        } catch (error: any) {
          failures += 1;
          sequenceStatus = `ERRO: ${String(error?.message || "falha")}`;
        }
      }

      const promptFileName = `${slug}.txt`;
      promptsFolder?.file(promptFileName, buildVideoPrompt(exercise));

      rows.push([
        String(globalOrder),
        exercise.id,
        exercise.name,
        slug,
        exercise.muscleGroup,
        principalFileName,
        principalStatus,
        sequenceFileName,
        sequenceStatus,
        promptFileName,
        exercise.videoUrl ? "VIDEO_CADASTRADO" : "VIDEO_PENDENTE",
        exercise.videoUrl || "",
      ]);
    }

    const csv =
      "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\n");

    root?.file("manifesto.csv", csv);
    root?.file("status.csv", csv);
    root?.file(
      "LEIA-ME.txt",
      [
        "EXPORTAÇÃO PARA VÍDEOS — FUNCIONAL VIP DIGITAL",
        "",
        `Parte: ${batch} de ${totalBatches}`,
        `Exercícios neste pacote: ${exercises.length}`,
        `Faixa da biblioteca: ${skip + 1} até ${skip + exercises.length}`,
        `Imagens principais exportadas: ${principalExported}`,
        `Imagens sequenciais exportadas: ${sequenceExported}`,
        `Falhas de imagem: ${failures}`,
        "",
        "Use __principal como origem no CapCut.",
        "Use __sequencia como referência da execução.",
        "O TXT de mesmo nome contém o prompt individual.",
        "",
        `Depois desta parte, baixe a parte ${batch < totalBatches ? batch + 1 : "finalizada"}.`,
      ].join("\n")
    );

    const zipBytes = await zip.generateAsync({
      type: "uint8array",
      compression: "STORE",
    });

    const zipArrayBuffer = zipBytes.buffer.slice(
      zipBytes.byteOffset,
      zipBytes.byteOffset + zipBytes.byteLength
    ) as ArrayBuffer;

    return new NextResponse(zipArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="funcional-vip-export-ia-parte-${batchLabel}-de-${totalLabel}.zip"`,
        "Cache-Control": "no-store",
        "X-Export-Batch": String(batch),
        "X-Export-Total-Batches": String(totalBatches),
        "X-Export-Exercises": String(exercises.length),
      },
    });
  } catch (error: any) {
    console.error("GET /api/exercise-library/export error:", error);

    return NextResponse.json(
      {
        error: "Não foi possível exportar este lote da biblioteca.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

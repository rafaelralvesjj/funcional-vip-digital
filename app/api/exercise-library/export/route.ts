
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

function buildMovementInstruction(exercise: {
  name: string;
  description: string;
  instructions: string | null;
  sequencePrompt: string | null;
}): string {
  const sequencePrompt = compactText(exercise.sequencePrompt);
  const instructions = compactText(exercise.instructions);
  const description = compactText(exercise.description);

  if (sequencePrompt) return sequencePrompt;
  if (instructions) return instructions;
  if (description) return description;

  return `Executar uma repetição completa de ${exercise.name}, com movimento lento, controlado e retorno à posição inicial.`;
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
  const movementInstruction = buildMovementInstruction(exercise);
  const mistakes = compactText(exercise.commonMistakes);
  const safety = compactText(exercise.safetyNotes);

  return [
    `ANIMAÇÃO DE EXERCÍCIO — ${exercise.name}`,
    "",
    "Crie somente a animação corporal do exercício mostrado na imagem.",
    "A imagem principal é a cena inicial. A imagem de sequência, quando enviada, serve apenas como referência técnica das fases do movimento.",
    "",
    "MOVIMENTO OBRIGATÓRIO:",
    movementInstruction,
    "",
    "PADRÃO FIXO:",
    "- Fazer somente uma repetição completa.",
    "- Movimento lento, contínuo, controlado e biomecanicamente coerente.",
    "- Começar na posição inicial, executar o movimento e terminar exatamente na posição inicial.",
    "- Câmera totalmente fixa.",
    "- Sem zoom, rotação, panorâmica, cortes ou mudança de enquadramento.",
    "- Manter roupa, equipamento, fundo, iluminação, cores, proporções corporais e composição visual da imagem.",
    "- Manter os pés, mãos e equipamentos estáveis e anatomicamente coerentes.",
    "- Não criar movimentos extras, passos, gestos, saltos ou balanços que não façam parte do exercício.",
    "- Não adicionar ou remover pessoas, objetos ou equipamentos.",
    "- Não transformar o ambiente.",
    "- Duração aproximada de 6 segundos.",
    "",
    "ÁUDIO E ELEMENTOS GRÁFICOS:",
    "- Sem voz.",
    "- Sem narração.",
    "- Sem música.",
    "- Sem efeitos sonoros.",
    "- Sem texto.",
    "- Sem legendas.",
    "- Sem logotipo.",
    "- Sem marca-d'água.",
    "- Sem transições.",
    "- Sem efeitos visuais.",
    "",
    mistakes ? `EVITAR: ${mistakes}` : "",
    safety ? `CUIDADO TÉCNICO: ${safety}` : "",
    "",
    "RESULTADO ESPERADO:",
    "Vídeo silencioso, didático, limpo e padronizado para uma biblioteca profissional de exercícios do Funcional UP Digital.",
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
        "O TXT de mesmo nome contém o prompt individual otimizado para o CapCut.",
        "Os prompts geram somente movimento: sem voz, música, texto ou efeitos.",
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

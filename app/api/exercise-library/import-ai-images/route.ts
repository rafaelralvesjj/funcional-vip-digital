import { del, put } from "@vercel/blob";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type ImportKind = "MAIN" | "SEQUENCE";

type ParsedAiImageFile = {
  safeFileName: string;
  exerciseSlug: string;
  kind: ImportKind | null;
  extension: string;
};

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 4 * 1024 * 1024;

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
}

function canManageExerciseLibrary(role?: string | null): boolean {
  return ["GESTOR", "ADMIN", "TEACHER"].includes(normalizeRole(role));
}

function slugify(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function collapseDuplicateImageExtensions(fileName: string): string {
  let current = fileName;
  const duplicateExtension = /\.(png|jpe?g|webp)\.(png|jpe?g|webp)$/i;

  while (duplicateExtension.test(current)) {
    current = current.replace(duplicateExtension, ".$2");
  }

  return current;
}

function getSafeFileName(fileName: string): string {
  const safe = String(fileName || "imagem.png")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/^-|-$/g, "") || "imagem.png";

  return collapseDuplicateImageExtensions(safe).replace(
    /[-_]+(\.[a-z0-9]+)$/i,
    "$1"
  );
}

function parseAiImageFile(fileName: string): ParsedAiImageFile {
  const safeFileName = getSafeFileName(fileName);
  const extensionMatch = safeFileName.match(/\.([a-z0-9]+)$/i);
  const extension = extensionMatch?.[1] || "png";
  const baseName = safeFileName.replace(/\.[a-z0-9]+$/i, "");
  const normalizedBase = baseName
    .replace(/_+/g, "_")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const markerMatch = normalizedBase.match(
    /(?:__|[-_])(principal|capa|main|sequencia|sequencial|sequence|execucao)(?:[-_]?\d+)?$/i
  );

  if (!markerMatch || markerMatch.index === undefined) {
    return {
      safeFileName,
      exerciseSlug: slugify(normalizedBase.replace(/_/g, "-")),
      kind: null,
      extension,
    };
  }

  const marker = markerMatch[1].toLowerCase();
  const kind: ImportKind = ["principal", "capa", "main"].includes(marker)
    ? "MAIN"
    : "SEQUENCE";
  const exercisePart = normalizedBase.slice(0, markerMatch.index);

  return {
    safeFileName,
    exerciseSlug: slugify(exercisePart.replace(/_/g, "-")),
    kind,
    extension,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Erro desconhecido ao salvar imagem.";
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as { id?: string; role?: string } | undefined;

    if (!sessionUser?.id || !canManageExerciseLibrary(sessionUser.role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        {
          error:
            "Vercel Blob não está conectado ao projeto. Confira BLOB_STORE_ID nas variáveis de ambiente.",
        },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (files.length === 0) {
      return NextResponse.json({ error: "Nenhuma imagem enviada." }, { status: 400 });
    }

    const exercises = await prisma.exerciseLibrary.findMany({
      orderBy: { name: "asc" },
    });

    const exercisesBySlug = new Map(
      exercises.map((exercise) => [slugify(exercise.name), exercise])
    );
    const importedSlots = new Set<string>();

    const imported: Array<{
      fileName: string;
      exerciseName: string;
      kind: ImportKind;
      url: string;
      pathname: string;
    }> = [];
    const skipped: Array<{ fileName: string; reason: string }> = [];
    const updatedExercises: typeof exercises = [];

    for (const file of files) {
      const parsed = parseAiImageFile(file.name);

      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        skipped.push({
          fileName: file.name,
          reason: "Tipo não permitido. Use PNG, JPG ou WebP.",
        });
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        skipped.push({
          fileName: file.name,
          reason: `Arquivo acima de ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(
            0
          )} MB.`,
        });
        continue;
      }

      if (!parsed.kind) {
        skipped.push({
          fileName: file.name,
          reason:
            "Nome sem marcador __principal ou __sequencia. Também aceitamos sufixos como __sequencia2.",
        });
        continue;
      }

      if (!parsed.exerciseSlug) {
        skipped.push({
          fileName: file.name,
          reason: "Não foi possível identificar o nome do exercício pelo arquivo.",
        });
        continue;
      }

      const exercise = exercisesBySlug.get(parsed.exerciseSlug);

      if (!exercise) {
        skipped.push({
          fileName: file.name,
          reason: `Exercício não encontrado para o nome ${parsed.exerciseSlug}.`,
        });
        continue;
      }

      const slotKey = `${exercise.id}:${parsed.kind}`;

      if (importedSlots.has(slotKey)) {
        skipped.push({
          fileName: file.name,
          reason:
            parsed.kind === "MAIN"
              ? `Já foi importada uma imagem principal para ${exercise.name} neste envio.`
              : `Já foi importada uma imagem sequencial para ${exercise.name} neste envio.`,
        });
        continue;
      }

      const existingImageUrl =
        parsed.kind === "MAIN" ? exercise.imageUrl : exercise.sequenceImageUrl;

      if (existingImageUrl) {
        skipped.push({
          fileName: file.name,
          reason:
            parsed.kind === "MAIN"
              ? `${exercise.name} já possui imagem principal cadastrada. Para substituir, edite o exercício manualmente ou remova a imagem atual antes de importar.`
              : `${exercise.name} já possui imagem sequencial cadastrada. Para substituir, edite o exercício manualmente ou remova a imagem atual antes de importar.`,
        });
        continue;
      }

      importedSlots.add(slotKey);

      const folder = parsed.kind === "MAIN" ? "principal" : "sequencias";
      const pathname = `exercise-library/ia/${parsed.exerciseSlug}/${folder}/${parsed.safeFileName}`;
      let uploadedBlobUrl: string | null = null;

      try {
        const blob = await put(pathname, file, {
          access: "public",
          addRandomSuffix: true,
          contentType: file.type,
          cacheControlMaxAge: 365 * 24 * 60 * 60,
          maximumSizeInBytes: MAX_FILE_SIZE,
        });
        uploadedBlobUrl = blob.url;

        const data =
          parsed.kind === "MAIN"
            ? { imageUrl: blob.url }
            : {
                sequenceImageUrl: blob.url,
                sequenceGeneratedByAi: true,
                sequenceImageLabel:
                  exercise.sequenceImageLabel ||
                  `Execução de ${exercise.name} em etapas`,
                sequenceImageNotes:
                  exercise.sequenceImageNotes ||
                  "Observe a postura, o alinhamento corporal e o controle do movimento em cada etapa.",
                sequenceFramesCount: exercise.sequenceFramesCount || 6,
              };

        const updatedExercise = await prisma.exerciseLibrary.update({
          where: { id: exercise.id },
          data,
        });

        imported.push({
          fileName: file.name,
          exerciseName: exercise.name,
          kind: parsed.kind,
          url: blob.url,
          pathname: blob.pathname,
        });
        updatedExercises.push(updatedExercise);
        exercisesBySlug.set(parsed.exerciseSlug, updatedExercise);
      } catch (error: unknown) {
        if (uploadedBlobUrl) {
          await del(uploadedBlobUrl).catch((cleanupError) => {
            console.error("Erro ao remover Blob órfão:", cleanupError);
          });
        }

        skipped.push({
          fileName: file.name,
          reason: getErrorMessage(error),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      storage: "vercel-blob",
      importedCount: imported.length,
      ignoredCount: skipped.length,
      message: `Importação concluída no Vercel Blob. ${imported.length} arquivo(s) aproveitado(s) e ${skipped.length} ignorado(s).`,
      imported,
      skipped,
      updatedExercises,
    });
  } catch (error: unknown) {
    console.error("POST /api/exercise-library/import-ai-images error:", error);

    return NextResponse.json(
      {
        error: "Erro ao importar imagens IA para o Vercel Blob.",
        message: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}

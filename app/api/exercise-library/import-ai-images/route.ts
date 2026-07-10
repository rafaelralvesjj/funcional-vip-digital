import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

type ImportKind = "MAIN" | "SEQUENCE";

type ParsedAiImageFile = {
  safeFileName: string;
  exerciseSlug: string;
  kind: ImportKind | null;
  extension: string;
};

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
}

function canManageExerciseLibrary(role?: string | null): boolean {
  const normalized = normalizeRole(role);

  return ["GESTOR", "ADMIN", "TEACHER"].includes(normalized);
}

function slugify(value?: string | null): string {
  const slug = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug;
}

function getSafeFileName(fileName: string): string {
  return String(fileName || "imagem.png")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/^-|-$/g, "") || "imagem.png";
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

  const mainPattern = /(^|[-_])(principal|capa|main)(-\d+)?$/i;
  const sequencePattern = /(^|[-_])(sequencia|sequencial|sequence|execucao)(-\d+)?$/i;

  const hasMainMarker = mainPattern.test(normalizedBase) || normalizedBase.includes("__principal") || normalizedBase.includes("__capa");
  const hasSequenceMarker = sequencePattern.test(normalizedBase) || normalizedBase.includes("__sequencia") || normalizedBase.includes("__sequencial");

  let kind: ImportKind | null = null;
  let exercisePart = normalizedBase;

  if (hasMainMarker) {
    kind = "MAIN";
    exercisePart = exercisePart
      .replace(/__(principal|capa|main)(-\d+)?$/i, "")
      .replace(/([-_])(principal|capa|main)(-\d+)?$/i, "");
  } else if (hasSequenceMarker) {
    kind = "SEQUENCE";
    exercisePart = exercisePart
      .replace(/__(sequencia|sequencial|sequence|execucao)(-\d+)?$/i, "")
      .replace(/([-_])(sequencia|sequencial|sequence|execucao)(-\d+)?$/i, "");
  }

  const exerciseSlug = slugify(exercisePart.replace(/_/g, "-"));

  return {
    safeFileName,
    exerciseSlug,
    kind,
    extension,
  };
}

async function uploadFileToGithub(params: {
  file: File;
  path: string;
  message: string;
}) {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    throw new Error("GitHub não configurado.");
  }

  const buffer = Buffer.from(await params.file.arrayBuffer());
  const content = buffer.toString("base64");
  const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${params.path}`;

  const getRes = await fetch(getUrl, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  let sha: string | undefined;
  if (getRes.ok) {
    const existing = await getRes.json();
    sha = existing.sha;
  }

  const putRes = await fetch(getUrl, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github.v3+json",
    },
    body: JSON.stringify({
      message: params.message,
      content,
      ...(sha && { sha }),
    }),
  });

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => null);
    throw new Error(err?.message || "Erro ao salvar imagem no GitHub.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id || !canManageExerciseLibrary(sessionUser?.role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
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

    const exercisesBySlug = new Map<string, any>(
      exercises.map((exercise) => [slugify(exercise.name), exercise])
    );

    const importedSlots = new Set<string>();

    const imported: Array<{
      fileName: string;
      exerciseName: string;
      kind: ImportKind;
      url: string;
    }> = [];

    const skipped: Array<{
      fileName: string;
      reason: string;
    }> = [];

    const updatedExercises: any[] = [];

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
          reason: `Arquivo acima de ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB.`,
        });
        continue;
      }

      if (!parsed.kind) {
        skipped.push({
          fileName: file.name,
          reason: "Nome sem marcador __principal ou __sequencia.",
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
          reason: `Exercício não encontrado para o slug ${parsed.exerciseSlug}.`,
        });
        continue;
      }

      const slotKey = `${exercise.id}:${parsed.kind}`;

      if (importedSlots.has(slotKey)) {
        skipped.push({
          fileName: file.name,
          reason:
            parsed.kind === "MAIN"
              ? `Já foi importada uma imagem principal para ${exercise.name} neste lote.`
              : `Já foi importada uma imagem sequencial para ${exercise.name} neste lote.`,
        });
        continue;
      }

      const existingImageUrl = parsed.kind === "MAIN" ? exercise.imageUrl : exercise.sequenceImageUrl;

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
      const relativePath = `ia/${parsed.exerciseSlug}/${folder}/${parsed.safeFileName}`;
      const githubPath = `public/images/exercices/${relativePath}`;
      const publicUrl = `/images/exercices/${relativePath}`;

      try {
        await uploadFileToGithub({
          file,
          path: githubPath,
          message: `Add or update AI exercise image ${parsed.safeFileName}`,
        });

        const data =
          parsed.kind === "MAIN"
            ? {
                imageUrl: publicUrl,
              }
            : {
                sequenceImageUrl: publicUrl,
                sequenceGeneratedByAi: true,
                sequenceImageLabel:
                  exercise.sequenceImageLabel || `Execução de ${exercise.name} em etapas`,
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
          url: publicUrl,
        });

        updatedExercises.push(updatedExercise);
        exercisesBySlug.set(parsed.exerciseSlug, updatedExercise);
      } catch (error: any) {
        skipped.push({
          fileName: file.name,
          reason: error?.message || "Erro ao salvar imagem.",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      imported,
      skipped,
      updatedExercises,
    });
  } catch (error: any) {
    console.error("POST /api/exercise-library/import-ai-images error:", error);

    return NextResponse.json(
      {
        error: "Erro ao importar imagens IA.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

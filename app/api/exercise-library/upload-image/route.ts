import { put } from "@vercel/blob";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

export const runtime = "nodejs";

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

function getExtensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Erro desconhecido ao enviar a imagem.";
}

export async function POST(request: Request) {
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

    const formData = await request.formData();
    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File) || fileEntry.size <= 0) {
      return NextResponse.json({ error: "Nenhuma imagem enviada." }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.includes(fileEntry.type)) {
      return NextResponse.json(
        { error: "Tipo não permitido. Use PNG, JPG ou WebP." },
        { status: 400 }
      );
    }

    if (fileEntry.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `Imagem acima de ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(
            0
          )} MB. Reduza o arquivo antes de enviar.`,
        },
        { status: 400 }
      );
    }

    const kindRaw = String(formData.get("kind") || "MAIN").toUpperCase();
    const kind = kindRaw === "SEQUENCE" ? "SEQUENCE" : "MAIN";
    const exerciseName = String(formData.get("exerciseName") || "").trim();

    const baseName = slugify(
      exerciseName || fileEntry.name.replace(/\.[a-z0-9]+$/i, "")
    ).slice(0, 120) || "imagem-exercicio";
    const extension = getExtensionForMimeType(fileEntry.type);
    const folder = kind === "SEQUENCE" ? "sequencias" : "principal";
    const pathname = `exercise-library/manual/${folder}/${Date.now()}-${baseName}.${extension}`;

    const blob = await put(pathname, fileEntry, {
      access: "public",
      addRandomSuffix: true,
      contentType: fileEntry.type,
      cacheControlMaxAge: 365 * 24 * 60 * 60,
      maximumSizeInBytes: MAX_FILE_SIZE,
    });

    return NextResponse.json({
      ok: true,
      storage: "vercel-blob",
      url: blob.url,
      pathname: blob.pathname,
      fileName: blob.pathname.split("/").pop() || fileEntry.name,
      contentType: blob.contentType,
      size: fileEntry.size,
    });
  } catch (error: unknown) {
    console.error("POST /api/exercise-library/upload-image error:", error);

    return NextResponse.json(
      {
        error: "Não foi possível enviar a imagem ao Vercel Blob.",
        message: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}

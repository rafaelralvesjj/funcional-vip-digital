import { put } from "@vercel/blob";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

export const runtime = "nodejs";

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_VIDEO_SIZE = 4 * 1024 * 1024;

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
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  return "mp4";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Erro desconhecido ao enviar o vídeo.";
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
      return NextResponse.json({ error: "Nenhum vídeo enviado." }, { status: 400 });
    }

    if (!ALLOWED_VIDEO_TYPES.includes(fileEntry.type)) {
      return NextResponse.json(
        { error: "Tipo não permitido. Use MP4, WebM ou MOV." },
        { status: 400 }
      );
    }

    if (fileEntry.size > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        {
          error: `Vídeo acima de ${(MAX_VIDEO_SIZE / 1024 / 1024).toFixed(
            0
          )} MB. Reduza o arquivo antes de enviar.`,
        },
        { status: 400 }
      );
    }

    const exerciseName = String(formData.get("exerciseName") || "").trim();
    const baseName =
      slugify(exerciseName || fileEntry.name.replace(/\.[a-z0-9]+$/i, "")).slice(
        0,
        120
      ) || "video-exercicio";
    const extension = getExtensionForMimeType(fileEntry.type);
    const pathname = `exercise-library/videos/${Date.now()}-${baseName}.${extension}`;

    const blob = await put(pathname, fileEntry, {
      access: "public",
      addRandomSuffix: true,
      contentType: fileEntry.type,
      cacheControlMaxAge: 365 * 24 * 60 * 60,
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
    console.error("POST /api/exercise-library/upload-video error:", error);

    return NextResponse.json(
      {
        error: "Não foi possível enviar o vídeo ao Vercel Blob.",
        message: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}

import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 4 * 1024 * 1024;

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

function getSafeFolder(value: FormDataEntryValue | null): string {
  const normalized = slugify(String(value || ""));

  const folderMap: Record<string, string> = {
    perfil: "perfil",
    "cadastro-aluno": "cadastro-aluno",
    onboarding: "onboarding",
  };

  return folderMap[normalized] || "perfil";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Erro desconhecido ao enviar a foto.";
}

export async function POST(request: Request) {
  try {
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
      return NextResponse.json(
        { error: "Nenhuma foto foi enviada." },
        { status: 400 }
      );
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

    const folder = getSafeFolder(formData.get("folder"));
    const originalName = fileEntry.name.replace(/\.[a-z0-9]+$/i, "");
    const baseName =
      slugify(originalName).slice(0, 120) || "foto-perfil";
    const extension = getExtensionForMimeType(fileEntry.type);
    const pathname = `profile-photos/${folder}/${Date.now()}-${baseName}.${extension}`;

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
    console.error("POST /api/upload-profile-photo error:", error);

    return NextResponse.json(
      {
        error: "Não foi possível enviar a foto ao Vercel Blob.",
        message: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}

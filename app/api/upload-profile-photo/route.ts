import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function getSafeExtension(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function getSafeContext(value: unknown): string {
  const context = slugify(typeof value === "string" ? value : "");

  const allowedContexts = [
    "perfil",
    "cadastro-aluno",
    "onboarding",
  ];

  return allowedContexts.includes(context) ? context : "perfil";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Erro desconhecido ao enviar a imagem.";
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        {
          error:
            "Vercel Blob não está conectado ao projeto. Confira as variáveis do Blob na Vercel.",
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const entry = formData.get("file");
    const context = getSafeContext(formData.get("folder"));

    if (!(entry instanceof File) || entry.size <= 0) {
      return NextResponse.json(
        { error: "Nenhuma imagem foi enviada." },
        { status: 400 }
      );
    }

    if (!ALLOWED_IMAGE_TYPES.includes(entry.type)) {
      return NextResponse.json(
        {
          error: "Formato inválido. Use uma imagem PNG, JPG ou WebP.",
        },
        { status: 400 }
      );
    }

    if (entry.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `A imagem precisa ter no máximo ${
            MAX_FILE_SIZE / 1024 / 1024
          } MB.`,
        },
        { status: 400 }
      );
    }

    const extension = getSafeExtension(entry);
    const pathname = `profile-photos/${context}/foto-${Date.now()}.${extension}`;

    const blob = await put(pathname, entry, {
      access: "public",
      addRandomSuffix: true,
      contentType: entry.type,
      cacheControlMaxAge: 365 * 24 * 60 * 60,
      maximumSizeInBytes: MAX_FILE_SIZE,
    });

    return NextResponse.json({
      ok: true,
      storage: "vercel-blob",
      url: blob.url,
      pathname: blob.pathname,
    });
  } catch (error: unknown) {
    console.error("POST /api/upload-profile-photo error:", error);

    return NextResponse.json(
      {
        error: "Erro ao enviar a foto para o Vercel Blob.",
        message: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}

import { issueSignedToken, presignUrl } from "@vercel/blob";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/mpeg",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const MAX_CHAT_MEDIA_SIZE = 25 * 1024 * 1024;
const MAX_CHAT_DOCUMENT_SIZE = 5 * 1024 * 1024;
const SIGNED_URL_VALIDITY_MS = 15 * 60 * 1000;

type UploadRequestBody = {
  pathname?: unknown;
  contentType?: unknown;
  size?: unknown;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível preparar o envio do arquivo.";
}

function normalizePathname(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._/-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\/+/, "");
}

async function getStudentForSession() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as
    | { id?: string | null; email?: string | null }
    | undefined;
  const userId = String(sessionUser?.id || "").trim();
  const email = String(sessionUser?.email || "").trim();

  if (!userId && !email) return null;

  return prisma.student.findFirst({
    where: {
      active: true,
      OR: [
        ...(userId ? [{ userAuthId: userId }] : []),
        ...(email
          ? [
              { email: { equals: email, mode: "insensitive" as const } },
              {
                userAuth: {
                  email: { equals: email, mode: "insensitive" as const },
                },
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  });
}

export async function POST(request: Request) {
  try {
    const student = await getStudentForSession();

    if (!student) {
      return NextResponse.json(
        { error: "Aluno não encontrado para o usuário conectado." },
        { status: 401 }
      );
    }

    const body = (await request.json()) as UploadRequestBody;
    const pathname = String(body.pathname || "").trim();
    const contentType = String(body.contentType || "").trim().toLowerCase();
    const size = Number(body.size);
    const normalizedPathname = normalizePathname(pathname);
    const expectedPrefix = `chat/${student.id}/`;

    if (
      !pathname ||
      normalizedPathname !== pathname ||
      !normalizedPathname.startsWith(expectedPrefix) ||
      normalizedPathname.includes("../")
    ) {
      return NextResponse.json(
        { error: "Caminho de upload inválido para este aluno." },
        { status: 400 }
      );
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Formato de foto ou vídeo não permitido." },
        { status: 400 }
      );
    }

    const isDocument = contentType === "application/pdf" || contentType === "application/msword" || contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || contentType === "text/plain";
    const maximumSize = isDocument ? MAX_CHAT_DOCUMENT_SIZE : MAX_CHAT_MEDIA_SIZE;

    if (!Number.isFinite(size) || size <= 0 || size > maximumSize) {
      return NextResponse.json(
        { error: isDocument ? "Documentos precisam ter até 5 MB." : "Fotos e vídeos precisam ter até 25 MB." },
        { status: 400 }
      );
    }

    const validUntil = Date.now() + SIGNED_URL_VALIDITY_MS;
    const token = await issueSignedToken({
      pathname: normalizedPathname,
      operations: ["put"],
      allowedContentTypes: [contentType],
      maximumSizeInBytes: maximumSize,
      validUntil,
    });

    const { presignedUrl } = await presignUrl(token, {
      pathname: normalizedPathname,
      operation: "put",
      access: "public",
      validUntil,
      addRandomSuffix: true,
      allowOverwrite: false,
    });

    return NextResponse.json({ presignedUrl });
  } catch (error) {
    console.error("POST /api/chat/upload error:", error);

    return NextResponse.json(
      {
        error: "Não foi possível preparar o envio do arquivo do chat.",
        message: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}

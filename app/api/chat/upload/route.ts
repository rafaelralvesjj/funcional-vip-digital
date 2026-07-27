import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ALLOWED_CONTENT_TYPES = [
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
];

const MAX_CHAT_MEDIA_SIZE = 25 * 1024 * 1024;

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

function getStudentIdFromPayload(tokenPayload?: string | null): string | null {
  if (!tokenPayload) return null;

  try {
    const parsed = JSON.parse(tokenPayload) as { studentId?: unknown };
    const studentId = String(parsed?.studentId || "").trim();
    return studentId || null;
  } catch {
    return null;
  }
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
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Vercel Blob não está conectado ao projeto." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as HandleUploadBody;

    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const student = await getStudentForSession();

        if (!student) {
          throw new Error("Aluno não encontrado para o usuário conectado.");
        }

        const normalizedPathname = normalizePathname(pathname);
        const expectedPrefix = `chat/${student.id}/`;

        if (
          !normalizedPathname.startsWith(expectedPrefix) ||
          normalizedPathname !== pathname ||
          normalizedPathname.includes("../")
        ) {
          throw new Error("Caminho de upload inválido para este aluno.");
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_CHAT_MEDIA_SIZE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ studentId: student.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.info("Upload de chat concluído", {
          pathname: blob.pathname,
          studentId: getStudentIdFromPayload(tokenPayload),
        });
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("POST /api/chat/upload error:", error);

    return NextResponse.json(
      {
        error: "Não foi possível enviar o arquivo do chat.",
        message: getErrorMessage(error),
      },
      { status: 400 }
    );
  }
}

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

export const runtime = "nodejs";

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();
  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";
  return value;
}

function canManageExerciseLibrary(role?: string | null): boolean {
  return ["GESTOR", "ADMIN", "TEACHER"].includes(normalizeRole(role));
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as { id?: string; role?: string } | undefined;

    if (!sessionUser?.id || !canManageExerciseLibrary(sessionUser.role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_VIDEO_TYPES,
        maximumSizeInBytes: MAX_VIDEO_SIZE,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("POST /api/exercise-library/upload-video error:", error);
    return NextResponse.json(
      { error: "Não foi possível enviar o vídeo ao Vercel Blob." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "ALUNO") return "STUDENT";
  if (value === "PROFESSOR") return "TEACHER";

  return value;
}

function cleanImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const imageUrl = value.trim();

  if (!imageUrl) return null;
  if (imageUrl.length > 2000) return null;

  const isRelativeUpload = imageUrl.startsWith("/");
  const isHttpUrl = /^https?:\/\//i.test(imageUrl);

  if (!isRelativeUpload && !isHttpUrl) return null;

  return imageUrl;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const userId = sessionUser?.id ? String(sessionUser.id) : null;
    const userEmail = sessionUser?.email ? String(sessionUser.email).trim().toLowerCase() : null;
    const role = normalizeRole(sessionUser?.role);

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const imageUrl = cleanImageUrl(body?.imageUrl);

    if (!imageUrl) {
      return NextResponse.json(
        { ok: false, error: "URL da imagem inválida." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          image: imageUrl,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          image: true,
        },
      });

      let updatedStudent: { id: string; image: string | null } | null = null;

      if (role === "STUDENT") {
        const student = await tx.student.findFirst({
          where: {
            OR: [
              { userAuthId: userId },
              ...(userEmail ? [{ email: { equals: userEmail, mode: "insensitive" as const } }] : []),
            ],
          },
          select: {
            id: true,
          },
        });

        if (student?.id) {
          updatedStudent = await tx.student.update({
            where: {
              id: student.id,
            },
            data: {
              image: imageUrl,
            },
            select: {
              id: true,
              image: true,
            },
          });
        }
      }

      return {
        user: updatedUser,
        student: updatedStudent,
      };
    });

    return NextResponse.json({
      ok: true,
      imageUrl,
      user: result.user,
      student: result.student,
    });
  } catch (error: any) {
    console.error("POST /api/profile/photo error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Erro ao atualizar foto do perfil.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

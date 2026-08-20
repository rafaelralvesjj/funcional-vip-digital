import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);
    const token = String(body?.token || "").trim();
    const password = String(body?.password || "");

    if (!token) {
      return NextResponse.json({ error: "Link de redefinição inválido" }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter no mínimo 6 caracteres" },
        { status: 400 }
      );
    }

    const tokenHash = hashToken(token);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Este link de redefinição é inválido ou expirou. Solicite um novo." },
        { status: 400 }
      );
    }

    const hashedPassword = await hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      prisma.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ message: "Senha redefinida com sucesso" }, { status: 200 });
  } catch (error) {
    console.error("RESET_PASSWORD_ERROR", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

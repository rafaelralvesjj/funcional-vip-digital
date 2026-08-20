import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const GENERIC_RESPONSE = {
  message:
    "Se o e-mail informado estiver cadastrado, você receberá um link para redefinir sua senha.",
};

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getResetPasswordUrl(token: string): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/auth/redefinir-senha?token=${token}`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resolveRecipientType(role: string | null | undefined): "STUDENT" | "TEACHER" | "SYSTEM" {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "ALUNO" || normalized === "STUDENT") return "STUDENT";
  if (normalized === "PROFESSOR" || normalized === "TEACHER") return "TEACHER";
  return "SYSTEM";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Informe um e-mail válido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, role: true, active: true },
    });

    if (user && user.active && user.email) {
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = hashToken(rawToken);

      // Invalida qualquer link de redefinição anterior ainda não usado,
      // para que só o link mais recente enviado funcione.
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });

      const resetUrl = getResetPasswordUrl(rawToken);
      const firstName = String(user.name || "").trim().split(" ")[0] || "";

      const html = `
        <h1>Redefinir senha</h1>
        <p>${firstName ? `Olá, ${escapeHtml(firstName)}.` : "Olá."}</p>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta no Funcional UP Digital. Se foi você, clique no botão abaixo para criar uma nova senha. O link expira em 1 hora.</p>
        <a href="${resetUrl}">Redefinir minha senha</a>
        <p>Se você não solicitou essa alteração, pode ignorar este e-mail — sua senha atual continua válida.</p>
      `;

      try {
        await sendEmail({
          to: user.email,
          subject: "Redefinição de senha - Funcional UP Digital",
          text: `Acesse o link para redefinir sua senha: ${resetUrl} (expira em 1 hora). Se você não solicitou essa alteração, ignore este e-mail.`,
          html,
          eventType: "PASSWORD_RESET_REQUESTED",
          recipientType: resolveRecipientType(user.role),
          contextId: user.id,
        });
      } catch (emailError) {
        console.error("PASSWORD_RESET_EMAIL_FAILED", { userId: user.id, error: emailError });
      }
    }

    // Resposta sempre genérica, independentemente do e-mail existir ou não,
    // para não revelar quais e-mails estão cadastrados no sistema.
    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  } catch (error) {
    console.error("FORGOT_PASSWORD_ERROR", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  eventType?: string;
  recipientType?: "STUDENT" | "TEACHER" | "MANAGEMENT" | "SYSTEM";
  contextId?: string | null;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Variável de ambiente não configurada: ${name}`);
  }

  return value;
}

export async function sendEmail({ to, subject, text, html, eventType = "UNSPECIFIED", recipientType = "SYSTEM", contextId = null }: SendEmailInput) {
  const normalizedTo = String(to || "").trim().toLowerCase();
  if (!normalizedTo || !normalizedTo.includes("@")) {
    throw new Error(`Destinatário de e-mail inválido para ${eventType}`);
  }

  const host = process.env.EMAIL_HOST || "smtp.gmail.com";
  const port = Number(process.env.EMAIL_PORT || "465");
  const secure = port === 465;

  const user = getRequiredEnv("EMAIL_USER");
  const pass = getRequiredEnv("EMAIL_PASS");
  const from = process.env.EMAIL_FROM || `Funcional UP Digital <${user}>`;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  try {
    const result = await transporter.sendMail({
      from,
      to: normalizedTo,
      subject,
      text,
      html,
    });

    console.info("EMAIL_SENT", {
      eventType,
      recipientType,
      contextId,
      to: normalizedTo,
      messageId: result.messageId || null,
    });

    return result;
  } catch (error) {
    console.error("EMAIL_FAILED", {
      eventType,
      recipientType,
      contextId,
      to: normalizedTo,
      error,
    });
    throw error;
  }
}

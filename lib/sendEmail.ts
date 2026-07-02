import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Variável de ambiente não configurada: ${name}`);
  }

  return value;
}

export async function sendEmail({ to, subject, text, html }: SendEmailInput) {
  const host = process.env.EMAIL_HOST || "smtp.gmail.com";
  const port = Number(process.env.EMAIL_PORT || "465");
  const secure = port === 465;

  const user = getRequiredEnv("EMAIL_USER");
  const pass = getRequiredEnv("EMAIL_PASS");
  const from = process.env.EMAIL_FROM || `Funcional Vip Digital <${user}>`;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  return transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

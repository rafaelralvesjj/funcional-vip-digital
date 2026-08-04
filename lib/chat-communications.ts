import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";
import { resolveProfessorRecipientEmail, resolveStudentRecipientEmail } from "@/lib/email-recipient-policy";

function appLoginUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://funcional-up-digital.vercel.app";
  return `${base.replace(/\/$/, "")}/auth/signin`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function preview(value: string, max = 180): string {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function notifyStudentAboutChatReply(input: {
  studentId: string;
  authorId: string;
  senderName: string;
  conversationId: string;
  replyText: string;
  includeReplyTextInEmail?: boolean;
}): Promise<{ noticeCreated: boolean; emailSent: boolean; email: string | null }> {
  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { id: true, name: true, email: true, userAuthId: true },
  });

  if (!student) {
    console.error("CHAT_REPLY_STUDENT_NOT_FOUND", { studentId: input.studentId, conversationId: input.conversationId });
    return { noticeCreated: false, emailSent: false, email: null };
  }

  let noticeCreated = false;
  try {
    await prisma.notice.create({
      data: {
        title: `${input.senderName} respondeu sua mensagem 💬`,
        content: [
          `Oi, ${student.name || "aluno"}!`,
          "",
          `${input.senderName} respondeu sua conversa no chat.`,
          preview(input.replyText),
          "",
          "Abra a conversa para ler tudo e continuar falando com o professor, se precisar.",
        ].join("\n"),
        type: "RESPOSTA_CHAT",
        targetRole: "STUDENT",
        studentId: student.id,
        authorId: input.authorId,
      },
    });
    noticeCreated = true;
    console.info("CHAT_REPLY_NOTICE_CREATED", { studentId: student.id, conversationId: input.conversationId });
  } catch (error) {
    console.error("CHAT_REPLY_NOTICE_FAILED", { studentId: student.id, conversationId: input.conversationId, error });
  }

  const email = await resolveStudentRecipientEmail({
    studentId: student.id,
    studentEmail: student.email,
    userAuthId: student.userAuthId,
  });

  if (!email) {
    console.error("CHAT_REPLY_EMAIL_SKIPPED_NO_RECIPIENT", {
      studentId: student.id,
      conversationId: input.conversationId,
      hasStudentEmail: Boolean(student.email),
      hasUserAuthId: Boolean(student.userAuthId),
    });
    return { noticeCreated, emailSent: false, email: null };
  }

  const loginUrl = appLoginUrl();
  const studentName = student.name || "aluno";
  const subject = `${input.senderName} respondeu sua mensagem 💬`;
  const text = [
    `Oi, ${studentName}!`,
    "",
    `${input.senderName} leu sua mensagem e já respondeu pelo chat do Funcional UP Digital.`,
    ...(input.includeReplyTextInEmail ? ["", input.replyText] : []),
    "",
    "Abra a conversa, leia com calma e continue por lá se ainda quiser contar alguma coisa ou tirar outra dúvida.",
    "",
    `Abrir conversa: ${loginUrl}`,
    "",
    "Funcional UP Digital",
    "Mensagem automática enviada depois de uma resposta real do professor.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
        <h2 style="color:#00A19C;margin:0 0 16px;">Tem resposta nova para você 💬</h2>
        <p style="color:#f5f5f5;line-height:1.6;">Oi, <strong>${escapeHtml(studentName)}</strong>!</p>
        <p style="color:#d4d4d4;line-height:1.6;"><strong>${escapeHtml(input.senderName)}</strong> leu sua mensagem e já respondeu pelo chat.</p>
        ${input.includeReplyTextInEmail ? `<div style="margin:16px 0;padding:14px 16px;border-left:3px solid #00A19C;background:#0a0a0a;border-radius:8px;color:#f5f5f5;font-size:14px;line-height:1.6;">${escapeHtml(input.replyText)}</div>` : ""}
        <p style="color:#d4d4d4;line-height:1.6;">Abra a conversa, leia com calma e continue por lá se ainda quiser contar alguma coisa ou tirar outra dúvida.</p>
        <a href="${loginUrl}" style="display:inline-block;background:#00A19C;color:#0a0a0a;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px;">Abrir minha conversa</a>
        <p style="color:#6b7280;font-size:11px;line-height:1.5;margin-top:18px;">Mensagem automática enviada depois de uma resposta real do professor.</p>
      </div>
    </div>`;

  try {
    await sendEmail({
      to: email,
      subject,
      text,
      html,
      eventType: "TEACHER_CHAT_REPLY",
      recipientType: "STUDENT",
      contextId: input.conversationId,
    });
    return { noticeCreated, emailSent: true, email };
  } catch (error) {
    console.error("CHAT_REPLY_EMAIL_FAILED", { studentId: student.id, conversationId: input.conversationId, email, error });
    return { noticeCreated, emailSent: false, email };
  }
}

export async function notifyProfessorAboutStudentChatMessage(input: {
  studentId: string;
  professorId?: string | null;
  authorId: string;
  conversationId: string;
  messageText: string;
}): Promise<{ noticeCreated: boolean; emailSent: boolean }> {
  const [student, professor] = await Promise.all([
    prisma.student.findUnique({ where: { id: input.studentId }, select: { id: true, name: true } }),
    resolveProfessorRecipientEmail({ professorId: input.professorId, studentId: input.studentId }),
  ]);

  if (!student || !professor) {
    console.error("STUDENT_CHAT_NOTIFY_PROFESSOR_SKIPPED", {
      studentId: input.studentId,
      professorId: input.professorId || null,
      conversationId: input.conversationId,
    });
    return { noticeCreated: false, emailSent: false };
  }

  let noticeCreated = false;
  try {
    await prisma.notice.create({
      data: {
        title: `${student.name} enviou uma nova mensagem`,
        content: [
          `${student.name} escreveu pelo chat:`,
          preview(input.messageText),
          "",
          "Abra a conversa para responder e manter o acompanhamento registrado.",
        ].join("\n"),
        type: "NOVA_MENSAGEM_ALUNO",
        targetRole: "TEACHER",
        studentId: student.id,
        professorId: professor.professorId,
        authorId: input.authorId,
      },
    });
    noticeCreated = true;
    console.info("STUDENT_CHAT_NOTICE_CREATED", { studentId: student.id, professorId: professor.professorId, conversationId: input.conversationId });
  } catch (error) {
    console.error("STUDENT_CHAT_NOTICE_FAILED", { studentId: student.id, professorId: professor.professorId, conversationId: input.conversationId, error });
  }

  const loginUrl = appLoginUrl();
  const text = [
    `Oi, ${professor.name || "professor"}!`,
    "",
    `${student.name} enviou uma nova mensagem pelo chat do Funcional UP Digital.`,
    "",
    preview(input.messageText),
    "",
    `Abrir conversa: ${loginUrl}`,
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;"><div style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;"><h2 style="color:#00A19C;">Nova mensagem de aluno</h2><p style="color:#f5f5f5;">Oi, <strong>${escapeHtml(professor.name || "professor")}</strong>!</p><p style="color:#d4d4d4;"><strong>${escapeHtml(student.name)}</strong> enviou uma nova mensagem pelo chat.</p><p style="color:#d4d4d4;">${escapeHtml(preview(input.messageText))}</p><a href="${loginUrl}" style="display:inline-block;background:#00A19C;color:#0a0a0a;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px;">Abrir conversa</a></div></div>`;

  try {
    await sendEmail({
      to: professor.email,
      subject: `${student.name} enviou uma nova mensagem`,
      text,
      html,
      eventType: "STUDENT_CHAT_MESSAGE",
      recipientType: "TEACHER",
      contextId: input.conversationId,
    });
    return { noticeCreated, emailSent: true };
  } catch (error) {
    console.error("STUDENT_CHAT_EMAIL_FAILED", { studentId: student.id, professorId: professor.professorId, conversationId: input.conversationId, error });
    return { noticeCreated, emailSent: false };
  }
}

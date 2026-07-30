import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const NOTICE_TITLE = "Prepare-se para uma nova semana de treinos";
const NOTICE_TYPE = "WEEK_PREPARATION";
const TARGET_ROLE = "STUDENT";
const TIME_ZONE = "America/Maceio";

const MOTIVATIONAL_PHRASES = [
  "Uma nova semana é uma nova oportunidade de cuidar de você e seguir evoluindo.",
  "Constância não é fazer tudo perfeito; é continuar dando o próximo passo.",
  "Cada treino realizado com atenção fortalece o corpo, a confiança e a disciplina.",
  "Comece a semana lembrando: pequenos avanços consistentes constroem grandes resultados.",
  "Seu progresso começa quando você separa um tempo para cuidar de si.",
];

type EligibleStudent = {
  id: string;
  name: string;
  email: string | null;
  userAuthId: string | null;
  userId: string | null;
  user: {
    name: string | null;
  } | null;
};

function getAppStudentUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/aluno`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getDatePartsInTimeZone(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: String(values.weekday || ""),
  };
}

function getNextMondayKey(referenceDate: Date = new Date()): string {
  const parts = getDatePartsInTimeZone(referenceDate);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  const weekday = date.getUTCDay();
  const daysUntilMonday = weekday === 0 ? 1 : 8 - weekday;

  date.setUTCDate(date.getUTCDate() + daysUntilMonday);

  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function formatMondayLabel(mondayKey: string): string {
  const [year, month, day] = mondayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return date.toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}

function chooseMotivationalPhrase(studentId: string, mondayKey: string): string {
  const seed = `${studentId}-${mondayKey}`;
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return MOTIVATIONAL_PHRASES[hash % MOTIVATIONAL_PHRASES.length];
}

async function getNoticeAuthorId(): Promise<string | null> {
  const manager = await prisma.user.findFirst({
    where: {
      active: true,
      role: {
        in: ["GESTOR", "ADMIN"],
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return manager?.id || null;
}

async function getStudentEmail(student: EligibleStudent): Promise<string | null> {
  if (student.email) return student.email;
  if (!student.userAuthId) return null;

  const user = await prisma.user.findUnique({
    where: {
      id: student.userAuthId,
    },
    select: {
      email: true,
    },
  });

  return user?.email || null;
}

function buildMessage({
  studentName,
  professorName,
  motivationalPhrase,
  mondayLabel,
}: {
  studentName: string;
  professorName: string;
  motivationalPhrase: string;
  mondayLabel: string;
}): string {
  return [
    `Oi, ${studentName}!`,
    "",
    motivationalPhrase,
    "",
    `Amanhã, ${mondayLabel}, seus treinos da nova semana estarão disponíveis na plataforma. Organize sua agenda, separe seus horários e comece a semana preparado para cuidar de você.`,
    "",
    "Antes de iniciar, confira as orientações, imagens, séries, repetições e cuidados de execução. Se surgir qualquer dúvida, use o chat da plataforma para falar com seu professor.",
    "",
    "Desejamos uma ótima semana e bons treinos!",
    "",
    professorName,
    "Funcional UP Digital",
    "Mensagem automática de preparação para a semana enviada em nome do seu professor.",
  ].join("\n");
}

async function sendPreparationEmail({
  to,
  studentName,
  professorName,
  motivationalPhrase,
  mondayLabel,
  content,
}: {
  to: string;
  studentName: string;
  professorName: string;
  motivationalPhrase: string;
  mondayLabel: string;
  content: string;
}) {
  const appUrl = getAppStudentUrl();
  const safeStudentName = escapeHtml(studentName);
  const safeProfessorName = escapeHtml(professorName);
  const safePhrase = escapeHtml(motivationalPhrase);
  const safeMondayLabel = escapeHtml(mondayLabel);

  await sendEmail({
    to,
    subject: NOTICE_TITLE,
    text: `${content}\n\nAcessar a plataforma: ${appUrl}`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#111111;color:#f5f5f5;padding:28px;border-radius:16px;line-height:1.6;max-width:640px;margin:0 auto;">
        <p>Oi, <strong>${safeStudentName}</strong>!</p>
        <p style="font-size:18px;color:#f5a623;font-weight:700;">${safePhrase}</p>
        <p>Amanhã, <strong>${safeMondayLabel}</strong>, seus treinos da nova semana estarão disponíveis na plataforma. Organize sua agenda, separe seus horários e comece a semana preparado para cuidar de você.</p>
        <p>Antes de iniciar, confira as orientações, imagens, séries, repetições e cuidados de execução. Se surgir qualquer dúvida, use o chat da plataforma para falar com seu professor.</p>
        <p>Desejamos uma ótima semana e bons treinos!</p>
        <p style="margin-top:24px;">${safeProfessorName}<br/>Funcional UP Digital</p>
        <a href="${appUrl}" style="display:inline-block;margin-top:14px;background:#f5a623;color:#111111;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">Acessar a plataforma</a>
        <p style="margin-top:24px;color:#a3a3a3;font-size:12px;">Mensagem automática de preparação para a semana enviada em nome do seu professor.</p>
      </div>
    `,
  });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authorId = await getNoticeAuthorId();

  if (!authorId) {
    return NextResponse.json(
      { error: "Nenhum gestor/admin ativo encontrado para assinar os avisos." },
      { status: 400 }
    );
  }

  const mondayKey = getNextMondayKey();
  const mondayLabel = formatMondayLabel(mondayKey);
  const weeklyNoticeTitle = `${NOTICE_TITLE} — semana de ${mondayLabel}`;

  const students = (await prisma.student.findMany({
    where: {
      active: true,
      userAuthId: {
        not: null,
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      userAuthId: true,
      userId: true,
      user: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  })) as EligibleStudent[];

  const sent: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];

  for (const student of students) {
    try {
      const existingNotice = await prisma.notice.findFirst({
        where: {
          studentId: student.id,
          type: NOTICE_TYPE,
          targetRole: {
            in: ["ALUNO", "STUDENT"],
          },
          title: weeklyNoticeTitle,
        },
        select: {
          id: true,
        },
      });

      if (existingNotice) {
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          reason: "Lembrete desta semana já enviado",
        });
        continue;
      }

      const studentName = student.name || "Aluno";
      const professorName = student.user?.name || "Seu professor";
      const motivationalPhrase = chooseMotivationalPhrase(student.id, mondayKey);
      const visibleContent = buildMessage({
        studentName,
        professorName,
        motivationalPhrase,
        mondayLabel,
      });

      const notice = await prisma.notice.create({
        data: {
          title: weeklyNoticeTitle,
          content: visibleContent,
          type: NOTICE_TYPE,
          targetRole: TARGET_ROLE,
          studentId: student.id,
          authorId,
        },
      });

      const studentEmail = await getStudentEmail(student);
      let emailSent = false;
      let emailError: string | null = null;

      if (studentEmail) {
        try {
          await sendPreparationEmail({
            to: studentEmail,
            studentName,
            professorName,
            motivationalPhrase,
            mondayLabel,
            content: visibleContent,
          });
          emailSent = true;
        } catch (error: any) {
          emailError = error?.message || "Erro ao enviar e-mail";
        }
      }

      sent.push({
        studentId: student.id,
        studentName,
        noticeId: notice.id,
        emailSent,
        emailError,
      });
    } catch (error: any) {
      errors.push({
        studentId: student.id,
        studentName: student.name,
        message: error?.message || "Erro desconhecido",
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    schedule: {
      localTimeZone: TIME_ZONE,
      localTime: "domingo às 20:00",
      nextWeekMonday: mondayKey,
    },
    totals: {
      eligibleStudents: students.length,
      sent: sent.length,
      skipped: skipped.length,
      errors: errors.length,
    },
    sent,
    skipped,
    errors,
  });
}

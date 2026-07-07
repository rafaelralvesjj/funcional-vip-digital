import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import * as bcrypt from "bcryptjs";
import { sendEmail } from "@/lib/sendEmail";

type BodySource = FormData | Record<string, any>;

function getValue(source: BodySource, keys: string[]): any {
  if (source instanceof FormData) {
    for (const key of keys) {
      const value = source.get(key);
      if (value !== null && value !== undefined) return value;
    }

    return null;
  }

  for (const key of keys) {
    const value = source?.[key];
    if (value !== null && value !== undefined) return value;
  }

  return null;
}

function getString(source: BodySource, keys: string[]): string {
  const value = getValue(source, keys);

  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();

  return String(value).trim();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function addMonthsMinusOneDay(startDate: Date, months: number): Date {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + Math.max(months, 1));
  endDate.setDate(endDate.getDate() - 1);
  endDate.setHours(23, 59, 59, 999);

  return endDate;
}

function getAppLoginUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-vip-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/auth/signin`;
}

function getAppManagementAssignmentUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-vip-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/dashboard/gestor/vincular-alunos`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDatePtBr(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function buildTrialWelcomeContent({
  studentName,
  endDateText,
  workoutsPerWeek,
  workoutsPerMonth,
}: {
  studentName: string;
  endDateText: string;
  workoutsPerWeek: number;
  workoutsPerMonth: number;
}): string {
  return [
    `Olá, ${studentName}!`,
    "",
    "Seu cadastro no Funcional Vip Digital foi criado com sucesso e sua experiência gratuita já está ativa.",
    `Validade da experiência: até ${endDateText}.`,
    "",
    `Nesta experiência, seu plano prevê ${workoutsPerWeek} treino(s) por semana, totalizando ${workoutsPerMonth} treino(s) no ciclo.`,
    "",
    "Agora a equipe fará o vínculo com um professor responsável. Assim que os primeiros treinos forem preparados e liberados, você receberá um novo aviso por aqui e por e-mail.",
    "",
    "Você já pode acessar seu painel com o e-mail e senha cadastrados para acompanhar os avisos e sua evolução.",
    "",
    "Este é um ciclo gratuito de experiência. Para continuar após o período experimental, será necessário contratar um plano.",
  ].join("\n");
}

function buildManagementNewTrialStudentContent({
  studentName,
  studentEmail,
  studentPhone,
  endDateText,
  workoutsPerWeek,
  workoutsPerMonth,
  source,
}: {
  studentName: string;
  studentEmail: string;
  studentPhone?: string | null;
  endDateText: string;
  workoutsPerWeek: number;
  workoutsPerMonth: number;
  source: string;
}): string {
  return [
    `Novo aluno iniciou experiência gratuita: ${studentName}.`,
    "",
    `E-mail: ${studentEmail}`,
    studentPhone ? `WhatsApp: ${studentPhone}` : null,
    `Origem: ${source}.`,
    `Experiência válida até: ${endDateText}.`,
    `Plano da experiência: ${workoutsPerWeek} treino(s)/semana e ${workoutsPerMonth} treino(s)/mês.`,
    "",
    "Ação recomendada: acessar Vincular Alunos, definir o professor responsável e orientar a montagem dos primeiros treinos.",
  ]
    .filter(Boolean)
    .join("\n");
}


async function getOptionalImage(source: BodySource): Promise<string | null> {
  if (!(source instanceof FormData)) return null;

  const fileValue =
    source.get("image") ||
    source.get("foto") ||
    source.get("photo") ||
    source.get("avatar");

  if (!fileValue || typeof fileValue === "string") return null;

  const file = fileValue as File;

  if (!file.size || !file.type?.startsWith("image/")) return null;

  const maxBytes = 1.5 * 1024 * 1024;

  if (file.size > maxBytes) {
    return null;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

async function getTrialPlan() {
  let plan = await prisma.servicePlan.findFirst({
    where: {
      allowTrial: true,
      active: true,
    },
    orderBy: [
      {
        sortOrder: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  if (plan) return plan;

  plan = await prisma.servicePlan.create({
    data: {
      name: "Experiência grátis - 1 mês",
      description:
        "Ciclo de experiência para o aluno conhecer a plataforma e testar o acompanhamento.",
      workoutsPerWeek: 2,
      workoutsPerMonth: 8,
      durationMonths: 1,
      priceCents: 0,
      active: true,
      trialDays: 30,
      allowTrial: true,
      sortOrder: 1,
    },
  });

  return plan;
}

function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

async function findExistingStudentOrUser({
  email,
  phoneDigits,
}: {
  email: string;
  phoneDigits: string;
}) {
  const existingUserByEmail = await prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      active: true,
      studentAuths: {
        select: {
          id: true,
          name: true,
          active: true,
        },
      },
    },
  });

  if (existingUserByEmail) {
    return {
      reason: "EMAIL_EXISTS",
      studentIds: existingUserByEmail.studentAuths.map((student) => student.id),
    };
  }

  if (phoneDigits) {
    const students = await prisma.student.findMany({
      where: {
        phone: {
          contains: phoneDigits,
        },
      },
      select: {
        id: true,
      },
      take: 5,
    });

    if (students.length > 0) {
      return {
        reason: "PHONE_EXISTS",
        studentIds: students.map((student) => student.id),
      };
    }

    /*
     * Importante:
     * Não bloqueamos telefone existente em professor/gestor.
     * Bloqueamos apenas telefone usado por login de aluno ou por usuário
     * que já tenha vínculo StudentAuth.
     */
    const users = await prisma.user.findMany({
      where: {
        phone: {
          contains: phoneDigits,
        },
        OR: [
          {
            role: {
              in: ["ALUNO", "STUDENT"],
            },
          },
          {
            studentAuths: {
              some: {},
            },
          },
        ],
      },
      select: {
        id: true,
        studentAuths: {
          select: {
            id: true,
          },
        },
      },
      take: 5,
    });

    if (users.length > 0) {
      return {
        reason: "PHONE_EXISTS",
        studentIds: users.flatMap((item) => item.studentAuths.map((student) => student.id)),
      };
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    const body: BodySource = contentType.includes("multipart/form-data")
      ? await req.formData()
      : await req.json();

    const name = getString(body, ["name", "nome", "fullName", "aluno"]);
    const email = normalizeEmail(getString(body, ["email", "mail"]));
    const phone = getString(body, ["phone", "telefone", "whatsapp", "celular"]);
    const phoneDigits = normalizePhone(phone);
    const password = getString(body, ["password", "senha"]);
    const confirmPassword = getString(body, ["confirmPassword", "confirmarSenha", "passwordConfirmation"]);
    const objective = getString(body, ["objective", "objetivo"]);
    const restrictions = getString(body, ["restrictions", "restricoes", "lesoes", "dores"]);
    const activityLevel = getString(body, ["activityLevel", "nivelAtividade"]);
    const source = getString(body, ["source", "origem"]) || "LANDING_PAGE";
    const acceptedTermsRaw = getValue(body, ["acceptedTerms", "aceiteTermos", "termsAccepted"]);
    const acceptedTerms =
      acceptedTermsRaw === true ||
      acceptedTermsRaw === "true" ||
      acceptedTermsRaw === "on" ||
      acceptedTermsRaw === "1";
    const notesFromBody = getString(body, ["notes", "observacoes", "observations"]);
    const uploadedImageUrl = getString(body, ["imageUrl", "fotoUrl", "photoUrl"]);
    const image = uploadedImageUrl || (await getOptionalImage(body));

    if (!name) {
      return NextResponse.json({ error: "Informe o nome do aluno." }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "Informe o e-mail do aluno." }, { status: 400 });
    }

    if (!phoneDigits) {
      return NextResponse.json({ error: "Informe o WhatsApp do aluno." }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
    }

    if (confirmPassword && password !== confirmPassword) {
      return NextResponse.json({ error: "As senhas não conferem." }, { status: 400 });
    }

    if (!acceptedTerms) {
      return NextResponse.json(
        { error: "Para iniciar a experiência gratuita, aceite o termo de experiência." },
        { status: 400 }
      );
    }

    const existing = await findExistingStudentOrUser({
      email,
      phoneDigits,
    });

    if (existing) {
      return NextResponse.json(
        {
          error:
            "Identificamos que você já possui ou já possuiu cadastro conosco. Para retomar seu acompanhamento, fale com a equipe pelo WhatsApp.",
          code: existing.reason,
        },
        { status: 409 }
      );
    }

    const trialPlan = await getTrialPlan();
    const startDate = new Date();
    startDate.setHours(12, 0, 0, 0);

    const durationMonths = trialPlan.durationMonths || 1;
    const endDate = addMonthsMinusOneDay(startDate, durationMonths);
    const passwordHash = await bcrypt.hash(password, 10);
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") || null;
    const termsVersion = "trial-v1";

    const result = await prisma.$transaction(async (tx) => {
      const authUser = await tx.user.create({
        data: {
          name,
          email,
          phone: phone || null,
          image,
          password: passwordHash,
          role: "ALUNO",
          active: true,
        },
      });

      const notes = [
        "Cadastro criado pelo fluxo de experiência gratuita.",
        `Origem: ${source}.`,
        objective ? `Objetivo informado: ${objective}.` : null,
        activityLevel ? `Nível de atividade: ${activityLevel}.` : null,
        restrictions ? `Restrições/dores/lesões informadas: ${restrictions}.` : null,
        notesFromBody ? `Observações: ${notesFromBody}.` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const student = await tx.student.create({
        data: {
          name,
          email,
          phone: phone || null,
          image,
          notes,
          active: true,
          onboardingCompleto: false,
          commercialStatus: "EXPERIENCIA_ATIVA",
          contractedTrainingDaysPerMonth: trialPlan.workoutsPerMonth,
          userAuthId: authUser.id,
          userId: authUser.id,
        },
      });

      const contract = await tx.studentContract.create({
        data: {
          studentId: student.id,
          planId: trialPlan.id,
          professorId: null,
          contractNumber: `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          type: "TRIAL",
          status: "ACTIVE",
          commercialStatus: "EXPERIENCIA_ATIVA",
          startDate,
          endDate,
          durationMonths,
          workoutsPerWeek: trialPlan.workoutsPerWeek,
          workoutsPerMonth: trialPlan.workoutsPerMonth,
          totalContractedWorkouts: trialPlan.workoutsPerMonth * durationMonths,
          priceCents: 0,
          paymentMode: "GRATUITO",
          source,
          acceptedAt: new Date(),
          activatedAt: new Date(),
          notes: [
            "Termo de experiência gratuita aceito digitalmente.",
            `Versão do termo: ${termsVersion}.`,
            ip ? `IP: ${ip}.` : null,
            userAgent ? `User-Agent: ${userAgent}.` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });

      const managementRecipients = await tx.user.findMany({
        where: {
          role: {
            in: ["GESTOR", "ADMIN"],
          },
          active: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      const notificationAuthor = managementRecipients[0] || null;
      const managementAuthorId = notificationAuthor?.id || authUser.id;
      const endDateText = formatDatePtBr(contract.endDate);

      const notice = await tx.notice.create({
        data: {
          title: "Sua experiência gratuita foi ativada",
          content: buildTrialWelcomeContent({
            studentName: student.name,
            endDateText,
            workoutsPerWeek: contract.workoutsPerWeek,
            workoutsPerMonth: contract.workoutsPerMonth,
          }),
          type: "COMERCIAL",
          targetRole: "STUDENT",
          studentId: student.id,
          authorId: managementAuthorId,
          expiresAt: contract.endDate,
        },
      });

      const managementNotice = await tx.notice.create({
        data: {
          title: "Novo aluno em experiência aguardando professor",
          content: buildManagementNewTrialStudentContent({
            studentName: student.name,
            studentEmail: email,
            studentPhone: student.phone,
            endDateText,
            workoutsPerWeek: contract.workoutsPerWeek,
            workoutsPerMonth: contract.workoutsPerMonth,
            source,
          }),
          type: "COMERCIAL",
          targetRole: "GESTOR",
          studentId: student.id,
          authorId: authUser.id,
          expiresAt: contract.endDate,
        },
      });

      return {
        userId: authUser.id,
        studentId: student.id,
        studentName: student.name,
        email,
        phone: student.phone,
        contractId: contract.id,
        contractType: contract.type,
        commercialStatus: student.commercialStatus,
        startDate: contract.startDate,
        endDate: contract.endDate,
        workoutsPerWeek: contract.workoutsPerWeek,
        workoutsPerMonth: contract.workoutsPerMonth,
        totalContractedWorkouts: contract.totalContractedWorkouts,
        welcomeNoticeId: notice.id,
        managementNoticeId: managementNotice.id,
        managementRecipients: managementRecipients.map((item) => ({
          id: item.id,
          name: item.name,
          email: item.email,
        })),
      };
    });

    try {
      const endDateText = formatDatePtBr(result.endDate);
      const loginUrl = getAppLoginUrl();
      const safeName = escapeHtml(name);
      const safeEndDateText = escapeHtml(endDateText);
      const safeLoginUrl = escapeHtml(loginUrl);

      await sendEmail({
        to: email,
        subject: "Sua experiência gratuita foi ativada",
        text: [
          `Olá, ${name}!`,
          "",
          "Sua experiência gratuita no Funcional Vip Digital foi ativada.",
          `Validade da experiência: até ${endDateText}.`,
          "",
          `Seu plano de experiência prevê ${result.workoutsPerWeek} treino(s) por semana, totalizando ${result.workoutsPerMonth} treino(s) no ciclo.`,
          "",
          "Agora a equipe irá vincular um professor responsável. Assim que seus primeiros treinos forem preparados, você receberá um novo aviso.",
          "",
          `Acesse o painel com seu e-mail e senha cadastrados: ${loginUrl}`,
          "",
          "Este é um ciclo gratuito de experiência. Para continuar após o período experimental, será necessário contratar um plano.",
        ].join("\n"),
        html: `
          <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
            <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
              <h2 style="color:#D4A373; margin:0 0 16px;">Sua experiência gratuita foi ativada</h2>

              <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
                Olá, <strong>${safeName}</strong>!
              </p>

              <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
                Seu cadastro no <strong style="color:#f5f5f5;">Funcional Vip Digital</strong> foi criado com sucesso.
              </p>

              <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
                Sua experiência gratuita está ativa até
                <strong style="color:#f5f5f5;">${safeEndDateText}</strong>.
              </p>

              <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
                Seu plano de experiência prevê <strong style="color:#f5f5f5;">${result.workoutsPerWeek} treino(s) por semana</strong>,
                totalizando <strong style="color:#f5f5f5;">${result.workoutsPerMonth} treino(s)</strong> no ciclo.
              </p>

              <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
                Agora a equipe irá vincular um professor responsável. Assim que seus primeiros treinos forem preparados,
                você receberá um novo aviso por aqui e por e-mail.
              </p>

              <a href="${safeLoginUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px;">
                Acessar meu painel
              </a>

              <p style="color:#6b6b6b; font-size:11px; line-height:1.5; margin-top:20px;">
                Este é um ciclo gratuito de experiência. Para continuar após o período experimental,
                será necessário contratar um plano.
              </p>
            </div>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Erro ao enviar e-mail da experiência gratuita:", emailError);
    }

    try {
      const managementEmails = Array.from(
        new Set(
          (result.managementRecipients || [])
            .map((item: { email?: string | null }) => item.email)
            .filter((item: string | null | undefined): item is string => Boolean(item))
        )
      );

      if (managementEmails.length > 0) {
        const assignmentUrl = getAppManagementAssignmentUrl();
        const endDateText = formatDatePtBr(result.endDate);
        const safeStudentName = escapeHtml(result.studentName);
        const safeStudentEmail = escapeHtml(result.email);
        const safeStudentPhone = escapeHtml(result.phone || "-");
        const safeEndDateText = escapeHtml(endDateText);
        const safeAssignmentUrl = escapeHtml(assignmentUrl);

        await Promise.allSettled(
          managementEmails.map((to) =>
            sendEmail({
              to,
              subject: "Novo aluno em experiência aguardando professor",
              text: [
                `Novo aluno iniciou experiência gratuita: ${result.studentName}.`,
                "",
                `E-mail: ${result.email}`,
                result.phone ? `WhatsApp: ${result.phone}` : null,
                `Experiência válida até: ${endDateText}.`,
                `Plano da experiência: ${result.workoutsPerWeek} treino(s)/semana e ${result.workoutsPerMonth} treino(s)/mês.`,
                "",
                "Ação recomendada: acessar Vincular Alunos, definir o professor responsável e orientar a montagem dos primeiros treinos.",
                "",
                `Abrir Vincular Alunos: ${assignmentUrl}`,
              ]
                .filter(Boolean)
                .join("\n"),
              html: `
                <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
                  <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
                    <h2 style="color:#D4A373; margin:0 0 16px;">Novo aluno em experiência</h2>

                    <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
                      <strong>${safeStudentName}</strong> iniciou uma experiência gratuita no Funcional Vip Digital.
                    </p>

                    <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
                      E-mail: <strong style="color:#f5f5f5;">${safeStudentEmail}</strong><br />
                      WhatsApp: <strong style="color:#f5f5f5;">${safeStudentPhone}</strong><br />
                      Experiência válida até: <strong style="color:#f5f5f5;">${safeEndDateText}</strong>
                    </p>

                    <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
                      Ação recomendada: vincular um professor responsável para que os primeiros treinos possam ser preparados.
                    </p>

                    <a href="${safeAssignmentUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px;">
                      Abrir Vincular Alunos
                    </a>
                  </div>
                </div>
              `,
            })
          )
        );
      }
    } catch (managementEmailError) {
      console.error("Erro ao enviar e-mail para gestão sobre novo aluno:", managementEmailError);
    }

    return NextResponse.json({
      ok: true,
      message:
        "Cadastro criado, experiência gratuita ativada, aluno avisado e gestão notificada para vincular professor.",
      ...result,
    });
  } catch (error: any) {
    console.error("POST /api/aluno/register error:", error);

    const message = String(error?.message || "");

    if (
      message.includes("commercial_status") ||
      message.includes("student_contracts") ||
      message.includes("service_plans")
    ) {
      return NextResponse.json(
        {
          error:
            "A base de dados ainda não está preparada para experiência gratuita. Rode o SQL da Fase 1 no mesmo banco usado pela Vercel.",
          message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "Erro interno do servidor.",
        message,
      },
      { status: 500 }
    );
  }
}

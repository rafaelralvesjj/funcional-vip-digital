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

      return {
        userId: authUser.id,
        studentId: student.id,
        studentName: student.name,
        email: authUser.email,
        contractId: contract.id,
        contractType: contract.type,
        commercialStatus: student.commercialStatus,
        startDate: contract.startDate,
        endDate: contract.endDate,
        workoutsPerMonth: contract.workoutsPerMonth,
        totalContractedWorkouts: contract.totalContractedWorkouts,
      };
    });

    try {
      const endDateText = new Date(result.endDate).toLocaleDateString("pt-BR");

      await sendEmail({
        to: email,
        subject: "Sua experiência gratuita foi ativada",
        text: `Olá, ${name}! Sua experiência gratuita no Funcional Vip Digital foi ativada até ${endDateText}. A equipe irá vincular um professor para liberar seus primeiros treinos. Acesse o painel com seu e-mail e senha cadastrados.`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #222;">
            <h2>Sua experiência gratuita foi ativada</h2>
            <p>Olá, <strong>${name}</strong>!</p>
            <p>Seu cadastro no <strong>Funcional Vip Digital</strong> foi criado com sucesso.</p>
            <p>
              Sua experiência gratuita está ativa até
              <strong>${endDateText}</strong>.
            </p>
            <p>
              Agora a equipe irá vincular um professor para liberar seus primeiros treinos.
            </p>
            <p>
              Você já pode acessar o painel com o e-mail e a senha cadastrados.
            </p>
            <p style="font-size: 12px; color: #666;">
              Este é um ciclo gratuito de experiência. Para continuar após o período experimental,
              será necessário contratar um plano.
            </p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Erro ao enviar e-mail da experiência gratuita:", emailError);
    }

    return NextResponse.json({
      ok: true,
      message:
        "Cadastro criado e experiência gratuita ativada. Agora a equipe irá vincular um professor para liberar os primeiros treinos.",
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

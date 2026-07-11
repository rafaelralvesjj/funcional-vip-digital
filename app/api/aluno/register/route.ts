import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { formatBirthDatePtBr, validateBirthDateInput } from "@/lib/student-age";
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

function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function withMidday(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);
  return normalized;
}

function addMonthsMinusOneDay(startDate: Date, months: number): Date {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + Math.max(months, 1));
  endDate.setDate(endDate.getDate() - 1);
  endDate.setHours(23, 59, 59, 999);

  return endDate;
}

function getFirstSafeTrialStartDate(referenceDate = new Date()): {
  startDate: Date;
  shiftedToNextWeek: boolean;
  reason: string | null;
} {
  const reference = startOfDay(referenceDate);
  const day = reference.getDay();

  const isFridaySaturdayOrSunday = day === 5 || day === 6 || day === 0;

  if (!isFridaySaturdayOrSunday) {
    return {
      startDate: withMidday(reference),
      shiftedToNextWeek: false,
      reason: null,
    };
  }

  const nextMonday = new Date(reference);
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  nextMonday.setDate(reference.getDate() + daysUntilMonday);

  return {
    startDate: withMidday(nextMonday),
    shiftedToNextWeek: true,
    reason:
      "Cadastro realizado no fim da semana. Experiência direcionada para a próxima segunda-feira para garantir primeira janela segura de acompanhamento.",
  };
}

function getAppLoginUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-vip-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/auth/signin`;
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

function normalizeOptionalNumberText(value: string): string {
  const normalized = String(value || "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");

  if (!normalized) return "";

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) return "";

  return String(parsed);
}

function formatOnboardingValue(value: string): string | null {
  const trimmed = String(value || "").trim();

  return trimmed.length > 0 ? trimmed : null;
}

function buildOnboardingLines({
  birthDateText,
  ageYears,
  objective,
  activityLevel,
  trainingEnvironment,
  availableEquipment,
  timeAvailableMinutes,
  preferredDays,
  currentPain,
  medicalRestriction,
  trainingHistory,
  weightKg,
  heightCm,
  notesFromBody,
}: {
  birthDateText: string;
  ageYears: number;
  objective: string;
  activityLevel: string;
  trainingEnvironment: string;
  availableEquipment: string;
  timeAvailableMinutes: string;
  preferredDays: string;
  currentPain: string;
  medicalRestriction: string;
  trainingHistory: string;
  weightKg: string;
  heightCm: string;
  notesFromBody: string;
}): string[] {
  return [
    birthDateText ? `Data de nascimento: ${birthDateText}.` : null,
    Number.isFinite(ageYears) ? `Idade no cadastro: ${ageYears} ano(s).` : null,
    objective ? `Objetivo principal: ${objective}.` : null,
    activityLevel ? `Nível atual informado: ${activityLevel}.` : null,
    trainingEnvironment ? `Ambiente de treino: ${trainingEnvironment}.` : null,
    availableEquipment ? `Equipamentos/materiais disponíveis: ${availableEquipment}.` : null,
    timeAvailableMinutes ? `Tempo disponível por treino: ${timeAvailableMinutes} minuto(s).` : null,
    preferredDays ? `Dias/horários preferidos: ${preferredDays}.` : null,
    currentPain ? `Dor/desconforto atual informado: ${currentPain}.` : null,
    medicalRestriction ? `Restrição médica/física declarada: ${medicalRestriction}.` : null,
    trainingHistory ? `Histórico de treino: ${trainingHistory}.` : null,
    weightKg ? `Peso informado: ${weightKg} kg.` : null,
    heightCm ? `Altura informada: ${heightCm} cm.` : null,
    notesFromBody ? `Observações livres do aluno: ${notesFromBody}.` : null,
  ].filter((item): item is string => Boolean(item));
}

function getOnboardingStatus({
  objective,
  activityLevel,
  trainingEnvironment,
  availableEquipment,
  timeAvailableMinutes,
  currentPain,
  medicalRestriction,
  restrictions,
}: {
  objective: string;
  activityLevel: string;
  trainingEnvironment: string;
  availableEquipment: string;
  timeAvailableMinutes: string;
  currentPain: string;
  medicalRestriction: string;
  restrictions: string;
}): {
  onboardingComplete: boolean;
  missingLabels: string[];
} {
  const requiredFields = [
    { label: "objetivo principal", value: objective },
    { label: "nível atual", value: activityLevel },
    { label: "ambiente de treino", value: trainingEnvironment },
    { label: "equipamentos disponíveis", value: availableEquipment },
    { label: "tempo disponível por treino", value: timeAvailableMinutes },
    { label: "dores, desconfortos ou restrições", value: currentPain || medicalRestriction || restrictions },
  ];

  const missingLabels = requiredFields
    .filter((field) => !formatOnboardingValue(field.value))
    .map((field) => field.label);

  return {
    onboardingComplete: missingLabels.length === 0,
    missingLabels,
  };
}

function buildOnboardingStatusText({
  onboardingComplete,
  missingLabels,
}: {
  onboardingComplete: boolean;
  missingLabels: string[];
}): string {
  if (onboardingComplete) {
    return "Ficha inicial do aluno: completa.";
  }

  return `Ficha inicial do aluno: incompleta. Confirmar antes de personalizar treino: ${missingLabels.join(", ")}.`;
}

function buildTrialWelcomeContent({
  studentName,
  startDateText,
  endDateText,
  workoutsPerWeek,
  workoutsPerMonth,
  onboardingComplete,
  missingOnboardingLabels,
  shiftedToNextWeek,
}: {
  studentName: string;
  startDateText: string;
  endDateText: string;
  workoutsPerWeek: number;
  workoutsPerMonth: number;
  onboardingComplete: boolean;
  missingOnboardingLabels: string[];
  shiftedToNextWeek: boolean;
}): string {
  return [
    `Oi, ${studentName}! Que bom ter você com a gente.`,
    "",
    shiftedToNextWeek
      ? `Seu cadastro está concluído e sua experiência foi organizada para começar em ${startDateText}, na primeira janela segura de acompanhamento.`
      : "Seu cadastro está concluído e sua experiência gratuita já começou.",
    shiftedToNextWeek
      ? "Isso não significa atraso: escolhemos essa data para que você comece com uma semana inteira, sem treinos corridos ou acumulados."
      : null,
    `Sua experiência fica válida até ${endDateText}.`,
    `Nesse período, estão previstos ${workoutsPerWeek} treino(s) por semana, totalizando ${workoutsPerMonth} treino(s) no ciclo.`,
    "",
    onboardingComplete
      ? "Recebemos sua ficha inicial. Ela será usada pelo professor para conhecer seu momento e preparar uma proposta mais segura e direcionada."
      : `Ainda precisamos confirmar algumas informações para personalizar melhor seus treinos: ${missingOnboardingLabels.join(", ")}.`,
    "",
    "Agora a gestão vai vincular um professor responsável. Quando isso acontecer, ele será apresentado a você e acompanhará seus treinos e sua evolução.",
    "Assim que a primeira semana estiver pronta, você receberá um novo aviso no painel e por e-mail.",
    "",
    "Depois do vínculo, use o chat da plataforma para falar com o professor sobre dúvidas de treino. Assim, todo o acompanhamento fica registrado e organizado.",
    "O WhatsApp fica reservado para contatos específicos da gestão, quando necessário.",
    "",
    "Você já pode acessar sua área com o e-mail e a senha cadastrados para acompanhar avisos, treinos e próximos passos.",
    "",
    "Este é um ciclo gratuito de experiência. Perto do encerramento, a gestão vai orientar você sobre as opções para continuar.",
    "",
    "Gestão do Funcional VIP Digital",
    "Mensagem automática de boas-vindas enviada pela plataforma.",
  ]
    .filter((item): item is string => item !== null)
    .join("\n");
}

function buildManagementNewTrialStudentContent({
  studentName,
  studentEmail,
  studentPhone,
  startDateText,
  endDateText,
  workoutsPerWeek,
  workoutsPerMonth,
  source,
  onboardingComplete,
  missingOnboardingLabels,
  onboardingLines,
  shiftedToNextWeek,
}: {
  studentName: string;
  studentEmail: string;
  studentPhone?: string | null;
  startDateText: string;
  endDateText: string;
  workoutsPerWeek: number;
  workoutsPerMonth: number;
  source: string;
  onboardingComplete: boolean;
  missingOnboardingLabels: string[];
  onboardingLines: string[];
  shiftedToNextWeek: boolean;
}): string {
  return [
    "Olá, equipe de gestão.",
    "",
    `${studentName} concluiu o cadastro para a experiência gratuita.`,
    `E-mail: ${studentEmail}`,
    studentPhone ? `Telefone/WhatsApp cadastrado: ${studentPhone}` : null,
    `Origem do cadastro: ${source}.`,
    `Início da experiência: ${startDateText}.`,
    `Término previsto: ${endDateText}.`,
    `Programação contratada: ${workoutsPerWeek} treino(s) por semana e ${workoutsPerMonth} treino(s) no ciclo.`,
    shiftedToNextWeek
      ? "Como o cadastro aconteceu no fim da semana, o início foi direcionado para a próxima janela segura. Não é necessário recuperar treinos da semana do cadastro."
      : null,
    "",
    buildOnboardingStatusText({
      onboardingComplete,
      missingLabels: missingOnboardingLabels,
    }),
    onboardingLines.length > 0 ? "" : null,
    onboardingLines.length > 0 ? "Informações iniciais recebidas:" : null,
    ...onboardingLines.map((line) => `- ${line}`),
    "",
    shiftedToNextWeek
      ? "Próximo passo: vincular um professor responsável e garantir que a primeira semana esteja preparada para a data de início."
      : onboardingComplete
        ? "Próximo passo: vincular um professor responsável e orientar a preparação dos primeiros treinos com base na ficha inicial."
        : "Próximo passo: vincular um professor, confirmar os dados que faltam e manter a primeira prescrição conservadora até a ficha estar completa.",
    "",
    "Mensagem automática de apoio operacional para a gestão.",
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
      { sortOrder: "asc" },
      { createdAt: "asc" },
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
    where: { email },
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
    const birthDateRaw = getString(body, ["birthDate", "dataNascimento", "dateOfBirth"]);
    const birthDateValidation = validateBirthDateInput(birthDateRaw);
    const password = getString(body, ["password", "senha"]);
    const confirmPassword = getString(body, ["confirmPassword", "confirmarSenha", "passwordConfirmation"]);
    const objective = getString(body, ["objective", "objetivo"]);
    const restrictions = getString(body, ["restrictions", "restricoes", "lesoes", "dores"]);
    const activityLevel = getString(body, ["activityLevel", "nivelAtividade"]);
    const trainingEnvironment = getString(body, ["trainingEnvironment", "ambienteTreino", "ambiente", "localTreino"]);
    const availableEquipment = getString(body, ["availableEquipment", "equipamentos", "materiais", "equipment"]);
    const timeAvailableMinutes = normalizeOptionalNumberText(getString(body, ["timeAvailableMinutes", "tempoDisponivelMinutos", "tempoTreino", "tempoDisponivel"]));
    const preferredDays = getString(body, ["preferredDays", "diasPreferidos", "dias"]);
    const currentPain = getString(body, ["currentPain", "dorAtual", "desconfortoAtual", "pain"]);
    const medicalRestriction = getString(body, ["medicalRestriction", "restricaoMedica", "restricao", "restricoesMedicas"]);
    const trainingHistory = getString(body, ["trainingHistory", "historicoTreino", "historico", "experienciaTreino"]);
    const weightKg = normalizeOptionalNumberText(getString(body, ["weightKg", "peso", "pesoKg"]));
    const heightCm = normalizeOptionalNumberText(getString(body, ["heightCm", "altura", "alturaCm"]));
    const source = getString(body, ["source", "origem"]) || "LANDING_PAGE";
    const acceptedTermsRaw = getValue(body, ["acceptedTerms", "aceiteTermos", "termsAccepted"]);
    const acceptedTerms =
      acceptedTermsRaw === true ||
      acceptedTermsRaw === "true" ||
      acceptedTermsRaw === "on" ||
      acceptedTermsRaw === "1";
    const termsVersion = getString(body, ["termsVersion", "versaoTermo"]) || "EXPERIENCIA_GRATUITA_V1";
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

    if (birthDateValidation.error || !birthDateValidation.birthDate || birthDateValidation.ageYears === null) {
      return NextResponse.json(
        { error: birthDateValidation.error || "Informe a data de nascimento do aluno." },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
    }

    if (confirmPassword && password !== confirmPassword) {
      return NextResponse.json({ error: "As senhas não conferem." }, { status: 400 });
    }

    if (!acceptedTerms) {
      return NextResponse.json({ error: "Você precisa aceitar os termos da experiência gratuita." }, { status: 400 });
    }

    const existing = await findExistingStudentOrUser({ email, phoneDigits });

    if (existing) {
      return NextResponse.json(
        {
          error:
            existing.reason === "EMAIL_EXISTS"
              ? "Já existe um cadastro com este e-mail. Faça login ou fale com a equipe."
              : "Já existe um cadastro com este WhatsApp. Faça login ou fale com a equipe.",
          code: existing.reason,
          studentIds: existing.studentIds,
        },
        { status: 409 }
      );
    }

    const trialPlan = await getTrialPlan();
    const durationMonths = Math.max(Number(trialPlan.durationMonths || 1), 1);
    const safeWindow = getFirstSafeTrialStartDate(new Date());
    const startDate = safeWindow.startDate;
    const endDate = addMonthsMinusOneDay(startDate, durationMonths);
    const startDateText = formatDatePtBr(startDate);
    const endDateText = formatDatePtBr(endDate);
    const passwordHash = await bcrypt.hash(password, 10);
    const birthDate = birthDateValidation.birthDate;
    const ageYears = birthDateValidation.ageYears;
    const birthDateText = formatBirthDatePtBr(birthDate);
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent");

    const onboardingStatus = getOnboardingStatus({
      objective,
      activityLevel,
      trainingEnvironment,
      availableEquipment,
      timeAvailableMinutes,
      currentPain,
      medicalRestriction,
      restrictions,
    });

    const onboardingLines = buildOnboardingLines({
      birthDateText,
      ageYears,
      objective,
      activityLevel,
      trainingEnvironment,
      availableEquipment,
      timeAvailableMinutes,
      preferredDays,
      currentPain,
      medicalRestriction,
      trainingHistory,
      weightKg,
      heightCm,
      notesFromBody,
    });

    const result = await prisma.$transaction(async (tx) => {
      const authUser = await tx.user.create({
        data: {
          name,
          email,
          phone: phone || null,
          birthDate,
          image,
          password: passwordHash,
          role: "ALUNO",
          active: true,
        },
      });

      const notes = [
        "Cadastro criado pelo fluxo de experiência gratuita.",
        `Origem: ${source}.`,
        safeWindow.shiftedToNextWeek ? "Entrada tardia/fim de semana: experiência iniciará na primeira janela segura de treino." : null,
        safeWindow.reason ? safeWindow.reason : null,
        `Início da experiência: ${startDateText}.`,
        `Fim da experiência: ${endDateText}.`,
        buildOnboardingStatusText({
          onboardingComplete: onboardingStatus.onboardingComplete,
          missingLabels: onboardingStatus.missingLabels,
        }),
        ...onboardingLines,
      ]
        .filter(Boolean)
        .join("\n");

      const studentCommercialStatus = safeWindow.shiftedToNextWeek
        ? "EXPERIENCIA_AGENDADA"
        : "EXPERIENCIA_ATIVA";

      const student = await tx.student.create({
        data: {
          name,
          email,
          phone: phone || null,
          image,
          notes,
          active: true,
          onboardingCompleto: onboardingStatus.onboardingComplete,
          commercialStatus: studentCommercialStatus,
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
          commercialStatus: studentCommercialStatus,
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
          activatedAt: safeWindow.shiftedToNextWeek ? null : new Date(),
          notes: [
            "Termo de experiência gratuita aceito digitalmente.",
            `Versão do termo: ${termsVersion}.`,
            safeWindow.shiftedToNextWeek
              ? "Início comercial ajustado para a primeira janela segura de acompanhamento."
              : null,
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

      const notice = await tx.notice.create({
        data: {
          title: safeWindow.shiftedToNextWeek
            ? "Sua experiência está agendada para começar bem"
            : "Sua experiência gratuita começou",
          content: buildTrialWelcomeContent({
            studentName: student.name,
            startDateText,
            endDateText,
            workoutsPerWeek: contract.workoutsPerWeek,
            workoutsPerMonth: contract.workoutsPerMonth,
            onboardingComplete: onboardingStatus.onboardingComplete,
            missingOnboardingLabels: onboardingStatus.missingLabels,
            shiftedToNextWeek: safeWindow.shiftedToNextWeek,
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
          title: safeWindow.shiftedToNextWeek
            ? "Novo aluno em experiência: organizar início seguro"
            : "Novo aluno em experiência: vincular professor",
          content: buildManagementNewTrialStudentContent({
            studentName: student.name,
            studentEmail: email,
            studentPhone: student.phone,
            startDateText,
            endDateText,
            workoutsPerWeek: contract.workoutsPerWeek,
            workoutsPerMonth: contract.workoutsPerMonth,
            source,
            onboardingComplete: onboardingStatus.onboardingComplete,
            missingOnboardingLabels: onboardingStatus.missingLabels,
            onboardingLines,
            shiftedToNextWeek: safeWindow.shiftedToNextWeek,
          }),
          type: "COMERCIAL",
          targetRole: "GESTOR",
          studentId: student.id,
          authorId: managementAuthorId,
          expiresAt: contract.endDate,
        },
      });

      const onboardingCareEvent = onboardingStatus.onboardingComplete
        ? null
        : await tx.studentCareEvent.create({
            data: {
              studentId: student.id,
              contractId: contract.id,
              eventType: "ONBOARDING_INCOMPLETE",
              severity: "ATENCAO",
              status: "ABERTO",
              source: "LANDING_PAGE",
              title: "Ficha inicial incompleta",
              description: [
                "Aluno iniciou experiência gratuita, mas ainda faltam informações mínimas para personalização segura.",
                `Campos a confirmar: ${onboardingStatus.missingLabels.join(", ")}.`,
                "Enquanto a ficha estiver incompleta, orientar treino inicial conservador e confirmar dados antes de progredir carga/intensidade.",
              ].join("\n"),
              studentMessage:
                "Precisamos confirmar algumas informações para personalizar melhor seus treinos.",
              professorMessage:
                "Antes de montar treinos personalizados, confirme os campos faltantes da ficha inicial do aluno.",
            },
          });

      if (safeWindow.shiftedToNextWeek) {
        await tx.contractLifecycleEvent.create({
          data: {
            contractId: contract.id,
            studentId: student.id,
            eventType: "TRIAL_START_DELAYED_SAFE_WINDOW",
            eventKey: startDate.toISOString().slice(0, 10),
            channel: "SISTEMA",
            noticeId: notice.id,
          },
        });
      }

      return {
        userId: authUser.id,
        studentId: student.id,
        studentName: student.name,
        email,
        phone: student.phone,
        birthDate: birthDate.toISOString(),
        ageYears,
        isMinor: birthDateValidation.isMinor,
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
        onboardingCareEventId: onboardingCareEvent?.id || null,
        onboardingComplete: onboardingStatus.onboardingComplete,
        missingOnboardingLabels: onboardingStatus.missingLabels,
        shiftedToNextWeek: safeWindow.shiftedToNextWeek,
        managementRecipients: managementRecipients.map((item) => ({
          id: item.id,
          name: item.name,
          email: item.email,
        })),
      };
    });

    try {
      const loginUrl = getAppLoginUrl();
      const safeName = escapeHtml(name);
      const safeStartDateText = escapeHtml(formatDatePtBr(result.startDate));
      const safeEndDateText = escapeHtml(formatDatePtBr(result.endDate));
      const safeLoginUrl = escapeHtml(loginUrl);
      const title = result.shiftedToNextWeek
        ? "Sua experiência está agendada para começar bem"
        : "Sua experiência gratuita começou";
      const text = [
        `Oi, ${name}! Que bom ter você com a gente.`,
        "",
        result.shiftedToNextWeek
          ? `Seu cadastro está concluído e sua experiência foi organizada para começar em ${formatDatePtBr(result.startDate)}, na primeira janela segura de acompanhamento.`
          : "Seu cadastro está concluído e sua experiência gratuita já começou.",
        result.shiftedToNextWeek
          ? "Isso não significa atraso. A data foi escolhida para que você comece com uma semana inteira, sem treinos corridos ou acumulados."
          : null,
        `Sua experiência fica válida até ${formatDatePtBr(result.endDate)}.`,
        `Nesse período, estão previstos ${result.workoutsPerWeek} treino(s) por semana, totalizando ${result.workoutsPerMonth} treino(s) no ciclo.`,
        "",
        "Agora a gestão vai vincular um professor responsável. Quando a primeira semana estiver pronta, você receberá um novo aviso no painel e por e-mail.",
        "Depois do vínculo, use o chat da plataforma para falar com o professor sobre dúvidas de treino. O WhatsApp fica reservado para contatos específicos da gestão.",
        "",
        `Acesse sua área com o e-mail e a senha cadastrados: ${loginUrl}`,
        "",
        "Gestão do Funcional VIP Digital",
        "Mensagem automática de boas-vindas enviada pela plataforma.",
      ]
        .filter(Boolean)
        .join("\n");

      await sendEmail({
        to: email,
        subject: title,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
            <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
              <h2 style="color:#D4A373; margin:0 0 16px;">${escapeHtml(title)}</h2>
              <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${safeName}</strong>! Que bom ter você com a gente.</p>
              <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
                ${result.shiftedToNextWeek
                  ? `Seu cadastro está concluído e sua experiência foi organizada para começar em <strong style="color:#f5f5f5;">${safeStartDateText}</strong>, na primeira janela segura de acompanhamento.`
                  : "Seu cadastro está concluído e sua experiência gratuita já começou."}
              </p>
              ${result.shiftedToNextWeek
                ? `<p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Isso não significa atraso. Escolhemos essa data para que você comece com uma semana inteira, sem treinos corridos ou acumulados.</p>`
                : ""}
              <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:12px; padding:14px; margin:16px 0;">
                <p style="color:#d4d4d4; font-size:13px; margin:0 0 8px;">Início: <strong style="color:#f5f5f5;">${safeStartDateText}</strong></p>
                <p style="color:#d4d4d4; font-size:13px; margin:0 0 8px;">Validade: <strong style="color:#f5f5f5;">${safeEndDateText}</strong></p>
                <p style="color:#d4d4d4; font-size:13px; margin:0;">Programação: <strong style="color:#f5f5f5;">${result.workoutsPerWeek} treino(s) por semana</strong></p>
              </div>
              <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Agora a gestão vai vincular um professor responsável. Quando a primeira semana estiver pronta, você receberá um novo aviso no painel e por e-mail.</p>
              <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Depois do vínculo, use o chat da plataforma para dúvidas de treino. Assim, o acompanhamento fica registrado e organizado. O WhatsApp fica reservado para contatos específicos da gestão.</p>
              <a href="${safeLoginUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">Acessar minha área</a>
              <p style="color:#d4d4d4; font-size:13px; line-height:1.5; margin-top:22px;">Gestão do Funcional VIP Digital</p>
              <p style="color:#6b6b6b; font-size:11px; line-height:1.5; margin-top:4px;">Mensagem automática de boas-vindas enviada pela plataforma.</p>
            </div>
          </div>
        `,
      });
    } catch (error) {
      console.error("Erro ao enviar e-mail de experiência gratuita:", error);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("POST /api/aluno/register error:", error);

    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Já existe um cadastro com esses dados." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao criar cadastro.", message: error?.message },
      { status: 500 }
    );
  }
}

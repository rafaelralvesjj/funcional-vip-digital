import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
}

function formatDate(value?: Date | string | null): string {
  if (!value) return "não informado";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value?: Date | string | null): string {
  if (!value) return "não informado";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMetric(value?: number | null, suffix = ""): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "não informado";
  }

  return `${Number(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}${suffix}`;
}

function diffMetric(before?: number | null, after?: number | null, suffix = ""): string {
  if (before === null || before === undefined || after === null || after === undefined) {
    return "sem comparação";
  }

  const diff = Number(after) - Number(before);
  const signal = diff > 0 ? "+" : "";

  return `${formatMetric(before, suffix)} → ${formatMetric(after, suffix)} (${signal}${formatMetric(diff, suffix)})`;
}

function getWeeklyWorkoutLimit(contractedTrainingDaysPerMonth?: number | null): number | null {
  const contracted = Number(contractedTrainingDaysPerMonth || 0);

  if (!Number.isFinite(contracted) || contracted <= 0) {
    return null;
  }

  if (contracted <= 4) return 1;
  if (contracted <= 8) return 2;
  if (contracted <= 16) return 3;

  return Math.ceil(contracted / 4);
}

function getWeekRange(referenceDate: Date): { startOfWeek: Date; endOfWeek: Date } {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);

  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() + diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  return { startOfWeek, endOfWeek };
}

function getNextWeekRange(referenceDate: Date): { startOfWeek: Date; endOfWeek: Date } {
  const current = getWeekRange(referenceDate);
  const startOfWeek = new Date(current.startOfWeek);
  startOfWeek.setDate(startOfWeek.getDate() + 7);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  return { startOfWeek, endOfWeek };
}

function getStatusLabel(status?: string | null): string {
  const value = String(status || "").toUpperCase();

  if (value === "CONCLUIDO") return "concluído";
  if (value === "PENDENTE") return "pendente";

  return value || "não informado";
}

function normalizeText(value?: string | null): string {
  const text = String(value || "").trim();

  return text || "não informado";
}

function calculateAdherence(completed: number, planned: number): string {
  if (!planned) return "sem treinos planejados";

  const percent = Math.round((completed / planned) * 100);

  return `${percent}% (${completed}/${planned})`;
}

function getTrendText(first: any | null, latest: any | null): string[] {
  if (!first || !latest || first.id === latest.id) {
    return ["Ainda não há duas avaliações para comparação completa."];
  }

  return [
    `Peso: ${diffMetric(first.peso, latest.peso, " kg")}`,
    `Abdômen: ${diffMetric(first.abdomen, latest.abdomen, " cm")}`,
    `Quadril: ${diffMetric(first.quadril, latest.quadril, " cm")}`,
    `Braço: ${diffMetric(first.braco, latest.braco, " cm")}`,
    `Coxa: ${diffMetric(first.coxa, latest.coxa, " cm")}`,
    `Glúteo: ${diffMetric(first.gluteo, latest.gluteo, " cm")}`,
  ];
}

function buildAiPrompt(summaryText: string): string {
  return [
    "Você é um professor de educação física apoiando a montagem de um treino personalizado.",
    "",
    "Use APENAS o resumo do aluno abaixo para criar uma sugestão de treino. Não invente restrições, lesões, equipamentos ou metas que não estejam no resumo.",
    "",
    "Importante:",
    "- Não gere SQL.",
    "- Gere uma sugestão estruturada para o professor revisar.",
    "- O professor é responsável por validar, ajustar e cadastrar no sistema.",
    "- Se houver baixa adesão, priorize retomada, segurança e consistência antes de progressão agressiva.",
    "- Se faltarem dados, indique quais informações precisam ser confirmadas.",
    "",
    "Formato esperado:",
    "1. Leitura rápida do aluno",
    "2. Pontos de atenção",
    "3. Estratégia da próxima semana",
    "4. Treinos sugeridos em formato estruturado:",
    "   - Nome do treino",
    "   - Data sugerida",
    "   - Objetivo do treino",
    "   - Exercícios",
    "   - Séries",
    "   - Repetições",
    "   - Carga sugerida ou orientação de carga",
    "   - Descanso",
    "   - Observações para o professor revisar",
    "5. Justificativa técnica da sugestão",
    "",
    "RESUMO DO ALUNO:",
    summaryText,
  ].join("\n");
}

async function canAccessStudent({
  userId,
  role,
  student,
}: {
  userId: string;
  role: string;
  student: {
    userId: string | null;
  };
}) {
  if (role === "GESTOR" || role === "ADMIN") return true;
  if (role === "TEACHER") return student.userId === userId;

  return false;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);
    const studentId = params.id;

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (!studentId) {
      return NextResponse.json({ error: "ID do aluno obrigatório" }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: {
        id: studentId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        notes: true,
        active: true,
        userId: true,
        userAuthId: true,
        onboardingCompleto: true,
        contractedTrainingDaysPerMonth: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        userAuth: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    const hasAccess = await canAccessStudent({
      userId,
      role,
      student,
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const now = new Date();
    const currentWeek = getWeekRange(now);
    const nextWeek = getNextWeekRange(now);
    const weeklyLimit = getWeeklyWorkoutLimit(student.contractedTrainingDaysPerMonth);

    const [
      avaliacoes,
      workoutPlans,
      workouts,
      questions,
      notices,
      feedbacks,
      didYouKnowDeliveries,
      engagementNotifications,
      careEvents,
    ] = await Promise.all([
      prisma.avaliacao.findMany({
        where: {
          alunoId: studentId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
      }),

      prisma.workoutPlan.findMany({
        where: {
          studentId,
        },
        include: {
          exercises: {
            orderBy: {
              order: "asc",
            },
          },
          workouts: {
            select: {
              id: true,
              date: true,
              status: true,
              notes: true,
            },
            orderBy: {
              date: "desc",
            },
          },
        },
        orderBy: [
          {
            date: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        take: 30,
      }),

      prisma.workout.findMany({
        where: {
          studentId,
        },
        include: {
          workoutPlan: {
            select: {
              id: true,
              name: true,
              date: true,
            },
          },
        },
        orderBy: {
          date: "desc",
        },
        take: 120,
      }),

      prisma.question.findMany({
        where: {
          studentId,
          parentId: null,
        },
        include: {
          children: {
            orderBy: {
              createdAt: "asc",
            },
          },
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          answeredBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      }),

      prisma.notice.findMany({
        where: {
          OR: [
            {
              studentId,
            },
            {
              targetRole: {
                in: ["ALUNO", "STUDENT"],
              },
            },
          ],
        },
        select: {
          id: true,
          title: true,
          content: true,
          type: true,
          targetRole: true,
          expiresAt: true,
          createdAt: true,
          author: {
            select: {
              name: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 30,
      }),

      prisma.evolutionFeedback.findMany({
        where: {
          studentId,
        },
        orderBy: {
          milestone: "desc",
        },
        take: 10,
      }),

      prisma.didYouKnowDelivery.findMany({
        where: {
          studentId,
        },
        orderBy: {
          sentAt: "desc",
        },
        take: 10,
      }),

      prisma.workoutEngagementNotification.findMany({
        where: {
          studentId,
        },
        orderBy: {
          sentAt: "desc",
        },
        take: 20,
      }),

      prisma.studentCareEvent.findMany({
        where: {
          studentId,
        },
        include: {
          relatedWorkoutPlan: {
            select: {
              id: true,
              name: true,
              date: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      }),
    ]);

    const contentIds = Array.from(
      new Set(didYouKnowDeliveries.map((delivery) => delivery.contentId))
    );

    const didYouKnowContents = contentIds.length
      ? await prisma.didYouKnowContent.findMany({
          where: {
            id: {
              in: contentIds,
            },
          },
          select: {
            id: true,
            title: true,
            category: true,
          },
        })
      : [];

    const didYouKnowContentMap = new Map(
      didYouKnowContents.map((content) => [content.id, content])
    );

    const completedWorkouts = workouts.filter((workout) => workout.status === "CONCLUIDO");
    const overdueWorkouts = workouts.filter(
      (workout) => workout.status !== "CONCLUIDO" && workout.date < now
    );
    const pendingFutureWorkouts = workouts.filter(
      (workout) => workout.status !== "CONCLUIDO" && workout.date >= now
    );

    const currentWeekWorkouts = workouts.filter(
      (workout) => workout.date >= currentWeek.startOfWeek && workout.date < currentWeek.endOfWeek
    );
    const nextWeekPlans = workoutPlans.filter(
      (plan) => plan.date && plan.date >= nextWeek.startOfWeek && plan.date < nextWeek.endOfWeek
    );

    const currentWeekCompleted = currentWeekWorkouts.filter((workout) => workout.status === "CONCLUIDO").length;

    const firstAvaliacao = avaliacoes.length > 0 ? avaliacoes[avaliacoes.length - 1] : null;
    const latestAvaliacao = avaliacoes[0] || null;

    const recentWorkoutLines = workoutPlans.slice(0, 8).map((plan) => {
      const exercises = plan.exercises
        .map((exercise) => {
          return `${exercise.order || 0}. ${exercise.name} — ${exercise.series || "-"} séries x ${exercise.reps || "-"} reps, carga: ${exercise.weight || "não informada"}, descanso: ${exercise.restTime || "não informado"}`;
        })
        .join("\n      ");

      const statusLine = plan.workouts.length
        ? plan.workouts.map((workout) => `${formatDate(workout.date)}: ${getStatusLabel(workout.status)}`).join("; ")
        : "sem execução registrada";

      return [
        `- ${plan.name} (${formatDate(plan.date || plan.createdAt)})`,
        `  Descrição: ${normalizeText(plan.description)}`,
        `  Observações: ${normalizeText(plan.notes)}`,
        `  Status/execução: ${statusLine}`,
        `  Exercícios:\n      ${exercises || "nenhum exercício cadastrado"}`,
      ].join("\n");
    });

    const questionLines = questions.slice(0, 8).map((question) => {
      const messages = [question, ...(question.children || [])];
      const lastMessage = messages[messages.length - 1];

      return [
        `- Criada em ${formatDateTime(question.createdAt)} para ${question.teacher?.name || question.teacherId ? "professor" : "gestão"}`,
        `  Status: ${question.resolvedAt ? "resolvida" : "em aberto"}`,
        `  Mensagens na conversa: ${messages.length}`,
        `  Última mensagem: ${normalizeText(lastMessage?.content).slice(0, 300)}`,
      ].join("\n");
    });

    const noticeLines = notices.slice(0, 8).map((notice) => {
      return `- ${formatDate(notice.createdAt)} | ${notice.title || notice.type} | tipo ${notice.type} | expira: ${notice.expiresAt ? formatDate(notice.expiresAt) : "não expira"}`;
    });

    const feedbackLines = feedbacks.map((feedback) => {
      return `- Marco ${feedback.milestone} treinos | status: ${feedback.status} | criado: ${formatDate(feedback.createdAt)} | enviado: ${formatDate(feedback.sentAt)}`;
    });

    const educationLines = didYouKnowDeliveries.map((delivery) => {
      const content = didYouKnowContentMap.get(delivery.contentId);

      return `- ${formatDate(delivery.sentAt)} | ${content?.title || "conteúdo não localizado"} | categoria: ${content?.category || "não informada"}`;
    });

    const engagementLines = engagementNotifications.slice(0, 10).map((item) => {
      return `- ${formatDate(item.sentAt)} | ${item.eventType} | canal: ${item.channel}`;
    });

    const careLines = careEvents.slice(0, 12).map((event) => {
      return [
        `- ${formatDate(event.createdAt)} | ${event.title} | tipo: ${event.eventType} | severidade: ${event.severity} | status: ${event.status}`,
        `  Relato: ${normalizeText(event.description).slice(0, 350)}`,
        `  Leitura para treino: ${normalizeText(event.professorMessage).slice(0, 500)}`,
        event.relatedWorkoutPlan
          ? `  Treino relacionado: ${event.relatedWorkoutPlan.name} (${formatDate(event.relatedWorkoutPlan.date)})`
          : "  Treino relacionado: não informado",
      ].join("\n");
    });

    const openCareEvents = careEvents.filter((event) => event.status !== "RESOLVIDO");
    const hasInjuryCare = openCareEvents.some((event) => event.eventType === "DOR_DESCONFORTO");
    const hasDifficultExercise = openCareEvents.some((event) => event.eventType === "EXERCICIO_DIFICIL");
    const hasLowMotivation = openCareEvents.some((event) => event.eventType === "DESMOTIVACAO" || event.eventType === "FALTA_TEMPO");

    const summaryText = [
      "RESUMO COMPLETO DO ALUNO — FUNCIONAL VIP DIGITAL",
      "",
      "1) Identificação",
      `Aluno: ${student.name}`,
      `E-mail: ${student.email || student.userAuth?.email || "não informado"}`,
      `Telefone: ${student.phone || "não informado"}`,
      `Status: ${student.active ? "ativo" : "inativo"}`,
      `Cadastro em: ${formatDate(student.createdAt)}`,
      `Onboarding/bioimpedância inicial completa: ${student.onboardingCompleto ? "sim" : "não"}`,
      `Professor responsável: ${student.user?.name || "não vinculado"} (${student.user?.email || "sem e-mail"})`,
      `Treinos contratados/mês: ${student.contractedTrainingDaysPerMonth || "não informado"}`,
      `Meta semanal estimada: ${weeklyLimit ? `${weeklyLimit} treino(s)/semana` : "não configurada"}`,
      `Observações cadastrais: ${normalizeText(student.notes)}`,
      "",
      "2) Objetivo e avaliação/bioimpedância",
      `Total de avaliações registradas: ${avaliacoes.length}`,
      `Primeira avaliação: ${firstAvaliacao ? formatDate(firstAvaliacao.createdAt) : "não informada"}`,
      `Última avaliação: ${latestAvaliacao ? formatDate(latestAvaliacao.createdAt) : "não informada"}`,
      latestAvaliacao
        ? [
            `Objetivo atual: ${normalizeText(latestAvaliacao.objetivo)}`,
            `Meta específica: ${normalizeText(latestAvaliacao.metaEspecifica)}`,
            `Peso atual: ${formatMetric(latestAvaliacao.peso, " kg")}`,
            `Altura: ${formatMetric(latestAvaliacao.altura, " m")}`,
            `Abdômen: ${formatMetric(latestAvaliacao.abdomen, " cm")}`,
            `Quadril: ${formatMetric(latestAvaliacao.quadril, " cm")}`,
            `Braço: ${formatMetric(latestAvaliacao.braco, " cm")}`,
            `Coxa: ${formatMetric(latestAvaliacao.coxa, " cm")}`,
            `Glúteo: ${formatMetric(latestAvaliacao.gluteo, " cm")}`,
            `Preferências: ${normalizeText(latestAvaliacao.preferencia)}`,
            `Equipamentos disponíveis: ${normalizeText(latestAvaliacao.equipamentos)}`,
            `Frequência informada: ${latestAvaliacao.frequencia || "não informada"}`,
            `Nível de atividade: ${normalizeText(latestAvaliacao.nivelAtividade)}`,
            `Lesões/restrições informadas: ${normalizeText(latestAvaliacao.lesoes)}`,
          ].join("\n")
        : "Nenhuma avaliação encontrada.",
      "",
      "Comparação primeira x última avaliação:",
      ...getTrendText(firstAvaliacao, latestAvaliacao),
      "",
      "3) Histórico de treino e adesão",
      `Treinos planejados/registrados: ${workouts.length}`,
      `Treinos concluídos: ${completedWorkouts.length}`,
      `Treinos vencidos não concluídos: ${overdueWorkouts.length}`,
      `Treinos pendentes futuros: ${pendingFutureWorkouts.length}`,
      `Adesão geral: ${calculateAdherence(completedWorkouts.length, workouts.length)}`,
      `Semana atual: ${formatDate(currentWeek.startOfWeek)} a ${formatDate(new Date(currentWeek.endOfWeek.getTime() - 1))}`,
      `Treinos da semana atual: ${currentWeekWorkouts.length}; concluídos: ${currentWeekCompleted}; adesão semanal: ${calculateAdherence(currentWeekCompleted, currentWeekWorkouts.length)}`,
      `Próxima semana: ${formatDate(nextWeek.startOfWeek)} a ${formatDate(new Date(nextWeek.endOfWeek.getTime() - 1))}`,
      `Treinos já planejados para próxima semana: ${nextWeekPlans.length}${weeklyLimit ? `/${weeklyLimit}` : ""}`,
      "",
      "Últimos planos de treino com exercícios:",
      recentWorkoutLines.length ? recentWorkoutLines.join("\n\n") : "Nenhum plano de treino encontrado.",
      "",
      "4) Dúvidas e interações com professor/gestão",
      questionLines.length ? questionLines.join("\n") : "Nenhuma dúvida encontrada.",
      "",
      "5) Avisos relevantes recentes",
      noticeLines.length ? noticeLines.join("\n") : "Nenhum aviso recente encontrado.",
      "",
      "6) Feedbacks de evolução",
      feedbackLines.length ? feedbackLines.join("\n") : "Nenhum feedback de evolução encontrado.",
      "",
      "7) Conteúdos educativos Você Sabia recebidos",
      educationLines.length ? educationLines.join("\n") : "Nenhum conteúdo Você Sabia encontrado.",
      "",
      "8) Régua de engajamento/alertas automáticos recentes",
      engagementLines.length ? engagementLines.join("\n") : "Nenhum alerta automático recente encontrado.",
      "",
      "9) Sinais recentes de cuidado do aluno",
      careLines.length ? careLines.join("\n") : "Nenhum sinal de cuidado registrado.",
      "",
      "10) Leitura operacional para montagem de treino",
      openCareEvents.length > 0
        ? `Existem ${openCareEvents.length} evento(s) de cuidado em aberto. Revisar antes de montar ou progredir treino.`
        : "Não há eventos de cuidado em aberto.",
      hasInjuryCare
        ? "Atenção: há relato de dor/desconforto. Não gerar progressão agressiva. Priorizar segurança, regressão, revisão humana e, se necessário, orientação para avaliação profissional."
        : "Sem relato aberto de dor/desconforto.",
      hasDifficultExercise
        ? "Atenção: aluno relatou exercício/treino difícil. Sugerir variações mais simples, menor volume, menor carga ou instruções mais claras."
        : "Sem relato aberto de exercício difícil.",
      hasLowMotivation
        ? "Atenção: há sinal de falta de tempo/desmotivação. Priorizar treino curto, objetivo e aderente."
        : "Sem sinal aberto de falta de tempo/desmotivação.",
      weeklyLimit
        ? `A sugestão de treino deve respeitar aproximadamente ${weeklyLimit} treino(s) por semana, conforme os dias contratados.`
        : "A meta semanal ainda não está configurada; confirmar quantidade de treinos antes de montar.",
      overdueWorkouts.length >= 3
        ? "Atenção: aluno com vários treinos não concluídos. Priorizar retomada, simplicidade e aderência antes de avançar progressão."
        : overdueWorkouts.length > 0
          ? "Atenção: aluno tem treinos não concluídos. Avaliar se é melhor adaptar ou repetir parte da programação."
          : "Sem sinal forte de baixa adesão pelo histórico de treinos vencidos.",
      latestAvaliacao?.lesoes
        ? `Considerar restrições/lesões informadas: ${latestAvaliacao.lesoes}.`
        : "Nenhuma lesão/restrição registrada na última avaliação; confirmar com o aluno se houver dúvida.",
    ].join("\n");

    const aiPrompt = buildAiPrompt(summaryText);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      student: {
        id: student.id,
        name: student.name,
        professorName: student.user?.name || null,
        weeklyLimit,
      },
      metrics: {
        avaliacoes: avaliacoes.length,
        workoutPlans: workoutPlans.length,
        workouts: workouts.length,
        completedWorkouts: completedWorkouts.length,
        overdueWorkouts: overdueWorkouts.length,
        pendingFutureWorkouts: pendingFutureWorkouts.length,
        currentWeekWorkouts: currentWeekWorkouts.length,
        currentWeekCompleted,
        nextWeekPlans: nextWeekPlans.length,
        feedbacks: feedbacks.length,
        questions: questions.length,
        careEvents: careEvents.length,
        openCareEvents: openCareEvents.length,
      },
      summaryText,
      aiPrompt,
    });
  } catch (error: any) {
    console.error("GET /api/students/[id]/ai-summary error:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error?.message },
      { status: 500 }
    );
  }
}

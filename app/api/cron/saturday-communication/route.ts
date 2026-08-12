import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";
import { resolveStudentRecipientEmail } from "@/lib/email-recipient-policy";
import { NextRequest, NextResponse } from "next/server";
import { getStudentDisplayName } from "@/lib/display-name";
import { getSaoPauloCivilKey, workoutDateToCivilKey } from "@/lib/workout-validation-window";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function appUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://funcional-up-digital.vercel.app";
  return `${base.replace(/\/$/, "")}${path}`;
}

function firstName(value?: string | null) {
  const text = String(value || "").trim();
  return text ? text.split(/\s+/)[0] : "você";
}

function escapeHtml(value: string) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function weekRange(reference = new Date()) {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function weeklyLimit(days?: number | null) {
  const value = Number(days || 0);
  if (!value) return 0;
  if (value <= 4) return 1;
  if (value <= 8) return 2;
  if (value <= 16) return 3;
  return Math.ceil(value / 4);
}

function studentMessage(
  name: string,
  planned: number,
  completed: number,
  remainingWeekendWorkouts = 0
) {
  const student = firstName(name);

  if (remainingWeekendWorkouts > 0) {
    return {
      subject: `${student}, sua semana ainda está em andamento 💪`,
      title: `Sua semana ainda está aberta, ${student}! 💪`,
      body: `Você concluiu ${completed} de ${planned} treino(s) até agora e ainda tem ${remainingWeekendWorkouts} treino(s) programado(s) para o fim de semana. Sábado e domingo fazem parte da sua programação quando foram definidos como dias de treino.`,
      next: "Siga somente os treinos previstos para você e registre no chat qualquer dificuldade, facilidade ou desconforto. O treino de fim de semana permanece aberto até 23h59 do próprio dia programado.",
    };
  }

  if (planned > 0 && completed >= planned) {
    return {
      subject: `${student}, você fechou a semana com tudo! 🎉`,
      title: `Semana concluída, ${student}! 🎉`,
      body: `Você concluiu ${completed} de ${planned} treino(s) planejado(s). Isso é constância de verdade! Siga sua programação da semana e reserve momentos de recuperação entre os treinos. Se houver treino no fim de semana, ele continua valendo normalmente.`,
      next: "Hidrate-se, descanse e registre no chat qualquer facilidade, dificuldade ou desconforto. Seu professor acompanha esses sinais.",
    };
  }
  if (completed > 0) {
    return {
      subject: `${student}, sua semana teve movimento — e isso conta 💛`,
      title: `Seu esforço desta semana valeu, ${student}! 👏`,
      body: `Você concluiu ${completed} de ${planned} treino(s). Nem toda semana sai exatamente como planejamos, mas cada sessão feita mantém sua jornada viva. Sem culpa e sem compensação: seguimos do ponto em que estamos.`,
      next: "Conte no chat o que facilitou ou atrapalhou sua rotina. Essa informação ajuda seu professor a ajustar a próxima semana.",
    };
  }
  return {
    subject: `${student}, a próxima semana pode ser um novo começo 🌱`,
    title: `Vamos recomeçar juntos, ${student}? 🌱`,
    body: planned > 0
      ? "Os treinos desta semana ficaram pendentes. Está tudo bem: uma semana difícil não apaga seu objetivo. O mais importante agora é entender o que aconteceu e preparar uma retomada possível, sem pressão e sem tentar compensar tudo de uma vez."
      : "Ainda não encontramos treinos planejados para você nesta semana. Já avisamos o professor responsável para revisar sua programação. Você não precisa fazer nada sozinho.",
    next: "Abra o chat e conte como está sua rotina. Seu professor pode ajustar dias, duração ou exercícios para tornar o treino mais possível para você.",
  };
}

async function getAuthorId() {
  const user = await prisma.user.findFirst({ where: { active: true, role: { in: ["GESTOR", "ADMIN"] } }, select: { id: true }, orderBy: { createdAt: "asc" } });
  return user?.id || null;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authorId = await getAuthorId();
  if (!authorId) return NextResponse.json({ error: "Gestor/admin não encontrado" }, { status: 400 });

  const { start, end } = weekRange();
  const weekKey = start.toISOString().slice(0, 10);
  const students = await prisma.student.findMany({
    where: { active: true },
    select: {
      id: true, name: true, preferredName: true, email: true, userAuthId: true, contractedTrainingDaysPerMonth: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { name: "asc" },
  });

  const results: Array<{ studentId: string; planned: number; completed: number }> = [];
  const teachersMissing = new Map<string, { id: string; name: string; email: string | null; students: string[] }>();

  for (const student of students) {
    const plans = await prisma.workout.findMany({
      where: { studentId: student.id, date: { gte: start, lt: end } },
      select: { id: true, status: true, date: true },
    });
    const planned = plans.length;
    const completed = plans.filter((item) => String(item.status).toUpperCase() === "CONCLUIDO").length;
    const todayKey = getSaoPauloCivilKey();
    const remainingWeekendWorkouts = plans.filter((item) => {
      const status = String(item.status || "").toUpperCase();
      const workoutKey = workoutDateToCivilKey(item.date);
      return status !== "CONCLUIDO" && workoutKey >= todayKey;
    }).length;
    const studentDisplayName = getStudentDisplayName(student);
    const message = studentMessage(
      studentDisplayName,
      planned,
      completed,
      remainingWeekendWorkouts
    );
    const title = `${message.title} — ${weekKey}`;

    const exists = await prisma.notice.findFirst({ where: { studentId: student.id, type: "SATURDAY_MOTIVATION", title }, select: { id: true } });
    if (!exists) {
      await prisma.notice.create({ data: { title, content: `${message.body}\n\n${message.next}\n\nMensagem automática de acompanhamento enviada em nome do seu professor.`, type: "SATURDAY_MOTIVATION", targetRole: "ALUNO", studentId: student.id, authorId } });
      const email = await resolveStudentRecipientEmail({ studentId: student.id, studentEmail: student.email, userAuthId: student.userAuthId });
      if (email) {
        const professor = student.user?.name || "Seu professor";
        const alunoUrl = appUrl("/aluno");
        await sendEmail({
          to: email,
          subject: message.subject,
          eventType: "SATURDAY_MOTIVATION",
          recipientType: "STUDENT",
          contextId: student.id,
          text: `Oi, ${studentDisplayName}!\n\n${message.body}\n\n${message.next}\n\nConte comigo,\n${professor}\nFuncional UP Digital\n\nMensagem automática de acompanhamento enviada em nome do seu professor.\n${alunoUrl}`,
          html: `<div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px"><div style="max-width:560px;margin:auto;background:#111;border:1px solid #2a2a2a;border-radius:18px;padding:26px"><h2 style="color:#00A19C">${escapeHtml(message.title)}</h2><p style="color:#ddd;line-height:1.65">${escapeHtml(message.body)}</p><div style="margin-top:18px;padding:14px;border-radius:12px;background:#00A19C12;border:1px solid #00A19C35;color:#ddd"><strong style="color:#00A19C">Próximo passo:</strong><br/>${escapeHtml(message.next)}</div><a href="${alunoUrl}" style="display:inline-block;margin-top:20px;background:#00A19C;color:#081312;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Abrir minha área</a><p style="color:#f5f5f5;margin-top:22px">Conte comigo,<br/><strong>${escapeHtml(professor)}</strong><br/><span style="color:#00A19C">Funcional UP Digital</span></p><p style="color:#666;font-size:11px">Mensagem automática de acompanhamento enviada em nome do seu professor.</p></div></div>`,
        });
      }
    }

    const limit = weeklyLimit(student.contractedTrainingDaysPerMonth);
    if (limit > 0 && planned === 0 && student.user?.id && ["TEACHER", "PROFESSOR"].includes(String(student.user.role || "").toUpperCase())) {
      const current = teachersMissing.get(student.user.id) || { id: student.user.id, name: student.user.name || "Professor", email: student.user.email, students: [] };
      current.students.push(student.name || "Aluno");
      teachersMissing.set(student.user.id, current);
    }
    results.push({ studentId: student.id, planned, completed });
  }

  for (const teacher of Array.from(teachersMissing.values())) {
    const title = `Atenção: aluno(s) sem treino nesta semana — ${weekKey}`;
    const exists = await prisma.notice.findFirst({ where: { professorId: teacher.id, type: "MANAGEMENT", title }, select: { id: true } });
    if (exists) continue;
    const list = teacher.students.map((name) => `- ${name}`).join("\n");
    const content = `Oi, ${firstName(teacher.name)}!\n\nIdentificamos aluno(s) sob sua responsabilidade sem nenhum treino planejado na semana atual:\n${list}\n\nRevise cada caso hoje. Se o aluno estiver em pausa, com evento de cuidado ou sem contrato válido, registre a situação. Caso contrário, prepare o treino e faça contato pelo chat para evitar que ele fique sem acompanhamento.`;
    await prisma.notice.create({ data: { title, content, type: "MANAGEMENT", targetRole: "PROFESSOR", professorId: teacher.id, authorId } });
    if (teacher.email) {
      await sendEmail({
        to: teacher.email, subject: "Ação necessária: aluno(s) sem treino nesta semana", eventType: "CURRENT_WEEK_MISSING_WORKOUTS", recipientType: "TEACHER", contextId: teacher.id,
        text: `${content}\n\nDashboard: ${appUrl("/dashboard")}`,
        html: `<div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px"><div style="max-width:620px;margin:auto;background:#111;border:1px solid #2a2a2a;border-radius:16px;padding:24px"><h2 style="color:#f5a623">Precisamos cuidar destes alunos hoje</h2><p style="color:#eee">Oi, <strong>${escapeHtml(firstName(teacher.name))}</strong>!</p><p style="color:#ddd;line-height:1.6">Identificamos aluno(s) sem treino na semana atual:</p><ul style="color:#ddd">${teacher.students.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul><p style="color:#ddd;line-height:1.6">Revise cada caso. Se houver pausa, evento de cuidado ou questão contratual, registre a situação. Caso contrário, prepare o treino e faça contato pelo chat.</p><a href="${appUrl("/dashboard")}" style="display:inline-block;background:#00A19C;color:#081312;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Abrir dashboard</a><p style="color:#666;font-size:11px">Mensagem automática de acompanhamento operacional.</p></div></div>`,
      });
    }
  }

  return NextResponse.json({ ok: true, weekKey, students: results.length, teachersAlerted: teachersMissing.size });
}

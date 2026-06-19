import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import QuestionForm from "./components/QuestionForm";

export const dynamic = "force-dynamic";

function timeAgo(date: Date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`;
  if (s < 604800) return `há ${Math.floor(s / 86400)}d`;
  return `há ${Math.floor(s / 604800)}sem`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  });
}

export default async function AlunoDashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  if (session.user.role !== "ALUNO") {
    redirect("/dashboard");
  }

  const student = await prisma.student.findUnique({
    where: { userAuthId: session.user.id },
  });

  if (!student) {
    return (
      <div className="text-center py-20">
        <p className="text-[#a1a1a1]">
          Perfil de aluno não encontrado. Entre em contato com o suporte.
        </p>
      </div>
    );
  }

  const notices = await prisma.notice.findMany({
    where: {
      OR: [{ studentId: null }, { studentId: student.id }],
    },
    include: {
      author: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const questions = await prisma.question.findMany({
    where: { studentId: student.id },
    include: {
      answeredBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f5f5f5]">
          Olá, {session.user.name}!
        </h1>
        <p className="text-sm text-[#a1a1a1]">Bem-vindo à sua área do aluno</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
            📢 Avisos e Feedbacks
          </h2>
          {notices.length === 0 ? (
            <p className="text-sm text-[#a1a1a1]">
              Nenhum aviso ou feedback no momento.
            </p>
          ) : (
            <div className="space-y-3">
              {notices.map((notice) => (
                <div
                  key={notice.id}
                  className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      {notice.title && (
                        <p className="text-sm font-medium text-[#f5f5f5]">
                          {notice.title}
                        </p>
                      )}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          notice.type === "FEEDBACK"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-[#D4A373]/10 text-[#D4A373]"
                        }`}
                      >
                        {notice.type === "FEEDBACK" ? "Feedback" : "Aviso"}
                      </span>
                    </div>
                    <span className="text-xs text-[#525252] whitespace-nowrap">
                      {timeAgo(notice.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-[#a1a1a1]">{notice.content}</p>
                  {notice.author.name && (
                    <p className="text-xs text-[#525252] mt-2">
                      — {notice.author.name}
                      {notice.studentId && " (para você)"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
            📅 Meus Treinos
          </h2>
          <div className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-6 text-center">
            <p className="text-3xl mb-2">🏋️</p>
            <p className="text-sm text-[#a1a1a1]">
              Em breve você poderá ver seus treinos aqui no calendário!
            </p>
            <p className="text-xs text-[#525252] mt-2">
              Seu professor está montando seus treinos personalizados.
            </p>
          </div>

          <div className="mt-6">
            <h3 className="text-md font-semibold text-[#f5f5f5] mb-3">
              ❓ Dúvidas
            </h3>
            <QuestionForm studentId={student.id} initialQuestions={questions} />
          </div>
        </div>
      </div>

      {questions.filter((q) => q.answer).length > 0 && (
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
            ✅ Dúvidas respondidas
          </h2>
          <div className="space-y-3">
            {questions
              .filter((q) => q.answer)
              .map((q) => (
                <div
                  key={q.id}
                  className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#D4A373]/10 flex items-center justify-center shrink-0">
                      <span className="text-[#D4A373] text-sm">❓</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-[#f5f5f5]">{q.content}</p>
                      <p className="text-xs text-[#525252] mt-1">
                        {timeAgo(q.createdAt)}
                      </p>
                    </div>
                  </div>
                  {q.answer && (
                    <div className="flex items-start gap-3 mt-3 pl-11">
                      <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                        <span className="text-green-400 text-sm">💬</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-[#a1a1a1]">{q.answer}</p>
                        <p className="text-xs text-[#525252] mt-1">
                          {q.answeredBy?.name &&
                            `Respondido por ${q.answeredBy.name}`}
                          {q.answeredAt && ` • ${formatDate(q.answeredAt)}`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

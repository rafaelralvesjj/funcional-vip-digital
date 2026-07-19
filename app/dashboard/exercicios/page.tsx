import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ExerciseGrid from "./components/ExerciseGrid";

export const dynamic = "force-dynamic";

export default async function BibliotecaExerciciosPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) redirect("/auth/signin");
  if (session.user.role === "ALUNO") redirect("/aluno");

  const exercises = await prisma.exerciseLibrary.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6 p-6 min-h-screen bg-[#0a0a0a]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f5f5f5]">
            🏋️ Biblioteca de Exercícios
          </h1>
          <p className="text-sm text-[#a1a1a1]">
            {exercises.length} exercício(s) cadastrado(s)
          </p>
        </div>

        {["GESTOR", "ADMIN"].includes(String(session.user.role || "").toUpperCase()) && (
          <a
            href="/api/exercise-library/export"
            className="inline-flex items-center justify-center rounded-xl bg-[#ff6b00] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#e85f00]"
          >
            ↓ Exportar imagens para IA
          </a>
        )}
      </div>

      <div className="rounded-xl border border-[#2a2a2a] bg-[#111111] p-4 text-sm text-[#c7c7c7]">
        O arquivo ZIP inclui uma imagem por exercício e um manifesto CSV com os dados da biblioteca para organizar a produção dos vídeos no CapCut.
      </div>

      <ExerciseGrid exercises={exercises} />
    </div>
  );
}

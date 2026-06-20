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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f5f5f5]">
            🏋️ Biblioteca de Exercícios
          </h1>
          <p className="text-sm text-[#a1a1a1]">
            {exercises.length} exercício(s) cadastrado(s)
          </p>
        </div>
      </div>

      <ExerciseGrid exercises={exercises} />
    </div>
  );
}

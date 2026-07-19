import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ExerciseGrid from "./components/ExerciseGrid";

export const dynamic = "force-dynamic";

const EXERCISES_PER_ZIP = 10;

export default async function BibliotecaExerciciosPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) redirect("/auth/signin");
  if (session.user.role === "ALUNO") redirect("/aluno");

  const [exercises, activeExercisesCount] = await Promise.all([
    prisma.exerciseLibrary.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.exerciseLibrary.count({
      where: { active: true },
    }),
  ]);

  const canExport = ["GESTOR", "ADMIN"].includes(
    String(session.user.role || "").toUpperCase()
  );

  const totalExportParts = Math.max(
    1,
    Math.ceil(activeExercisesCount / EXERCISES_PER_ZIP)
  );

  return (
    <div className="min-h-screen space-y-6 bg-[#0a0a0a] p-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f5f5f5]">
          🏋️ Biblioteca de Exercícios
        </h1>
        <p className="text-sm text-[#a1a1a1]">
          {exercises.length} exercício(s) cadastrado(s)
        </p>
      </div>

      {canExport && (
        <section className="rounded-xl border border-[#333333] bg-[#111111] p-4">
          <h2 className="text-base font-semibold text-[#f5f5f5]">
            Exportar imagens e prompts para vídeos
          </h2>

          <p className="mt-2 text-sm leading-6 text-[#c7c7c7]">
            Para não estourar a memória da Vercel, a biblioteca foi dividida em{" "}
            <strong className="text-white">{totalExportParts} partes</strong> de
            até {EXERCISES_PER_ZIP} exercícios. Baixe uma parte por vez. Cada ZIP
            contém as imagens principal e sequencial, os prompts e o relatório
            de status.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: totalExportParts }, (_, index) => {
              const batch = index + 1;
              const firstExercise = index * EXERCISES_PER_ZIP + 1;
              const lastExercise = Math.min(
                batch * EXERCISES_PER_ZIP,
                activeExercisesCount
              );

              return (
                <a
                  key={batch}
                  href={`/api/exercise-library/export?batch=${batch}&limit=${EXERCISES_PER_ZIP}`}
                  className="flex min-h-16 items-center justify-between rounded-xl bg-[#ff6b00] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#e85f00]"
                >
                  <span>
                    ↓ Baixar parte {batch} de {totalExportParts}
                  </span>
                  <span className="ml-3 text-xs font-normal text-orange-100">
                    {firstExercise}–{lastExercise}
                  </span>
                </a>
              );
            })}
          </div>

          <p className="mt-4 text-xs leading-5 text-[#a1a1a1]">
            No celular, aguarde o download de uma parte terminar antes de tocar
            na próxima.
          </p>
        </section>
      )}

      <ExerciseGrid exercises={exercises} />
    </div>
  );
}

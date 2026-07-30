import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import SairButton from "./components/SairButton";
import BrandLogo from "../../components/BrandLogo";

export default async function AlunoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  if (session.user.role !== "ALUNO") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header simples */}
      <header className="border-b border-[#ffffff10] bg-[#111111]">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandLogo href="/aluno" variant="symbol" size="sm" priority />
            <Link href="/aluno" className="text-[#00A19C] font-bold text-sm sm:text-base">
              Funcional UP Digital
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#a1a1a1]">{session.user.name}</span>
            <SairButton />
          </div>
        </div>
      </header>
      {/* Conteúdo */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}

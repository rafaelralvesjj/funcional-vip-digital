"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import BrandLogo from "../../components/BrandLogo";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import type { JSX } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const role = String(session?.user?.role || "").toUpperCase();
  const isGestor = role === "GESTOR" || role === "ADMIN";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  /*
   * Menu do professor
   *
   * Regra de produto:
   * - Professor não acessa "Montar Treino" solto pelo menu.
   * - Professor não acessa "Resumo do Aluno IA" solto pelo menu.
   * - Feedbacks/Evolução ficam fora do menu enquanto não houver uso recorrente.
   * - As rotas continuam existindo para acesso contextual pelo dashboard, ficha ou montagem.
   */
  const professorItems = [
    { href: "/dashboard", label: "Dashboard", icon: "grid" },
    { href: "/dashboard/students", label: "Alunos", icon: "users" },
    { href: "/dashboard/conversas", label: "Conversas", icon: "message" },
    { href: "/dashboard/cuidado-aluno", label: "Acompanhamento do Aluno", icon: "heart" },
    { href: "/dashboard/exercicios", label: "Biblioteca", icon: "book" },
  ];

  /*
   * Menu da gestão
   *
   * Regra:
   * - Gestor não vê "Montar Treino".
   * - Gestão mantém acesso a financeiro, gestão de alunos/professores e acompanhamento.
   * - "Resumo do Aluno IA" fica fora do menu porque é uma tela de apoio operacional,
   *   acessada a partir da montagem de treino.
   * - Feedbacks/Evolução ficam fora do menu enquanto o fluxo amadurece;
   *   o acesso pode continuar por card/link contextual no dashboard.
   */
  const gestorItems = [
    { href: "/dashboard", label: "Dashboard", icon: "grid" },
    { href: "/dashboard/cuidado-aluno", label: "Acompanhamento do Aluno", icon: "heart" },
    { href: "/dashboard/financeiro", label: "Financeiro", icon: "credit" },
    { href: "/dashboard/exercicios", label: "Biblioteca", icon: "book" },
    { href: "/dashboard/gestao", label: "Gestão", icon: "message" },
    { href: "/dashboard/gestor/voce-sabia", label: "Você Sabia", icon: "book" },
    { href: "/dashboard/gestor/vincular-alunos", label: "Vincular Alunos", icon: "link" },
    { href: "/dashboard/gestor/alunos", label: "Gerenciar Alunos", icon: "users" },
    { href: "/dashboard/gestor/professores", label: "Gerenciar Professores", icon: "user" },
    { href: "/dashboard/gestor/gestores", label: "Gerenciar Gestores", icon: "user" },
  ];

  const navItems = isGestor ? gestorItems : professorItems;

  function NavIcon({ icon }: { icon: string }) {
    const icons: Record<string, JSX.Element> = {
      grid: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
      users: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      user: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      book: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      ),
      edit: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      ),
      message: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
      link: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ),
      heart: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
      ),
      credit: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <path d="M6 15h4" />
        </svg>
      ),
    };

    return icons[icon] || null;
  }

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);

    const loginPath = "/auth/signin";

    try {
      await signOut({
        redirect: false,
        callbackUrl: loginPath,
      });
    } finally {
      /*
       * O replace evita que o botão "voltar" do navegador tente reabrir
       * o dashboard depois que a sessão já foi encerrada.
       */
      window.location.replace(loginPath);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`w-64 lg:w-72 fixed left-0 top-0 h-screen bg-[#111111] border-r border-[#ffffff10] flex flex-col z-50 transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="p-6 border-b border-[#ffffff10] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo href="/dashboard" variant="symbol" size="sm" priority />
            <Link href="/dashboard" className="text-[#D4A373] font-bold text-base leading-tight">
              Funcional VIP Digital
            </Link>
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-[#a1a1a1] hover:text-white transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition ${
                isActive(item.href)
                  ? "bg-[#D4A373]/10 text-[#D4A373] border-l-2 border-[#D4A373]"
                  : "text-[#a1a1a1] hover:text-[#e5e5e5] hover:bg-white/5"
              }`}
            >
              <NavIcon icon={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-[#ffffff10] space-y-3">
          <div className="px-4 py-2">
            <p className="text-sm font-medium text-[#f5f5f5] truncate">
              {session?.user?.name || "Usuário"}
            </p>
            <p className="text-xs text-[#a1a1a1]">
              {isGestor ? "Gestor" : "Professor"}
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm text-[#a1a1a1] hover:text-red-400 hover:bg-red-500/5 transition"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>{loggingOut ? "Saindo..." : "Sair"}</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 lg:ml-72 min-h-screen">
        <div className="lg:hidden sticky top-0 z-30 bg-[#0a0a0a] border-b border-[#ffffff10] px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-[#a1a1a1] hover:text-white transition"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <BrandLogo href="/dashboard" variant="symbol" size="sm" priority />
            <span className="text-[#D4A373] font-bold text-xs sm:text-sm">
              Funcional VIP Digital
            </span>
          </div>

          <div className="w-6 h-6 rounded-full bg-[#D4A373]/20 text-[#D4A373] flex items-center justify-center font-bold text-xs">
            {session?.user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}

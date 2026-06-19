"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import type { JSX } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: "grid" },
    { href: "/dashboard/students", label: "Alunos", icon: "users" },
    { href: "/dashboard/exercises", label: "Biblioteca", icon: "book" },
    { href: "/dashboard/planning", label: "Planejamento", icon: "calendar" },
    { href: "/dashboard/checkins", label: "Check-ins", icon: "check" },
    { href: "/dashboard/feedbacks", label: "Feedbacks", icon: "star" },
    { href: "/dashboard/controls", label: "Controle Semanal", icon: "chart" },
  ];

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
      book: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      ),
      calendar: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
      check: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
      star: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
      chart: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    };
    return icons[icon] || null;
  }

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <aside className="w-64 lg:w-72 fixed left-0 top-0 h-screen bg-[#111111] border-r border-[#ffffff10] flex flex-col z-50">
        <div className="p-6 border-b border-[#ffffff10]">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#D4A373] flex items-center justify-center text-[#0a0a0a] font-bold text-sm">F</div>
            <span className="text-[#D4A373] font-bold text-base leading-tight">Funcional<br />Vip Digital</span>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}
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
            <p className="text-sm font-medium text-[#f5f5f5] truncate">{session?.user?.name || "Usuário"}</p>
            <p className="text-xs text-[#a1a1a1]">{session?.user?.role === "GESTOR" ? "Gestor" : "Professor"}</p>
          </div>
          <button type="button" onClick={() => signOut({ callbackUrl: "/" })}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm text-[#a1a1a1] hover:text-red-400 hover:bg-red-500/5 transition"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sair</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 ml-64 lg:ml-72">{children}</main>
    </div>
  );
}

"use client";

import BrandLogo from "../../../components/BrandLogo";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("E-mail ou senha inválidos");
      setLoading(false);
      return;
    }

    const sessionRes = await fetch("/api/auth/session");
    const session = await sessionRes.json();

    if (session?.user?.role === "ALUNO") {
      router.push("/aluno");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <main className="min-h-screen w-full bg-[#0a0a0a] flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-[#111111] border border-[#ffffff10] rounded-xl p-6 sm:p-8 shadow-2xl">
        <div className="mb-4 flex justify-center">
          <BrandLogo variant="full" size="lg" priority />
        </div>
        <h1 className="text-center text-2xl sm:text-3xl font-bold text-[#22D3EE] mb-2">
          Funcional UP Digital
        </h1>
        <p className="text-center text-[#a1a1a1] text-sm sm:text-base mb-6">
          Acesse sua conta
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-[#e5e5e5]">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none transition focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-[#e5e5e5]">
              Senha
            </label>
            <input
              id="password"
              type="password"
              placeholder="Sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none transition focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]"
            />
          </div>

          {error && (
            <p className="text-center text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-[#22D3EE] px-4 py-3 text-sm font-bold text-[#0a0a0a] transition hover:bg-[#0891B2] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <Link
            href="/auth/aluno-registro"
            className="text-[#22D3EE] transition hover:underline font-medium"
          >
            Não tenho conta! Novo aluno
          </Link>
          <Link
            href="/"
            className="text-[#a1a1a1] transition hover:text-[#e5e5e5]"
          >
            Voltar para o início
          </Link>
        </div>
      </div>
    </main>
  );
}

"use client";

import BrandLogo from "../../../components/BrandLogo";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cadastro = params.get("cadastro");
    const emailFromQuery = params.get("email");

    if (emailFromQuery) {
      setEmail(emailFromQuery.trim().toLowerCase());
    }

    if (cadastro === "sucesso") {
      setSuccessMessage(
        "Cadastro concluído com sucesso. Entre com a senha que você acabou de criar."
      );
    }
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    if (result?.error || !result?.ok) {
      setError("E-mail ou senha inválidos");
      setLoading(false);
      return;
    }

    const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
    const session = await sessionRes.json();

    if (session?.user?.role === "ALUNO") {
      window.location.replace("/aluno");
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <main className="min-h-screen w-full bg-[#0a0a0a] flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-[#111111] border border-[#ffffff10] rounded-xl p-6 sm:p-8 shadow-2xl">
        <div className="mb-4 flex justify-center">
          <BrandLogo variant="full" size="lg" priority />
        </div>

        <h1 className="text-center text-2xl sm:text-3xl font-bold text-[#00A19C] mb-2">
          Funcional UP Digital
        </h1>

        <p className="text-center text-[#a1a1a1] text-sm sm:text-base mb-6">
          Acesse sua conta
        </p>

        {successMessage && (
          <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {successMessage}
          </div>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="email"
              className="text-sm font-medium text-[#e5e5e5]"
            >
              E-mail
            </label>

            <input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none transition focus:border-[#00A19C] focus:ring-1 focus:ring-[#00A19C]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="password"
              className="text-sm font-medium text-[#e5e5e5]"
            >
              Senha
            </label>

            <input
              id="password"
              type="password"
              placeholder="Sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none transition focus:border-[#00A19C] focus:ring-1 focus:ring-[#00A19C]"
            />
          </div>

          {error && (
            <p className="text-center text-sm text-red-500">{error}</p>
          )}

          <div className="flex justify-end">
            <Link
              href="/auth/esqueci-senha"
              className="text-sm text-[#00A19C] transition hover:underline"
            >
              Esqueci minha senha
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-[#00A19C] px-4 py-3 text-sm font-bold text-[#0a0a0a] transition hover:bg-[#007D79] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <Link
            href="/auth/aluno-registro"
            className="text-[#00A19C] transition hover:underline font-medium"
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

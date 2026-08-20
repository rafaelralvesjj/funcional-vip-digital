"use client";

import BrandLogo from "@/components/BrandLogo";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error || "Não foi possível processar sua solicitação");
        return;
      }

      setMessage(
        data?.message ||
          "Se o e-mail informado estiver cadastrado, você receberá um link para redefinir sua senha."
      );
    } catch {
      setError("Não foi possível processar sua solicitação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen w-full bg-[#0a0a0a] flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-[#111111] border border-[#ffffff10] rounded-xl p-6 sm:p-8 shadow-2xl">
        <div className="mb-4 flex justify-center">
          <BrandLogo variant="full" size="lg" priority />
        </div>

        <h1 className="text-center text-2xl sm:text-3xl font-bold text-[#00A19C] mb-2">
          Esqueci minha senha
        </h1>

        <p className="text-center text-[#a1a1a1] text-sm sm:text-base mb-6">
          Informe o e-mail da sua conta e enviaremos um link para você criar uma nova senha.
        </p>

        {message ? (
          <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {message}
          </div>
        ) : (
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
                autoComplete="email"
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none transition focus:border-[#00A19C] focus:ring-1 focus:ring-[#00A19C]"
              />
            </div>

            {error && <p className="text-center text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-[#00A19C] px-4 py-3 text-sm font-bold text-[#0a0a0a] transition hover:bg-[#007D79] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Enviando..." : "Enviar link de redefinição"}
            </button>
          </form>
        )}

        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <Link href="/auth/signin" className="text-[#00A19C] transition hover:underline font-medium">
            Voltar para o login
          </Link>
        </div>
      </div>
    </main>
  );
}

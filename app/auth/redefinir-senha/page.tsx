"use client";

import BrandLogo from "@/components/BrandLogo";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
    setTokenReady(true);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Link de redefinição inválido. Solicite um novo.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error || "Não foi possível redefinir sua senha");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.replace("/auth/signin");
      }, 2500);
    } catch {
      setError("Não foi possível redefinir sua senha. Tente novamente.");
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
          Criar nova senha
        </h1>

        <p className="text-center text-[#a1a1a1] text-sm sm:text-base mb-6">
          Escolha uma nova senha para sua conta.
        </p>

        {success ? (
          <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Senha redefinida com sucesso. Redirecionando para o login...
          </div>
        ) : !tokenReady ? null : !token ? (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Este link de redefinição é inválido. Solicite um novo link na tela de login.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-sm font-medium text-[#e5e5e5]">
                Nova senha
              </label>

              <input
                id="password"
                type="password"
                placeholder="Mínimo de 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none transition focus:border-[#00A19C] focus:ring-1 focus:ring-[#00A19C]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-[#e5e5e5]">
                Confirmar nova senha
              </label>

              <input
                id="confirmPassword"
                type="password"
                placeholder="Repita a senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none transition focus:border-[#00A19C] focus:ring-1 focus:ring-[#00A19C]"
              />
            </div>

            {error && <p className="text-center text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-[#00A19C] px-4 py-3 text-sm font-bold text-[#0a0a0a] transition hover:bg-[#007D79] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Salvando..." : "Redefinir senha"}
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

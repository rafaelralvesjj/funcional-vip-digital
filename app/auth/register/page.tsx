"use client";

import BrandLogo from "../../../components/BrandLogo";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("GESTOR");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    if (!name.trim()) {
      setError("O nome é obrigatório");
      setLoading(false);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("E-mail inválido");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres");
      setLoading(false);
      return;
    }

    if (confirmPassword !== password) {
      setError("As senhas não conferem");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, phone, role }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push("/auth/signin");
        }, 2000);
      } else {
        setError(data.error || "Erro ao cadastrar");
      }
    } catch (err) {
      setError("Erro ao conectar com o servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-[#ffffff10] bg-[#111111] p-6 shadow-2xl sm:p-8">
        <div className="mb-4 flex justify-center">
          <BrandLogo variant="full" size="lg" priority />
        </div>
        <h1 className="mb-2 text-center text-2xl font-bold text-[#00A19C] sm:text-3xl">
          Funcional UP Digital
        </h1>
        <p className="mb-6 text-center text-sm text-[#a1a1a1] sm:text-base">
          Crie sua conta
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium text-[#e5e5e5]">
              Nome
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome completo"
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none transition placeholder:text-[#6b6b6b] focus:border-[#00A19C] focus:ring-1 focus:ring-[#00A19C]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-[#e5e5e5]">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none transition placeholder:text-[#6b6b6b] focus:border-[#00A19C] focus:ring-1 focus:ring-[#00A19C]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="phone" className="text-sm font-medium text-[#e5e5e5]">
              Telefone
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-8888"
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none transition placeholder:text-[#6b6b6b] focus:border-[#00A19C] focus:ring-1 focus:ring-[#00A19C]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-[#e5e5e5]">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none transition placeholder:text-[#6b6b6b] focus:border-[#00A19C] focus:ring-1 focus:ring-[#00A19C]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-[#e5e5e5]">
              Confirmar senha
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none transition placeholder:text-[#6b6b6b] focus:border-[#00A19C] focus:ring-1 focus:ring-[#00A19C]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="role" className="text-sm font-medium text-[#e5e5e5]">
              Tipo de conta
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none transition focus:border-[#00A19C] focus:ring-1 focus:ring-[#00A19C]"
            >
              <option value="GESTOR">Gestor</option>
              <option value="PROFESSOR">Professor</option>
            </select>
          </div>

          {error && (
            <p className="text-center text-sm text-red-500">{error}</p>
          )}

          {success && (
            <p className="text-center text-sm text-green-500">
              Conta criada com sucesso! Redirecionando...
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-[#00A19C] px-4 py-3 text-sm font-bold text-[#0a0a0a] transition hover:bg-[#007D79] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Cadastrando..." : "Criar conta"}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <Link
            href="/auth/signin"
            className="text-[#00A19C] transition hover:underline"
          >
            Já tem conta? Fazer login
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

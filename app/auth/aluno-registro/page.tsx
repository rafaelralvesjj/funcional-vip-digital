"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AlunoRegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    acceptedTerms: false,
  });

  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setImageUrl(data.url);
      } else {
        const err = await res.json().catch(() => null);
        alert(`Erro ao enviar imagem: ${err?.error || "tente novamente."}`);
      }
    } catch {
      alert("Erro ao conectar com o servidor");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!form.name || !form.email || !form.phone || !form.password) {
      setError("Preencha nome, e-mail, telefone e senha.");
      return;
    }

    if (form.password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    if (!form.acceptedTerms) {
      setError("Para iniciar a experiência gratuita, aceite o termo de experiência.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/aluno/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          confirmPassword: form.confirmPassword,
          imageUrl: imageUrl || null,
          acceptedTerms: form.acceptedTerms,
          source: "LANDING_PAGE",
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Erro ao criar conta.");
        setLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (result?.ok) {
        router.push("/aluno");
      } else {
        setError("Conta criada, mas houve erro ao fazer login. Faça login manualmente.");
        router.push("/auth/signin");
      }
    } catch {
      setError("Erro interno do servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#D4A373]">
            Funcional Vip Digital
          </h1>
          <p className="text-sm text-[#a1a1a1] mt-2">
            Crie sua conta para iniciar sua experiência gratuita
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#111] border border-[#ffffff10] rounded-2xl p-6 space-y-4"
        >
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="rounded-xl bg-[#D4A373]/10 border border-[#D4A373]/20 px-4 py-3">
            <p className="text-sm text-[#D4A373] font-semibold">
              Experiência gratuita de 1 mês
            </p>
            <p className="text-xs text-[#a1a1a1] mt-1">
              Seu cadastro ativa uma experiência grátis. Depois disso, a equipe irá vincular um professor para liberar seus primeiros treinos.
            </p>
          </div>

          <div>
            <label className="block text-sm text-[#d6d6d6] mb-1">
              Sua foto <span className="text-[#6b6b6b]">(opcional)</span>
            </label>

            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="block w-full text-sm text-[#a1a1a1] file:mr-4 file:rounded-lg file:border-0 file:bg-[#D4A373] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#0a0a0a]"
            />

            {uploading && (
              <p className="text-xs text-[#D4A373] mt-1">Enviando foto...</p>
            )}

            {imageUrl && !uploading && (
              <p className="text-xs text-green-400 mt-1">✅ Foto enviada!</p>
            )}
          </div>

          <div>
            <label className="block text-sm text-[#d6d6d6] mb-1">
              Nome completo *
            </label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
              placeholder="Seu nome"
              autoComplete="name"
            />
          </div>

          <div>
            <label className="block text-sm text-[#d6d6d6] mb-1">
              E-mail *
            </label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
              placeholder="voce@email.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm text-[#d6d6d6] mb-1">
              WhatsApp *
            </label>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
              placeholder="(61) 99999-9999"
              autoComplete="tel"
            />
          </div>

          <div>
            <label className="block text-sm text-[#d6d6d6] mb-1">
              Senha *
            </label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-sm text-[#d6d6d6] mb-1">
              Confirmar senha *
            </label>
            <input
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
              placeholder="Repita sua senha"
              autoComplete="new-password"
            />
          </div>

          <label className="flex gap-3 rounded-xl bg-[#1a1a1a] border border-[#ffffff10] px-4 py-3 cursor-pointer">
            <input
              name="acceptedTerms"
              type="checkbox"
              checked={form.acceptedTerms}
              onChange={handleChange}
              className="mt-1 h-4 w-4 accent-[#D4A373]"
            />
            <span className="text-xs text-[#d6d6d6] leading-relaxed">
              Li e aceito o{" "}
              <strong className="text-[#D4A373]">
                Termo de Experiência Gratuita
              </strong>
              . Entendo que o período experimental tem duração limitada, não gera cobrança automática e que, para continuar após o período gratuito, será necessário contratar um plano.
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !form.acceptedTerms}
            className="w-full rounded-xl bg-[#D4A373] px-4 py-3 font-semibold text-[#0a0a0a] hover:bg-[#c49563] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Criando experiência..." : "Começar experiência gratuita"}
          </button>

          <p className="text-center text-sm text-[#a1a1a1]">
            Já tem conta?{" "}
            <Link href="/auth/signin" className="text-[#D4A373] hover:underline">
              Fazer login
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}

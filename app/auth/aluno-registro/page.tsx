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
  });
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
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
        const err = await res.json();
        alert(`Erro ao enviar imagem: ${err.error}`);
      }
    } catch {
      alert("Erro ao conectar com o servidor");
    } finally {
      setUploading(false);
    }
  }
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.email || !form.password) {
      setError("Preencha todos os campos obrigatórios.");
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
    setLoading(true);
    try {
      const res = await fetch("/api/aluno/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          imageUrl: imageUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao criar conta.");
        setLoading(false);
        return;
      }
      if (data.studentId) {
        router.push(`/onboarding/${data.studentId}`);
      } else {
        const result = await signIn("credentials", {
          email: form.email,
          password: form.password,
          redirect: false,
        });
        if (result?.ok) {
          router.push("/aluno");
        } else {
          setError("Conta criada, mas erro ao fazer login. Faça login manualmente.");
          router.push("/auth/signin");
        }
      }
    } catch {
      setError("Erro interno do servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#D4A373]">Funcional Vip Digital</h1>
          <p className="text-[#a1a1a1] mt-1">Crie sua conta de aluno</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          {/* 🔥 Foto do aluno */}
          <div>
            <label className="block text-sm text-[#e5e5e5] mb-1">
              📸 Sua foto <span className="text-[#525252]">(opcional)</span>
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageUpload}
              className="w-full text-sm text-[#e5e5e5] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#D4A373] file:text-[#0a0a0a] file:font-semibold file:text-xs hover:file:bg-[#b88a5e]"
            />
            {uploading && <p className="text-xs text-[#D4A373] mt-1">Enviando foto...</p>}
            {imageUrl && !uploading && (
              <p className="text-xs text-green-500 mt-1">✅ Foto enviada!</p>
            )}
          </div>

          <div>
            <label className="block text-sm text-[#a1a1a1] mb-1">Nome completo *</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Seu nome"
              required
              className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-3 text-[#f5f5f5] placeholder:text-[#525252] focus:outline-none focus:border-[#D4A373] transition"
            />
          </div>
          <div>
            <label className="block text-sm text-[#a1a1a1] mb-1">E-mail *</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="seu@email.com"
              required
              className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-3 text-[#f5f5f5] placeholder:text-[#525252] focus:outline-none focus:border-[#D4A373] transition"
            />
          </div>
          <div>
            <label className="block text-sm text-[#a1a1a1] mb-1">Telefone</label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="(61) 99999-9999"
              className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-3 text-[#f5f5f5] placeholder:text-[#525252] focus:outline-none focus:border-[#D4A373] transition"
            />
          </div>
          <div>
            <label className="block text-sm text-[#a1a1a1] mb-1">Senha *</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
              className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-3 text-[#f5f5f5] placeholder:text-[#525252] focus:outline-none focus:border-[#D4A373] transition"
            />
          </div>
          <div>
            <label className="block text-sm text-[#a1a1a1] mb-1">Confirmar senha *</label>
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Repita a senha"
              required
              className="w-full bg-[#0a0a0a] border border-[#ffffff10] rounded-lg px-4 py-3 text-[#f5f5f5] placeholder:text-[#525252] focus:outline-none focus:border-[#D4A373] transition"
            />
          </div>
          <button
            type="submit"
            disabled={loading || uploading}
            className="w-full bg-[#D4A373] text-[#0a0a0a] font-semibold rounded-lg py-3 hover:bg-[#c49463] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Criando conta..." : "Criar conta"}
          </button>
          <div className="text-center pt-2">
            <p className="text-sm text-[#a1a1a1]">
              Já tem conta?{" "}
              <Link href="/auth/signin" className="text-[#D4A373] hover:underline">
                Fazer login
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

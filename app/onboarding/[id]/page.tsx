"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [alunoNome, setAlunoNome] = useState("");
  const fileInputRef = useState<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    objetivo: "",
    metaEspecifica: "",
    peso: "",
    altura: "",
    abdomen: "",
    quadril: "",
    braco: "",
    coxa: "",
    gluteo: "",
    preferencia: "",
    frequencia: "",
    nivelAtividade: "",
    lesoes: "",
    fotoUrl: "",
  });

  useEffect(() => {
    fetch(`/api/student/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.name) setAlunoNome(data.name);
        if (data.onboardingCompleto) {
          router.push(`/dashboard/aluno/${params.id}`);
        }
      })
      .catch(() => {});
  }, [params.id, router]);

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
        setForm((prev) => ({ ...prev, fotoUrl: data.url }));
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/avaliacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alunoId: params.id,
          tipo: "INICIAL",
          mesReferencia: 1,
          ...form,
        }),
      });

      if (res.ok) {
        router.push(`/dashboard/aluno/${params.id}`);
      } else {
        const err = await res.json();
        alert(`Erro ao salvar: ${err.error}`);
      }
    } catch {
      alert("Erro ao conectar com o servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#D4A373]/10 to-transparent pb-12">
        <div className="max-w-2xl mx-auto px-4 pt-12">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#D4A373]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📋</span>
            </div>
            <h1 className="text-2xl font-bold text-[#f5f5f5]">
              Bem-vindo, {alunoNome || "Aluno"}!
            </h1>
            <p className="text-[#a1a1a1] mt-2">
              Antes de começar, conte-nos um pouco sobre você para personalizarmos seus treinos.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 pb-16 -mt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Seção: Objetivo */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">🎯 Seu Objetivo</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">
                  Qual seu objetivo principal?
                </label>
                <select
                  value={form.objetivo}
                  onChange={(e) => setForm({ ...form, objetivo: e.target.value })}
                  required
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                >
                  <option value="">Selecione...</option>
                  <option value="emagrecimento">Emagrecimento / Redução de medidas</option>
                  <option value="massa">Ganho de massa muscular</option>
                  <option value="condicionamento">Condicionamento físico / Saúde</option>
                  <option value="definicao">Definição muscular</option>
                  <option value="reabilitacao">Reabilitação / Melhora de postura</option>
                  <option value="performance">Performance esportiva</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">
                  Qual sua meta específica para este mês?
                </label>
                <textarea
                  value={form.metaEspecifica}
                  onChange={(e) => setForm({ ...form, metaEspecifica: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                  placeholder="Ex: Quero perder 3kg, conseguir fazer 10 flexões..."
                />
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">
                  Prefere treinar em casa ou na academia?
                </label>
                <select
                  value={form.preferencia}
                  onChange={(e) => setForm({ ...form, preferencia: e.target.value })}
                  required
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                >
                  <option value="">Selecione...</option>
                  <option value="casa">Em casa</option>
                  <option value="academia">Na academia</option>
                </select>
              </div>
            </div>
          </div>

          {/* Seção: Dados Físicos */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">📏 Dados Físicos</h2>
            <p className="text-sm text-[#a1a1a1] mb-4">
              Tire suas medidas com uma fita métrica. Não precisa ser exato, o importante é acompanhar a evolução!
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Peso (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.peso}
                  onChange={(e) => setForm({ ...form, peso: e.target.value })}
                  required
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                  placeholder="Ex: 75"
                />
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Altura (cm)</label>
                <input
                  type="number"
                  step="1"
                  value={form.altura}
                  onChange={(e) => setForm({ ...form, altura: e.target.value })}
                  required
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                  placeholder="Ex: 170"
                />
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Abdômen (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.abdomen}
                  onChange={(e) => setForm({ ...form, abdomen: e.target.value })}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                  placeholder="Ex: 85"
                />
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Glúteo (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.gluteo}
                  onChange={(e) => setForm({ ...form, gluteo: e.target.value })}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                  placeholder="Ex: 98"
                />
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Braço (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.braco}
                  onChange={(e) => setForm({ ...form, braco: e.target.value })}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                  placeholder="Ex: 32"
                />
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Coxa (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.coxa}
                  onChange={(e) => setForm({ ...form, coxa: e.target.value })}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                  placeholder="Ex: 55"
                />
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Quadril (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.quadril}
                  onChange={(e) => setForm({ ...form, quadril: e.target.value })}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                  placeholder="Ex: 100"
                />
              </div>
            </div>
          </div>

          {/* Seção: Contexto */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">📋 Seu Contexto</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-[#e5e5e5] block mb-1">
                    Frequência semanal desejada
                  </label>
                  <select
                    value={form.frequencia}
                    onChange={(e) => setForm({ ...form, frequencia: e.target.value })}
                    required
                    className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                  >
                    <option value="">Selecione...</option>
                    <option value="2">2 dias</option>
                    <option value="3">3 dias</option>
                    <option value="4">4 dias</option>
                    <option value="5">5 dias</option>
                    <option value="6">6 dias</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-[#e5e5e5] block mb-1">
                    Nível de atividade
                  </label>
                  <select
                    value={form.nivelAtividade}
                    onChange={(e) => setForm({ ...form, nivelAtividade: e.target.value })}
                    required
                    className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                  >
                    <option value="">Selecione...</option>
                    <option value="sedentario">Sedentário</option>
                    <option value="leve">Leve</option>
                    <option value="moderado">Moderado</option>
                    <option value="ativo">Ativo</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">
                  Lesões ou limitações <span className="text-[#525252]">(opcional)</span>
                </label>
                <textarea
                  value={form.lesoes}
                  onChange={(e) => setForm({ ...form, lesoes: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                  placeholder="Ex: Joelho direito com lesão no menisco..."
                />
              </div>
            </div>
          </div>

          {/* Seção: Foto */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">📸 Foto Inicial</h2>
            <p className="text-sm text-[#a1a1a1] mb-3">
              Tire uma foto de corpo inteiro para compararmos no fim do mês. <span className="text-[#525252]">(opcional)</span>
            </p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageUpload}
              className="w-full text-sm text-[#e5e5e5] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#D4A373] file:text-[#0a0a0a] file:font-semibold file:text-sm hover:file:bg-[#b88a5e]"
            />
            {uploading && (
              <p className="text-xs text-[#D4A373] mt-2">Enviando foto...</p>
            )}
            {form.fotoUrl && !uploading && (
              <p className="text-xs text-green-500 mt-2">✅ Foto enviada!</p>
            )}
          </div>

          {/* Botão */}
          <button
            type="submit"
            disabled={loading || uploading}
            className="w-full bg-[#D4A373] text-[#0a0a0a] font-bold rounded-xl py-4 text-base transition hover:bg-[#b88a5e] disabled:opacity-70"
          >
            {loading ? "Salvando..." : "✅ Salvar e Começar"}
          </button>
        </form>
      </div>
    </div>
  );
}

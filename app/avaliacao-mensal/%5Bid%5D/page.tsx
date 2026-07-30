"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AvaliacaoMensalPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [relatorio, setRelatorio] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    peso: "",
    abdomen: "",
    quadril: "",
    braco: "",
    coxa: "",
    gluteo: "",
    fotoUrl: "",
  });

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload-image", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setForm((prev) => ({ ...prev, fotoUrl: data.url }));
      }
    } catch {} finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // Cria a avaliação mensal
      const res = await fetch("/api/avaliacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alunoId: params.id,
          tipo: "MENSAL",
          mesReferencia: 1,
          ...form,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Erro ao salvar: ${err.error}`);
        return;
      }

      // Gera o relatório
      setGerandoRelatorio(true);
      const resRelatorio = await fetch(`/api/avaliacao/relatorio?alunoId=${params.id}`);
      const dataRelatorio = await resRelatorio.json();
      setRelatorio(dataRelatorio);
    } catch {
      alert("Erro ao conectar com o servidor");
    } finally {
      setLoading(false);
      setGerandoRelatorio(false);
    }
  }

  // Se já tem relatório, mostra ele
  if (relatorio) {
    const campos = Object.values(relatorio.comparativo || {}) as any[];
    const melhorias = campos.filter((c: any) => c.melhorou === true).length;
    const totais = campos.filter((c: any) => c.melhorou !== null).length;

    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
        <div className="bg-gradient-to-b from-[#22D3EE]/10 to-transparent pb-8">
          <div className="max-w-2xl mx-auto px-4 pt-12 text-center">
            <div className="w-20 h-20 bg-[#22D3EE]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🏆</span>
            </div>
            <h1 className="text-2xl font-bold">📈 Seu Relatório Mensal</h1>
            <p className="text-[#a1a1a1] mt-2">
              Aqui está sua evolução neste mês!
            </p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-16 -mt-4 space-y-4">
          {/* Score de evolução */}
          <div className="bg-gradient-to-r from-[#22D3EE]/10 to-transparent border border-[#22D3EE]/20 rounded-xl p-6 text-center">
            <span className="text-5xl">
              {relatorio.scoreEvolucao >= 80 ? "🔥" : relatorio.scoreEvolucao >= 50 ? "💪" : "📈"}
            </span>
            <h2 className="text-lg font-bold text-[#22D3EE] mt-2">
              {relatorio.scoreEvolucao}% de evolução positiva
            </h2>
            <p className="text-sm text-[#a1a1a1] mt-1">
              {melhorias} de {totais} medidas melhoraram ou se mantiveram!
            </p>
            {relatorio.scoreEvolucao >= 80 && (
              <p className="text-sm text-green-400 mt-2">🌟 Resultado excelente! Continue assim!</p>
            )}
          </div>

          {/* Comparativo por medida */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="font-semibold mb-4">📊 Comparativo de Medidas</h2>
            <div className="space-y-3">
              {campos
                .filter((c: any) => c.inicial != null)
                .map((campo: any) => {
                  const diferenca = campo.diferenca;
                  const diferencaFormatada =
                    diferenca != null
                      ? (diferenca > 0 ? "+" : "") + diferenca
                      : "—";

                  return (
                    <div
                      key={campo.label}
                      className="flex items-center justify-between bg-[#1a1a1a] rounded-lg px-4 py-3"
                    >
                      <div>
                        <span className="text-sm text-[#e5e5e5]">{campo.label}</span>
                        <div className="text-xs text-[#6b6b6b] mt-0.5">
                          Início: {campo.inicial} {campo.atual != null ? `→ Atual: ${campo.atual}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        {campo.melhorou === true && (
                          <span className="text-green-400 font-bold text-sm">
                            {diferencaFormatada} ✅
                          </span>
                        )}
                        {campo.melhorou === false && (
                          <span className="text-red-400 text-sm">
                            {diferencaFormatada}
                          </span>
                        )}
                        {campo.melhorou === null && (
                          <span className="text-[#6b6b6b] text-sm">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* IMC */}
          {relatorio.imcInicial && (
            <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
              <h2 className="font-semibold mb-3">⚖️ IMC</h2>
              <div className="flex items-center justify-between bg-[#1a1a1a] rounded-lg px-4 py-3">
                <span className="text-sm text-[#e5e5e5]">Início do mês</span>
                <span className="text-sm font-bold">{relatorio.imcInicial}</span>
              </div>
              {relatorio.imcAtual && (
                <div className="flex items-center justify-between bg-[#1a1a1a] rounded-lg px-4 py-3 mt-2">
                  <span className="text-sm text-[#e5e5e5]">Atual</span>
                  <span className="text-sm font-bold">{relatorio.imcAtual}</span>
                </div>
              )}
            </div>
          )}

          {/* Meta */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="font-semibold mb-2">🎯 Sua Meta</h2>
            <p className="text-[#22D3EE] font-medium">
              {relatorio.objetivo || "Não definida"}
            </p>
            {relatorio.metaEspecifica && (
              <p className="text-sm text-[#a1a1a1] mt-1">
                "{relatorio.metaEspecifica}"
              </p>
            )}
          </div>

          {/* Parabéns */}
          <div className="bg-gradient-to-r from-[#22D3EE]/10 to-transparent border border-[#22D3EE]/20 rounded-xl p-6 text-center">
            <p className="text-[#e5e5e5]">
              {relatorio.scoreEvolucao >= 80
                ? "🔥 Parabéns! Você teve um mês incrível! Continue com essa consistência que os resultados só vão melhorar!"
                : relatorio.scoreEvolucao >= 50
                ? "💪 Bom trabalho! Você está no caminho certo. Continue focado que o próximo mês será ainda melhor!"
                : "📈 Todo progresso conta! Use esse relatório como motivação para o próximo mês. Vamos juntos!"}
            </p>
          </div>

          {/* Botão voltar */}
          <button
            onClick={() => router.push(`/dashboard/aluno/${params.id}`)}
            className="w-full bg-[#22D3EE] text-[#0a0a0a] font-bold rounded-xl py-4 text-base transition hover:bg-[#0891B2]"
          >
            🏠 Voltar ao Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Formulário de avaliação mensal
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      <div className="bg-gradient-to-b from-[#22D3EE]/10 to-transparent pb-8">
        <div className="max-w-2xl mx-auto px-4 pt-12">
          <div className="text-center mb-4">
            <div className="w-16 h-16 bg-[#22D3EE]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📊</span>
            </div>
            <h1 className="text-2xl font-bold">Avaliação do Mês</h1>
            <p className="text-[#a1a1a1] mt-2">
              Atualize suas medidas para gerar seu relatório mensal de evolução!
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-16 -mt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Medidas */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="text-lg font-semibold text-[#22D3EE] mb-4">📏 Atualize suas medidas</h2>
            <p className="text-sm text-[#a1a1a1] mb-4">
              Tire as medidas novamente com a fita métrica para compararmos com o início do mês.
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
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE]"
                  placeholder="Ex: 74"
                />
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Abdômen (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.abdomen}
                  onChange={(e) => setForm({ ...form, abdomen: e.target.value })}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE]"
                  placeholder="Ex: 84"
                />
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Glúteo (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.gluteo}
                  onChange={(e) => setForm({ ...form, gluteo: e.target.value })}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE]"
                  placeholder="Ex: 99"
                />
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Braço (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.braco}
                  onChange={(e) => setForm({ ...form, braco: e.target.value })}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE]"
                  placeholder="Ex: 33"
                />
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Coxa (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.coxa}
                  onChange={(e) => setForm({ ...form, coxa: e.target.value })}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE]"
                  placeholder="Ex: 54"
                />
              </div>
              <div>
                <label className="text-sm text-[#e5e5e5] block mb-1">Quadril (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.quadril}
                  onChange={(e) => setForm({ ...form, quadril: e.target.value })}
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE]"
                  placeholder="Ex: 101"
                />
              </div>
            </div>
          </div>

          {/* Foto */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="text-lg font-semibold text-[#22D3EE] mb-4">📸 Foto do mês</h2>
            <p className="text-sm text-[#a1a1a1] mb-3">
              Tire uma foto nova para compararmos com a do início. <span className="text-[#525252]">(opcional)</span>
            </p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageUpload}
              className="w-full text-sm text-[#e5e5e5] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#22D3EE] file:text-[#0a0a0a] file:font-semibold file:text-sm hover:file:bg-[#0891B2]"
            />
            {uploading && <p className="text-xs text-[#22D3EE] mt-2">Enviando foto...</p>}
            {form.fotoUrl && !uploading && <p className="text-xs text-green-500 mt-2">✅ Foto enviada!</p>}
          </div>

          {/* Botão */}
          <button
            type="submit"
            disabled={loading || uploading}
            className="w-full bg-[#22D3EE] text-[#0a0a0a] font-bold rounded-xl py-4 text-base transition hover:bg-[#0891B2] disabled:opacity-70"
          >
            {loading ? "Gerando relatório..." : "📊 Gerar Relatório do Mês"}
          </button>
        </form>
      </div>
    </div>
  );
}

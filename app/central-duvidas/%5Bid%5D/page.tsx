"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function CentralDuvidasPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [duvidas, setDuvidas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const [novaDuvida, setNovaDuvida] = useState({
    content: "",
    videoUrl: "",
    imageUrl: "",
  });
  const [mostrarForm, setMostrarForm] = useState(false);

  useEffect(() => {
    carregarDuvidas();
  }, []);

  async function carregarDuvidas() {
    try {
      const res = await fetch(`/api/student/${params.id}/questions`);
      if (res.ok) {
        const data = await res.json();
        setDuvidas(data);
      }
    } catch (err) {
      console.error("Erro ao carregar dúvidas:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload-image", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setNovaDuvida((prev) => ({ ...prev, imageUrl: data.url }));
      }
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!novaDuvida.content.trim()) return;
    setEnviando(true);

    try {
      const res = await fetch(`/api/student/${params.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novaDuvida),
      });

      if (res.ok) {
        setNovaDuvida({ content: "", videoUrl: "", imageUrl: "" });
        setMostrarForm(false);
        await carregarDuvidas();
      } else {
        const err = await res.json();
        alert(`Erro: ${err.error}`);
      }
    } catch {
      alert("Erro ao conectar com o servidor");
    } finally {
      setEnviando(false);
    }
  }

  function formatarData(data: string) {
    return new Date(data).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#D4A373]/10 to-transparent pb-6">
        <div className="max-w-2xl mx-auto px-4 pt-12">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => router.push(`/dashboard/aluno/${params.id}`)}
              className="text-sm text-[#D4A373] hover:text-[#b88a5e]"
            >
              ← Voltar
            </button>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-[#D4A373]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">💬</span>
            </div>
            <h1 className="text-2xl font-bold">Central de Dúvidas</h1>
            <p className="text-[#a1a1a1] mt-2">
              Tire suas dúvidas com vídeo, foto ou texto. Seu professor responde por aqui!
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-16 -mt-4 space-y-4">
        {/* Botão nova dúvida */}
        {!mostrarForm && (
          <button
            onClick={() => setMostrarForm(true)}
            className="w-full bg-[#D4A373] text-[#0a0a0a] font-bold rounded-xl py-4 text-base transition hover:bg-[#b88a5e]"
          >
            📝 Nova Dúvida
          </button>
        )}

        {/* Formulário nova dúvida */}
        {mostrarForm && (
          <form onSubmit={handleSubmit} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-[#D4A373]">Nova Dúvida</h2>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">
                Sua dúvida <span className="text-red-400">*</span>
              </label>
              <textarea
                value={novaDuvida.content}
                onChange={(e) => setNovaDuvida({ ...novaDuvida, content: e.target.value })}
                rows={3}
                required
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Descreva sua dúvida em detalhes..."
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">
                Link do vídeo <span className="text-[#525252]">(opcional)</span>
              </label>
              <input
                type="url"
                value={novaDuvida.videoUrl}
                onChange={(e) => setNovaDuvida({ ...novaDuvida, videoUrl: e.target.value })}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                placeholder="Cole o link do vídeo (YouTube, Google Drive...)"
              />
              <p className="text-xs text-[#6b6b6b] mt-1">
                💡 Grave sua execução do exercício e cole o link aqui para correção!
              </p>
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">
                Imagem <span className="text-[#525252]">(opcional)</span>
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImageUpload}
                className="w-full text-sm text-[#e5e5e5] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#D4A373] file:text-[#0a0a0a] file:font-semibold file:text-sm hover:file:bg-[#b88a5e]"
              />
              {novaDuvida.imageUrl && (
                <p className="text-xs text-green-500 mt-1">✅ Imagem anexada</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={enviando || !novaDuvida.content.trim()}
                className="flex-1 bg-[#D4A373] text-[#0a0a0a] font-bold rounded-xl py-3 text-sm transition hover:bg-[#b88a5e] disabled:opacity-70"
              >
                {enviando ? "Enviando..." : "📤 Enviar Dúvida"}
              </button>
              <button
                type="button"
                onClick={() => setMostrarForm(false)}
                className="px-6 rounded-xl border border-[#ffffff20] text-sm text-[#a1a1a1] hover:bg-[#1a1a1a] transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Lista de dúvidas */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-[#6b6b6b]">Carregando dúvidas...</p>
          </div>
        ) : duvidas.length === 0 ? (
          <div className="text-center py-12 bg-[#111111] border border-[#ffffff10] rounded-xl">
            <span className="text-4xl">📭</span>
            <p className="text-[#a1a1a1] mt-3">Nenhuma dúvida ainda.</p>
            <p className="text-[#6b6b6b] text-sm mt-1">
              Clique em "Nova Dúvida" para começar!
            </p>
          </div>
        ) : (
          duvidas.map((duvida) => (
            <div key={duvida.id} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
              {/* Cabeçalho */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-[#6b6b6b]">
                  {formatarData(duvida.createdAt)}
                </span>
                {duvida.answer ? (
                  <span className="text-xs bg-green-500/10 text-green-400 px-3 py-1 rounded-full">
                    Respondida ✅
                  </span>
                ) : (
                  <span className="text-xs bg-[#D4A373]/10 text-[#D4A373] px-3 py-1 rounded-full">
                    Aguardando resposta ⏳
                  </span>
                )}
              </div>

              {/* Conteúdo da dúvida */}
              <p className="text-sm text-[#e5e5e5] whitespace-pre-wrap">{duvida.content}</p>

              {/* Mídias */}
              <div className="flex flex-wrap gap-2 mt-3">
                {duvida.videoUrl && (
                  <a
                    href={duvida.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs bg-[#1a1a1a] text-[#D4A373] px-3 py-1.5 rounded-lg hover:bg-[#252525] transition"
                  >
                    ▶️ Ver vídeo
                  </a>
                )}
                {duvida.imageUrl && (
                  <a
                    href={duvida.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs bg-[#1a1a1a] text-[#D4A373] px-3 py-1.5 rounded-lg hover:bg-[#252525] transition"
                  >
                    🖼️ Ver imagem
                  </a>
                )}
              </div>

              {/* Resposta do professor */}
              {duvida.answer && (
                <div className="mt-4 pt-4 border-t border-[#ffffff10]">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-[#D4A373]/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-sm">👨‍🏫</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-[#D4A373]">
                          {duvida.answeredBy?.name || "Professor"}
                        </span>
                        {duvida.answeredAt && (
                          <span className="text-xs text-[#6b6b6b]">
                            {formatarData(duvida.answeredAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[#e5e5e5] whitespace-pre-wrap">
                        {duvida.answer}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

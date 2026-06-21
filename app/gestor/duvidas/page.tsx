"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function GestorDuvidasPage() {
  const router = useRouter();
  const [duvidas, setDuvidas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "pendentes" | "respondidas">("pendentes");
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    // Busca o ID do usuário logado (gestor)
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.id) {
          setUserId(data.user.id);
        }
      })
      .catch(() => {});

    carregarDuvidas();
  }, []);

  async function carregarDuvidas() {
    try {
      const res = await fetch("/api/gestor/duvidas");
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

  async function handleResponder(duvidaId: string) {
    if (!resposta.trim() || !userId) return;
    setEnviando(true);

    try {
      const res = await fetch(`/api/questions/${duvidaId}/answer`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: resposta, answeredById: userId }),
      });

      if (res.ok) {
        setResposta("");
        setRespondendo(null);
        await carregarDuvidas();
      } else {
        const err = await res.json();
        alert(`Erro ao responder: ${err.error}`);
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

  const duvidasFiltradas = duvidas.filter((d) => {
    if (filtro === "pendentes") return !d.answer;
    if (filtro === "respondidas") return d.answer;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#D4A373]/10 to-transparent pb-6">
        <div className="max-w-4xl mx-auto px-4 pt-12">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-[#D4A373] hover:text-[#b88a5e]"
            >
              ← Voltar ao Dashboard
            </button>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-[#D4A373]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">💬</span>
            </div>
            <h1 className="text-2xl font-bold">Central de Dúvidas</h1>
            <p className="text-[#a1a1a1] mt-2">
              Veja e responda as dúvidas dos seus alunos
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-16 -mt-4">
        {/* Filtros */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setFiltro("pendentes")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filtro === "pendentes"
                ? "bg-[#D4A373] text-[#0a0a0a]"
                : "bg-[#1a1a1a] text-[#a1a1a1] hover:bg-[#252525]"
            }`}
          >
            ⏳ Pendentes
          </button>
          <button
            onClick={() => setFiltro("respondidas")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filtro === "respondidas"
                ? "bg-[#D4A373] text-[#0a0a0a]"
                : "bg-[#1a1a1a] text-[#a1a1a1] hover:bg-[#252525]"
            }`}
          >
            ✅ Respondidas
          </button>
          <button
            onClick={() => setFiltro("todas")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filtro === "todas"
                ? "bg-[#D4A373] text-[#0a0a0a]"
                : "bg-[#1a1a1a] text-[#a1a1a1] hover:bg-[#252525]"
            }`}
          >
            📋 Todas
          </button>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-[#6b6b6b]">Carregando dúvidas...</p>
          </div>
        ) : duvidasFiltradas.length === 0 ? (
          <div className="text-center py-12 bg-[#111111] border border-[#ffffff10] rounded-xl">
            <span className="text-4xl">🎉</span>
            <p className="text-[#a1a1a1] mt-3">
              {filtro === "pendentes"
                ? "Nenhuma dúvida pendente!"
                : "Nenhuma dúvida encontrada."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {duvidasFiltradas.map((duvida) => (
              <div
                key={duvida.id}
                className={`bg-[#111111] border rounded-xl p-5 ${
                  !duvida.answer
                    ? "border-[#D4A373]/30"
                    : "border-[#ffffff10]"
                }`}
              >
                {/* Cabeçalho */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#D4A373]/10 rounded-full flex items-center justify-center">
                      <span className="text-sm">👤</span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {duvida.student?.name || "Aluno"}
                      </p>
                      <p className="text-xs text-[#6b6b6b]">
                        {formatarData(duvida.createdAt)}
                      </p>
                    </div>
                  </div>
                  {!duvida.answer && (
                    <span className="text-xs bg-[#D4A373]/10 text-[#D4A373] px-3 py-1 rounded-full">
                      ⏳ Pendente
                    </span>
                  )}
                </div>

                {/* Conteúdo */}
                <p className="text-sm text-[#e5e5e5] whitespace-pre-wrap mb-3">
                  {duvida.content}
                </p>

                {/* Mídias */}
                {(duvida.videoUrl || duvida.imageUrl) && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {duvida.videoUrl && (
                      <a
                        href={duvida.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs bg-[#1a1a1a] text-[#D4A373] px-3 py-1.5 rounded-lg hover:bg-[#252525]"
                      >
                        ▶️ Ver vídeo
                      </a>
                    )}
                    {duvida.imageUrl && (
                      <a
                        href={duvida.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs bg-[#1a1a1a] text-[#D4A373] px-3 py-1.5 rounded-lg hover:bg-[#252525]"
                      >
                        🖼️ Ver imagem
                      </a>
                    )}
                  </div>
                )}

                {/* Resposta existente */}
                {duvida.answer && (
                  <div className="mt-3 pt-3 border-t border-[#ffffff10]">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-[#D4A373]/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-sm">👨‍🏫</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-[#D4A373]">
                            {duvida.answeredBy?.name || "Você"}
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

                {/* Formulário de resposta */}
                {!duvida.answer && (
                  <div className="mt-3 pt-3 border-t border-[#ffffff10]">
                    {respondendo === duvida.id ? (
                      <div className="space-y-3">
                        <textarea
                          value={resposta}
                          onChange={(e) => setResposta(e.target.value)}
                          rows={3}
                          className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                          placeholder="Escreva sua resposta..."
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResponder(duvida.id)}
                            disabled={enviando || !resposta.trim()}
                            className="bg-[#D4A373] text-[#0a0a0a] font-bold px-4 py-2 rounded-lg text-sm transition hover:bg-[#b88a5e] disabled:opacity-70"
                          >
                            {enviando ? "Enviando..." : "📤 Responder"}
                          </button>
                          <button
                            onClick={() => {
                              setRespondendo(null);
                              setResposta("");
                            }}
                            className="px-4 py-2 rounded-lg text-sm text-[#a1a1a1] hover:bg-[#1a1a1a]"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRespondendo(duvida.id)}
                        className="text-sm text-[#D4A373] hover:text-[#b88a5e]"
                      >
                        ✏️ Responder
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

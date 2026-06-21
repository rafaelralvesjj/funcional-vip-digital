"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardAlunoPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [aluno, setAluno] = useState<any>(null);
  const [avaliacaoInicial, setAvaliacaoInicial] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregarDados() {
      try {
        // Busca dados do aluno
        const resAluno = await fetch(`/api/student/${params.id}`);
        const dataAluno = await resAluno.json();

        if (!dataAluno.onboardingCompleto) {
          router.push(`/onboarding/${params.id}`);
          return;
        }

        setAluno(dataAluno);

        // Busca avaliação inicial
        const resAval = await fetch(`/api/avaliacao?alunoId=${params.id}&tipo=INICIAL`);
        const dataAval = await resAval.json();
        if (dataAval.length > 0) {
          setAvaliacaoInicial(dataAval[0]);
        }
      } catch (err) {
        console.error("Erro ao carregar dados:", err);
      } finally {
        setLoading(false);
      }
    }

    carregarDados();
  }, [params.id, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#D4A373] text-lg">Carregando...</div>
      </div>
    );
  }

  if (!aluno) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#a1a1a1] text-lg">Aluno não encontrado</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#D4A373]/10 to-transparent pb-8">
        <div className="max-w-2xl mx-auto px-4 pt-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-[#D4A373]/10 rounded-full flex items-center justify-center">
              <span className="text-xl">💪</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#f5f5f5]">
                Olá, {aluno.name}! 👋
              </h1>
              <p className="text-sm text-[#a1a1a1]">
                Seu treino personalizado te espera
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-16 -mt-4 space-y-4">
        {/* Card: Treino da Semana */}
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">📋 Treino da Semana</h2>
            <span className="text-xs bg-[#D4A373]/10 text-[#D4A373] px-3 py-1 rounded-full">
              Semana 1
            </span>
          </div>
          <div className="text-center py-8">
            <span className="text-4xl">🏋️</span>
            <p className="text-[#a1a1a1] text-sm mt-3">
              Seu professor ainda está montando seu treino.
            </p>
            <p className="text-[#6b6b6b] text-xs mt-1">
              Assim que estiver pronto, aparecerá aqui.
            </p>
          </div>
        </div>

        {/* Card: Medidas */}
        {avaliacaoInicial && (
          <div 
            onClick={() => router.push(`/avaliacao-mensal/${params.id}`)}
            className="bg-[#111111] border border-[#D4A373]/20 rounded-xl p-5 cursor-pointer hover:border-[#D4A373]/40 transition"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">📊 Suas Medidas</h2>
                <p className="text-xs text-[#a1a1a1] mt-1">
                  Clique para atualizar suas medidas do mês
                </p>
              </div>
              <span className="text-2xl">📏</span>
            </div>
            <div className="flex gap-4 mt-3 text-xs text-[#6b6b6b]">
              <span>Peso: {avaliacaoInicial.peso}kg</span>
              {avaliacaoInicial.abdomen && <span>Abdômen: {avaliacaoInicial.abdomen}cm</span>}
              {avaliacaoInicial.gluteo && <span>Glúteo: {avaliacaoInicial.gluteo}cm</span>}
            </div>
          </div>
        )}

        {/* Card: Progresso */}
        {avaliacaoInicial && (
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="font-semibold mb-3">🔥 Progresso</h2>
            <div className="text-center py-6">
              <span className="text-4xl">📈</span>
              <p className="text-[#a1a1a1] text-sm mt-3">
                Seu relatório mensal aparecerá aqui.
              </p>
              <p className="text-[#6b6b6b] text-xs mt-1">
                Complete o primeiro mês para ver sua evolução!
              </p>
            </div>
          </div>
        )}

        {/* Card: Aviso de avaliação mensal */}
        <div className="bg-gradient-to-r from-[#D4A373]/5 to-transparent border border-[#D4A373]/10 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-xl">💡</span>
            <div>
              <p className="text-sm text-[#e5e5e5]">
                No fim do mês, você poderá refazer suas medidas e receber um relatório completo com sua evolução!
              </p>
              <p className="text-xs text-[#D4A373] mt-2">
 Continue assim que os resultados virão! 🚀
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

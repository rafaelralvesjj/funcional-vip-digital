"use client";
import { useParams } from "next/navigation";

export default function PerfilAlunoPage() {
  const params = useParams();
  const studentId = params.id as string;

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold text-[#D4A373]">Perfil do Aluno</h1>
        <p className="text-sm text-[#a1a1a1] mt-2">ID: {studentId}</p>
        <p className="text-sm text-[#6b6b6b] mt-8">Página de teste - se você está vendo isso, a rota funciona!</p>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function PerfilAlunoPage() {
  const params = useParams();
  const studentId = params?.id as string;

  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (studentId) {
      fetchStudent();
    }
  }, [studentId]);

  async function fetchStudent() {
    try {
      const res = await fetch(`/api/student/${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setStudent(data);
      }
    } catch {}
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-6 flex items-center justify-center">
        <p className="text-[#6b6b6b]">Carregando...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-6 flex items-center justify-center">
        <p className="text-[#6b6b6b]">Aluno não encontrado (ID: {studentId})</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold text-[#D4A373]">{student.name}</h1>
        <p className="text-sm text-[#a1a1a1] mt-2">ID: {studentId}</p>
        <p className="text-sm text-[#6b6b6b] mt-4">Perfil do aluno carregado com sucesso!</p>
      </div>
    </div>
  );
}

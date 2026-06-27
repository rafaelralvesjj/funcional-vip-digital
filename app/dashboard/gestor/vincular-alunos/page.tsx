"use client";
import { useEffect, useState } from "react";

interface Student {
  id: string;
  name: string;
  email?: string;
  image?: string;
}

interface Professor {
  id: string;
  name: string;
  email?: string;
}

interface WorkoutPlan {
  id: string;
  name: string;
}

export default function VincularAlunosPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [selectedProfessor, setSelectedProfessor] = useState<Record<string, string>>({});
  const [selectedPlan, setSelectedPlan] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "unassigned">("unassigned");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [studentsRes, professorsRes] = await Promise.all([
        fetch("/api/students"),
        fetch("/api/professores"),
      ]);
      if (studentsRes.ok) {
        const data = await studentsRes.json();
        setStudents(Array.isArray(data) ? data : data.students || data || []);
      }
      if (professorsRes.ok) {
        const data = await professorsRes.json();
        setProfessors(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function vincularAluno(studentId: string) {
    const professorId = selectedProfessor[studentId];
    if (!professorId) return;

    setSaving(studentId);
    setSuccess("");

    try {
      const res = await fetch("/api/students/assign-professor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, professorId }),
      });

      if (res.ok) {
        setSuccess("Aluno vinculado com sucesso!");
        setTimeout(() => setSuccess(""), 3000);
        loadData();
      } else {
        const err = await res.json();
        alert("Erro: " + err.error);
      }
    } catch {
      alert("Erro ao vincular aluno.");
    } finally {
      setSaving(null);
    }
  }

  const displayStudents = activeTab === "unassigned"
    ? students
    : students;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#D4A373]">Vincular Alunos a Professores</h1>
        <p className="text-[#a1a1a1] mt-1">
          Distribua os alunos entre os professores disponiveis
        </p>
      </div>

      {success && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-lg p-4 mb-6">
          {success}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("unassigned")}
          className={"px-4 py-2 rounded-lg text-sm font-medium transition " + (activeTab === "unassigned" ? "bg-[#D4A373] text-[#0a0a0a]" : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-[#f5f5f5]")}
        >
          Alunos sem professor
        </button>
        <button
          onClick={() => setActiveTab("all")}
          className={"px-4 py-2 rounded-lg text-sm font-medium transition " + (activeTab === "all" ? "bg-[#D4A373] text-[#0a0a0a]" : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-[#f5f5f5]")}
        >
          Todos os alunos
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#525252]">Carregando...</div>
      ) : displayStudents.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[#525252] text-lg">Nenhum aluno encontrado</p>
          <p className="text-[#525252] text-sm mt-1">Os alunos aparecerao aqui apos se cadastrarem.</p>
        </div>
      ) : (
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#ffffff10]">
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Aluno</th>
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Vincular Professor</th>
                  <th className="text-right px-5 py-4 text-sm font-medium text-[#a1a1a1]">Acao</th>
                </tr>
              </thead>
              <tbody>
                {displayStudents.map((student) => (
                  <tr key={student.id} className="border-b border-[#ffffff10] hover:bg-white/5">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#D4A373]/20 text-[#D4A373] flex items-center justify-center font-bold text-sm">
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[#f5f5f5] text-sm font-medium">{student.name}</p>
                          {student.email && (
                            <p className="text-[#525252] text-xs">{student.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td 

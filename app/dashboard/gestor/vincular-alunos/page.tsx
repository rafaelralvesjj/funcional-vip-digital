"use client";

import { useEffect, useMemo, useState } from "react";

interface Student {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  userId?: string | null;
  active?: boolean;
  contractedTrainingDaysPerMonth?: number | null;
}

interface Professor {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
}

function normalizeStudents(data: any): Student[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.students)) return data.students;
  return [];
}

function normalizeProfessors(data: any): Professor[] {
  const list = Array.isArray(data) ? data : data?.teachers || data?.professores || [];
  return Array.isArray(list) ? list : [];
}

export default function VincularAlunosPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [selectedProfessor, setSelectedProfessor] = useState<Record<string, string>>({});
  const [selectedDays, setSelectedDays] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "unassigned">("unassigned");

  useEffect(() => {
    loadData();
  }, []);

  const professorIds = useMemo(() => new Set(professors.map((professor) => professor.id)), [professors]);

  const professorMap = useMemo(() => {
    const map = new Map<string, Professor>();
    professors.forEach((professor) => map.set(professor.id, professor));
    return map;
  }, [professors]);

  async function loadData() {
    setLoading(true);

    try {
      const [studentsRes, professorsRes] = await Promise.all([
        fetch("/api/students/todos", { cache: "no-store" }),
        fetch("/api/professores", { cache: "no-store" }),
      ]);

      let studentsList: Student[] = [];

      if (studentsRes.ok) {
        const data = await studentsRes.json();
        studentsList = normalizeStudents(data);
        setStudents(studentsList);
      } else {
        setStudents([]);
      }

      if (professorsRes.ok) {
        const data = await professorsRes.json();
        setProfessors(normalizeProfessors(data));
      } else {
        setProfessors([]);
      }

      const initialDays: Record<string, string> = {};
      studentsList.forEach((student) => {
        if (
          student.contractedTrainingDaysPerMonth !== null &&
          student.contractedTrainingDaysPerMonth !== undefined
        ) {
          initialDays[student.id] = String(student.contractedTrainingDaysPerMonth);
        }
      });
      setSelectedDays(initialDays);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function vincularAluno(student: Student) {
    const currentProfessorIsValid = Boolean(student.userId && professorIds.has(student.userId));
    const professorId = selectedProfessor[student.id] || (currentProfessorIsValid ? student.userId || "" : "");
    const daysValue = selectedDays[student.id];

    if (!professorId) {
      alert("Selecione um professor.");
      return;
    }

    if (!daysValue) {
      alert("Informe a quantidade de dias contratados por mês.");
      return;
    }

    setSaving(student.id);
    setSuccess("");

    try {
      const res = await fetch("/api/students/assign-professor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          professorId,
          contractedTrainingDaysPerMonth: Number(daysValue),
        }),
      });

      if (res.ok) {
        setSuccess("Aluno vinculado com sucesso!");
        setTimeout(() => setSuccess(""), 3000);
        await loadData();
      } else {
        const err = await res.json();
        alert("Erro: " + (err.error || "Erro ao vincular aluno."));
      }
    } catch {
      alert("Erro ao vincular aluno.");
    } finally {
      setSaving(null);
    }
  }

  const studentsWithoutProfessor = students.filter(
    (student) => !student.userId || !professorIds.has(student.userId)
  );

  const displayStudents = activeTab === "unassigned" ? studentsWithoutProfessor : students;

  function getProfessorName(student: Student): string {
    if (!student.userId || !professorIds.has(student.userId)) {
      return "";
    }

    return professorMap.get(student.userId)?.name || "";
  }

  function getButtonDisabled(student: Student): boolean {
    const currentProfessorIsValid = Boolean(student.userId && professorIds.has(student.userId));
    const professorId = selectedProfessor[student.id] || (currentProfessorIsValid ? student.userId || "" : "");
    const daysValue = selectedDays[student.id];

    return !professorId || !daysValue || saving === student.id;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#D4A373]">Vincular Alunos a Professores</h1>
        <p className="text-[#a1a1a1] mt-1">
          Distribua os alunos entre os professores e registre os dias de treino contratados por mês.
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
          <p className="text-[#525252] text-sm mt-1">Os alunos aparecerão aqui após se cadastrarem.</p>
        </div>
      ) : (
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#ffffff10]">
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Aluno</th>
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Professor Atual</th>
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Vincular / Trocar</th>
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Dias contratados/mês</th>
                  <th className="text-right px-5 py-4 text-sm font-medium text-[#a1a1a1]">Ação</th>
                </tr>
              </thead>
              <tbody>
                {displayStudents.map((student) => {
                  const currentProfessor = getProfessorName(student);
                  return (
                    <tr key={student.id} className="border-b border-[#ffffff10] hover:bg-white/5">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#D4A373]/20 text-[#D4A373] flex items-center justify-center font-bold text-sm">
                            {(student.name || "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-[#f5f5f5] text-sm font-medium">{student.name}</p>
                            {student.email && (
                              <p className="text-[#525252] text-xs">{student.email}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {currentProfessor ? (
                          <span className="text-xs bg-[#D4A373]/20 text-[#D4A373] px-2 py-1 rounded-full">
                            {currentProfessor}
                          </span>
                        ) : (
                          <span className="text-xs text-[#525252]">Sem professor</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <select
                          value={selectedProfessor[student.id] || ""}
                          onChange={(e) =>
                            setSelectedProfessor((prev) => ({
                              ...prev,
                              [student.id]: e.target.value,
                            }))
                          }
                          className="w-full max-w-xs rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                        >
                          <option value="">
                            {currentProfessor ? "Manter ou trocar professor..." : "Selecione um professor..."}
                          </option>
                          {professors.map((professor) => (
                            <option key={professor.id} value={professor.id}>
                              {professor.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-5 py-4">
                        <input
                          value={selectedDays[student.id] || ""}
                          onChange={(e) =>
                            setSelectedDays((prev) => ({
                              ...prev,
                              [student.id]: e.target.value,
                            }))
                          }
                          type="number"
                          min="0"
                          placeholder="Ex.: 8, 12, 16, 20"
                          className="w-full max-w-[190px] rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                        />
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => vincularAluno(student)}
                          disabled={getButtonDisabled(student)}
                          className="bg-[#D4A373] text-[#0a0a0a] text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#c49463] transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {saving === student.id ? "Salvando..." : currentProfessor ? "Salvar" : "Vincular"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {professors.length === 0 && !loading && (
        <div className="mt-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm rounded-lg p-4">
          Nenhum professor encontrado no sistema. Cadastre professores primeiro.
        </div>
      )}

      <p className="text-xs text-[#525252] text-center mt-6">
        {displayStudents.length} aluno(s) - {professors.length} professor(es) disponíveis
      </p>
    </div>
  );
}

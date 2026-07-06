"use client";

import { useEffect, useMemo, useState } from "react";

type Student = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  active?: boolean;
  userId?: string | null;
  professorId?: string | null;
  contractedTrainingDaysPerMonth?: number | null;
  contracted_training_days_per_month?: number | null;
  user?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  professor?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
};

type Teacher = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  active?: boolean;
  role?: string | null;
  cref?: string | null;
  specialty?: string | null;
};

function normalizeStudents(data: any): Student[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.students)) return data.students;
  if (Array.isArray(data?.alunos)) return data.alunos;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;

  return [];
}

function normalizeTeachers(data: any): Teacher[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.teachers)) return data.teachers;
  if (Array.isArray(data?.professores)) return data.professores;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;

  return [];
}

function getProfessorId(student: Student): string {
  return String(
    student.userId ||
      student.professorId ||
      student.user?.id ||
      student.professor?.id ||
      ""
  );
}

function getProfessorName(student: Student, teachers: Teacher[]): string {
  const professorId = getProfessorId(student);
  const teacher = teachers.find((item) => item.id === professorId);

  return (
    teacher?.name ||
    student.user?.name ||
    student.professor?.name ||
    "Sem professor"
  );
}

function getContractedDays(student: Student): string {
  const value =
    student.contractedTrainingDaysPerMonth ??
    student.contracted_training_days_per_month ??
    null;

  if (value === null || value === undefined) return "";

  return String(value);
}

function getInitials(name?: string | null): string {
  const text = String(name || "").trim();

  if (!text) return "?";

  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

function getWeeklyLimit(monthlyDays?: string | number | null): string {
  const value = Number(monthlyDays || 0);

  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value <= 4) return "1 treino/semana";
  if (value <= 8) return "2 treinos/semana";
  if (value <= 16) return "3 treinos/semana";

  return `${Math.ceil(value / 4)} treinos/semana`;
}

export default function VincularAlunosPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedProfessorByStudent, setSelectedProfessorByStudent] = useState<Record<string, string>>({});
  const [daysByStudent, setDaysByStudent] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<"unassigned" | "all">("unassigned");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);

  async function loadData() {
    setLoading(true);
    setMessage(null);

    try {
      const [studentsRes, teachersRes] = await Promise.all([
        fetch("/api/students", {
          cache: "no-store",
        }),
        fetch("/api/teachers?includeInactive=true", {
          cache: "no-store",
        }),
      ]);

      const studentsData = await studentsRes.json().catch(() => null);
      const teachersData = await teachersRes.json().catch(() => null);

      const normalizedStudents = normalizeStudents(studentsData);
      const normalizedTeachers = normalizeTeachers(teachersData).filter(
        (teacher) => teacher.active !== false
      );

      setStudents(normalizedStudents);
      setTeachers(normalizedTeachers);

      const professorMap: Record<string, string> = {};
      const daysMap: Record<string, string> = {};

      normalizedStudents.forEach((student) => {
        professorMap[student.id] = getProfessorId(student);
        daysMap[student.id] = getContractedDays(student);
      });

      setSelectedProfessorByStudent(professorMap);
      setDaysByStudent(daysMap);

      if (!teachersRes.ok) {
        setMessage({
          type: "error",
          text: teachersData?.error || "Não foi possível carregar os professores.",
        });
      } else if (normalizedTeachers.length === 0) {
        setMessage({
          type: "warning",
          text: "Nenhum professor ativo encontrado. Confira se o professor foi cadastrado e se o cadastro está ativo.",
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Erro ao carregar alunos e professores.",
      });
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();

    return students.filter((student) => {
      const professorId = getProfessorId(student);
      const isUnassigned = !professorId;

      if (viewMode === "unassigned" && !isUnassigned) return false;

      if (!term) return true;

      return [
        student.name,
        student.email,
        student.phone,
        getProfessorName(student, teachers),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [students, teachers, search, viewMode]);

  const unassignedCount = students.filter((student) => !getProfessorId(student)).length;

  function updateProfessor(studentId: string, professorId: string) {
    setSelectedProfessorByStudent((current) => ({
      ...current,
      [studentId]: professorId,
    }));
  }

  function updateDays(studentId: string, value: string) {
    const onlyNumbers = value.replace(/\D/g, "");

    setDaysByStudent((current) => ({
      ...current,
      [studentId]: onlyNumbers,
    }));
  }

  async function handleAssign(student: Student) {
    const professorId = selectedProfessorByStudent[student.id] || "";
    const days = daysByStudent[student.id] || "";

    if (!professorId) {
      setMessage({
        type: "error",
        text: "Selecione um professor para vincular o aluno.",
      });
      return;
    }

    if (!days || Number(days) <= 0) {
      setMessage({
        type: "error",
        text: "Informe os dias contratados por mês antes de vincular.",
      });
      return;
    }

    setSavingStudentId(student.id);
    setMessage(null);

    try {
      const res = await fetch("/api/students/assign-professor", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId: student.id,
          professorId,
          contractedTrainingDaysPerMonth: Number(days),
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({
          type: "success",
          text: "Aluno vinculado com sucesso. O professor será notificado quando aplicável.",
        });
        await loadData();
      } else {
        setMessage({
          type: "error",
          text: data?.error || "Erro ao vincular aluno.",
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Erro ao vincular aluno.",
      });
    }

    setSavingStudentId(null);
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <p className="text-xs text-[#D4A373] uppercase tracking-[0.3em] mb-2">
          Gestão de vínculos
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-[#D4A373]">
          Vincular Alunos a Professores
        </h1>
        <p className="text-sm text-[#a1a1a1] mt-2">
          Distribua os alunos entre os professores e registre os dias de treino contratados por mês.
        </p>
      </div>

      {message && (
        <div
          className={
            "rounded-xl px-4 py-3 text-sm border " +
            (message.type === "success"
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : message.type === "warning"
                ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20")
          }
        >
          {message.text}
        </div>
      )}

      <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setViewMode("unassigned")}
              className={
                "px-4 py-2 rounded-xl text-sm font-medium transition " +
                (viewMode === "unassigned"
                  ? "bg-[#D4A373] text-[#0a0a0a]"
                  : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
              }
            >
              Alunos sem professor ({unassignedCount})
            </button>

            <button
              type="button"
              onClick={() => setViewMode("all")}
              className={
                "px-4 py-2 rounded-xl text-sm font-medium transition " +
                (viewMode === "all"
                  ? "bg-[#D4A373] text-[#0a0a0a]"
                  : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
              }
            >
              Todos os alunos ({students.length})
            </button>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="text-xs px-3 py-2 rounded-lg bg-[#1a1a1a] text-[#a1a1a1] hover:text-white border border-[#ffffff10] disabled:opacity-50"
          >
            Atualizar lista
          </button>
        </div>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por aluno, e-mail, telefone ou professor..."
          className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Alunos</p>
            <p className="text-2xl font-bold text-[#f5f5f5]">{students.length}</p>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Sem professor</p>
            <p className="text-2xl font-bold text-yellow-400">{unassignedCount}</p>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Professores ativos</p>
            <p className="text-2xl font-bold text-[#D4A373]">{teachers.length}</p>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Exibidos</p>
            <p className="text-2xl font-bold text-[#f5f5f5]">{filteredStudents.length}</p>
          </div>
        </div>
      </div>

      <div className="bg-[#111] border border-[#ffffff10] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-[#a1a1a1] text-center">
            Carregando alunos e professores...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-8 text-sm text-[#a1a1a1] text-center">
            Nenhum aluno encontrado para este filtro.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-[#151515] border-b border-[#ffffff10]">
                <tr>
                  <th className="px-5 py-4 text-xs font-semibold text-[#a1a1a1]">
                    Aluno
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold text-[#a1a1a1]">
                    Professor atual
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold text-[#a1a1a1]">
                    Vincular / Trocar
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold text-[#a1a1a1]">
                    Dias contratados/mês
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold text-[#a1a1a1]">
                    Meta semanal
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold text-[#a1a1a1] text-right">
                    Ação
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#ffffff10]">
                {filteredStudents.map((student) => {
                  const selectedProfessor = selectedProfessorByStudent[student.id] || "";
                  const days = daysByStudent[student.id] || "";
                  const isSaving = savingStudentId === student.id;

                  return (
                    <tr key={student.id} className="hover:bg-[#ffffff05] transition">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#D4A373]/20 text-[#D4A373] flex items-center justify-center text-sm font-bold">
                            {getInitials(student.name)}
                          </div>

                          <div>
                            <p className="text-sm font-semibold text-[#f5f5f5]">
                              {student.name}
                            </p>
                            <p className="text-xs text-[#6b6b6b]">
                              {student.email || "Sem e-mail"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm text-[#a1a1a1]">
                          {getProfessorName(student, teachers)}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <select
                          value={selectedProfessor}
                          onChange={(event) => updateProfessor(student.id, event.target.value)}
                          className="w-full min-w-[220px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-2.5 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
                        >
                          <option value="">Selecione um professor...</option>

                          {teachers.map((teacher) => (
                            <option key={teacher.id} value={teacher.id}>
                              {teacher.name}
                              {teacher.specialty ? ` · ${teacher.specialty}` : ""}
                              {teacher.cref ? ` · ${teacher.cref}` : ""}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-5 py-4">
                        <input
                          value={days}
                          onChange={(event) => updateDays(student.id, event.target.value)}
                          placeholder="Ex.: 8, 12, 16, 20"
                          inputMode="numeric"
                          className="w-full min-w-[150px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-2.5 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
                        />
                      </td>

                      <td className="px-5 py-4">
                        <span className="text-xs px-3 py-1 rounded-full bg-[#D4A373]/10 text-[#D4A373]">
                          {getWeeklyLimit(days)}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleAssign(student)}
                          disabled={isSaving || teachers.length === 0}
                          className="bg-[#D4A373] text-[#0a0a0a] rounded-xl px-4 py-2.5 font-semibold text-sm hover:bg-[#c49563] transition disabled:opacity-50"
                        >
                          {isSaving ? "Salvando..." : getProfessorId(student) ? "Atualizar" : "Vincular"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {teachers.length === 0 && !loading && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4">
          <p className="text-sm text-yellow-400 font-semibold">
            Nenhum professor ativo encontrado no sistema.
          </p>
          <p className="text-xs text-[#a1a1a1] mt-1">
            Cadastre um professor em <strong>Gerenciar Professores</strong> e confirme se o status está ativo.
            Esta tela busca os professores pela API <code>/api/teachers?includeInactive=true</code>.
          </p>
        </div>
      )}

      <p className="text-xs text-[#6b6b6b] text-center">
        {students.length} aluno(s) · {teachers.length} professor(es) ativo(s) disponíveis
      </p>
    </div>
  );
}

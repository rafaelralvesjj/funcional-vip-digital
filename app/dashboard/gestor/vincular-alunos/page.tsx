"use client";

import { useEffect, useMemo, useState } from "react";

type Student = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  ageYears?: number | null;
  isMinor?: boolean;
  active?: boolean;
  userId?: string | null;
  professorId?: string | null;
  contractedTrainingDaysPerMonth?: number | null;
  contracted_training_days_per_month?: number | null;
  commercialStatus?: string | null;
  commercial_status?: string | null;
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

type ViewMode = "pending" | "linked";

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

function getPossibleProfessorIds(student: Student): string[] {
  return [
    student.professorId,
    student.user?.id,
    student.professor?.id,
    student.userId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function getValidProfessorId(student: Student, teachers: Teacher[]): string {
  const teacherIds = new Set(teachers.map((teacher) => teacher.id));
  const possibleIds = getPossibleProfessorIds(student);

  return possibleIds.find((id) => teacherIds.has(id)) || "";
}

function getProfessorName(student: Student, teachers: Teacher[]): string {
  const professorId = getValidProfessorId(student, teachers);
  const teacher = teachers.find((item) => item.id === professorId);

  return teacher?.name || "Sem professor";
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

function getCommercialStatus(student: Student): string {
  return String(
    student.commercialStatus ||
      student.commercial_status ||
      "SEM_CONTRATO_ATIVO"
  ).toUpperCase();
}

function commercialStatusLabel(student: Student): string {
  const status = getCommercialStatus(student);

  const labels: Record<string, string> = {
    LEAD: "Lead",
    EXPERIENCIA_ATIVA: "Experiência ativa",
    CONTRATO_ATIVO: "Contrato ativo",
    SEM_CONTRATO_ATIVO: "Sem contrato ativo",
    SUSPENSO_POR_PAGAMENTO: "Suspenso por pagamento",
    AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
    AGUARDANDO_ACEITE: "Aguardando aceite",
    INATIVO: "Inativo",
  };

  return labels[status] || status;
}

function isPendingLink(student: Student, teachers: Teacher[]): boolean {
  /*
   * Esta página cuida somente do vínculo professor-aluno.
   *
   * O status comercial aparece no cartão apenas como informação e não deve
   * fazer um aluno já vinculado voltar para a lista de pendentes.
   */
  return !getValidProfessorId(student, teachers);
}

export default function VincularAlunosPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedProfessorByStudent, setSelectedProfessorByStudent] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("pending");
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

      normalizedStudents.forEach((student) => {
        professorMap[student.id] = getValidProfessorId(student, normalizedTeachers);
      });

      setSelectedProfessorByStudent(professorMap);

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
    const params = new URLSearchParams(window.location.search);
    const studentName = params.get("studentName");

    if (studentName) {
      setSearch(studentName);
    }

    setViewMode("pending");
    loadData();
  }, []);

  const pendingStudents = useMemo(() => {
    return students.filter((student) => isPendingLink(student, teachers));
  }, [students, teachers]);

  const linkedStudents = useMemo(() => {
    return students.filter((student) => !isPendingLink(student, teachers));
  }, [students, teachers]);

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = viewMode === "pending" ? pendingStudents : linkedStudents;

    return source.filter((student) => {
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
  }, [pendingStudents, linkedStudents, teachers, search, viewMode]);

  function updateProfessor(studentId: string, professorId: string) {
    setSelectedProfessorByStudent((current) => ({
      ...current,
      [studentId]: professorId,
    }));
  }

  async function handleAssign(student: Student) {
    const professorId = selectedProfessorByStudent[student.id] || "";

    if (!professorId) {
      setMessage({
        type: "error",
        text: "Selecione um professor para vincular o aluno.",
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
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        const recipientName =
          data?.professorNotification?.recipientName || data?.student?.professorName || "o professor";
        const recipientEmail =
          data?.professorNotification?.recipientEmail || data?.student?.professorEmail || null;
        const emailConfirmation = data?.professorNotification?.emailSent
          ? ` Destinatário confirmado: ${recipientName}${recipientEmail ? ` (${recipientEmail})` : ""}.`
          : "";

        setMessage({
          type: "success",
          text:
            `${
              data?.message ||
              "Professor vinculado. Para liberar treinos, crie uma experiência grátis ou contrato no Financeiro."
            }${emailConfirmation}`,
        });
        await loadData();
        setViewMode("pending");
      } else {
        setMessage({
          type: "error",
          text: data?.error || "Erro ao vincular professor.",
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Erro ao vincular professor.",
      });
    }

    setSavingStudentId(null);
  }

  function goToFinanceiro(student: Student) {
    const params = new URLSearchParams({
      studentId: student.id,
      studentName: student.name || "",
    });

    window.location.href = `/dashboard/financeiro?${params.toString()}`;
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <p className="text-xs text-[#22D3EE] uppercase tracking-[0.3em] mb-2">
          Gestão de vínculos
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-[#22D3EE]">
          Vincular Alunos a Professores
        </h1>
        <p className="text-sm text-[#a1a1a1] mt-2">
          Distribua os alunos entre os professores. A lista de pendentes mostra somente quem ainda está sem professor.
          Contrato, experiência e pagamento continuam visíveis no status comercial, mas não alteram o vínculo.
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
              onClick={() => setViewMode("pending")}
              className={
                "px-4 py-2 rounded-xl text-sm font-medium transition " +
                (viewMode === "pending"
                  ? "bg-[#22D3EE] text-[#0a0a0a]"
                  : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
              }
            >
              Sem professor ({pendingStudents.length})
            </button>

            <button
              type="button"
              onClick={() => setViewMode("linked")}
              className={
                "px-4 py-2 rounded-xl text-sm font-medium transition " +
                (viewMode === "linked"
                  ? "bg-[#22D3EE] text-[#0a0a0a]"
                  : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
              }
            >
              Com professor vinculado ({linkedStudents.length})
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
          className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#22D3EE]"
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Alunos</p>
            <p className="text-2xl font-bold text-[#f5f5f5]">{students.length}</p>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Sem professor</p>
            <p className="text-2xl font-bold text-yellow-400">{pendingStudents.length}</p>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Vinculados</p>
            <p className="text-2xl font-bold text-green-400">{linkedStudents.length}</p>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Professores ativos</p>
            <p className="text-2xl font-bold text-[#22D3EE]">{teachers.length}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-8 text-sm text-[#a1a1a1] text-center">
            Carregando alunos e professores...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-8 text-sm text-[#a1a1a1] text-center">
            {viewMode === "pending"
              ? "Nenhum aluno está sem professor."
              : "Nenhum aluno com professor vinculado foi encontrado."}
          </div>
        ) : (
          filteredStudents.map((student) => {
            const selectedProfessor = selectedProfessorByStudent[student.id] || "";
            const isSaving = savingStudentId === student.id;
            const isPending = isPendingLink(student, teachers);

            return (
              <div
                key={student.id}
                className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-[#22D3EE]/20 text-[#22D3EE] flex items-center justify-center text-sm font-bold shrink-0">
                      {getInitials(student.name)}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[#f5f5f5] truncate">
                          {student.name}
                        </p>

                        <span
                          className={
                            "text-[10px] px-2 py-1 rounded-full font-semibold " +
                            (isPending
                              ? "bg-yellow-500/10 text-yellow-400"
                              : "bg-green-500/10 text-green-400")
                          }
                        >
                          {isPending ? "Pendente" : "Vinculado"}
                        </span>
                      </div>

                      <p className="text-xs text-[#6b6b6b] truncate">
                        {student.email || "Sem e-mail"}
                      </p>
                      <p className={"mt-1 text-[11px] " + (student.ageYears === null || student.ageYears === undefined ? "text-red-400" : "text-[#22D3EE]")}>
                        {student.ageYears === null || student.ageYears === undefined
                          ? "Nascimento pendente"
                          : `${student.ageYears} ano(s)${student.isMinor ? " · menor" : ""}`}
                      </p>
                    </div>
                  </div>

                  <div className="lg:text-right">
                    <p className="text-[10px] uppercase text-[#6b6b6b]">
                      Professor atual
                    </p>
                    <p className="text-sm text-[#a1a1a1]">
                      {getProfessorName(student, teachers)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1.3fr)_minmax(140px,0.7fr)_minmax(130px,0.6fr)_auto] gap-3 lg:items-end">
                  <div>
                    <label className="block text-xs text-[#a1a1a1] mb-1">
                      Vincular / Trocar professor
                    </label>
                    <select
                      value={selectedProfessor}
                      onChange={(event) => updateProfessor(student.id, event.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-2.5 text-sm text-[#f5f5f5] outline-none focus:border-[#22D3EE]"
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
                  </div>

                  <div>
                    <label className="block text-xs text-[#a1a1a1] mb-1">
                      Status comercial
                    </label>
                    <div className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-3 py-2.5 text-sm text-[#22D3EE]">
                      {commercialStatusLabel(student)}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row lg:flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => handleAssign(student)}
                      disabled={isSaving || teachers.length === 0}
                      className="w-full lg:w-auto bg-[#22D3EE] text-[#0a0a0a] rounded-xl px-5 py-2.5 font-semibold text-sm hover:bg-[#06B6D4] transition disabled:opacity-50"
                    >
                      {isSaving ? "Salvando..." : isPending ? "Vincular professor" : "Trocar professor"}
                    </button>

                    <button
                      type="button"
                      onClick={() => goToFinanceiro(student)}
                      className="w-full lg:w-auto bg-[#1a1a1a] border border-[#ffffff10] text-[#f5f5f5] rounded-xl px-5 py-2.5 font-semibold text-sm hover:border-[#22D3EE] transition"
                    >
                      Criar contrato
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {teachers.length === 0 && !loading && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4">
          <p className="text-sm text-yellow-400 font-semibold">
            Nenhum professor ativo encontrado no sistema.
          </p>
          <p className="text-xs text-[#a1a1a1] mt-1">
            Cadastre um professor em <strong>Gerenciar Professores</strong> e confirme se o status está ativo.
          </p>
        </div>
      )}

      <p className="text-xs text-[#6b6b6b] text-center">
        {students.length} aluno(s) · {pendingStudents.length} sem professor · {linkedStudents.length} vinculado(s) · {teachers.length} professor(es) ativo(s)
      </p>
    </div>
  );
}

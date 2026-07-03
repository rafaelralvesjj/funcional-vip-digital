"use client";

import { useEffect, useMemo, useState } from "react";

interface Student {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  image?: string | null;
  active?: boolean;
  userId?: string | null;
  userAuthId?: string | null;
  contractedTrainingDaysPerMonth?: number | null;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
}

interface Teacher {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
}

interface StudentFormState {
  name: string;
  email: string;
  phone: string;
  password: string;
  notes: string;
  image: string;
  active: boolean;
  professorId: string;
  contractedTrainingDaysPerMonth: string;
}

const emptyForm: StudentFormState = {
  name: "",
  email: "",
  phone: "",
  password: "",
  notes: "",
  image: "",
  active: true,
  professorId: "",
  contractedTrainingDaysPerMonth: "",
};

function normalizeStudents(data: any): Student[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.students)) return data.students;
  return [];
}

function normalizeTeachers(data: any): Teacher[] {
  const list = Array.isArray(data) ? data : data?.teachers || data?.professores || [];
  return Array.isArray(list) ? list : [];
}

function normalizeRole(role?: string | null) {
  return String(role || "").toUpperCase();
}

export default function GerenciarAlunosPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState<StudentFormState>(emptyForm);
  const [savingEdit, setSavingEdit] = useState(false);

  const [addStudent, setAddStudent] = useState(false);
  const [newForm, setNewForm] = useState<StudentFormState>(emptyForm);
  const [savingAdd, setSavingAdd] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const teacherOptions = useMemo(() => {
    return teachers.filter((teacher) => {
      const role = normalizeRole(teacher.role);
      return !role || role === "PROFESSOR" || role === "TEACHER";
    });
  }, [teachers]);

  const teacherIds = useMemo(() => new Set(teacherOptions.map((teacher) => teacher.id)), [teacherOptions]);

  async function loadData() {
    setLoading(true);
    try {
      const [studentsRes, teachersRes] = await Promise.all([
        fetch("/api/students", { cache: "no-store" }),
        fetch("/api/teachers", { cache: "no-store" }),
      ]);

      if (studentsRes.ok) {
        const data = await studentsRes.json();
        setStudents(normalizeStudents(data));
      } else {
        setStudents([]);
      }

      if (teachersRes.ok) {
        const data = await teachersRes.json();
        setTeachers(normalizeTeachers(data));
      } else {
        setTeachers([]);
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar alunos" });
    } finally {
      setLoading(false);
    }
  }

  function getProfessorName(student: Student): string {
    if (!student.userId || !teacherIds.has(student.userId)) {
      return "Sem professor";
    }

    const professor = teacherOptions.find((teacher) => teacher.id === student.userId);
    return professor?.name || student.user?.name || "Professor";
  }

  function updateNewForm(field: keyof StudentFormState, value: string | boolean) {
    setNewForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateEditForm(field: keyof StudentFormState, value: string | boolean) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }

  function openAddModal() {
    setNewForm(emptyForm);
    setMessage(null);
    setAddStudent(true);
  }

  function abrirEditar(student: Student) {
    setEditStudent(student);
    setEditForm({
      name: student.name || "",
      email: student.email || "",
      phone: student.phone || "",
      password: "",
      notes: student.notes || "",
      image: student.image || "",
      active: student.active !== false,
      professorId: student.userId && teacherIds.has(student.userId) ? student.userId : "",
      contractedTrainingDaysPerMonth:
        student.contractedTrainingDaysPerMonth !== null &&
        student.contractedTrainingDaysPerMonth !== undefined
          ? String(student.contractedTrainingDaysPerMonth)
          : "",
    });
  }

  function buildPayload(form: StudentFormState, includePassword: boolean) {
    return {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      ...(includePassword && { password: form.password }),
      ...(includePassword === false && form.password.trim() ? { password: form.password } : {}),
      notes: form.notes.trim() || null,
      image: form.image.trim() || null,
      active: form.active,
      professorId: form.professorId || null,
      contractedTrainingDaysPerMonth:
        form.contractedTrainingDaysPerMonth.trim() === ""
          ? null
          : Number(form.contractedTrainingDaysPerMonth),
    };
  }

  async function handleAddAluno() {
    if (!newForm.name.trim() || !newForm.email.trim() || !newForm.password.trim()) {
      setMessage({ type: "error", text: "Preencha nome, e-mail e senha inicial." });
      return;
    }

    setSavingAdd(true);
    setMessage(null);

    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(newForm, true)),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Aluno cadastrado com sucesso!" });
        setAddStudent(false);
        setNewForm(emptyForm);
        await loadData();
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: "Erro: " + (err.error || "Erro ao cadastrar") });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao cadastrar aluno" });
    } finally {
      setSavingAdd(false);
    }
  }

  async function salvarEdicao() {
    if (!editStudent) return;

    if (!editForm.name.trim() || !editForm.email.trim()) {
      setMessage({ type: "error", text: "Preencha nome e e-mail." });
      return;
    }

    setSavingEdit(true);
    setMessage(null);

    try {
      const res = await fetch("/api/students/" + editStudent.id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(editForm, false)),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Aluno atualizado com sucesso!" });
        setEditStudent(null);
        await loadData();
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: "Erro: " + (err.error || "Erro ao atualizar") });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao atualizar aluno" });
    } finally {
      setSavingEdit(false);
    }
  }

  async function excluirAluno(studentId: string) {
    setDeleting(studentId);
    setMessage(null);

    try {
      const res = await fetch("/api/students/" + studentId, {
        method: "DELETE",
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Aluno e login excluídos com sucesso!" });
        setStudents((prev) => prev.filter((student) => student.id !== studentId));
        setConfirmDelete(null);
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: "Erro: " + (err.error || "Erro ao excluir") });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao excluir aluno" });
    } finally {
      setDeleting(null);
    }
  }

  function StudentForm({
    form,
    onChange,
    isEdit = false,
  }: {
    form: StudentFormState;
    onChange: (field: keyof StudentFormState, value: string | boolean) => void;
    isEdit?: boolean;
  }) {
    return (
      <div className="space-y-3">
        <input
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="Nome completo"
          className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm outline-none focus:border-[#D4A373]"
        />

        <input
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
          placeholder="E-mail"
          type="email"
          className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm outline-none focus:border-[#D4A373]"
        />

        <input
          value={form.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          placeholder="Telefone"
          className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm outline-none focus:border-[#D4A373]"
        />

        <input
          value={form.password}
          onChange={(e) => onChange("password", e.target.value)}
          placeholder={isEdit ? "Nova senha, se quiser alterar" : "Senha inicial"}
          type="password"
          className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm outline-none focus:border-[#D4A373]"
        />

        <select
          value={form.professorId}
          onChange={(e) => onChange("professorId", e.target.value)}
          className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm outline-none focus:border-[#D4A373]"
        >
          <option value="">Sem professor definido</option>
          {teacherOptions.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name}
            </option>
          ))}
        </select>

        <input
          value={form.contractedTrainingDaysPerMonth}
          onChange={(e) => onChange("contractedTrainingDaysPerMonth", e.target.value)}
          placeholder="Dias contratados por mês. Ex.: 8, 12, 16, 20"
          type="number"
          min="0"
          className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm outline-none focus:border-[#D4A373]"
        />

        <input
          value={form.image}
          onChange={(e) => onChange("image", e.target.value)}
          placeholder="URL da foto/imagem, se houver"
          className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm outline-none focus:border-[#D4A373]"
        />

        <textarea
          value={form.notes}
          onChange={(e) => onChange("notes", e.target.value)}
          placeholder="Observações"
          rows={3}
          className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm outline-none focus:border-[#D4A373] resize-none"
        />

        <label className="flex items-center gap-2 text-sm text-[#a1a1a1]">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => onChange("active", e.target.checked)}
            className="accent-[#D4A373]"
          />
          Aluno ativo
        </label>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#D4A373]">Gerenciar Alunos</h1>
        <p className="text-[#a1a1a1] mt-1">
          Cadastre, edite e exclua alunos do sistema
        </p>
      </div>

      {message && (
        <div className={"text-sm rounded-lg p-4 mb-6 " + (message.type === "success" ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400")}>
          {message.text}
        </div>
      )}

      <div className="mb-4">
        <button
          onClick={openAddModal}
          className="bg-[#D4A373] text-[#0a0a0a] font-semibold rounded-lg px-5 py-3 text-sm transition hover:bg-[#c49563]"
        >
          + Cadastrar Aluno
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#525252]">Carregando...</div>
      ) : students.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[#525252] text-lg">Nenhum aluno cadastrado</p>
        </div>
      ) : (
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="w-full">
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[19%]" />
                <col className="w-[20%]" />
                <col className="w-[13%]" />
                <col className="w-[13%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[18%]" />
              </colgroup>

              <thead>
                <tr className="border-b border-[#ffffff10]">
                  <th className="text-left px-3 py-3 text-xs font-medium text-[#a1a1a1]">Aluno</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-[#a1a1a1]">E-mail</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-[#a1a1a1]">Telefone</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-[#a1a1a1]">Professor</th>
                  <th className="text-left px-2 py-3 text-xs font-medium text-[#a1a1a1] whitespace-nowrap">Dias/mês</th>
                  <th className="text-left px-2 py-3 text-xs font-medium text-[#a1a1a1]">Status</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-[#a1a1a1]">Ações</th>
                </tr>
              </thead>

              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-b border-[#ffffff10] hover:bg-white/5">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#D4A373]/20 text-[#D4A373] flex items-center justify-center font-bold text-xs shrink-0">
                          {(student.name || "?").charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <p className="text-[#f5f5f5] text-sm font-medium truncate">
                            {student.name}
                          </p>

                          {student.notes && (
                            <p className="text-[#525252] text-[11px] truncate">
                              {student.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <p className="text-xs text-[#a1a1a1] truncate">
                        {student.email || "-"}
                      </p>
                    </td>

                    <td className="px-3 py-3">
                      <p className="text-xs text-[#a1a1a1] truncate">
                        {student.phone || "-"}
                      </p>
                    </td>

                    <td className="px-3 py-3">
                      <p className="text-xs text-[#a1a1a1] truncate" title={getProfessorName(student)}>
                        {getProfessorName(student)}
                      </p>
                    </td>

                    <td className="px-2 py-3">
                      <p className="text-xs text-[#a1a1a1] whitespace-nowrap">
                        {student.contractedTrainingDaysPerMonth ?? "-"}
                      </p>
                    </td>

                    <td className="px-2 py-3">
                      <span
                        className={
                          "text-[11px] px-2 py-1 rounded-full whitespace-nowrap " +
                          (student.active === false
                            ? "bg-red-500/10 text-red-400"
                            : "bg-green-500/10 text-green-400")
                        }
                      >
                        {student.active === false ? "Inativo" : "Ativo"}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <button
                          onClick={() => abrirEditar(student)}
                          className="text-[#D4A373] hover:text-[#c49563] text-xs px-2 py-1 rounded hover:bg-[#D4A373]/5 transition"
                        >
                          Editar
                        </button>

                        {confirmDelete === student.id ? (
                          <>
                            <button
                              onClick={() => excluirAluno(student.id)}
                              disabled={deleting === student.id}
                              className="bg-red-500 text-white text-xs font-medium px-2 py-1 rounded hover:bg-red-600 transition disabled:opacity-50"
                              title="Confirmar exclusão"
                            >
                              {deleting === student.id ? "..." : "Sim"}
                            </button>

                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-[#a1a1a1] text-xs px-2 py-1 rounded hover:bg-white/5 transition"
                              title="Cancelar exclusão"
                            >
                              Não
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(student.id)}
                            className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/5 transition"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editStudent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditStudent(null)}>
          <div className="bg-[#1a1a1a] rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-white font-medium mb-4">Editar Aluno</h2>

            <StudentForm form={editForm} onChange={updateEditForm} isEdit />

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setEditStudent(null)}
                className="text-xs text-[#6b6b6b] hover:text-white px-3 py-1.5 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={salvarEdicao}
                disabled={savingEdit}
                className="text-xs bg-[#D4A373] hover:bg-[#c49563] text-black px-4 py-1.5 rounded transition-colors disabled:opacity-50"
              >
                {savingEdit ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {addStudent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { setAddStudent(false); setMessage(null); }}>
          <div className="bg-[#1a1a1a] rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-white font-medium mb-4">Cadastrar Aluno</h2>

            <StudentForm form={newForm} onChange={updateNewForm} />

            <p className="text-[11px] text-[#6b6b6b] mt-3">
              A bioimpedância/anamnese continua separada. Este cadastro cria o login e o registro cadastral do aluno.
            </p>

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => { setAddStudent(false); setMessage(null); }}
                className="text-xs text-[#6b6b6b] hover:text-white px-3 py-1.5 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddAluno}
                disabled={savingAdd}
                className="text-xs bg-[#D4A373] hover:bg-[#c49563] text-black px-4 py-1.5 rounded transition-colors disabled:opacity-50"
              >
                {savingAdd ? "Cadastrando..." : "Cadastrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-[#525252] text-center mt-6">
        {students.length} aluno(s) no total
      </p>
    </div>
  );
}

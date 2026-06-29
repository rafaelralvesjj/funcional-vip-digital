"use client";
import { useEffect, useState } from "react";

interface Student {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export default function GerenciarAlunosPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [addStudent, setAddStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [newStudentPassword, setNewStudentPassword] = useState("");
  const [savingAdd, setSavingAdd] = useState(false);

  useEffect(() => {
    loadStudents();
  }, []);

  async function loadStudents() {
    setLoading(true);
    try {
      const res = await fetch("/api/students");
      if (res.ok) {
        const data = await res.json();
        // Aceita tanto array direto quanto { students: [...] }
        const list = Array.isArray(data) ? data : data.students || [];
        setStudents(list);
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar alunos" });
    } finally {
      setLoading(false);
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
        setMessage({ type: "success", text: "Aluno excluído com sucesso!" });
        setStudents((prev) => prev.filter((s) => s.id !== studentId));
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

  function abrirEditar(student: Student) {
    setEditStudent(student);
    setEditName(student.name);
    setEditEmail(student.email || "");
  }

  async function salvarEdicao() {
    if (!editStudent) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/students/" + editStudent.id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, email: editEmail }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Aluno atualizado com sucesso!" });
        setEditStudent(null);
        loadStudents();
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: "Erro: " + (err.error || "Erro ao atualizar") });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao atualizar aluno" });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddAluno() {
    if (!newStudentName || !newStudentEmail || !newStudentPassword) {
      setMessage({ type: "error", text: "Preencha todos os campos" });
      return;
    }
    setSavingAdd(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newStudentName,
          email: newStudentEmail,
          password: newStudentPassword,
          role: "ALUNO"
        }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Aluno cadastrado com sucesso!" });
        setAddStudent(false);
        setNewStudentName("");
        setNewStudentEmail("");
        setNewStudentPassword("");
        loadStudents();
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
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
        <button onClick={() => setAddStudent(true)} className="bg-[#D4A373] text-[#0a0a0a] font-semibold rounded-lg px-5 py-3 text-sm transition hover:bg-[#c49563]">
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#ffffff10]">
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Aluno</th>
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Email</th>
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Telefone</th>
                  <th className="text-right px-5 py-4 text-sm font-medium text-[#a1a1a1]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-b border-[#ffffff10] hover:bg-white/5">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#D4A373]/20 text-[#D4A373] flex items-center justify-center font-bold text-sm">
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-[#f5f5f5] text-sm font-medium">{student.name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-[#a1a1a1]">
                      {student.email || "-"}
                    </td>
                    <td className="px-5 py-4 text-sm text-[#a1a1a1]">
                      {student.phone || "-"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => abrirEditar(student)}
                          className="text-[#D4A373] hover:text-[#c49563] text-sm px-3 py-1.5 rounded-lg hover:bg-[#D4A373]/5 transition"
                        >
                          Editar
                        </button>
                        {confirmDelete === student.id ? (
                          <>
                            <span className="text-xs text-red-400">Confirmar?</span>
                            <button
                              onClick={() => excluirAluno(student.id)}
                              disabled={deleting === student.id}
                              className="bg-red-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-red-600 transition disabled:opacity-50"
                            >
                              {deleting === student.id ? "..." : "Excluir"}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-[#a1a1a1] text-xs px-3 py-1.5 rounded-lg hover:bg-white/5 transition"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(student.id)}
                            className="text-red-400 hover:text-red-300 text-sm px-3 py-1.5 rounded-lg hover:bg-red-500/5 transition"
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

      {/* Modal de edição */}
      {editStudent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditStudent(null)}>
          <div className="bg-[#1a1a1a] rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-white font-medium mb-4">Editar Aluno</h2>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nome"
              className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-3 outline-none focus:border-[#D4A373]"
            />
            <input
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-4 outline-none focus:border-[#D4A373]"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditStudent(null)} className="text-xs text-[#6b6b6b] hover:text-white px-3 py-1.5 transition-colors">
                Cancelar
              </button>
              <button onClick={salvarEdicao} disabled={saving} className="text-xs bg-[#D4A373] hover:bg-[#c49563] text-black px-4 py-1.5 rounded transition-colors disabled:opacity-50">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de cadastro */}
      {addStudent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { setAddStudent(false); setMessage(null); }}>
          <div className="bg-[#1a1a1a] rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-white font-medium mb-4">Cadastrar Aluno</h2>
            <input
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              placeholder="Nome completo"
              className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-3 outline-none focus:border-[#D4A373]"
            />
            <input
              value={newStudentEmail}
              onChange={(e) => setNewStudentEmail(e.target.value)}
              placeholder="Email"
              type="email"
              className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-3 outline-none focus:border-[#D4A373]"
            />
            <input
              value={newStudentPassword}
              onChange={(e) => setNewStudentPassword(e.target.value)}
              placeholder="Senha"
              type="password"
              className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-4 outline-none focus:border-[#D4A373]"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setAddStudent(false); setMessage(null); }} className="text-xs text-[#6b6b6b] hover:text-white px-3 py-1.5 transition-colors">
                Cancelar
              </button>
              <button onClick={handleAddAluno} disabled={savingAdd} className="text-xs bg-[#D4A373] hover:bg-[#c49563] text-black px-4 py-1.5 rounded transition-colors disabled:opacity-50">
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

"use client";
import { useEffect, useState } from "react";

interface Student {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  image?: string;
  active: boolean;
  createdAt: string;
}

export default function GerenciarAlunosPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    loadStudents();
  }, []);

  async function loadStudents() {
    setLoading(true);
    try {
      const res = await fetch("/api/students/todos");
      if (res.ok) {
        const data = await res.json();
        setStudents(Array.isArray(data) ? data : data.students || data || []);
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
      const res = await fetch(`/api/students/${studentId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Aluno excluido com sucesso!" });
        setStudents((prev) => prev.filter((s) => s.id !== studentId));
        setConfirmDelete(null);
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: "Erro: " + err.error });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao excluir aluno" });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#D4A373]">Gerenciar Alunos</h1>
        <p className="text-[#a1a1a1] mt-1">
          Visualize e exclua alunos do sistema
        </p>
      </div>

      {message && (
        <div className={"text-sm rounded-lg p-4 mb-6 " + (message.type === "success" ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400")}>
          {message.text}
        </div>
      )}

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
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Contato</th>
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Status</th>
                  <th className="text-right px-5 py-4 text-sm font-medium text-[#a1a1a1]">Acoes</th>
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
                      {student.email && <p>{student.email}</p>}
                      {student.phone && <p className="text-xs text-[#525252]">{student.phone}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={"text-xs font-medium px-2 py-1 rounded-full " + (student.active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
                        {student.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {confirmDelete === student.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-red-400">Confirmar exclusao?</span>
                          <button
                            onClick={() => excluirAluno(student.id)}
                            disabled={deleting === student.id}
                            className="bg-red-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-red-600 transition disabled:opacity-50"
                          >
                            {deleting === student.id ? "..." : "Sim, excluir"}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-[#a1a1a1] text-xs px-3 py-1.5 rounded-lg hover:bg-white/5 transition"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(student.id)}
                          className="text-red-400 hover:text-red-300 text-sm px-3 py-1.5 rounded-lg hover:bg-red-500/5 transition"
                        >
                          Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-[#525252] text-center mt-6">
        {students.length} aluno(s) no total
      </p>
    </div>
  );
}

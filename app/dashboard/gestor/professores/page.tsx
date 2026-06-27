"use client";
import { useEffect, useState } from "react";

interface Professor {
  id: string;
  name: string;
  email?: string;
}

export default function GerenciarProfessoresPage() {
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editProfessor, setEditProfessor] = useState<Professor | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfessors();
  }, []);

  async function loadProfessors() {
    setLoading(true);
    try {
      const res = await fetch("/api/professores");
      if (res.ok) {
        const data = await res.json();
        setProfessors(Array.isArray(data) ? data : []);
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar professores" });
    } finally {
      setLoading(false);
    }
  }

  async function excluirProfessor(professorId: string) {
    setDeleting(professorId);
    setMessage(null);

    try {
      const res = await fetch("/api/professores/" + professorId, {
        method: "DELETE",
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Professor excluido com sucesso!" });
        setProfessors((prev) => prev.filter((p) => p.id !== professorId));
        setConfirmDelete(null);
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: "Erro: " + err.error });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao excluir professor" });
    } finally {
      setDeleting(null);
    }
  }

  function abrirEditar(professor: Professor) {
    setEditProfessor(professor);
    setEditName(professor.name);
    setEditEmail(professor.email || "");
  }

  async function salvarEdicao() {
    if (!editProfessor) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/professores/" + editProfessor.id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, email: editEmail }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Professor atualizado com sucesso!" });
        setEditProfessor(null);
        loadProfessors();
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: "Erro: " + err.error });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao atualizar professor" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#D4A373]">Gerenciar Professores</h1>
        <p className="text-[#a1a1a1] mt-1">
          Visualize, edite e exclua professores do sistema
        </p>
      </div>

      {message && (
        <div className={"text-sm rounded-lg p-4 mb-6 " + (message.type === "success" ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400")}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-[#525252]">Carregando...</div>
      ) : professors.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[#525252] text-lg">Nenhum professor cadastrado</p>
        </div>
      ) : (
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#ffffff10]">
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Professor</th>
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Email</th>
                  <th className="text-right px-5 py-4 text-sm font-medium text-[#a1a1a1]">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {professors.map((professor) => (
                  <tr key={professor.id} className="border-b border-[#ffffff10] hover:bg-white/5">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#D4A373]/20 text-[#D4A373] flex items-center justify-center font-bold text-sm">
                          {professor.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-[#f5f5f5] text-sm font-medium">{professor.name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-[#a1a1a1]">
                      {professor.email || "-"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => abrirEditar(professor)}
                          className="text-[#D4A373] hover:text-[#c49563] text-sm px-3 py-1.5 rounded-lg hover:bg-[#D4A373]/5 transition"
                        >
                          Editar
                        </button>
                        {confirmDelete === professor.id ? (
                          <>
                            <span className="text-xs text-red-400">Confirmar?</span>
                            <button
                              onClick={() => excluirProfessor(professor.id)}
                              disabled={deleting === professor.id}
                              className="bg-red-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-red-600 transition disabled:opacity-50"
                            >
                              {deleting === professor.id ? "..." : "Excluir"}
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
                            onClick={() => setConfirmDelete(professor.id)}
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

      {editProfessor && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditProfessor(null)}>
          <div className="bg-[#1a1a1a] rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-white font-medium mb-4">Editar Professor</h2>
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
              <button onClick={() => setEditProfessor(null)} className="text-xs text-[#6b6b6b] hover:text-white px-3 py-1.5 transition-colors">
                Cancelar
              </button>
              <button onClick={salvarEdicao} disabled={saving} className="text-xs bg-[#D4A373] hover:bg-[#c49563] text-black px-4 py-1.5 rounded transition-colors disabled:opacity-50">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-[#525252] text-center mt-6">
        {professors.length} professor(es) no total
      </p>
    </div>
  );
}

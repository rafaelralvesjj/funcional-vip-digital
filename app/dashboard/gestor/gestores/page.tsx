"use client";
import { useEffect, useState } from "react";

interface Gestor {
  id: string;
  name: string;
  email?: string;
}

export default function GerenciarGestoresPage() {
  const [gestores, setGestores] = useState<Gestor[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    loadGestores();
  }, []);

  async function loadGestores() {
    setLoading(true);
    try {
      const res = await fetch("/api/gestores");
      if (res.ok) {
        const data = await res.json();
        setGestores(Array.isArray(data) ? data : []);
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar gestores" });
    } finally {
      setLoading(false);
    }
  }

  async function excluirGestor(gestorId: string) {
    setDeleting(gestorId);
    setMessage(null);

    try {
      const res = await fetch(`/api/gestores/${gestorId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Gestor excluido com sucesso!" });
        setGestores((prev) => prev.filter((g) => g.id !== gestorId));
        setConfirmDelete(null);
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: "Erro: " + err.error });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao excluir gestor" });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#D4A373]">Gerenciar Gestores</h1>
        <p className="text-[#a1a1a1] mt-1">
          Visualize e exclua gestores do sistema
        </p>
      </div>

      {message && (
        <div className={"text-sm rounded-lg p-4 mb-6 " + (message.type === "success" ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400")}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-[#525252]">Carregando...</div>
      ) : gestores.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[#525252] text-lg">Nenhum gestor cadastrado</p>
        </div>
      ) : (
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#ffffff10]">
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Gestor</th>
                  <th className="text-left px-5 py-4 text-sm font-medium text-[#a1a1a1]">Email</th>
                  <th className="text-right px-5 py-4 text-sm font-medium text-[#a1a1a1]">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {gestores.map((gestor) => (
                  <tr key={gestor.id} className="border-b border-[#ffffff10] hover:bg-white/5">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#D4A373]/20 text-[#D4A373] flex items-center justify-center font-bold text-sm">
                          {gestor.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-[#f5f5f5] text-sm font-medium">{gestor.name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-[#a1a1a1]">
                      {gestor.email || "-"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {confirmDelete === gestor.id ? (
                        <div className="flex items-center justify-end gap-2">
       

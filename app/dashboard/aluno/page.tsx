"use client";
import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

function PerfilContent() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get("id");

  const [student, setStudent] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"treinos" | "avisos">("treinos");

  // Modal states
  const [editPlan, setEditPlan] = useState<any>(null);
  const [editNotice, setEditNotice] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const loadData = useCallback(async () => {
    if (!studentId) { setLoading(false); return; }
    try {
      const [studentsRes, plansRes, noticesRes] = await Promise.all([
        fetch("/api/students"),
        fetch(`/api/workout-plan?studentId=${studentId}`),
        fetch(`/api/notices?studentId=${studentId}`)
      ]);

      if (studentsRes.ok) {
        const data = await studentsRes.json();
        const list = Array.isArray(data) ? data : data.students || data || [];
        const found = list.find((s: any) => s.id === studentId);
        if (found) setStudent(found);
      }

      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlans(Array.isArray(data) ? data : []);
      }

      if (noticesRes.ok) {
        const data = await noticesRes.json();
        setNotices(Array.isArray(data) ? data : []);
      }
    } catch {}
    setLoading(false);
  }, [studentId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function deletePlan(id: string) {
    if (!confirm("Excluir este plano de treino?")) return;
    const res = await fetch(`/api/workout-plan?id=${id}`, { method: "DELETE" });
    if (res.ok) setPlans((prev) => prev.filter((p) => p.id !== id));
  }

  async function savePlan() {
    if (!editPlan) return;
    const res = await fetch("/api/workout-plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editPlan.id, name: editName, description: editDescription }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditPlan(null);
    }
  }

  async function deleteNotice(id: string) {
    if (!confirm("Excluir este aviso?")) return;
    const res = await fetch(`/api/notices?id=${id}`, { method: "DELETE" });
    if (res.ok) setNotices((prev) => prev.filter((n) => n.id !== id));
  }

  async function saveNotice() {
    if (!editNotice) return;
    const res = await fetch("/api/notices", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editNotice.id, title: editTitle, content: editContent }),
    });
    if (res.ok) {
      const updated = await res.json();
      setNotices((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setEditNotice(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-6 flex items-center justify-center">
        <p className="text-[#6b6b6b]">Carregando...</p>
      </div>
    );
  }

  if (!studentId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-6 flex items-center justify-center">
        <p className="text-[#6b6b6b]">Nenhum ID de aluno informado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Cabeçalho do Aluno */}
        <h1 className="text-xl font-bold text-[#D4A373]">{student?.name || "Aluno"}</h1>
        <p className="text-sm text-[#a1a1a1] mb-6">ID: {studentId}</p>

        {/* Abas */}
        <div className="flex gap-4 border-b border-[#2a2a2a] mb-6">
          <button onClick={() => setActiveTab("treinos")} className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === "treinos" ? "text-[#D4A373] border-b-2 border-[#D4A373]" : "text-[#6b6b6b] hover:text-[#a1a1a1]"}`}>
            Planos de Treino
          </button>
          <button onClick={() => setActiveTab("avisos")} className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === "avisos" ? "text-[#D4A373] border-b-2 border-[#D4A373]" : "text-[#6b6b6b] hover:text-[#a1a1a1]"}`}>
            Avisos
          </button>
        </div>

        {/* Conteúdo: Treinos */}
        {activeTab === "treinos" && (
          <div>
            {plans.length === 0 ? (
              <p className="text-[#6b6b6b] text-sm">Nenhum plano de treino encontrado.</p>
            ) : (
              <div className="space-y-3">
                {plans.map((plan) => (
                  <div key={plan.id} className="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-medium">{plan.name}</h3>
                      <p className="text-[#6b6b6b] text-xs mt-1">{plan.description || "Sem descrição"} · {plan.exercises?.length || 0} exercícios</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditPlan(plan); setEditName(plan.name); setEditDescription(plan.description || ""); }} className="text-xs bg-[#2a2a2a] hover:bg-[#3a3a3a] text-[#a1a1a1] px-3 py-1.5 rounded transition-colors">Editar</button>
                      <button onClick={() => deletePlan(plan.id)} className="text-xs bg-[#3a1a1a] hover:bg-[#4a2a2a] text-[#ff6b6b] px-3 py-1.5 rounded transition-colors">Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Modal Editar Plano */}
            {editPlan && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditPlan(null)}>
                <div className="bg-[#1a1a1a] rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                  <h2 className="text-white font-medium mb-4">Editar Plano de Treino</h2>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome do plano" className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-3 outline-none focus:border-[#D4A373]" />
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Descrição" rows={3} className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-4 outline-none focus:border-[#D4A373] resize-none" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditPlan(null)} className="text-xs text-[#6b6b6b] hover:text-white px-3 py-1.5 transition-colors">Cancelar</button>
                    <button onClick={savePlan} className="text-xs bg-[#D4A373] hover:bg-[#c49563] text-black px-4 py-1.5 rounded transition-colors">Salvar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Conteúdo: Avisos */}
        {activeTab === "avisos" && (
          <div>
            {notices.length === 0 ? (
              <p className="text-[#6b6b6b] text-sm">Nenhum aviso encontrado.</p>
            ) : (
              <div className="space-y-3">
                {notices.map((notice) => (
                  <div key={notice.id} className="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-medium">{notice.title || "Sem título"}</h3>
                      <p className="text-[#6b6b6b] text-xs mt-1">{notice.content?.substring(0, 80)}{notice.content?.length > 80 ? "..." : ""} · {new Date(notice.createdAt).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditNotice(notice); setEditTitle(notice.title || ""); setEditContent(notice.content); }} className="text-xs bg-[#2a2a2a] hover:bg-[#3a3a3a] text-[#a1a1a1] px-3 py-1.5 rounded transition-colors">Editar</button>
                      <button onClick={() => deleteNotice(notice.id)} className="text-xs bg-[#3a1a1a] hover:bg-[#4a2a2a] text-[#ff6b6b] px-3 py-1.5 rounded transition-colors">Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Modal Editar Aviso */}
            {editNotice && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditNotice(null)}>
                <div className="bg-[#1a1a1a] rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                  <h2 className="text-white font-medium mb-4">Editar Aviso</h2>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Título" className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-3 outline-none focus:border-[#D4A373]" />
                  <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} placeholder="Conteúdo" rows={3} className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-4 outline-none focus:border-[#D4A373] resize-none" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditNotice(null)} className="text-xs text-[#6b6b6b] hover:text-white px-3 py-1.5 transition-colors">Cancelar</button>
                    <button onClick={saveNotice} className="text-xs bg-[#D4A373] hover:bg-[#c49563] text-black px-4 py-1.5 rounded transition-colors">Salvar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PerfilAlunoPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] p-6 flex items-center justify-center">
        <p className="text-[#6b6b6b]">Carregando...</p>
      </div>
    }>
      <PerfilContent />
    </Suspense>
  );
}

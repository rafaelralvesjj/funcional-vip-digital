"use client";
import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
function PerfilContent() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get("id");
  const [student, setStudent] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"treinos" | "avisos" | "duvidas">("treinos");
  const [editPlan, setEditPlan] = useState<any>(null);
  const [editNotice, setEditNotice] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [answerText, setAnswerText] = useState("");
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [sendingAnswer, setSendingAnswer] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<any>(null);
  const loadData = useCallback(async () => {
    if (!studentId) { setLoading(false); return; }
    try {
      const sessionRes = await fetch("/api/auth/session");
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        setCurrentUserRole(session?.user?.role || "");
        setCurrentUserId(session?.user?.id || "");
      }
      const [studentsRes, plansRes, noticesRes, workoutsRes, questionsRes] = await Promise.all([
        fetch("/api/students"),
        fetch("/api/workout-plan?studentId=" + studentId),
        fetch("/api/notices?studentId=" + studentId),
        fetch("/api/workout/mark-complete?studentId=" + studentId),
        fetch("/api/aluno/questions?studentId=" + studentId)
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
      if (workoutsRes.ok) {
        const data = await workoutsRes.json();
        setWorkouts(Array.isArray(data) ? data : []);
      }
      if (questionsRes.ok) {
        const data = await questionsRes.json();
        setQuestions(Array.isArray(data) ? data : []);
      }
    } catch {}
    setLoading(false);
  }, [studentId]);
  useEffect(() => { loadData(); }, [loadData]);
  function isPlanCompleted(planId: string): boolean {
    return workouts.some((w: any) => w.workoutPlanId === planId && w.status === "CONCLUIDO");
  }
  function canEditOrDelete(notice: any): boolean {
    return currentUserRole === "GESTOR" || notice.authorId === currentUserId;
  }
  async function deletePlan(id: string) {
    if (!confirm("Excluir este plano de treino?")) return;
    const res = await fetch("/api/workout-plan?id=" + id, { method: "DELETE" });
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
    const res = await fetch("/api/notices?id=" + id, { method: "DELETE" });
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
  async function handleAnswer(questionId: string) {
    if (!answerText.trim()) return;
    setSendingAnswer(true);
    try {
      const res = await fetch("/api/aluno/questions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: questionId, answer: answerText.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setQuestions((prev) => prev.map((q) => (q.id === questionId ? updated : q)));
        setAnswerText("");
        setAnsweringId(null);
        setSelectedQuestion(null);
      }
    } catch {}
    setSendingAnswer(false);
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
        <h1 className="text-xl font-bold text-[#D4A373]">{student?.name || "Aluno"}</h1>
        <p className="text-sm text-[#6b6b6b] mb-6">Bem vindo ao perfil do aluno!</p>
        <div className="flex gap-4 border-b border-[#2a2a2a] mb-6">
          <button onClick={() => setActiveTab("treinos")} className={"pb-2 px-4 text-sm font-medium transition-colors " + (activeTab === "treinos" ? "text-[#D4A373] border-b-2 border-[#D4A373]" : "text-[#6b6b6b] hover:text-[#a1a1a1]")}>
            Planos de Treino
          </button>
          <button onClick={() => setActiveTab("avisos")} className={"pb-2 px-4 text-sm font-medium transition-colors " + (activeTab === "avisos" ? "text-[#D4A373] border-b-2 border-[#D4A373]" : "text-[#6b6b6b] hover:text-[#a1a1a1]")}>
            Avisos
          </button>
          <button onClick={() => setActiveTab("duvidas")} className={"pb-2 px-4 text-sm font-medium transition-colors " + (activeTab === "duvidas" ? "text-[#D4A373] border-b-2 border-[#D4A373]" : "text-[#6b6b6b] hover:text-[#a1a1a1]")}>
            Duvidas {questions.filter((q: any) => !q.answer).length > 0 && (
              <span className="ml-1 bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {questions.filter((q: any) => !q.answer).length}
              </span>
            )}
          </button>
        </div>
        {activeTab === "treinos" && (
          <div>
            {plans.length === 0 ? (
              <p className="text-[#6b6b6b] text-sm">Nenhum plano de treino encontrado.</p>
            ) : (
              <div className="space-y-3">
                {plans.map((plan) => {
                  const completed = isPlanCompleted(plan.id);
                  return (
                    <div key={plan.id} className="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-start gap-3">
                        <div className={"w-3 h-3 rounded-full mt-1 shrink-0 " + (completed ? "bg-green-500" : "bg-[#525252]")} />
                        <div>
                          <h3 className="text-white font-medium">
                            {plan.name}
                            {completed && <span className="text-green-400 text-[10px] ml-2">Concluido</span>}
                            <span className="text-[#6b6b6b] text-xs font-normal ml-2">{plan.date ? new Date(plan.date).toLocaleDateString("pt-BR") : "Sem data"}</span>
                          </h3>
                          <p className="text-[#6b6b6b] text-xs mt-1">{plan.description || "Sem descricao"} - {plan.exercises?.length || 0} exercicios</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditPlan(plan); setEditName(plan.name); setEditDescription(plan.description || ""); }} className="text-xs bg-[#2a2a2a] hover:bg-[#3a3a3a] text-[#a1a1a1] px-3 py-1.5 rounded transition-colors">Editar</button>
                        <button onClick={() => deletePlan(plan.id)} className="text-xs bg-[#3a1a1a] hover:bg-[#4a2a2a] text-[#ff6b6b] px-3 py-1.5 rounded transition-colors">Excluir</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {editPlan && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditPlan(null)}>
                <div className="bg-[#1a1a1a] rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                  <h2 className="text-white font-medium mb-4">Editar Plano de Treino</h2>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome do plano" className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-3 outline-none focus:border-[#D4A373]" />
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Descricao" rows={3} className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-4 outline-none focus:border-[#D4A373] resize-none" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditPlan(null)} className="text-xs text-[#6b6b6b] hover:text-white px-3 py-1.5 transition-colors">Cancelar</button>
                    <button onClick={savePlan} className="text-xs bg-[#D4A373] hover:bg-[#c49563] text-black px-4 py-1.5 rounded transition-colors">Salvar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === "avisos" && (
          <div>
            {notices.length === 0 ? (
              <p className="text-[#6b6b6b] text-sm">Nenhum aviso encontrado.</p>
            ) : (
              <div className="space-y-3">
                {notices.map((notice) => (
                  <div key={notice.id} className="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <div className={"w-3 h-3 rounded-full mt-1 shrink-0 " + (notice.readByStudent ? "bg-[#525252]" : "bg-green-500")} />
                      <div>
                        <h3 className="text-white font-medium">{notice.title || "Sem titulo"}</h3>
                        <p className="text-[#6b6b6b] text-xs mt-1">{notice.content?.substring(0, 80)}{notice.content?.length > 80 ? "..." : ""} - {new Date(notice.createdAt).toLocaleDateString("pt-BR")}</p>
                        {notice.author && (
                          <p className="text-[10px] text-[#6b6b6b] mt-1">
                            Enviado por: {notice.author.name}
                            {notice.author.role && (
                              <span className={"ml-1 px-1 py-0.5 rounded text-[9px] " + (notice.author.role === "GESTOR" ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-400")}>
                                {notice.author.role === "GESTOR" ? "Gestao" : "Professor"}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    {canEditOrDelete(notice) && (
                      <div className="flex gap-2">
                        <button onClick={() => { setEditNotice(notice); setEditTitle(notice.title || ""); setEditContent(notice.content); }} className="text-xs bg-[#2a2a2a] hover:bg-[#3a3a3a] text-[#a1a1a1] px-3 py-1.5 rounded transition-colors">Editar</button>
                        <button onClick={() => deleteNotice(notice.id)} className="text-xs bg-[#3a1a1a] hover:bg-[#4a2a2a] text-[#ff6b6b] px-3 py-1.5 rounded transition-colors">Excluir</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {editNotice && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditNotice(null)}>
                <div className="bg-[#1a1a1a] rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                  <h2 className="text-white font-medium mb-4">Editar Aviso</h2>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Titulo" className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-3 outline-none focus:border-[#D4A373]" />
                  <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} placeholder="Conteudo" rows={3} className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm mb-4 outline-none focus:border-[#D4A373] resize-none" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditNotice(null)} className="text-xs text-[#6b6b6b] hover:text-white px-3 py-1.5 transition-colors">Cancelar</button>
                    <button onClick={saveNotice} className="text-xs bg-[#D4A373] hover:bg-[#c49563] text-black px-4 py-1.5 rounded transition-colors">Salvar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === "duvidas" && (
          <div>
            {questions.length === 0 ? (
              <p className="text-[#6b6b6b] text-sm">Nenhuma duvida enviada pelo aluno.</p>
            ) : (
              <div className="space-y-3">
                {questions.map((q) => (
                  <div key={q.id} className="bg-[#1a1a1a] rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className={"w-3 h-3 rounded-full mt-1 shrink-0 " + (q.answer ? "bg-blue-500" : "bg-green-500")} />
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-white text-sm">{q.content}</p>
                            <p className="text-[10px] text-[#6b6b6b] mt-1">
                              {new Date(q.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                            {/* ANEXOS */}
                            {(q.imageUrl || q.videoUrl) && (
                              <div className="mt-2 flex gap-2">
                                {q.imageUrl && (
                                  <a href={q.imageUrl} target="_blank" className="text-[10px] text-blue-400 hover:text-blue-300 underline flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    Ver imagem
                                  </a>
                                )}
                                {q.videoUrl && (
                                  <a href={q.videoUrl} target="_blank" className="text-[10px] text-blue-400 hover:text-blue-300 underline flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Ver video
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                          <span className={"text-[10px] px-2 py-0.5 rounded shrink-0 " + (q.answer ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-400")}>
                            {q.answer ? "Respondida" : "Pendente"}
                          </span>
                        </div>
                        {/* RESPOSTA */}
                        {q.answer && (
                          <div className="mt-2 ml-4 pl-3 border-l-2 border-[#D4A373]/30">
                            <p className="text-xs text-[#D4A373] font-medium">Resposta:</p>
                            <p className="text-xs text-[#e5e5e5] mt-0.5">{q.answer}</p>
                            {q.answeredBy && (
                              <p className="text-[9px] text-[#6b6b6b] mt-0.5">
                                Respondido por: {q.answeredBy.name}
                                {q.answeredAt && " em " + new Date(q.answeredAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            )}
                          </div>
                        )}
                        {/* BOTAO RESPONDER */}
                        {!q.answer && (
                          <div className="mt-2">
                            {answeringId === q.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={answerText}
                                  onChange={(e) => setAnswerText(e.target.value)}
                                  placeholder="Digite sua resposta..."
                                  rows={3}
                                  className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded px-3 py-2 text-sm outline-none focus:border-[#D4A373] resize-none"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleAnswer(q.id)}
                                    disabled={sendingAnswer || !answerText.trim()}
                                    className="text-xs bg-[#D4A373] hover:bg-[#c49563] text-black px-4 py-1.5 rounded transition-colors disabled:opacity-50"
                                  >
                                    {sendingAnswer ? "Enviando..." : "Responder"}
                                  </button>
                                  <button
                                    onClick={() => { setAnsweringId(null); setAnswerText(""); }}
                                    className="text-xs text-[#6b6b6b] hover:text-white px-3 py-1.5 transition-colors"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setAnsweringId(q.id); setAnswerText(""); }}
                                className="text-xs bg-[#D4A373] hover:bg-[#c49563] text-black px-4 py-1.5 rounded transition-colors"
                              >
                                Responder
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
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

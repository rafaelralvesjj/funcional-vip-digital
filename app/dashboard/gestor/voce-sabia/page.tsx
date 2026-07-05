"use client";

import { useEffect, useMemo, useState } from "react";

type DidYouKnowContent = {
  id: string;
  title: string;
  content: string;
  category: string;
  active: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  type: "success" | "error" | "info";
  text: string;
};

const categories = [
  "CONSTANCIA",
  "TREINO",
  "RECUPERACAO",
  "HIDRATACAO",
  "NUTRICAO",
  "SONO",
  "HABITOS",
  "EVOLUCAO",
  "ACOMPANHAMENTO",
  "MOTIVACAO",
  "GERAL",
];

const emptyForm = {
  id: "",
  title: "",
  content: "",
  category: "GERAL",
  priority: 0,
  active: true,
};

export default function GestorVoceSabiaPage() {
  const [contents, setContents] = useState<DidYouKnowContent[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [filter, setFilter] = useState<"TODOS" | "ATIVOS" | "INATIVOS">("TODOS");

  const filteredContents = useMemo(() => {
    if (filter === "ATIVOS") return contents.filter((item) => item.active);
    if (filter === "INATIVOS") return contents.filter((item) => !item.active);

    return contents;
  }, [contents, filter]);

  useEffect(() => {
    fetchContents();
  }, []);

  async function fetchContents() {
    setLoading(true);

    try {
      const res = await fetch("/api/did-you-know", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao carregar conteúdos");
      }

      setContents(Array.isArray(data.contents) ? data.contents : []);
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error?.message || "Erro ao carregar conteúdos",
      });
    }

    setLoading(false);
  }

  function resetForm() {
    setForm(emptyForm);
  }

  function editContent(item: DidYouKnowContent) {
    setForm({
      id: item.id,
      title: item.title,
      content: item.content,
      category: item.category || "GERAL",
      priority: item.priority || 0,
      active: item.active,
    });

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function saveContent() {
    if (!form.title.trim() || !form.content.trim()) {
      setMessage({ type: "error", text: "Preencha título e conteúdo." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const isEditing = Boolean(form.id);
      const res = await fetch("/api/did-you-know", {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao salvar conteúdo");
      }

      setMessage({
        type: "success",
        text: isEditing ? "Conteúdo atualizado." : "Conteúdo criado.",
      });

      resetForm();
      await fetchContents();
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error?.message || "Erro ao salvar conteúdo",
      });
    }

    setSaving(false);
  }

  async function toggleActive(item: DidYouKnowContent) {
    try {
      const res = await fetch("/api/did-you-know", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          active: !item.active,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao atualizar status");
      }

      await fetchContents();
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error?.message || "Erro ao atualizar status",
      });
    }
  }

  async function inactivateContent(item: DidYouKnowContent) {
    const confirmed = window.confirm(
      "Deseja inativar este conteúdo? Ele não será mais enviado automaticamente."
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/did-you-know?id=${item.id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao inativar conteúdo");
      }

      await fetchContents();
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error?.message || "Erro ao inativar conteúdo",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-[#D4A373] font-semibold">
          Gestão de conteúdo
        </p>
        <h1 className="text-2xl font-bold text-[#f5f5f5] mt-2">
          Você sabia?
        </h1>
        <p className="text-sm text-[#a1a1a1] mt-1 max-w-3xl">
          Cadastre conteúdos educativos que serão enviados automaticamente aos alunos uma vez por semana. O sistema evita repetir o mesmo conteúdo para o mesmo aluno até concluir o ciclo.
        </p>
      </div>

      {message && (
        <div
          className={
            "rounded-xl border px-4 py-3 text-sm " +
            (message.type === "success"
              ? "bg-green-500/10 border-green-500/20 text-green-400"
              : message.type === "error"
                ? "bg-red-500/10 border-red-500/20 text-red-400"
                : "bg-blue-500/10 border-blue-500/20 text-blue-400")
          }
        >
          {message.text}
        </div>
      )}

      <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#f5f5f5]">
              {form.id ? "Editar conteúdo" : "Novo conteúdo"}
            </h2>
            <p className="text-xs text-[#6b6b6b] mt-1">
              Use linguagem simples, educativa e motivadora.
            </p>
          </div>

          {form.id && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-[#a1a1a1] hover:text-white transition"
            >
              Cancelar edição
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs text-[#a1a1a1] mb-1">
              Título
            </label>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Ex.: Você sabia que o descanso também faz parte do treino?"
              className="w-full rounded-xl border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] placeholder-[#525252] outline-none focus:border-[#D4A373]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#a1a1a1] mb-1">
              Tema
            </label>
            <select
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              className="w-full rounded-xl border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-[#a1a1a1] mb-1">
            Conteúdo
          </label>
          <textarea
            value={form.content}
            onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
            placeholder="Escreva o conteúdo educativo que será enviado ao aluno."
            className="w-full min-h-[130px] rounded-xl border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] placeholder-[#525252] outline-none focus:border-[#D4A373] resize-y"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs text-[#a1a1a1] mb-1">
              Prioridade
            </label>
            <input
              type="number"
              value={form.priority}
              onChange={(event) => setForm((prev) => ({ ...prev, priority: Number(event.target.value) }))}
              className="w-full rounded-xl border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[#a1a1a1]">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
              className="h-4 w-4 accent-[#D4A373]"
            />
            Ativo para envio automático
          </label>

          <button
            type="button"
            onClick={saveContent}
            disabled={saving}
            className="bg-[#D4A373] text-[#0a0a0a] font-semibold rounded-xl px-4 py-2 text-sm hover:bg-[#c49563] transition disabled:opacity-60"
          >
            {saving ? "Salvando..." : form.id ? "Salvar alterações" : "Cadastrar conteúdo"}
          </button>
        </div>
      </div>

      <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-[#f5f5f5]">
              Conteúdos cadastrados
            </h2>
            <p className="text-xs text-[#6b6b6b] mt-1">
              {contents.filter((item) => item.active).length} ativo(s) de {contents.length} cadastrado(s).
            </p>
          </div>

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as any)}
            className="rounded-xl border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
          >
            <option value="TODOS">Todos</option>
            <option value="ATIVOS">Ativos</option>
            <option value="INATIVOS">Inativos</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-[#a1a1a1]">Carregando...</p>
        ) : filteredContents.length === 0 ? (
          <p className="text-sm text-[#a1a1a1]">Nenhum conteúdo encontrado.</p>
        ) : (
          <div className="space-y-3">
            {filteredContents.map((item) => (
              <div key={item.id} className="border border-[#ffffff10] rounded-xl p-4 bg-[#1a1a1a]">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        className={
                          "text-[10px] px-2 py-0.5 rounded-full " +
                          (item.active
                            ? "bg-green-500/10 text-green-400"
                            : "bg-zinc-700 text-zinc-400")
                        }
                      >
                        {item.active ? "ATIVO" : "INATIVO"}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D4A373]/10 text-[#D4A373]">
                        {item.category}
                      </span>
                      <span className="text-[10px] text-[#6b6b6b]">
                        Prioridade {item.priority || 0}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-[#f5f5f5]">
                      {item.title}
                    </h3>
                    <p className="text-xs text-[#a1a1a1] mt-2 whitespace-pre-line">
                      {item.content}
                    </p>
                  </div>

                  <div className="flex md:flex-col gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => editContent(item)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-[#ffffff10] text-[#D4A373] hover:bg-[#D4A373]/10 transition"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(item)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-[#ffffff10] text-[#a1a1a1] hover:text-white hover:bg-white/5 transition"
                    >
                      {item.active ? "Inativar" : "Ativar"}
                    </button>
                    {item.active && (
                      <button
                        type="button"
                        onClick={() => inactivateContent(item)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

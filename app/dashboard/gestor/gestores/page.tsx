"use client";

import { useEffect, useMemo, useState } from "react";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  document?: string | null;
  birthDate?: string | null;
  cref?: string | null;
  specialty?: string | null;
  education?: string | null;
  experience?: string | null;
  bio?: string | null;
  active?: boolean;
  role?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type FormState = {
  id: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  document: string;
  birthDate: string;
  cref: string;
  specialty: string;
  education: string;
  experience: string;
  bio: string;
  active: boolean;
};

const emptyForm: FormState = {
  id: "",
  name: "",
  email: "",
  password: "",
  phone: "",
  document: "",
  birthDate: "",
  cref: "",
  specialty: "",
  education: "",
  experience: "",
  bio: "",
  active: true,
};

function normalizeList(data: any): ManagedUser[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.managers)) return data.managers;
  if (Array.isArray(data?.gestores)) return data.gestores;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;

  return [];
}

function formatDate(value?: string | null): string {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function userToForm(user: ManagedUser): FormState {
  return {
    id: user.id,
    name: user.name || "",
    email: user.email || "",
    password: "",
    phone: user.phone || "",
    document: user.document || "",
    birthDate: user.birthDate || "",
    cref: user.cref || "",
    specialty: user.specialty || "",
    education: user.education || "",
    experience: user.experience || "",
    bio: user.bio || "",
    active: user.active !== false,
  };
}

export default function GerenciarGestorPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isEditing = Boolean(form.id);

  async function loadUsers() {
    setLoading(true);

    try {
      const res = await fetch("/api/managers?includeInactive=true", {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setUsers(normalizeList(data));
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao carregar dados." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar dados." });
    }

    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return users.filter((user) => {
      if (!showInactive && user.active === false) return false;

      if (!term) return true;

      return [
        user.name,
        user.email,
        user.phone,
        user.document,
        user.cref,
        user.specialty,
        user.education,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [users, search, showInactive]);

  function openCreateModal() {
    setForm(emptyForm);
    setMessage(null);
    setShowModal(true);
  }

  function openEditModal(user: ManagedUser) {
    setForm(userToForm(user));
    setMessage(null);
    setShowModal(true);
  }

  function closeModal() {
    if (saving) return;

    setShowModal(false);
    setForm(emptyForm);
  }

  function updateField(field: keyof FormState, value: string | boolean) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!form.name.trim()) {
      setMessage({ type: "error", text: "Nome completo é obrigatório." });
      return;
    }

    if (!form.email.trim()) {
      setMessage({ type: "error", text: "E-mail é obrigatório." });
      return;
    }

    if (!isEditing && form.password.trim().length < 6) {
      setMessage({ type: "error", text: "Senha obrigatória com pelo menos 6 caracteres." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        ...form,
        password: form.password.trim(),
      };

      const res = await fetch("/api/managers", {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({
          type: "success",
          text: isEditing ? "Gestor atualizado com sucesso." : "Gestor cadastrado com sucesso.",
        });
        setShowModal(false);
        setForm(emptyForm);
        await loadUsers();
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao salvar cadastro." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao salvar cadastro." });
    }

    setSaving(false);
  }

  async function handleDeactivate(user: ManagedUser) {
    const ok = window.confirm("Deseja desativar este gestor? O histórico será preservado.");

    if (!ok) return;

    setMessage(null);

    try {
      const res = await fetch(`/api/managers?id=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({ type: "success", text: data?.message || "Gestor desativado com segurança." });
        await loadUsers();
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao desativar cadastro." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao desativar cadastro." });
    }
  }

  async function handleReactivate(user: ManagedUser) {
    setMessage(null);

    try {
      const res = await fetch("/api/managers", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...user,
          active: true,
          password: "",
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setMessage({ type: "success", text: "Gestor reativado com sucesso." });
        await loadUsers();
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao reativar cadastro." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao reativar cadastro." });
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-xs text-[#00A19C] uppercase tracking-[0.3em] mb-2">
            Gestão de acessos
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-[#00A19C]">
            Gerenciar Gestores
          </h1>
          <p className="text-sm text-[#a1a1a1] mt-2">
            Cadastre, edite e desative gestores do sistema.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="bg-[#00A19C] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#008B87] transition"
        >
          + Cadastrar Gestor
        </button>
      </div>

      {message && (
        <div
          className={
            "rounded-xl px-4 py-3 text-sm " +
            (message.type === "success"
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20")
          }
        >
          {message.text}
        </div>
      )}

      <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 md:items-center">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, e-mail, telefone, documento, registro ou especialidade..."
            className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
          />

          <label className="flex items-center gap-2 text-xs text-[#a1a1a1]">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
              className="accent-[#00A19C]"
            />
            Mostrar inativos
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Total</p>
            <p className="text-2xl font-bold text-[#f5f5f5]">{users.length}</p>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Ativos</p>
            <p className="text-2xl font-bold text-green-400">
              {users.filter((user) => user.active !== false).length}
            </p>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Inativos</p>
            <p className="text-2xl font-bold text-red-400">
              {users.filter((user) => user.active === false).length}
            </p>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-4">
            <p className="text-[10px] uppercase text-[#6b6b6b]">Exibidos</p>
            <p className="text-2xl font-bold text-[#00A19C]">{filteredUsers.length}</p>
          </div>
        </div>
      </div>

      <div className="bg-[#111] border border-[#ffffff10] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-[#a1a1a1] text-center">
            Carregando cadastros...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-sm text-[#a1a1a1] text-center">
            Nenhum gestor cadastrado.
          </div>
        ) : (
          <div className="divide-y divide-[#ffffff10]">
            {filteredUsers.map((user) => (
              <div key={user.id} className="p-5 hover:bg-[#ffffff05] transition">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-[#f5f5f5]">
                        {user.name}
                      </h2>

                      <span
                        className={
                          "text-[10px] px-2 py-1 rounded-full font-semibold " +
                          (user.active === false
                            ? "bg-red-500/10 text-red-400"
                            : "bg-green-500/10 text-green-400")
                        }
                      >
                        {user.active === false ? "Inativo" : "Ativo"}
                      </span>

                      {user.cref && (
                        <span className="text-[10px] px-2 py-1 rounded-full bg-[#00A19C]/10 text-[#00A19C]">
                          {user.cref}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs text-[#a1a1a1]">
                      <p>
                        <span className="text-[#6b6b6b]">E-mail:</span> {user.email || "-"}
                      </p>
                      <p>
                        <span className="text-[#6b6b6b]">Telefone:</span> {user.phone || "-"}
                      </p>
                      <p>
                        <span className="text-[#6b6b6b]">Documento:</span> {user.document || "-"}
                      </p>
                      <p>
                        <span className="text-[#6b6b6b]">Cargo/função:</span> {user.specialty || "-"}
                      </p>
                      <p>
                        <span className="text-[#6b6b6b]">Área de atuação:</span> {user.education || "-"}
                      </p>
                      <p>
                        <span className="text-[#6b6b6b]">Cadastro:</span> {formatDate(user.createdAt)}
                      </p>
                    </div>

                    {user.experience && (
                      <p className="text-xs text-[#a1a1a1] max-w-3xl">
                        <span className="text-[#6b6b6b]">Responsabilidades:</span> {user.experience}
                      </p>
                    )}

                    {user.bio && (
                      <p className="text-xs text-[#a1a1a1] max-w-3xl">
                        <span className="text-[#6b6b6b]">Observações:</span> {user.bio}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openEditModal(user)}
                      className="text-xs px-3 py-2 rounded-lg bg-[#1a1a1a] text-[#a1a1a1] hover:text-white border border-[#ffffff10]"
                    >
                      Editar
                    </button>

                    {user.active === false ? (
                      <button
                        onClick={() => handleReactivate(user)}
                        className="text-xs px-3 py-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20"
                      >
                        Reativar
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDeactivate(user)}
                        className="text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      >
                        Desativar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#ffffff10] rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
            <form onSubmit={handleSubmit} className="p-5 md:p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-[#f5f5f5]">
                    {isEditing ? "Editar Gestor" : "Cadastrar Gestor"}
                  </h2>
                  <p className="text-xs text-[#a1a1a1] mt-1">
                    Preencha os dados principais para deixar o cadastro mais completo e profissional.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="text-[#6b6b6b] hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#a1a1a1] block mb-1">
                    Nome completo *
                  </label>
                  <input
                    value={form.name}
                    onChange={(event) => updateField("name", event.target.value)}
                    placeholder="Nome completo"
                    className="w-full bg-[#111] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#a1a1a1] block mb-1">
                    E-mail de acesso *
                  </label>
                  <input
                    value={form.email}
                    onChange={(event) => updateField("email", event.target.value)}
                    placeholder="email@exemplo.com"
                    type="email"
                    className="w-full bg-[#111] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#a1a1a1] block mb-1">
                    Senha {isEditing ? "(preencha somente se quiser alterar)" : "*"}
                  </label>
                  <input
                    value={form.password}
                    onChange={(event) => updateField("password", event.target.value)}
                    placeholder={isEditing ? "Deixe em branco para manter a senha atual" : "Mínimo 6 caracteres"}
                    type="password"
                    className="w-full bg-[#111] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#a1a1a1] block mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    value={form.phone}
                    onChange={(event) => updateField("phone", event.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full bg-[#111] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#a1a1a1] block mb-1">
                    CPF / Documento
                  </label>
                  <input
                    value={form.document}
                    onChange={(event) => updateField("document", event.target.value)}
                    placeholder="CPF ou documento"
                    className="w-full bg-[#111] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#a1a1a1] block mb-1">
                    Data de nascimento
                  </label>
                  <input
                    value={form.birthDate}
                    onChange={(event) => updateField("birthDate", event.target.value)}
                    type="date"
                    className="w-full bg-[#111] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#a1a1a1] block mb-1">
                    Registro interno
                  </label>
                  <input
                    value={form.cref}
                    onChange={(event) => updateField("cref", event.target.value)}
                    placeholder="Ex.: matrícula, código interno ou deixe em branco"
                    className="w-full bg-[#111] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#a1a1a1] block mb-1">
                    Cargo/função
                  </label>
                  <input
                    value={form.specialty}
                    onChange={(event) => updateField("specialty", event.target.value)}
                    placeholder="Ex.: gestor operacional, administrador, coordenação"
                    className="w-full bg-[#111] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#a1a1a1] block mb-1">
                    Área de atuação
                  </label>
                  <input
                    value={form.education}
                    onChange={(event) => updateField("education", event.target.value)}
                    placeholder="Ex.: gestão, atendimento, operação, administração"
                    className="w-full bg-[#111] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#a1a1a1] block mb-1">
                    Status
                  </label>
                  <label className="flex items-center gap-2 bg-[#111] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5]">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) => updateField("active", event.target.checked)}
                      className="accent-[#00A19C]"
                    />
                    Cadastro ativo
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-[#a1a1a1] block mb-1">
                    Responsabilidades
                  </label>
                  <textarea
                    value={form.experience}
                    onChange={(event) => updateField("experience", event.target.value)}
                    placeholder="Ex.: acompanhamento de professores, alunos, avisos e indicadores"
                    className="w-full min-h-[90px] bg-[#111] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-[#a1a1a1] block mb-1">
                    Observações internas
                  </label>
                  <textarea
                    value={form.bio}
                    onChange={(event) => updateField("bio", event.target.value)}
                    placeholder="Observações internas sobre permissões, atuação e responsabilidades."
                    className="w-full min-h-[110px] bg-[#111] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-[#00A19C]/10 border border-[#00A19C]/20 p-4">
                <p className="text-xs text-[#00A19C] font-semibold mb-1">
                  Boa prática
                </p>
                <p className="text-xs text-[#a1a1a1] leading-relaxed">
                  Prefira desativar em vez de excluir. Assim o sistema preserva histórico de alunos,
                  treinos, dúvidas, avisos e ações já realizadas.
                </p>
              </div>

              <div className="flex flex-col-reverse md:flex-row md:justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-3 rounded-xl text-sm text-[#a1a1a1] hover:text-white"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#00A19C] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#008B87] transition disabled:opacity-50"
                >
                  {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Cadastrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface Student {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  ageYears?: number | null;
  isMinor?: boolean;
  hasBirthDate?: boolean;
  active: boolean;
  createdAt?: string | null;
  commercialStatus?: string | null;
  professorName?: string | null;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

function normalizeStatus(status?: string | null): string {
  const value = String(status || "").toUpperCase();

  const labels: Record<string, string> = {
    EXPERIENCIA_ATIVA: "Experiência ativa",
    CONTRATO_ATIVO: "Contrato ativo",
    AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
    SUSPENSO_POR_PAGAMENTO: "Suspenso por pagamento",
    SEM_CONTRATO_ATIVO: "Sem contrato ativo",
  };

  return labels[value] || value || "Status não informado";
}

function statusClass(status?: string | null): string {
  const value = String(status || "").toUpperCase();

  if (value === "CONTRATO_ATIVO") return "bg-green-500/10 text-green-300 border-green-500/20";
  if (value === "EXPERIENCIA_ATIVA") return "bg-blue-500/10 text-blue-300 border-blue-500/20";
  if (value === "AGUARDANDO_PAGAMENTO") return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  if (value === "SUSPENSO_POR_PAGAMENTO") return "bg-red-500/10 text-red-300 border-red-500/20";

  return "bg-[#ffffff08] text-[#a1a1a1] border-[#ffffff10]";
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchStudents();
  }, []);

  async function fetchStudents() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/students", {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Erro ao carregar alunos.");
        setStudents([]);
        return;
      }

      const list = Array.isArray(data?.students) ? data.students : Array.isArray(data) ? data : [];
      setStudents(list);
    } catch {
      setError("Erro ao carregar alunos.");
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return students;

    return students.filter((student) => {
      return [student.name, student.email, student.phone, student.ageYears, student.commercialStatus, student.professorName, student.user?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [students, search]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#00A19C] mb-2">
              Área do professor
            </p>
            <h1 className="text-2xl font-bold text-[#00A19C]">Meus alunos</h1>
            <p className="text-sm text-[#a1a1a1] mt-2 max-w-2xl">
              Selecione um aluno para ver avisos, treinos, dúvidas e resumo do ciclo dentro do Funcional UP Digital.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchStudents}
            className="rounded-xl bg-[#1a1a1a] border border-[#ffffff10] text-[#f5f5f5] px-4 py-3 text-sm font-semibold hover:border-[#00A19C]/40 transition"
          >
            Atualizar lista
          </button>
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-4">
          <label className="text-xs text-[#a1a1a1] block mb-2">Buscar aluno</label>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Digite nome, e-mail, telefone ou status..."
            className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 text-sm text-[#a1a1a1]">
            Carregando alunos...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-8 text-center">
            <p className="text-[#a1a1a1] text-sm">Nenhum aluno encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredStudents.map((student) => {
              const professorName = student.professorName || student.user?.name || "Professor não informado";

              return (
                <Link
                  key={student.id}
                  href={`/dashboard/students/${student.id}`}
                  className="block bg-[#111111] border border-[#ffffff10] rounded-2xl p-4 transition hover:border-[#00A19C]/50 hover:bg-[#1a1a1a]"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-[#00A19C]/20 flex items-center justify-center text-lg font-bold text-[#00A19C]">
                      {student.name?.charAt(0)?.toUpperCase() || "A"}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-[#f5f5f5] truncate">
                          {student.name || "Aluno"}
                        </h3>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(student.commercialStatus)}`}>
                          {normalizeStatus(student.commercialStatus)}
                        </span>
                      </div>

                      <p className="text-xs text-[#6b6b6b] mt-2 truncate">
                        {student.email || "Sem e-mail"}
                        {student.phone ? ` · ${student.phone}` : ""}
                      </p>

                      <p className={"text-xs mt-2 " + (student.ageYears === null || student.ageYears === undefined ? "text-red-400" : "text-[#00A19C]")}>
                        {student.ageYears === null || student.ageYears === undefined
                          ? "Data de nascimento não informada"
                          : `Idade: ${student.ageYears} ano(s)${student.isMinor ? " · menor de idade" : ""}`}
                      </p>

                      <p className="text-xs text-[#a1a1a1] mt-2">
                        Responsável: {professorName}
                      </p>
                    </div>

                    <span className="text-[#00A19C] text-sm pt-1">→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

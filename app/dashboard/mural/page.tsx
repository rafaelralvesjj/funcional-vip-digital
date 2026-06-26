"use client";
import { useEffect, useState } from "react";

interface Student {
  id: string;
  name: string;
}

interface Notice {
  id: string;
  content: string;
  title?: string;
  type: string;
  expiresAt?: string;
  createdAt: string;
  student?: { id: string; name: string };
  author?: { id: string; name: string };
}

export default function MuralPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStudents();
    fetchNotices();
  }, []);

  async function fetchStudents() {
    try {
      const res = await fetch("/api/students");
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || data || []);
      }
    } catch {}
  }

  async function fetchNotices() {
    try {
      const res = await fetch("/api/notices");
      if (res.ok) {
        const data = await res.json();
        setNotices(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const body: any = {
        content: content.trim(),
        studentId: selectedStudent || undefined,
        type: "AVISO",
      };
      if (title) body.title = title;
      if (expiresAt) body.expiresAt = expiresAt;

      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSuccess(true);
        setTitle("");
        setContent("");
        setExpiresAt("");
        fetchNotices();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const err = await res.json();
        setError(err.error || "Erro ao publicar aviso");
      }
    } catch {
      setError("Erro de conexão");
    }

    setSaving(false);
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function isExpired(expiresAt?: string) {
    if (!expiresAt) return false;
    return new Date(expiresAt) &lt; new Date();
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-[#D4A373]">Mural de Avisos</h1>

        <form onSubmit={handleSubmit} className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5 space-y-4">
          <h2 className="text-lg font-semibold text-[#D4A373]">📢 Publicar novo aviso</h2>

          <div>
            <label className="text-sm text-[#a1a1a1] block mb-1">Aluno (opcional)</label>
            <select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
            >
              <option value="">Todos os alunos (aviso geral)</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-[#a1a1a1] block mb-1">Tipo do aviso</label>
            <select
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#0a0a0a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
            >
              <option value="">Selecione um tipo...</option>
              <option value="📢 Aviso Importante">📢 Aviso Importante</option>
              <option value="💪 Feedback de Treino">💪 Feedback de Treino</option>
              <option value="📅 Mudança de Horário">📅 Mudança de Horário</option>
              <option value="❌ Aula Cancelada">❌ Aula Cancelada</option>
              <option 

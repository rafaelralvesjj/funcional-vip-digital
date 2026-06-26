"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Student {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  active: boolean;
  createdAt: string;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudents();
  }, []);

  async function fetchStudents() {
    try {
      const res = await fetch("/api/students");
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || data || []);
      }
    } catch {}
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-[#D4A373]">Alunos</h1>

        {loading ? (
          <p className="text-[#6b6b6b] text-sm">Carregando...</p>
        ) : students.length === 0 ? (
          <p className="text-[#525252] text-sm text-center py-8">Nenhum aluno cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {students.map((student) => (
              <Link
                key={student.id}
                href={`/dashboard/aluno/${student.id}`}
                className="block bg-[#111111] border border-[#ffffff10] rounded-xl p-4 transition hover:border-[#D4A373]/50 hover:bg-[#1a1a1a]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#D4A373]/20 flex items-center justify-center text-lg font-bold text-[#D4A373]">
                    {student.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-[#f5f5f5]">{student.name}</h3>
                    <p className="text-xs text-[#6b6b6b]">
                      {student.email && `${student.email}  `}
                      {student.phone && `| ${student.phone}`}
                    </p>
                  </div>
                  <span className="text-[#D4A373] text-sm">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

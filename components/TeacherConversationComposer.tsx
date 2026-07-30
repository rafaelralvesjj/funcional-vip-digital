"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

type TeacherStudentOption = {
  id: string;
  name: string;
  email?: string | null;
};

type Props = {
  teacherId: string;
  students: TeacherStudentOption[];
  fixedTarget?: ConversationTarget;
};

type ConversationTarget = "STUDENT" | "MANAGEMENT";

function getErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: unknown }).error;

    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

export default function TeacherConversationComposer({
  teacherId,
  students,
  fixedTarget,
}: Props) {
  const router = useRouter();

  const [target, setTarget] = useState<ConversationTarget>(
    fixedTarget || "STUDENT"
  );
  const effectiveTarget = fixedTarget || target;
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [content, setContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [selectedStudentId, students]
  );

  function handleTargetChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextTarget = event.target.value as ConversationTarget;

    setTarget(nextTarget);
    setError("");
    setSuccess("");

    if (nextTarget === "MANAGEMENT") {
      setSelectedStudentId("");
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;

    setSelectedFile(file);
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedContent = content.trim();

    setError("");
    setSuccess("");

    if (effectiveTarget === "STUDENT" && !selectedStudentId) {
      setError("Selecione o aluno com quem deseja iniciar a conversa.");
      return;
    }

    if (!trimmedContent && !selectedFile) {
      setError("Escreva uma mensagem ou anexe uma foto/vídeo antes de enviar.");
      return;
    }

    setSending(true);

    try {
      const form = new FormData();
      form.append("content", trimmedContent);
      form.append("senderRole", "TEACHER");
      form.append("teacherId", teacherId);

      if (effectiveTarget === "STUDENT") {
        form.append("studentId", selectedStudentId);
      }

      if (selectedFile) {
        form.append("file", selectedFile);
      }

      const response = await fetch("/api/questions", {
        method: "POST",
        body: form,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(getErrorMessage(data, "Não foi possível iniciar a conversa."));
        return;
      }

      setContent("");
      setSelectedFile(null);
      setFileInputKey((current) => current + 1);

      if (effectiveTarget === "STUDENT") {
        setSuccess(
          `Conversa iniciada com ${selectedStudent?.name || "o aluno"}. A mensagem já está disponível no painel dele.`
        );
      } else {
        setSuccess(
          "Conversa iniciada com a gestão. A equipe já consegue visualizar e responder pelo sistema."
        );
      }

      router.refresh();
    } catch (sendError) {
      console.error("TeacherConversationComposer send error:", sendError);
      setError("Não foi possível iniciar a conversa.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        {!fixedTarget && (
          <label className="space-y-2">
            <span className="text-xs font-medium text-[#a1a1a1]">
              Com quem você quer falar?
            </span>

            <select
              value={target}
              onChange={handleTargetChange}
              disabled={sending}
              className="w-full rounded-xl border border-[#ffffff10] bg-[#0a0a0a] px-3 py-3 text-sm text-[#f5f5f5] focus:border-[#00A19C] focus:outline-none disabled:opacity-60"
            >
              <option value="STUDENT">Um dos meus alunos</option>
              <option value="MANAGEMENT">Gestão</option>
            </select>
          </label>
        )}

        {effectiveTarget === "STUDENT" ? (
          <label className="space-y-2">
            <span className="text-xs font-medium text-[#a1a1a1]">
              Selecione o aluno
            </span>

            <select
              value={selectedStudentId}
              onChange={(event) => {
                setSelectedStudentId(event.target.value);
                setError("");
                setSuccess("");
              }}
              disabled={sending || students.length === 0}
              className="w-full rounded-xl border border-[#ffffff10] bg-[#0a0a0a] px-3 py-3 text-sm text-[#f5f5f5] focus:border-[#00A19C] focus:outline-none disabled:opacity-60"
            >
              <option value="">
                {students.length === 0
                  ? "Nenhum aluno vinculado"
                  : "Selecione um aluno..."}
              </option>

              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="rounded-xl border border-[#00A19C]/20 bg-[#00A19C]/5 p-3">
            <p className="text-xs font-semibold text-[#00A19C]">
              Conversa com a gestão
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#a1a1a1]">
              Use este canal para pedir apoio, informar impedimentos ou tratar assuntos
              administrativos. A conversa ficará registrada no sistema.
            </p>
          </div>
        )}
      </div>

      <label className="block space-y-2">
        <span className="text-xs font-medium text-[#a1a1a1]">Mensagem</span>

        <textarea
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setError("");
            setSuccess("");
          }}
          disabled={sending}
          rows={4}
          placeholder={
            effectiveTarget === "STUDENT"
              ? "Escreva a mensagem que o aluno receberá..."
              : "Explique para a gestão como ela pode apoiar..."
          }
          className="w-full resize-y rounded-xl border border-[#ffffff10] bg-[#0a0a0a] px-3 py-3 text-sm text-[#f5f5f5] placeholder:text-[#525252] focus:border-[#00A19C] focus:outline-none disabled:opacity-60"
        />
      </label>

      <div className="rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-3">
        <label className="block cursor-pointer">
          <span className="text-xs font-medium text-[#a1a1a1]">
            Anexo opcional — foto ou vídeo
          </span>

          <input
            key={fileInputKey}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileChange}
            disabled={sending}
            className="mt-2 block w-full text-xs text-[#a1a1a1] file:mr-3 file:rounded-lg file:border-0 file:bg-[#00A19C] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#0a0a0a] hover:file:bg-[#008B87] disabled:opacity-60"
          />
        </label>

        {selectedFile && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="truncate text-[11px] text-[#00A19C]">
              {selectedFile.name}
            </p>

            <button
              type="button"
              onClick={() => {
                setSelectedFile(null);
                setFileInputKey((current) => current + 1);
              }}
              disabled={sending}
              className="shrink-0 text-[11px] text-red-300 hover:text-red-200 disabled:opacity-60"
            >
              Remover
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {success && (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {success}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-relaxed text-[#6b6b6b]">
          O destinatário receberá a conversa no próprio painel. O e-mail funciona como
          aviso; as respostas devem continuar pelo chat para manter o histórico registrado.
        </p>

        <button
          type="submit"
          disabled={
            sending ||
            (effectiveTarget === "STUDENT" && (!selectedStudentId || students.length === 0))
          }
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#00A19C] px-5 py-3 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#008B87] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Enviando..." : "Iniciar conversa"}
        </button>
      </div>
    </form>
  );
}

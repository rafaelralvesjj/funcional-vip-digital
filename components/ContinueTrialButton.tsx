"use client";

import { useState } from "react";

type RequestState = "idle" | "loading" | "success" | "error";

type Props = {
  disabled?: boolean;
};

export function ContinueTrialButton({ disabled = false }: Props) {
  const [status, setStatus] = useState<RequestState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const isDisabled = disabled || isLoading || isSuccess;

  async function handleClick() {
    setStatus("loading");
    setMessage(null);

    try {
      const response = await fetch("/api/aluno/continuar-experiencia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível registrar seu interesse agora.");
      }

      setStatus("success");
      setMessage(
        data.alreadyRequested
          ? "Seu interesse em continuar já estava registrado. A equipe irá acompanhar seu pedido."
          : data.message || "Recebemos seu interesse em continuar. A equipe irá acompanhar seu pedido."
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar seu interesse agora. Tente novamente mais tarde."
      );
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className="inline-flex rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? "Enviando..." : isSuccess ? "Interesse registrado" : "Quero continuar"}
      </button>

      {message && (
        <p
          className={`mt-3 text-sm leading-6 ${
            status === "error" ? "text-red-700" : "text-emerald-700"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type DidYouKnowContent = {
  id: string;
  title: string;
  content: string;
  category: string;
  actionLabel?: string | null;
  actionHref?: string | null;
};

export function StudentDidYouKnowCard() {
  const [content, setContent] = useState<DidYouKnowContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadContent() {
      try {
        const response = await fetch("/api/student/did-you-know", {
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error || "Não foi possível carregar a dica.");
        }

        if (mounted) {
          setContent(data?.content ?? null);
          setError("");
        }
      } catch (loadError) {
        if (mounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar a dica."
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadContent();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleNextTip() {
    if (!content || confirming) return;

    try {
      setConfirming(true);
      setError("");

      const response = await fetch("/api/student/did-you-know", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: content.id }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível mostrar a próxima dica.");
      }

      setContent(data?.content ?? null);
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Não foi possível mostrar a próxima dica."
      );
    } finally {
      setConfirming(false);
    }
  }

  if (loading) return null;

  if (error && !content) {
    return (
      <section className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5">
        <p className="text-[10px] font-semibold text-red-300">Você sabia?</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-red-100/80">{error}</p>
      </section>
    );
  }

  if (!content) return null;

  return (
    <section className="rounded-xl border border-[#D4A373]/35 bg-[#111] px-3 py-3">
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D4A373] text-base text-[#0a0a0a]">
          💡
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#D4A373]">
            Você sabia?
          </p>
          <h2 className="mt-0.5 text-[12px] font-semibold leading-snug text-[#f5f5f5]">
            {content.title}
          </h2>

          <p className="mt-1.5 whitespace-pre-line text-[10px] leading-relaxed text-[#a1a1a1]">
            {content.content}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={content.actionHref || "/aluno#conversas-aluno"}
              className="rounded-lg bg-[#D4A373] px-3 py-1.5 text-[10px] font-bold text-[#0a0a0a] transition hover:bg-[#e2b583]"
            >
              {content.actionLabel || "Ir para o chat"}
            </a>

            <button
              type="button"
              onClick={handleNextTip}
              disabled={confirming}
              className="rounded-lg border border-[#ffffff18] bg-[#1a1a1a] px-3 py-1.5 text-[10px] font-semibold text-[#d4d4d4] transition hover:border-[#D4A373]/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirming ? "Carregando..." : "Ver próxima dica"}
            </button>
          </div>

          {error && (
            <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-[9px] text-red-300">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

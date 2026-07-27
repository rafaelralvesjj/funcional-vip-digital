"use client";

import { useEffect, useState } from "react";

type DidYouKnowContent = {
  id: string;
  title: string;
  content: string;
  category: string;
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

  async function handleUnderstood() {
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
        throw new Error(data?.error || "Não foi possível confirmar a dica.");
      }

      setContent(null);
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Não foi possível confirmar a dica."
      );
    } finally {
      setConfirming(false);
    }
  }

  if (loading) return null;

  if (error && !content) {
    return (
      <section className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
        <p className="text-xs font-semibold text-red-300">Você Sabia?</p>
        <p className="mt-1 text-[11px] leading-relaxed text-red-100/80">
          {error}
        </p>
      </section>
    );
  }

  if (!content) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-[#D4A373]/35 bg-[#111]">
      <div className="border-b border-[#ffffff10] bg-[#D4A373]/10 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D4A373] text-lg text-[#0a0a0a]">
            💡
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#D4A373]">
              Dica rápida
            </p>
            <h2 className="text-sm font-bold text-[#f5f5f5]">Você Sabia?</h2>
          </div>
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-sm font-semibold leading-relaxed text-[#f5f5f5]">
          {content.title}
        </h3>
        <p className="mt-2 whitespace-pre-line text-[11px] leading-relaxed text-[#a1a1a1]">
          {content.content}
        </p>

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-[10px] text-red-300">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleUnderstood}
            disabled={confirming}
            className="rounded-lg bg-[#D4A373] px-4 py-2 text-[11px] font-bold text-[#0a0a0a] transition hover:bg-[#e2b583] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirming ? "Registrando..." : "Entendi"}
          </button>
        </div>
      </div>
    </section>
  );
}

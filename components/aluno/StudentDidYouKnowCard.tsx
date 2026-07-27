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
    let active = true;

    async function loadContent() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/student/did-you-know", {
          method: "GET",
          cache: "no-store",
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error || "Não foi possível carregar a dica.");
        }

        if (active) {
          setContent(data?.content || null);
        }
      } catch (loadError: any) {
        if (active) {
          setError(loadError?.message || "Não foi possível carregar a dica.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadContent();

    return () => {
      active = false;
    };
  }, []);

  async function handleUnderstood() {
    if (!content || confirming) return;

    try {
      setConfirming(true);
      setError("");

      const response = await fetch("/api/student/did-you-know", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contentId: content.id }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível confirmar a dica.");
      }

      setContent(null);
    } catch (confirmError: any) {
      setError(confirmError?.message || "Não foi possível confirmar a dica.");
    } finally {
      setConfirming(false);
    }
  }

  if (loading || (!content && !error)) {
    return null;
  }

  if (!content) {
    return null;
  }

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-[#D4A373]/40 bg-zinc-950 text-white shadow-sm">
      <div className="border-b border-white/10 bg-gradient-to-r from-[#D4A373]/20 to-transparent px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#D4A373] text-xl text-zinc-950">
            💡
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D4A373]">
              Conteúdo rápido
            </p>
            <h2 className="mt-1 text-xl font-bold">Você sabia?</h2>
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        <h3 className="text-lg font-semibold leading-7 text-white">
          {content.title}
        </h3>

        <p className="mt-3 whitespace-pre-line text-sm leading-7 text-zinc-300">
          {content.content}
        </p>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleUnderstood}
            disabled={confirming}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#D4A373] px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirming ? "Registrando..." : "Entendi"}
          </button>
        </div>
      </div>
    </section>
  );
}

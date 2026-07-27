"use client";

import { useEffect, useState } from "react";
import { BookOpen, Check, Loader2 } from "lucide-react";

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
    let cancelled = false;

    async function loadContent() {
      try {
        const response = await fetch("/api/student/did-you-know", {
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Não foi possível carregar a dica.");
        }

        if (!cancelled) {
          setContent(data.content || null);
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message || "Não foi possível carregar a dica.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadContent();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUnderstood() {
    if (!content || confirming) return;

    setConfirming(true);
    setError("");

    try {
      const response = await fetch("/api/student/did-you-know", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: content.id }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível confirmar a leitura.");
      }

      setContent(data.content || null);
    } catch (confirmError: any) {
      setError(confirmError?.message || "Não foi possível confirmar a leitura.");
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <section className="mt-6 flex min-h-40 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-400 shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Carregando Você Sabia" />
      </section>
    );
  }

  if (!content && !error) return null;

  if (!content) {
    return (
      <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
        {error}
      </section>
    );
  }

  return (
    <section className="relative mt-6 overflow-hidden rounded-2xl border border-orange-500/30 bg-zinc-950 p-6 text-white shadow-lg">
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-orange-500/10 blur-2xl" />

      <div className="relative">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-zinc-950">
            <BookOpen className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-400">
              Você sabia?
            </p>
            <h2 className="mt-2 text-xl font-bold leading-snug text-white">
              {content.title}
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-300">
              {content.content}
            </p>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleUnderstood}
            disabled={confirming}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Entendi
          </button>
        </div>
      </div>
    </section>
  );
}

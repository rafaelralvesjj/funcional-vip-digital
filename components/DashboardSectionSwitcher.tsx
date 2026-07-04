"use client";

import { Children, ReactNode, useMemo, useState } from "react";

type DashboardCard = {
  id: string;
  label: string;
  value: number;
  tone?: string;
};

type Props = {
  cards: DashboardCard[];
  children: ReactNode;
};

function getDotClass(hasPending: boolean, tone?: string): string {
  if (!hasPending) return "bg-zinc-600";
  if (tone === "danger") return "bg-red-500";
  if (tone === "warning") return "bg-amber-400";
  return "bg-emerald-400";
}

function getStatusClass(hasPending: boolean, tone?: string): string {
  if (!hasPending) return "bg-zinc-800 text-zinc-400";
  if (tone === "danger") return "bg-red-500/10 text-red-400";
  if (tone === "warning") return "bg-amber-500/10 text-amber-400";
  return "bg-emerald-500/10 text-emerald-400";
}

function getStatusText(hasPending: boolean, tone?: string): string {
  if (!hasPending) return "Sem itens";
  if (tone === "danger") return "Prazo crítico";
  if (tone === "warning") return "Com pendência";
  return "Com itens";
}

export default function DashboardSectionSwitcher({ cards, children }: Props) {
  const sections = Children.toArray(children);

  const initialCardId = useMemo(() => {
    const firstPending = cards.find((card) => card.id !== "students" && card.value > 0);
    return firstPending?.id || cards[0]?.id || "";
  }, [cards]);

  const [activeCardId, setActiveCardId] = useState(initialCardId);

  const activeIndex = Math.max(
    cards.findIndex((card) => card.id === activeCardId),
    0
  );

  const activeCard = cards[activeIndex];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card) => {
          const isActive = card.id === activeCardId;
          const hasPending = card.value > 0;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveCardId(card.id)}
              className={
                "text-left bg-[#111111] border rounded-2xl p-5 transition " +
                (isActive
                  ? "border-[#D4A373] shadow-[0_0_0_1px_rgba(212,163,115,0.35)]"
                  : "border-[#ffffff10] hover:border-[#D4A373]/40")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[#a1a1a1] text-sm min-h-[40px]">
                  {card.label}
                </p>

                <span
                  className={
                    "mt-1 h-2.5 w-2.5 rounded-full shrink-0 " +
                    getDotClass(hasPending, card.tone)
                  }
                  title={getStatusText(hasPending, card.tone)}
                />
              </div>

              <div className="flex items-end justify-between gap-3 mt-3">
                <p className="text-3xl font-semibold text-[#D4A373]">
                  {card.value}
                </p>

                <span className="text-[11px] text-[#6b6b6b]">
                  {isActive ? "Aberto" : "Ver lista"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {activeCard && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[#a1a1a1]">
            Exibindo: <span className="text-[#D4A373]">{activeCard.label}</span>
          </p>

          <span
            className={
              "text-[11px] px-2 py-1 rounded-full " +
              getStatusClass(activeCard.value > 0, activeCard.tone)
            }
          >
            {getStatusText(activeCard.value > 0, activeCard.tone)}
          </span>
        </div>
      )}

      <div>{sections[activeIndex] || null}</div>
    </div>
  );
}

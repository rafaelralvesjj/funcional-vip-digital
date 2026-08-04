"use client";

import { Children, ReactNode, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  HelpCircle,
  ClipboardList,
  Dumbbell,
  HeartPulse,
  Link2,
  MessageCircle,
  RotateCcw,
  SlidersHorizontal,
  Users,
} from "lucide-react";

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

function CardIcon({ id }: { id: string }) {
  const className = "h-4 w-4 sm:h-[18px] sm:w-[18px]";

  switch (id) {
    case "students":
      return <Users className={className} />;
    case "awaiting-assignment":
      return <Link2 className={className} />;
    case "missing-current-week-workouts":
      return <Dumbbell className={className} />;
    case "care-return-preparation":
      return <RotateCcw className={className} />;
    case "missing-next-week-workouts":
      return <CalendarDays className={className} />;
    case "pending-workouts":
      return <ClipboardList className={className} />;
    case "unanswered-questions":
      return <HelpCircle className={className} />;
    case "care-events":
      return <HeartPulse className={className} />;
    case "training-preferences":
      return <SlidersHorizontal className={className} />;
    case "pending-notices":
    case "management-notices":
      return <Bell className={className} />;
    case "management-messages":
      return <MessageCircle className={className} />;
    default:
      return <ClipboardList className={className} />;
  }
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
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
        {cards.map((card) => {
          const isActive = card.id === activeCardId;
          const hasPending = card.value > 0;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveCardId(card.id)}
              aria-pressed={isActive}
              className={
                "group relative flex min-h-[142px] flex-col rounded-2xl border bg-gradient-to-br from-[#111111] to-[#151515] p-3 text-left transition sm:min-h-[160px] sm:p-4 " +
                (isActive
                  ? "border-[#00A19C] shadow-[0_0_0_1px_rgba(0,161,156,0.28)]"
                  : "border-[#ffffff12] hover:border-[#00A19C]/45")
              }
            >
              <div className="flex items-start justify-between gap-1.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00A19C]/10 text-[#24C7C0] sm:h-10 sm:w-10">
                  <CardIcon id={card.id} />
                </span>

                <span
                  className={
                    "mt-1 h-2.5 w-2.5 shrink-0 rounded-full " +
                    getDotClass(hasPending, card.tone)
                  }
                  title={getStatusText(hasPending, card.tone)}
                />
              </div>

              <p className="mt-3 line-clamp-3 text-[11px] font-medium leading-[1.25] text-[#b4b4b4] sm:text-xs sm:leading-4">
                {card.label}
              </p>

              <div className="mt-auto flex items-end justify-between gap-1 pt-2">
                <p className="text-2xl font-semibold leading-none text-[#00A19C] sm:text-3xl">
                  {card.value}
                </p>

                <span className="flex items-center gap-0.5 whitespace-nowrap text-[9px] text-[#777] sm:text-[10px]">
                  {isActive ? "Aberto" : "Ver lista"}
                  <span aria-hidden="true" className="text-xs">›</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {activeCard && (
        <div className="flex items-center justify-between gap-3 px-0.5">
          <p className="min-w-0 truncate text-xs text-[#a1a1a1] sm:text-sm">
            Exibindo: <span className="text-[#00A19C]">{activeCard.label}</span>
          </p>

          <span
            className={
              "shrink-0 rounded-full px-2 py-1 text-[10px] sm:text-[11px] " +
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

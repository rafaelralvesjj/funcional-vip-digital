"use client";

import { buildWorkoutMuscleSummary, MuscleKey, MuscleMapExercise } from "@/lib/workout-muscles";

interface Props {
  exercises: MuscleMapExercise[];
  compact?: boolean;
  title?: string;
  className?: string;
}

const FRONT: Array<{ key: MuscleKey; el: JSX.Element }> = [
  { key: "shoulders", el: <><ellipse cx="58" cy="70" rx="13" ry="9"/><ellipse cx="142" cy="70" rx="13" ry="9"/></> },
  { key: "chest", el: <><path d="M72 70 Q100 60 128 70 L123 105 Q100 114 77 105 Z"/></> },
  { key: "biceps", el: <><ellipse cx="52" cy="100" rx="9" ry="24"/><ellipse cx="148" cy="100" rx="9" ry="24"/></> },
  { key: "forearms", el: <><ellipse cx="43" cy="145" rx="7" ry="25"/><ellipse cx="157" cy="145" rx="7" ry="25"/></> },
  { key: "abs", el: <path d="M83 110 Q100 104 117 110 L114 173 Q100 180 86 173 Z"/> },
  { key: "obliques", el: <><path d="M75 108 L84 112 L87 172 L76 166 Z"/><path d="M125 108 L116 112 L113 172 L124 166 Z"/></> },
  { key: "hipFlexors", el: <><ellipse cx="87" cy="181" rx="9" ry="14"/><ellipse cx="113" cy="181" rx="9" ry="14"/></> },
  { key: "adductors", el: <><path d="M85 196 L98 194 L95 260 L82 252 Z"/><path d="M115 196 L102 194 L105 260 L118 252 Z"/></> },
  { key: "quadriceps", el: <><path d="M68 192 Q83 185 98 194 L94 275 Q80 284 68 270 Z"/><path d="M132 192 Q117 185 102 194 L106 275 Q120 284 132 270 Z"/></> },
  { key: "calves", el: <><ellipse cx="78" cy="320" rx="10" ry="35"/><ellipse cx="122" cy="320" rx="10" ry="35"/></> },
];

const BACK: Array<{ key: MuscleKey; el: JSX.Element }> = [
  { key: "shoulders", el: <><ellipse cx="58" cy="70" rx="13" ry="9"/><ellipse cx="142" cy="70" rx="13" ry="9"/></> },
  { key: "upperBack", el: <path d="M70 70 Q100 58 130 70 L121 104 Q100 116 79 104 Z"/> },
  { key: "lats", el: <><path d="M74 88 L88 101 L84 157 L68 145 Z"/><path d="M126 88 L112 101 L116 157 L132 145 Z"/></> },
  { key: "triceps", el: <><ellipse cx="52" cy="104" rx="9" ry="25"/><ellipse cx="148" cy="104" rx="9" ry="25"/></> },
  { key: "forearms", el: <><ellipse cx="43" cy="145" rx="7" ry="25"/><ellipse cx="157" cy="145" rx="7" ry="25"/></> },
  { key: "lowerBack", el: <path d="M83 133 Q100 127 117 133 L114 176 Q100 184 86 176 Z"/> },
  { key: "glutes", el: <><ellipse cx="85" cy="197" rx="18" ry="22"/><ellipse cx="115" cy="197" rx="18" ry="22"/></> },
  { key: "hamstrings", el: <><path d="M68 218 Q82 210 98 218 L94 284 Q80 292 69 279 Z"/><path d="M132 218 Q118 210 102 218 L106 284 Q120 292 131 279 Z"/></> },
  { key: "calves", el: <><ellipse cx="78" cy="320" rx="11" ry="36"/><ellipse cx="122" cy="320" rx="11" ry="36"/></> },
];

function Body({ side, levels }: { side: "front" | "back"; levels: Map<MuscleKey, number> }) {
  const regions = side === "front" ? FRONT : BACK;
  const fill = (key: MuscleKey) => {
    const value = levels.get(key) || 0;
    if (!value) return "#252525";
    if (value >= 0.78) return "#F97316";
    if (value >= 0.48) return "#D4A373";
    return "#7C5A3A";
  };
  return (
    <div className="text-center">
      <svg viewBox="0 0 200 380" className="mx-auto h-56 w-auto" role="img" aria-label={`Mapa muscular ${side === "front" ? "frontal" : "posterior"}`}>
        <g fill="#171717" stroke="#595959" strokeWidth="1.3">
          <circle cx="100" cy="30" r="22" />
          <path d="M88 50 L112 50 L132 70 L126 176 L132 195 L130 280 L127 363 L110 363 L103 282 L97 282 L90 363 L73 363 L70 280 L68 195 L74 176 L68 70 Z" />
          <path d="M68 72 L48 80 L35 154 L45 160 L58 113 Z" />
          <path d="M132 72 L152 80 L165 154 L155 160 L142 113 Z" />
        </g>
        <g stroke="#0a0a0a" strokeWidth="1.2">
          {regions.map((region, index) => <g key={`${region.key}-${index}`} fill={fill(region.key)}>{region.el}</g>)}
        </g>
      </svg>
      <p className="text-[10px] uppercase tracking-[0.18em] text-[#777]">{side === "front" ? "Frente" : "Costas"}</p>
    </div>
  );
}

export default function WorkoutMuscleMap({ exercises, compact = false, title = "Músculos trabalhados", className = "" }: Props) {
  const summary = buildWorkoutMuscleSummary(exercises || []);
  if (!exercises?.length) return null;
  const levels = new Map(summary.muscles.map((item) => [item.key, item.normalizedScore]));

  return (
    <section className={`rounded-2xl border border-[#D4A373]/25 bg-[#0b0b0b] ${compact ? "p-3" : "p-4"} ${className}`}>
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D4A373]">Mapa corporal</p>
        <h3 className={`${compact ? "text-sm" : "text-base"} font-semibold text-[#f5f5f5]`}>{title}</h3>
        <p className="mt-1 text-[10px] leading-relaxed text-[#8d8d8d]">A intensidade da cor considera os músculos principais, auxiliares e o volume previsto de cada exercício.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/5 bg-[#111] p-2">
        <Body side="front" levels={levels} />
        <Body side="back" levels={levels} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[9px]">
        <span className="rounded-full border border-orange-500/30 bg-orange-500/15 px-2 py-1 text-orange-300">Foco maior</span>
        <span className="rounded-full border border-[#D4A373]/30 bg-[#D4A373]/15 px-2 py-1 text-[#e7b785]">Foco moderado</span>
        <span className="rounded-full border border-[#7C5A3A]/30 bg-[#7C5A3A]/15 px-2 py-1 text-[#b58a62]">Participação auxiliar</span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="rounded-lg border border-white/5 bg-[#111] p-2.5">
          <p className="text-[9px] text-[#777]">Foco principal</p>
          <p className="text-[11px] font-medium text-[#f5f5f5]">{summary.headline}</p>
        </div>
        {summary.supportText && <div className="rounded-lg border border-white/5 bg-[#111] p-2.5"><p className="text-[9px] text-[#777]">Músculos de apoio</p><p className="text-[11px] text-[#d4d4d4]">{summary.supportText}</p></div>}
      </div>
    </section>
  );
}

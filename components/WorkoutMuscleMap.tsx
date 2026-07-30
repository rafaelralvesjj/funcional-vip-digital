"use client";

import { useState, type ReactElement } from "react";
import { buildWorkoutMuscleSummary, MuscleKey, MuscleMapExercise } from "@/lib/workout-muscles";

interface Props {
  exercises: MuscleMapExercise[];
  compact?: boolean;
  title?: string;
  className?: string;
}

type Region = { key: MuscleKey; el: ReactElement };
type FocusFilter = "major" | "moderate" | "auxiliary" | null;

const FRONT: Region[] = [
  { key: "shoulders", el: <><path d="M56 75 C48 76 43 83 43 93 C50 91 57 88 63 84 C66 81 66 77 64 74 Z"/><path d="M144 75 C152 76 157 83 157 93 C150 91 143 88 137 84 C134 81 134 77 136 74 Z"/></> },
  { key: "chest", el: <><path d="M67 79 C77 73 88 72 97 77 L97 111 C87 115 76 112 69 105 C65 98 64 88 67 79 Z"/><path d="M133 79 C123 73 112 72 103 77 L103 111 C113 115 124 112 131 105 C135 98 136 88 133 79 Z"/></> },
  { key: "biceps", el: <><path d="M45 98 C39 105 38 122 42 137 C46 139 51 137 54 132 C56 119 55 106 51 99 Z"/><path d="M155 98 C161 105 162 122 158 137 C154 139 149 137 146 132 C144 119 145 106 149 99 Z"/></> },
  { key: "forearms", el: <><path d="M40 139 C34 152 33 171 37 187 C40 191 45 190 48 185 C50 168 49 151 45 140 Z"/><path d="M160 139 C166 152 167 171 163 187 C160 191 155 190 152 185 C150 168 151 151 155 140 Z"/></> },
  { key: "abs", el: <><rect x="84" y="118" width="14" height="20" rx="5"/><rect x="102" y="118" width="14" height="20" rx="5"/><rect x="84" y="142" width="14" height="21" rx="5"/><rect x="102" y="142" width="14" height="21" rx="5"/><rect x="86" y="167" width="12" height="20" rx="5"/><rect x="102" y="167" width="12" height="20" rx="5"/></> },
  { key: "obliques", el: <><path d="M73 112 C77 118 80 126 81 136 L80 178 C74 172 69 163 67 153 L68 124 Z"/><path d="M127 112 C123 118 120 126 119 136 L120 178 C126 172 131 163 133 153 L132 124 Z"/></> },
  { key: "hipFlexors", el: <><path d="M79 181 C84 178 90 178 96 181 L93 205 C88 209 82 207 78 202 Z"/><path d="M121 181 C116 178 110 178 104 181 L107 205 C112 209 118 207 122 202 Z"/></> },
  { key: "adductors", el: <><path d="M86 207 C91 204 95 204 99 207 L96 282 C92 286 88 284 85 279 Z"/><path d="M114 207 C109 204 105 204 101 207 L104 282 C108 286 112 284 115 279 Z"/></> },
  { key: "quadriceps", el: <><path d="M67 205 C76 199 84 199 92 204 C95 223 95 255 90 285 C83 294 74 292 68 282 C64 253 64 225 67 205 Z"/><path d="M133 205 C124 199 116 199 108 204 C105 223 105 255 110 285 C117 294 126 292 132 282 C136 253 136 225 133 205 Z"/></> },
  { key: "calves", el: <><path d="M72 292 C65 309 65 338 72 358 C78 364 84 359 86 349 C88 326 86 305 81 293 Z"/><path d="M128 292 C135 309 135 338 128 358 C122 364 116 359 114 349 C112 326 114 305 119 293 Z"/></> },
];

const BACK: Region[] = [
  { key: "shoulders", el: <><path d="M56 75 C48 76 43 83 43 93 C50 91 57 88 63 84 C66 81 66 77 64 74 Z"/><path d="M144 75 C152 76 157 83 157 93 C150 91 143 88 137 84 C134 81 134 77 136 74 Z"/></> },
  { key: "upperBack", el: <path d="M67 79 C78 72 89 70 100 74 C111 70 122 72 133 79 L127 111 C117 108 108 104 100 98 C92 104 83 108 73 111 Z"/> },
  { key: "lats", el: <><path d="M71 105 C78 109 84 116 87 127 L84 168 C76 162 69 151 66 137 Z"/><path d="M129 105 C122 109 116 116 113 127 L116 168 C124 162 131 151 134 137 Z"/></> },
  { key: "triceps", el: <><path d="M45 98 C39 105 38 122 42 137 C46 139 51 137 54 132 C56 119 55 106 51 99 Z"/><path d="M155 98 C161 105 162 122 158 137 C154 139 149 137 146 132 C144 119 145 106 149 99 Z"/></> },
  { key: "forearms", el: <><path d="M40 139 C34 152 33 171 37 187 C40 191 45 190 48 185 C50 168 49 151 45 140 Z"/><path d="M160 139 C166 152 167 171 163 187 C160 191 155 190 152 185 C150 168 151 151 155 140 Z"/></> },
  { key: "lowerBack", el: <path d="M84 145 C89 140 95 138 100 141 C105 138 111 140 116 145 L114 183 C108 188 104 190 100 190 C96 190 92 188 86 183 Z"/> },
  { key: "glutes", el: <><path d="M67 190 C76 183 89 184 99 191 L97 221 C89 231 76 232 68 222 C64 212 64 200 67 190 Z"/><path d="M133 190 C124 183 111 184 101 191 L103 221 C111 231 124 232 132 222 C136 212 136 200 133 190 Z"/></> },
  { key: "hamstrings", el: <><path d="M68 226 C76 221 86 221 94 226 C97 245 96 274 91 290 C84 297 75 295 69 285 C65 264 65 242 68 226 Z"/><path d="M132 226 C124 221 114 221 106 226 C103 245 104 274 109 290 C116 297 125 295 131 285 C135 264 135 242 132 226 Z"/></> },
  { key: "calves", el: <><path d="M72 294 C65 311 65 340 72 359 C78 364 84 359 86 349 C88 327 86 306 81 295 Z"/><path d="M128 294 C135 311 135 340 128 359 C122 364 116 359 114 349 C112 327 114 306 119 295 Z"/></> },
];

function Body({ side, levels, activeFilter }: { side: "front" | "back"; levels: Map<MuscleKey, number>; activeFilter: FocusFilter }) {
  const regions = side === "front" ? FRONT : BACK;
  const fill = (key: MuscleKey) => {
    const value = levels.get(key) || 0;
    if (!value) return "#ECECEC";

    const category: Exclude<FocusFilter, null> =
      value >= 0.78 ? "major" : value >= 0.48 ? "moderate" : "auxiliary";

    if (activeFilter && category !== activeFilter) return "#E7E7E7";
    if (category === "major") return "#FF6A00";
    if (category === "moderate") return "#06B6D4";
    return "#0E7490";
  };

  return (
    <div className="text-center">
      <svg viewBox="0 0 200 390" className="mx-auto h-64 w-auto max-w-full" role="img" aria-label={`Mapa muscular ${side === "front" ? "frontal" : "posterior"}`}>
        <defs>
          <linearGradient id={`body-${side}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F8F8F8" />
            <stop offset="100%" stopColor="#D9D9D9" />
          </linearGradient>
          <filter id={`soft-${side}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.22" />
          </filter>
        </defs>

        <g fill={`url(#body-${side})`} stroke="#707070" strokeWidth="1.35" filter={`url(#soft-${side})`}>
          <ellipse cx="100" cy="28" rx="21" ry="24" />
          <path d="M88 52 C82 58 76 64 67 72 C63 82 62 102 64 124 L68 178 C65 188 63 198 64 211 L68 286 C70 310 70 338 72 365 L88 365 C91 339 94 313 96 287 L100 287 L104 287 C106 313 109 339 112 365 L128 365 C130 338 130 310 132 286 L136 211 C137 198 135 188 132 178 L136 124 C138 102 137 82 133 72 C124 64 118 58 112 52 Z" />
          <path d="M67 74 C58 73 49 77 44 88 C40 101 37 119 34 138 L31 163 C31 170 35 175 40 175 C45 174 48 169 49 162 L55 135 C59 119 62 102 65 88 Z" />
          <path d="M133 74 C142 73 151 77 156 88 C160 101 163 119 166 138 L169 163 C169 170 165 175 160 175 C155 174 152 169 151 162 L145 135 C141 119 138 102 135 88 Z" />
        </g>

        <g fill="none" stroke="#B8B8B8" strokeWidth="1" opacity="0.7">
          <path d="M100 53 L100 190" />
          <path d="M72 112 C83 117 91 119 100 119 C109 119 117 117 128 112" />
          <path d="M76 190 C86 194 93 196 100 196 C107 196 114 194 124 190" />
          <path d="M68 286 C78 289 87 290 96 287" />
          <path d="M132 286 C122 289 113 290 104 287" />
        </g>

        <g stroke="#FFFFFF" strokeWidth="1.4" strokeLinejoin="round">
          {regions.map((region, index) => (
            <g key={`${region.key}-${index}`} fill={fill(region.key)}>
              {region.el}
            </g>
          ))}
        </g>
      </svg>
      <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[#8b8b8b]">{side === "front" ? "Frente" : "Costas"}</p>
    </div>
  );
}

export default function WorkoutMuscleMap({ exercises, compact = false, title = "Músculos trabalhados", className = "" }: Props) {
  const [activeFilter, setActiveFilter] = useState<FocusFilter>(null);
  const summary = buildWorkoutMuscleSummary(exercises || []);
  if (!exercises?.length) return null;
  const levels = new Map(summary.muscles.map((item) => [item.key, item.normalizedScore]));

  return (
    <section className={`rounded-2xl border border-[#22D3EE]/25 bg-[#0b0b0b] ${compact ? "p-3" : "p-4"} ${className}`}>
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#22D3EE]">Mapa corporal</p>
        <h3 className={`${compact ? "text-sm" : "text-base"} font-semibold text-[#f5f5f5]`}>{title}</h3>
        <p className="mt-1 text-[10px] leading-relaxed text-[#8d8d8d]">A intensidade da cor considera os músculos principais, auxiliares e o volume previsto de cada exercício.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/5 bg-gradient-to-b from-[#171717] to-[#101010] p-2 sm:p-3">
        <Body side="front" levels={levels} activeFilter={activeFilter} />
        <Body side="back" levels={levels} activeFilter={activeFilter} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[9px]" aria-label="Filtros do mapa muscular">
        <button
          type="button"
          aria-pressed={activeFilter === "major"}
          onClick={() => setActiveFilter((current) => current === "major" ? null : "major")}
          className={`rounded-full border px-2.5 py-1.5 transition-all ${activeFilter === "major" ? "border-cyan-400 bg-cyan-500/30 text-cyan-200 ring-1 ring-cyan-400/50" : "border-cyan-500/30 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"}`}
        >
          Foco maior
        </button>
        <button
          type="button"
          aria-pressed={activeFilter === "moderate"}
          onClick={() => setActiveFilter((current) => current === "moderate" ? null : "moderate")}
          className={`rounded-full border px-2.5 py-1.5 transition-all ${activeFilter === "moderate" ? "border-[#E8B78C] bg-[#06B6D4]/30 text-[#ffd5b0] ring-1 ring-[#06B6D4]/50" : "border-[#06B6D4]/30 bg-[#06B6D4]/15 text-[#efbd91] hover:bg-[#06B6D4]/25"}`}
        >
          Foco moderado
        </button>
        <button
          type="button"
          aria-pressed={activeFilter === "auxiliary"}
          onClick={() => setActiveFilter((current) => current === "auxiliary" ? null : "auxiliary")}
          className={`rounded-full border px-2.5 py-1.5 transition-all ${activeFilter === "auxiliary" ? "border-[#B98A63] bg-[#0E7490]/35 text-[#e1b48f] ring-1 ring-[#0E7490]/60" : "border-[#0E7490]/30 bg-[#0E7490]/15 text-[#c39a77] hover:bg-[#0E7490]/25"}`}
        >
          Participação auxiliar
        </button>
      </div>
      <p className="mt-2 text-[9px] text-[#777]">Toque em uma categoria para destacar somente aquele nível. Toque novamente para mostrar todos.</p>
      <div className="mt-3 space-y-2">
        <div className="rounded-lg border border-white/5 bg-[#111] p-2.5">
          <p className="text-[9px] text-[#777]">Foco principal</p>
          <p className="text-[11px] font-medium text-[#f5f5f5]">{summary.headline}</p>
        </div>
        {summary.supportText && (
          <div className="rounded-lg border border-white/5 bg-[#111] p-2.5">
            <p className="text-[9px] text-[#777]">Músculos de apoio</p>
            <p className="text-[11px] text-[#d4d4d4]">{summary.supportText}</p>
          </div>
        )}
      </div>
    </section>
  );
}

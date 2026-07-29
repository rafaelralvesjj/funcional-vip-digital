"use client";

import type { ReactElement } from "react";
import { buildWorkoutMuscleSummary, MuscleKey, MuscleMapExercise } from "@/lib/workout-muscles";

interface Props {
  exercises: MuscleMapExercise[];
  compact?: boolean;
  title?: string;
  className?: string;
}

type Region = { key: MuscleKey; el: ReactElement };

const FRONT: Region[] = [
  {
    key: "shoulders",
    el: (
      <>
        <path d="M55 91 C46 93 39 101 38 113 C45 111 53 107 61 100 C65 96 64 91 61 88 Z" />
        <path d="M165 91 C174 93 181 101 182 113 C175 111 167 107 159 100 C155 96 156 91 159 88 Z" />
      </>
    ),
  },
  {
    key: "chest",
    el: (
      <>
        <path d="M64 96 C76 87 92 86 106 93 L106 126 C94 133 78 131 68 122 C62 115 60 104 64 96 Z" />
        <path d="M156 96 C144 87 128 86 114 93 L114 126 C126 133 142 131 152 122 C158 115 160 104 156 96 Z" />
      </>
    ),
  },
  {
    key: "biceps",
    el: (
      <>
        <path d="M43 116 C35 128 34 148 40 165 C45 169 52 166 56 159 C59 143 57 126 52 116 Z" />
        <path d="M177 116 C185 128 186 148 180 165 C175 169 168 166 164 159 C161 143 163 126 168 116 Z" />
      </>
    ),
  },
  {
    key: "forearms",
    el: (
      <>
        <path d="M39 167 C31 185 30 207 35 226 C39 232 46 231 50 224 C53 204 52 183 46 168 Z" />
        <path d="M181 167 C189 185 190 207 185 226 C181 232 174 231 170 224 C167 204 168 183 174 168 Z" />
      </>
    ),
  },
  {
    key: "abs",
    el: (
      <>
        <path d="M91 137 C96 134 102 134 106 137 L106 157 C101 160 96 160 91 157 Z" />
        <path d="M114 137 C118 134 124 134 129 137 L129 157 C124 160 119 160 114 157 Z" />
        <path d="M91 163 C96 160 102 160 106 163 L106 184 C101 187 96 187 91 184 Z" />
        <path d="M114 163 C118 160 124 160 129 163 L129 184 C124 187 119 187 114 184 Z" />
        <path d="M94 190 C98 188 103 188 106 190 L106 211 C102 214 98 214 94 211 Z" />
        <path d="M114 190 C117 188 122 188 126 190 L126 211 C122 214 118 214 114 211 Z" />
      </>
    ),
  },
  {
    key: "obliques",
    el: (
      <>
        <path d="M72 127 C80 132 86 142 87 155 L86 207 C77 199 70 186 67 171 L68 142 Z" />
        <path d="M148 127 C140 132 134 142 133 155 L134 207 C143 199 150 186 153 171 L152 142 Z" />
      </>
    ),
  },
  {
    key: "hipFlexors",
    el: (
      <>
        <path d="M82 210 C89 207 97 208 104 213 L101 240 C94 246 86 243 80 236 Z" />
        <path d="M138 210 C131 207 123 208 116 213 L119 240 C126 246 134 243 140 236 Z" />
      </>
    ),
  },
  {
    key: "adductors",
    el: (
      <>
        <path d="M91 241 C97 238 102 239 107 243 L104 325 C99 331 94 328 90 321 Z" />
        <path d="M129 241 C123 238 118 239 113 243 L116 325 C121 331 126 328 130 321 Z" />
      </>
    ),
  },
  {
    key: "quadriceps",
    el: (
      <>
        <path d="M66 239 C77 231 90 231 101 238 C105 263 104 299 97 327 C88 340 76 338 68 326 C62 295 62 263 66 239 Z" />
        <path d="M154 239 C143 231 130 231 119 238 C115 263 116 299 123 327 C132 340 144 338 152 326 C158 295 158 263 154 239 Z" />
      </>
    ),
  },
  {
    key: "calves",
    el: (
      <>
        <path d="M72 333 C63 352 64 385 72 407 C79 414 87 408 90 396 C92 371 90 348 84 334 Z" />
        <path d="M148 333 C157 352 156 385 148 407 C141 414 133 408 130 396 C128 371 130 348 136 334 Z" />
      </>
    ),
  },
];

const BACK: Region[] = [
  {
    key: "shoulders",
    el: (
      <>
        <path d="M55 91 C46 93 39 101 38 113 C45 111 53 107 61 100 C65 96 64 91 61 88 Z" />
        <path d="M165 91 C174 93 181 101 182 113 C175 111 167 107 159 100 C155 96 156 91 159 88 Z" />
      </>
    ),
  },
  {
    key: "upperBack",
    el: (
      <>
        <path d="M66 96 C77 88 91 86 106 91 L106 128 C92 126 80 120 70 111 Z" />
        <path d="M154 96 C143 88 129 86 114 91 L114 128 C128 126 140 120 150 111 Z" />
      </>
    ),
  },
  {
    key: "lats",
    el: (
      <>
        <path d="M70 119 C82 124 91 134 94 149 L89 202 C79 194 70 179 66 160 Z" />
        <path d="M150 119 C138 124 129 134 126 149 L131 202 C141 194 150 179 154 160 Z" />
      </>
    ),
  },
  {
    key: "triceps",
    el: (
      <>
        <path d="M43 116 C35 128 34 148 40 165 C45 169 52 166 56 159 C59 143 57 126 52 116 Z" />
        <path d="M177 116 C185 128 186 148 180 165 C175 169 168 166 164 159 C161 143 163 126 168 116 Z" />
      </>
    ),
  },
  {
    key: "forearms",
    el: (
      <>
        <path d="M39 167 C31 185 30 207 35 226 C39 232 46 231 50 224 C53 204 52 183 46 168 Z" />
        <path d="M181 167 C189 185 190 207 185 226 C181 232 174 231 170 224 C167 204 168 183 174 168 Z" />
      </>
    ),
  },
  {
    key: "lowerBack",
    el: <path d="M88 171 C95 165 104 163 110 168 C116 163 125 165 132 171 L128 216 C120 223 114 226 110 226 C106 226 100 223 92 216 Z" />,
  },
  {
    key: "glutes",
    el: (
      <>
        <path d="M65 222 C77 212 94 213 108 223 L105 258 C95 272 78 273 67 260 C61 248 61 234 65 222 Z" />
        <path d="M155 222 C143 212 126 213 112 223 L115 258 C125 272 142 273 153 260 C159 248 159 234 155 222 Z" />
      </>
    ),
  },
  {
    key: "hamstrings",
    el: (
      <>
        <path d="M68 264 C79 257 92 258 102 266 C106 289 104 319 97 337 C88 347 76 344 69 332 C63 307 63 282 68 264 Z" />
        <path d="M152 264 C141 257 128 258 118 266 C114 289 116 319 123 337 C132 347 144 344 151 332 C157 307 157 282 152 264 Z" />
      </>
    ),
  },
  {
    key: "calves",
    el: (
      <>
        <path d="M72 340 C63 359 64 389 72 408 C79 414 87 408 90 396 C92 373 90 353 84 341 Z" />
        <path d="M148 340 C157 359 156 389 148 408 C141 414 133 408 130 396 C128 373 130 353 136 341 Z" />
      </>
    ),
  },
];

function levelColor(value: number) {
  if (!value) return "#E8EAEC";
  if (value >= 0.78) return "#FF6A00";
  if (value >= 0.48) return "#D99558";
  return "#8B6342";
}

function Body({ side, levels }: { side: "front" | "back"; levels: Map<MuscleKey, number> }) {
  const regions = side === "front" ? FRONT : BACK;
  const uid = side === "front" ? "muscle-front" : "muscle-back";

  return (
    <div className="text-center">
      <svg
        viewBox="0 0 220 430"
        className="mx-auto h-[17rem] w-auto max-w-full sm:h-[19rem]"
        role="img"
        aria-label={`Mapa muscular ${side === "front" ? "frontal" : "posterior"}`}
      >
        <defs>
          <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="58%" stopColor="#F2F3F4" />
            <stop offset="100%" stopColor="#D7DADD" />
          </linearGradient>
          <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.38" />
            <stop offset="48%" stopColor="#FFFFFF" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.13" />
          </linearGradient>
          <filter id={`${uid}-shadow`} x="-20%" y="-15%" width="140%" height="135%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.32" />
          </filter>
        </defs>

        <g filter={`url(#${uid}-shadow)`}>
          <g fill={`url(#${uid}-body)`} stroke="#585B5F" strokeWidth="1.35" strokeLinejoin="round">
            <path d="M89 35 C89 20 98 11 110 11 C122 11 131 20 131 35 C131 49 123 61 110 63 C97 61 89 49 89 35 Z" />
            <path d="M93 58 C87 66 78 74 66 82 C59 92 56 111 58 132 L63 187 C59 204 58 220 61 239 L66 329 C67 354 69 380 72 413 L94 413 C98 383 102 354 105 329 L110 329 L115 329 C118 354 122 383 126 413 L148 413 C151 380 153 354 154 329 L159 239 C162 220 161 204 157 187 L162 132 C164 111 161 92 154 82 C142 74 133 66 127 58 C121 66 117 71 110 72 C103 71 99 66 93 58 Z" />
            <path d="M66 83 C54 81 43 87 37 101 C32 118 28 139 25 164 L22 197 C22 206 27 212 34 212 C41 211 45 205 46 196 L53 163 C58 143 62 120 66 99 Z" />
            <path d="M154 83 C166 81 177 87 183 101 C188 118 192 139 195 164 L198 197 C198 206 193 212 186 212 C179 211 175 205 174 196 L167 163 C162 143 158 120 154 99 Z" />
            <path d="M72 412 C72 421 77 425 86 425 L99 425 C101 421 100 416 94 412 Z" />
            <path d="M148 412 C148 421 143 425 134 425 L121 425 C119 421 120 416 126 412 Z" />
          </g>

          <g fill="none" stroke="#C4C7CA" strokeWidth="0.9" opacity="0.75" strokeLinecap="round">
            <path d="M110 73 L110 226" />
            <path d="M70 127 C83 134 97 137 110 137 C123 137 137 134 150 127" />
            <path d="M75 218 C88 225 99 228 110 228 C121 228 132 225 145 218" />
            <path d="M67 329 C79 333 92 334 105 329" />
            <path d="M153 329 C141 333 128 334 115 329" />
          </g>

          <g stroke="#F7F7F7" strokeWidth="1.5" strokeLinejoin="round">
            {regions.map((region, index) => {
              const value = levels.get(region.key) || 0;
              return (
                <g key={`${region.key}-${index}`} fill={levelColor(value)}>
                  {region.el}
                  {value > 0 && <g fill={`url(#${uid}-shine)`}>{region.el}</g>}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      <p className="mt-1 text-[10px] uppercase tracking-[0.28em] text-[#9a9a9a]">
        {side === "front" ? "Frente" : "Costas"}
      </p>
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
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D4A373]">Mapa corporal</p>
        <h3 className={`${compact ? "text-sm" : "text-base"} font-semibold text-[#f5f5f5]`}>{title}</h3>
        <p className="mt-1 text-[10px] leading-relaxed text-[#8d8d8d]">
          A intensidade da cor considera os músculos principais, auxiliares e o volume previsto de cada exercício.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl border border-white/[0.07] bg-gradient-to-b from-[#181818] via-[#121212] to-[#0d0d0d] px-1.5 py-3 sm:gap-3 sm:px-4">
        <Body side="front" levels={levels} />
        <Body side="back" levels={levels} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[9px]">
        <span className="rounded-full border border-[#FF6A00]/40 bg-[#FF6A00]/15 px-2 py-1 text-[#ffad72]">Foco maior</span>
        <span className="rounded-full border border-[#D99558]/35 bg-[#D99558]/15 px-2 py-1 text-[#efbd91]">Foco moderado</span>
        <span className="rounded-full border border-[#8B6342]/40 bg-[#8B6342]/15 px-2 py-1 text-[#c39a77]">Participação auxiliar</span>
      </div>

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

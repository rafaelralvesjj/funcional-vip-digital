import {
  ActiveWorkoutContract,
  ExerciseItem,
  LibraryExercise,
  WorkoutPlanSummary,
} from "./types";

export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInput(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getDateInputFromRaw(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : formatDateInput(date);
}

export function getWeekRange(referenceDate: Date) {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() + diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  return { startOfWeek, endOfWeek };
}

export function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR");
}

export function isUnsafeCurrentWeekPlanningDate(dateInput?: string | null): boolean {
  const parsed = parseDateInput(dateInput);
  if (!parsed) return false;

  const currentWeek = getWeekRange(new Date());
  const selectedWeek = getWeekRange(parsed);
  const todayDay = new Date().getDay();

  return (
    selectedWeek.startOfWeek.getTime() === currentWeek.startOfWeek.getTime() &&
    [5, 6, 0].includes(todayDay)
  );
}

export function getNextSafePlanningDateInput(dateInput?: string | null) {
  if (!isUnsafeCurrentWeekPlanningDate(dateInput)) {
    return { dateInput: dateInput || null, redirected: false as const };
  }

  const nextWeekStart = getWeekRange(new Date()).endOfWeek;

  return {
    dateInput: formatDateInput(nextWeekStart),
    redirected: true as const,
    message:
      "Esta semana já não possui janela segura de execução. O planejamento foi direcionado para a próxima semana.",
  };
}

function getPreferredWorkoutOffsets(limit: number): number[] {
  const patterns: Record<number, number[]> = {
    1: [0, 1, 2, 3, 4, 5, 6],
    2: [0, 2, 4, 1, 3, 5, 6],
    3: [0, 2, 4, 1, 3, 5, 6],
    4: [0, 1, 3, 4, 2, 5, 6],
    5: [0, 1, 2, 3, 4, 5, 6],
  };
  return patterns[limit] || [0, 1, 2, 3, 4, 5, 6];
}

export function getExpectedWorkoutDatesForWeek(
  startOfWeek: Date,
  weeklyLimit?: number | null,
  activeContract?: ActiveWorkoutContract | null
): string[] {
  const limit = Math.max(Number(weeklyLimit || 0), 0);
  if (!limit) return [];

  const weekStartInput = formatDateInput(startOfWeek);
  const weekEndExclusive = new Date(startOfWeek);
  weekEndExclusive.setDate(startOfWeek.getDate() + 7);
  const weekEndExclusiveInput = formatDateInput(weekEndExclusive);

  const contractStartInput = getDateInputFromRaw(activeContract?.startDate);
  const contractEndInput = getDateInputFromRaw(activeContract?.endDate);

  const effectiveStart =
    contractStartInput && contractStartInput > weekStartInput
      ? contractStartInput
      : weekStartInput;

  const effectiveEnd =
    contractEndInput && contractEndInput < weekEndExclusiveInput
      ? contractEndInput
      : weekEndExclusiveInput;

  return Array.from(
    new Set(
      getPreferredWorkoutOffsets(limit).map((offset) => {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + offset);
        return formatDateInput(date);
      })
    )
  )
    .filter((candidate) => candidate >= effectiveStart && candidate < effectiveEnd)
    .slice(0, limit);
}

export function getPlanDateInput(plan: WorkoutPlanSummary): string | null {
  const raw = plan.date || plan.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : formatDateInput(date);
}

export function getFirstMissingExpectedDate(
  expectedDates: string[],
  plans: WorkoutPlanSummary[]
): string | null {
  const created = new Set(
    plans.map(getPlanDateInput).filter((value): value is string => Boolean(value))
  );
  return expectedDates.find((date) => !created.has(date)) || null;
}

function compact(value?: string | number | null): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function buildExercisePurpose(exercise?: Partial<LibraryExercise> | null) {
  if (!exercise) return "";
  return [
    compact(exercise.description),
    compact(exercise.objectiveTags)
      ? `Objetivo relacionado: ${compact(exercise.objectiveTags)}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildExerciseInstructions(exercise?: Partial<LibraryExercise> | null) {
  return compact(exercise?.instructions) || compact(exercise?.description);
}

export function buildExerciseSafetyGuidance(exercise?: Partial<LibraryExercise> | null) {
  if (!exercise) return "";
  return [
    compact(exercise.safetyNotes),
    exercise.restrictionTags ? `Atenção: ${exercise.restrictionTags}.` : "",
    exercise.commonMistakes ? `Evite: ${exercise.commonMistakes}.` : "",
    exercise.contraindications
      ? `Contraindicação/atenção: ${exercise.contraindications}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function escapeHtml(value?: string | number | null): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function openWorkoutPrintPreview(params: {
  studentName: string;
  studentAge?: number | null;
  planName: string;
  date: string;
  startOfWeek: Date;
  endOfWeek: Date;
  objective: string;
  description: string;
  focusAreas: string;
  intensity: string;
  estimatedDurationMinutes: string;
  estimatedCaloriesMin: string;
  estimatedCaloriesMax: string;
  studentSummary: string;
  safetyNote: string;
  notes: string;
  exercises: ExerciseItem[];
}) {
  const {
    studentName,
    studentAge,
    planName,
    date,
    startOfWeek,
    endOfWeek,
    objective,
    description,
    focusAreas,
    intensity,
    estimatedDurationMinutes,
    estimatedCaloriesMin,
    estimatedCaloriesMax,
    studentSummary,
    safetyNote,
    notes,
    exercises,
  } = params;

  const rows = exercises
    .map(
      (exercise, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(exercise.name)}</strong><br/>${escapeHtml(
          exercise.description
        )}${exercise.notes ? `<br/><em>${escapeHtml(exercise.notes)}</em>` : ""}</td>
        <td>${escapeHtml(exercise.series)}</td>
        <td>${escapeHtml(exercise.reps)}</td>
        <td>${escapeHtml(exercise.weight || "a definir")}</td>
        <td>${escapeHtml(exercise.restTime || "-")}</td>
      </tr>`
    )
    .join("");

  const html = `<!doctype html>
  <html lang="pt-BR"><head><meta charset="utf-8"/><title>Prévia do treino</title>
  <style>
  body{font-family:Arial,sans-serif;padding:28px;color:#171717}
  h1{margin:8px 0} h2{margin-top:22px;color:#9a6b3f}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #ddd;padding:8px;vertical-align:top}
  .box{border:1px solid #ddd;border-radius:8px;padding:10px;margin-top:8px}
  button{background:#D4A373;border:0;border-radius:8px;padding:10px 14px;font-weight:bold}
  @media print{.actions{display:none}}
  </style></head><body>
  <div class="actions"><button onclick="window.print()">Imprimir / salvar como PDF</button></div>
  <h1>${escapeHtml(planName)}</h1>
  <p><strong>Aluno:</strong> ${escapeHtml(studentName)}</p>
  <p><strong>Idade:</strong> ${escapeHtml(studentAge ?? "Não informada")}</p>
  <p><strong>Data:</strong> ${escapeHtml(formatDatePtBr(parseDateInput(date) || new Date()))}</p>
  <p><strong>Semana:</strong> ${escapeHtml(formatDatePtBr(startOfWeek))} a ${escapeHtml(
    formatDatePtBr(new Date(endOfWeek.getTime() - 1))
  )}</p>
  ${description ? `<h2>Descrição</h2><div class="box">${escapeHtml(description)}</div>` : ""}
  ${objective ? `<h2>Objetivo</h2><div class="box">${escapeHtml(objective)}</div>` : ""}
  ${focusAreas ? `<h2>Foco</h2><div class="box">${escapeHtml(focusAreas)}</div>` : ""}
  ${intensity ? `<h2>Intensidade</h2><div class="box">${escapeHtml(intensity)}</div>` : ""}
  ${
    estimatedDurationMinutes || estimatedCaloriesMin || estimatedCaloriesMax
      ? `<h2>Duração e gasto estimado</h2><div class="box">${escapeHtml(
          estimatedDurationMinutes || "-"
        )} min · ${escapeHtml(estimatedCaloriesMin || "-")} a ${escapeHtml(
          estimatedCaloriesMax || "-"
        )} kcal</div>`
      : ""
  }
  ${studentSummary ? `<h2>Resumo para o aluno</h2><div class="box">${escapeHtml(studentSummary)}</div>` : ""}
  ${safetyNote ? `<h2>Segurança</h2><div class="box">${escapeHtml(safetyNote)}</div>` : ""}
  ${notes ? `<h2>Observações</h2><div class="box">${escapeHtml(notes)}</div>` : ""}
  <h2>Exercícios</h2><table><thead><tr><th>#</th><th>Exercício</th><th>Séries</th><th>Reps</th><th>Carga</th><th>Descanso</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    alert("Não foi possível abrir a prévia. Verifique o bloqueio de pop-up.");
    return;
  }

  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

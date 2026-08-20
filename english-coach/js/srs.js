// Progresso e repetição espaçada — tudo em localStorage, sem backend.
// Leitner simplificado: cada item tem uma "caixa" (0-5). Acertar sobe de caixa
// e empurra a próxima revisão mais para frente; errar volta para a caixa 0.

const STORAGE_KEY = "coach-ingles-state-v1";
const BOX_INTERVALS_DAYS = [0, 1, 2, 4, 7, 14]; // caixa -> dias até a próxima revisão

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const ms = new Date(b) - new Date(a);
  return Math.round(ms / 86400000);
}

function defaultState() {
  return {
    currentDay: 1,
    completedDays: [],
    streak: 0,
    lastCompletedDate: null,
    items: {} // itemId -> { box, dueDate }
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function recordItemResult(state, itemId, success) {
  const existing = state.items[itemId] || { box: 0, dueDate: todayISO() };
  const nextBox = success ? Math.min(existing.box + 1, BOX_INTERVALS_DAYS.length - 1) : 0;
  const due = new Date();
  due.setDate(due.getDate() + BOX_INTERVALS_DAYS[nextBox]);
  state.items[itemId] = { box: nextBox, dueDate: due.toISOString().slice(0, 10) };
  saveState(state);
}

// Retorna itens de dias já concluídos que estão "vencidos" para revisão hoje.
export function getDueReviewItems(state, curriculum, limit = 4) {
  const today = todayISO();
  const completedIds = new Set(state.completedDays);
  const pool = [];
  for (const day of curriculum) {
    if (!completedIds.has(day.id)) continue;
    for (const p of day.practice) {
      const record = state.items[p.id];
      if (!record || record.dueDate <= today) {
        pool.push({ ...p, dayTitle: day.title });
      }
    }
  }
  // embaralha e limita
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit);
}

export function markDayComplete(state, dayId) {
  const today = todayISO();
  if (!state.completedDays.includes(dayId)) {
    state.completedDays.push(dayId);
  }
  if (state.lastCompletedDate === today) {
    // já concluiu algo hoje, não duplica streak
  } else if (state.lastCompletedDate && daysBetween(state.lastCompletedDate, today) === 1) {
    state.streak += 1;
  } else if (!state.lastCompletedDate) {
    state.streak = 1;
  } else if (daysBetween(state.lastCompletedDate, today) > 1) {
    state.streak = 1; // quebrou a sequência, recomeça
  }
  state.lastCompletedDate = today;
  state.currentDay = Math.min(state.currentDay + 1, 9999);
  saveState(state);
}

export function getStreak(state) {
  const today = todayISO();
  if (!state.lastCompletedDate) return 0;
  const gap = daysBetween(state.lastCompletedDate, today);
  if (gap > 1) return 0; // sequência quebrada, mostra 0 até ela treinar de novo
  return state.streak;
}

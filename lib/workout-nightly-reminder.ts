import { addDaysToCivilKey, civilKeyToUtcDate, getSaoPauloCivilKey } from "./workout-validation-window";

export const NIGHTLY_WORKOUT_REMINDER_EVENT = "WORKOUT_PENDING_21H_EMAIL";
export const NIGHTLY_WORKOUT_REMINDER_HOUR = 21;

export function getNightlyWorkoutReminderWindow(now: Date): {
  civilDate: string;
  start: Date;
  end: Date;
  localHour: number;
  allowedToSend: boolean;
} {
  const civilDate = getSaoPauloCivilKey(now);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const localHour = Number(parts.find((part) => part.type === "hour")?.value ?? -1);
  return {
    civilDate,
    start: civilKeyToUtcDate(civilDate),
    end: civilKeyToUtcDate(addDaysToCivilKey(civilDate, 1)),
    localHour,
    // O cron é 00:00 UTC = 21:00 Brasília do dia civil anterior.
    // Pequenos atrasos de execução são aceitos até o fim da hora 22.
    allowedToSend: localHour === 21 || localHour === 22,
  };
}

export function shouldSendNightlyWorkoutReminder(status: string | null | undefined): boolean {
  // Somente treinos verdadeiramente abertos; não cobrar quem concluiu
  // parcialmente, registrou impedimento, está em revisão ou não foi liberado.
  return String(status || "").toUpperCase() === "PENDENTE";
}

export function buildNightlyWorkoutReminderMessage(studentName: string, workoutName: string) {
  const firstName = String(studentName || "Aluno").trim().split(/\s+/)[0] || "Aluno";
  const safeWorkoutName = String(workoutName || "seu treino de hoje").trim() || "seu treino de hoje";
  const subject = `${firstName}, seu treino de hoje ainda está te esperando 💪`;
  const content =
    `Oi, ${firstName}! 💚\n\n` +
    `Notamos que ${safeWorkoutName} ainda não foi marcado como concluído no Funcional UP Digital.\n\n` +
    "Se você já treinou, lembre-se de registrar a conclusão no aplicativo. Se ainda não conseguiu, o treino continua disponível dentro do prazo indicado na plataforma.\n\n" +
    "Cada sessão faz parte da sua evolução. Se teve alguma dificuldade ou precisa de ajuste, converse com seu professor pelo chat.\n\n" +
    "Estamos juntos nessa jornada!\nEquipe Funcional UP Digital";
  return { firstName, subject, content };
}

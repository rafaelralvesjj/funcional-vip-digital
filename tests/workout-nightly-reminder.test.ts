import test from "node:test";
import assert from "node:assert/strict";
import {
  getNightlyWorkoutReminderWindow,
  shouldSendNightlyWorkoutReminder,
  buildNightlyWorkoutReminderMessage,
} from "../lib/workout-nightly-reminder.ts";

test("00:00 UTC de 17/11 é 21h de 16/11 em Brasília e olha somente os treinos do dia 16", () => {
  const window = getNightlyWorkoutReminderWindow(new Date("2026-11-17T00:00:00.000Z"));
  assert.equal(window.civilDate, "2026-11-16");
  assert.equal(window.localHour, 21);
  assert.equal(window.allowedToSend, true);
  assert.equal(window.start.toISOString(), "2026-11-16T00:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-11-17T00:00:00.000Z");
});
test("não envia antecipado nem no dia seguinte", () => {
  assert.equal(getNightlyWorkoutReminderWindow(new Date("2026-11-16T23:00:00.000Z")).allowedToSend, false);
  assert.equal(getNightlyWorkoutReminderWindow(new Date("2026-11-17T03:00:00.000Z")).allowedToSend, false);
});
test("somente PENDENTE recebe lembrete; conclusão parcial não vira falta", () => {
  assert.equal(shouldSendNightlyWorkoutReminder("PENDENTE"), true);
  for (const status of ["CONCLUIDO", "CONCLUIDO_PARCIALMENTE", "NAO_REALIZADO", "PRE_PLANEJADO", "PRECISA_REVISAO", "INTERROMPIDO_CUIDADO", "NAO_CONCLUIDO_COM_RELATO"]) {
    assert.equal(shouldSendNightlyWorkoutReminder(status), false, status);
  }
});
test("texto não afirma que aluno deixou de treinar", () => {
  const message = buildNightlyWorkoutReminderMessage("Denize Batista Meira", "Treino A");
  assert.match(message.content, /ainda não foi marcado como concluído/);
  assert.match(message.content, /Se você já treinou/);
  assert.match(message.subject, /Denize/);
});

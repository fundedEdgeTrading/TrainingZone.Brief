import test from "node:test";
import assert from "node:assert/strict";
import { dragSaveFields, type WeekOccurrence } from "./agenda-utils";

function occurrence(over: Partial<WeekOccurrence> = {}): WeekOccurrence {
  return {
    id: "ses-1",
    uid: "ses-1:1",
    dayIndex: 1,
    startMin: 600,
    endMin: 660,
    title: "Grupo Fuerza",
    trainerId: "tr-1",
    type: "reduced",
    capacity: 6,
    selfBookable: false,
    isTrial: false,
    isRecurring: true,
    recurrence: "WEEKLY",
    recUntilISO: "2026-12-31",
    bookedMemberId: null,
    bookedMemberName: null,
    bookedCount: 2,
    status: "SCHEDULED",
    ...over,
  };
}

// --- QA-RES-03 · soltar una ocurrencia de una serie va por saveSession con alcance

test("QA-RES-03 · el arrastre de una ocurrencia manda el día original, el nuevo y el alcance", () => {
  const fields = dragSaveFields(occurrence(), {
    centerId: "c-1",
    occurrenceISO: "2026-09-29",
    dateISO: "2026-09-30",
    startHHMM: "11:00",
    endHHMM: "12:00",
    scope: "single",
  });

  assert.equal(fields.id, "ses-1");
  assert.equal(fields.occurrenceDate, "2026-09-29", "el servidor tiene que saber QUÉ día de la serie se movió");
  assert.equal(fields.date, "2026-09-30");
  assert.equal(fields.startTime, "11:00");
  assert.equal(fields.endTime, "12:00");
  assert.equal(fields.scope, "single");
  // Todo lo demás viaja tal cual: guardar no puede degradar la serie.
  assert.equal(fields.recurrence, "WEEKLY");
  assert.equal(fields.recUntil, "2026-12-31");
  assert.equal(fields.capacity, "6");
  assert.equal(fields.type, "reduced");
});

test("QA-RES-03 · arrastrar no toca al socio del EP: no manda memberId", () => {
  const fields = dragSaveFields(occurrence({ type: "personal", bookedMemberId: "m-1", selfBookable: true }), {
    centerId: "c-1",
    occurrenceISO: "2026-09-29",
    dateISO: "2026-09-29",
    startHHMM: "09:00",
    endHHMM: "10:00",
    scope: "all",
  });
  // Mandarlo intentaría reservarle de nuevo; mover ya se lleva su reserva.
  assert.equal("memberId" in fields, false);
  assert.equal(fields.selfBookable, "on");
});

test("QA-RES-03 · una serie sin fin no manda recUntil", () => {
  const fields = dragSaveFields(occurrence({ recUntilISO: null }), {
    centerId: "c-1",
    occurrenceISO: "2026-09-29",
    dateISO: "2026-09-29",
    startHHMM: "09:00",
    endHHMM: "10:00",
    scope: "future",
  });
  assert.equal("recUntil" in fields, false);
});

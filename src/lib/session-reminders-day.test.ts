import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { dueReminderKinds, runSessionReminderRule } from "./session-reminders";
import { renderSessionReminderEmail } from "@/lib/emails/templates";

/**
 * QA-RES-10 · R13: "Mañana entrenas" solo el día anterior; con menos de 2 h,
 * solo el de 2 h.
 *
 * La regla enviaba cada variante en cuanto `hoursUntilStart` bajaba de su
 * umbral. Con el cron diario de las 05:00 UTC, una clase de las 20:00 de HOY
 * recibía "Mañana entrenas" por la mañana (faltan 13 h ≤ 24 h), y una pasada a
 * menos de 2 h mandaba las dos variantes a la vez si la de 24 h no había salido.
 * Y "mañana" se medía en horas, no en el calendario del centro.
 */

const MADRID = "Europe/Madrid";
const at = (iso: string) => new Date(iso);

test("QA-RES-10 · con menos de 2 h solo toca el de 2 h", () => {
  // 12:00 en Madrid, clase a las 13:00 del mismo día.
  assert.deepEqual(dueReminderKinds(at("2026-09-23T11:00:00Z"), at("2026-09-23T10:00:00Z"), MADRID), ["2H"]);
});

test("QA-RES-10 · el mismo día y con más de 2 h no se manda nada", () => {
  // 07:00 en Madrid (la pasada del cron), clase a las 20:00 de hoy: 13 h.
  assert.deepEqual(dueReminderKinds(at("2026-09-23T18:00:00Z"), at("2026-09-23T05:00:00Z"), MADRID), []);
});

test("QA-RES-10 · el día anterior toca el de 24 h aunque falten más de 24 h", () => {
  // 07:00 del martes en Madrid, clase el miércoles a las 19:00: 36 h. Con la
  // pasada diaria, si no sale ahora no sale nunca el día anterior.
  assert.deepEqual(dueReminderKinds(at("2026-09-24T17:00:00Z"), at("2026-09-23T05:00:00Z"), MADRID), ["24H"]);
});

test("QA-RES-10 · 'mañana' es el calendario del centro, no el de UTC", () => {
  // 22:30 UTC del 23 = 00:30 del 24 en Madrid. La clase es el 24 a las 20:00
  // de Madrid: en UTC parece "mañana", en el centro ya es hoy.
  assert.deepEqual(dueReminderKinds(at("2026-09-24T18:00:00Z"), at("2026-09-23T22:30:00Z"), MADRID), []);
});

test("QA-RES-10 · lo que ya empezó o queda a dos días no avisa", () => {
  assert.deepEqual(dueReminderKinds(at("2026-09-23T09:00:00Z"), at("2026-09-23T10:00:00Z"), MADRID), []);
  assert.deepEqual(dueReminderKinds(at("2026-09-25T17:00:00Z"), at("2026-09-23T05:00:00Z"), MADRID), []);
});

// --- Plantilla ----------------------------------------------------------------

const base = {
  memberFirstName: "Eva",
  brandName: "Centro",
  brandLogoUrl: "https://example.com/logo.png",
  variant: "24H" as const,
  sessionName: "Grupo reducido",
  dateLabel: "jueves, 24 de septiembre",
  startTime: "19:00",
  centerName: "Centro",
  agendaUrl: "https://example.com/portal/agenda",
};

test("QA-RES-10 · la ventana del correo es la del servidor, no un 24h fijo", () => {
  const html = renderSessionReminderEmail({ ...base, cancelWindowHours: 48, withinCancelWindow: false });
  assert.match(html, /48h antes/);
  assert.doesNotMatch(html, /24h/);
});

test("QA-RES-10 · dentro de la ventana no se promete una cancelación gratis que ya no existe", () => {
  // Con la ventana de 48 h, el aviso del día anterior llega ya dentro de ella.
  const html = renderSessionReminderEmail({ ...base, cancelWindowHours: 48, withinCancelWindow: true });
  assert.doesNotMatch(html, /Puedes cancelar sin penalización/);
  assert.match(html, /dentro de las 48h previas/);
});

// --- La regla sobre filas reales ---------------------------------------------

const SUFFIX = "test-qa-res-10";

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
    await prisma.booking.deleteMany({ where: { member: { orgId: org.id } } });
    await prisma.classSession.deleteMany({ where: { orgId: org.id } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/** Reserva en un centro de Madrid para el día `day` (fecha suelta) a `startTime`. */
async function bookingOn(tag: string, day: Date, startTime: string) {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Recordatorios ${tag}`, slug } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro`, timezone: MADRID },
  });
  const member = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: center.id, firstName: "Eva", lastName: tag, email: `${slug}@example.com` },
  });
  const session = await prisma.classSession.create({
    data: { orgId: org.id, centerId: center.id, name: "Grupo", classType: "Grupo", date: day, startTime, endTime: startTime, capacity: 10 },
  });
  const booking = await prisma.booking.create({
    data: { sessionId: session.id, memberId: member.id, occurrenceDate: day, status: "BOOKED" },
  });
  return { orgId: org.id, bookingId: booking.id };
}

const marks = async (orgId: string) =>
  (await prisma.auditLog.findMany({ where: { orgId, entityType: "Booking" }, select: { action: true } }))
    .map((r) => r.action)
    .sort();

/** Sin Brevo, el mailer vuelca el correo entero al log: aquí solo cuenta qué se marca. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
}

test("QA-RES-10 · R13: a menos de 2 h sale solo el de 2 h, no también 'Mañana entrenas'", async () => {
  const f = await bookingOn("dos-horas", new Date(2026, 8, 23), "13:00");
  const sent = await quietly(() => runSessionReminderRule(f.orgId, at("2026-09-23T10:00:00Z")));
  assert.equal(sent, 1);
  assert.deepEqual(await marks(f.orgId), ["SESSION_REMINDER_2H_SENT"]);
});

test("QA-RES-10 · R13: una clase de hoy no recibe 'Mañana entrenas' en la pasada de la mañana", async () => {
  const f = await bookingOn("hoy", new Date(2026, 8, 23), "20:00");
  const sent = await quietly(() => runSessionReminderRule(f.orgId, at("2026-09-23T05:00:00Z")));
  assert.equal(sent, 0);
  assert.deepEqual(await marks(f.orgId), []);
});

test("QA-RES-10 · R13: la clase de mañana recibe el de 24 h en la pasada de hoy", async () => {
  const f = await bookingOn("manana", new Date(2026, 8, 24), "19:00");
  const sent = await quietly(() => runSessionReminderRule(f.orgId, at("2026-09-23T05:00:00Z")));
  assert.equal(sent, 1);
  assert.deepEqual(await marks(f.orgId), ["SESSION_REMINDER_24H_SENT"]);
});

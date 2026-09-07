import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { runSessionReminderRule, memberWantsSessionReminders, setMemberSessionReminderPreference } from "./session-reminders";

/**
 * E5-03 — escenario principal: el recordatorio a 24h se envía una sola vez
 * por reserva (idempotencia con marca en `AuditLog`) y respeta la
 * cancelación previa y la preferencia propia del socio.
 *
 * El centro se crea en zona "UTC" para poder construir `occurrenceDate`/
 * `startTime` con aritmética exacta (ver `zonedTimeToInstant` en
 * `date-utils.ts`): con offset 0 el instante resultante es
 * `Date.UTC(y, m, d, hh, mm)` sin más vueltas, así el test no depende de la
 * zona horaria del proceso que lo ejecuta.
 */

const SUFFIX = "e2e-session-reminders-test";
const pad = (n: number) => String(n).padStart(2, "0");

function utcCalendarParts(date: Date) {
  return {
    date: new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`,
  };
}

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

async function fixture(tag: string, hoursFromNow: number) {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Reminders ${tag}`, slug } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro`, timezone: "UTC" },
  });
  const member = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: center.id, firstName: "Eva", lastName: tag, email: `${slug}@example.com` },
  });
  const { date, time } = utcCalendarParts(new Date(Date.now() + hoursFromNow * 60 * 60 * 1000));
  const session = await prisma.classSession.create({
    data: {
      orgId: org.id,
      centerId: center.id,
      name: "Grupo reducido",
      classType: "Grupo",
      date,
      startTime: time,
      endTime: time,
      capacity: 10,
    },
  });
  const booking = await prisma.booking.create({
    data: { sessionId: session.id, memberId: member.id, occurrenceDate: date, status: "BOOKED" },
  });
  return { orgId: org.id, memberId: member.id, bookingId: booking.id };
}

test("recordatorio a 24h: se envía una vez y queda marcado en AuditLog", async () => {
  const f = await fixture("24h", 20);

  const firstRun = await runSessionReminderRule(f.orgId);
  assert.equal(firstRun, 1, "una reserva a 20h vista dispara el recordatorio de 24h");

  const marks = await prisma.auditLog.count({
    where: { orgId: f.orgId, action: "SESSION_REMINDER_24H_SENT", entityId: f.bookingId },
  });
  assert.equal(marks, 1);

  const secondRun = await runSessionReminderRule(f.orgId);
  assert.equal(secondRun, 0, "una segunda pasada no repite el mismo recordatorio");
});

test("una reserva cancelada antes del aviso no recibe recordatorio", async () => {
  const f = await fixture("cancelada", 10);
  await prisma.booking.update({ where: { id: f.bookingId }, data: { status: "CANCELLED" } });

  const sent = await runSessionReminderRule(f.orgId);
  assert.equal(sent, 0);
});

test("el socio puede desactivar los recordatorios de forma independiente", async () => {
  const f = await fixture("preferencia", 15);

  assert.equal(await memberWantsSessionReminders(f.memberId), true, "por defecto están activados");
  await setMemberSessionReminderPreference(f.orgId, f.memberId, false);
  assert.equal(await memberWantsSessionReminders(f.memberId), false);

  const sent = await runSessionReminderRule(f.orgId);
  assert.equal(sent, 0, "con la preferencia apagada no se envía, aunque esté dentro de la ventana");

  await setMemberSessionReminderPreference(f.orgId, f.memberId, true);
  const sentAfterReenable = await runSessionReminderRule(f.orgId);
  assert.equal(sentAfterReenable, 1, "al reactivarla vuelve a enviarse en la siguiente pasada");
});

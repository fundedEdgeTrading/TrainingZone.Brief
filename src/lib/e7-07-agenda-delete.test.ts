import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { deleteSession, bookSessionForMemberAsStaff } from "@/lib/agenda-queries";
import { SESSION_DELETED_AUDIT_ACTION } from "@/lib/session-deletion";
import {
  balanceOf,
  cleanupRegressionOrgs,
  createRegressionMember,
  createRegressionOrg,
  createRegressionSession,
  type RegressionMember,
  type RegressionOrg,
} from "@/lib/e7-07-fixture";

/**
 * E7-07 · U1 — borrar una sesión con reservas devuelve el bono a cada socio y
 * deja `AuditLog`.
 *
 * `session-deletion.test.ts` ya prueba la parte pura (`planSessionDeletion`
 * reparte las reservas en devolver / no devolver / confirmar). Lo que faltaba
 * es lo que esa decisión hace de verdad contra la base: que el saldo suba, que
 * suba UNA vez por socio, y que quede firmado quién borró.
 *
 * Es la operación con más dinero por línea de toda la agenda. Un borrado que no
 * devuelve no da ningún error: deja a cada apuntado con una sesión menos por
 * una clase que nadie dio, y el descuadre solo aparece semanas después, cuando
 * el bono se agota antes de tiempo y el socio lo reclama en el mostrador.
 */

const TAG = "u1-delete";
let org: RegressionOrg;
let actorUserId: string;

before(async () => {
  await cleanupRegressionOrgs(TAG);
  org = await createRegressionOrg(TAG);
  actorUserId = org.trainerId;
});

after(async () => {
  await cleanupRegressionOrgs(TAG);
  await prisma.$disconnect();
});

/** Tres socios apuntados a la misma clase, por el camino real del mostrador. */
async function sessionWithThree(name: string, opts: { startsInHours: number }) {
  const socios: RegressionMember[] = [];
  for (const i of [1, 2, 3]) socios.push(await createRegressionMember(org, `${TAG}-${name}`, i, 5));
  const session = await createRegressionSession(org, `${name}`, { capacity: 6, ...opts });

  for (const socio of socios) {
    const booked = await bookSessionForMemberAsStaff(org.orgId, {
      sessionId: session.id,
      memberId: socio.id,
      occurrenceDate: session.day,
    });
    assert.equal(booked.ok, true, "el punto de partida tiene que ser una reserva real, con su descuento");
  }
  for (const socio of socios) assert.equal(await balanceOf(socio.subscriptionId), 4);

  return { session, socios };
}

test("U1 · borrar una sesión con tres reservas devuelve la sesión a los tres bonos", async () => {
  const { session, socios } = await sessionWithThree("clase-con-tres", { startsInHours: 72 });

  const result = await deleteSession(org.orgId, session.id, { actorUserId });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.refunded, 3, "una devolución por reserva viva");

  for (const socio of socios) {
    assert.equal(await balanceOf(socio.subscriptionId), 5, "cada socio recupera exactamente la sesión que pagó");
  }
  assert.equal(await prisma.classSession.count({ where: { id: session.id } }), 0);
  assert.equal(await prisma.booking.count({ where: { sessionId: session.id } }), 0);
});

test("U1 · la devolución deja AuditLog por socio, firmado por quien borra", async () => {
  const { session, socios } = await sessionWithThree("clase-auditada", { startsInHours: 72 });

  await deleteSession(org.orgId, session.id, { actorUserId });

  const audits = await prisma.auditLog.findMany({
    where: { action: SESSION_DELETED_AUDIT_ACTION, memberId: { in: socios.map((s) => s.id) } },
    select: { actorUserId: true, memberId: true, entityType: true, metadata: true },
  });

  assert.equal(audits.length, 3, "una entrada por devolución, no una por borrado: el saldo se cuadra sesión a sesión");
  assert.deepEqual(
    [...new Set(audits.map((a) => a.memberId))].sort(),
    socios.map((s) => s.id).sort()
  );
  for (const audit of audits) {
    assert.equal(audit.actorUserId, actorUserId, "sin firma, la devolución no se le puede pedir a nadie");
    assert.equal(audit.entityType, "Booking");
    assert.equal((audit.metadata as { refunded: boolean }).refunded, true);
  }
});

test("U1 · y deja asiento en SessionLedger: nada mueve el saldo sin escribir en el libro", async () => {
  const { session, socios } = await sessionWithThree("clase-con-libro", { startsInHours: 72 });

  await deleteSession(org.orgId, session.id, { actorUserId });

  for (const socio of socios) {
    const entries = await prisma.sessionLedger.findMany({
      where: { subscriptionId: socio.subscriptionId },
      select: { delta: true, reason: true },
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(entries.map((e) => e.delta), [-1, 1], "reserva y devolución, y el libro cuadra a cero");
    assert.equal(entries[1].reason, "CANCELLATION");
  }
});

test("U1 · una asistencia ya registrada no se borra a la primera, y no devuelve nada", async () => {
  const { session, socios } = await sessionWithThree("clase-asistida", { startsInHours: -48 });
  const [asistio] = socios;
  await prisma.booking.updateMany({
    where: { sessionId: session.id, memberId: asistio.id },
    data: { status: "ATTENDED", checkedInAt: new Date() },
  });

  const blocked = await deleteSession(org.orgId, session.id, { actorUserId });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ok === false && blocked.needsConfirmation, true, "la decisión es de quien borra, no del código");
  assert.equal(await prisma.classSession.count({ where: { id: session.id } }), 1, "y hasta entonces no se toca nada");
  for (const socio of socios) assert.equal(await balanceOf(socio.subscriptionId), 4);

  const confirmed = await deleteSession(org.orgId, session.id, { actorUserId, confirmSettled: true });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.ok && confirmed.refunded, 2, "los dos que no llegaron a asistir sí recuperan");
  assert.equal(await balanceOf(asistio.subscriptionId), 4, "una sesión que se dio, se dio: no se devuelve");
});

test("U1 · una reserva cancelada no revive ni cobra dos veces al borrar la sesión", async () => {
  const { session, socios } = await sessionWithThree("clase-con-cancelada", { startsInHours: 72 });
  const [cancelado] = socios;
  // Cancelada a mano como la deja el portal: sin bono asociado, porque ya se
  // devolvió al cancelar. Si el borrado la contase otra vez, ese socio saldría
  // con una sesión de regalo.
  await prisma.booking.updateMany({
    where: { sessionId: session.id, memberId: cancelado.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), subscriptionId: null },
  });
  await prisma.subscription.update({
    where: { id: cancelado.subscriptionId },
    data: { sessionsRemaining: 5 },
  });

  const result = await deleteSession(org.orgId, session.id, { actorUserId });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.refunded, 2, "solo se devuelve lo que seguía consumido");
  assert.equal(await balanceOf(cancelado.subscriptionId), 5, "el que ya había cancelado no cobra dos veces");
});

test("U1 · un bono ilimitado no recibe devolución: nunca descontó", async () => {
  const socio = await createRegressionMember(org, `${TAG}-ilimitado`, 9, null);
  const session = await createRegressionSession(org, "clase-ilimitada", { capacity: 6, startsInHours: 72 });
  await bookSessionForMemberAsStaff(org.orgId, {
    sessionId: session.id,
    memberId: socio.id,
    occurrenceDate: session.day,
  });

  const result = await deleteSession(org.orgId, session.id, { actorUserId });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.refunded, 0);
  assert.equal(await balanceOf(socio.subscriptionId), null, "NULL − 1 sigue siendo NULL, y +1 también");
  assert.equal(await prisma.sessionLedger.count({ where: { subscriptionId: socio.subscriptionId } }), 0);
});

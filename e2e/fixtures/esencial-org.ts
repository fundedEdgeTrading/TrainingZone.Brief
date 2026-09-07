import { prisma } from "@/lib/prisma";
import { setPassword } from "@/lib/identity";

/**
 * Organización propia en plan **Esencial** (`features: []`), para probar el
 * CAMINO NEGATIVO del gateo por plan: E7-06 · E5 en la API móvil y E7-08 en la
 * web.
 *
 * Va en una organización aparte y no bajando de plan a la de demo a propósito.
 * Bajar el plan de la organización de demo la deja sin `salud_aptitud` mientras
 * dure el spec, y con eso se cae media suite —incluidos los specs de otras
 * pistas— si algo falla antes de restaurarlo. Un plan es estado global de la
 * organización: se prueba con una organización de usar y tirar, no tocando la
 * que comparten todos los demás tests.
 *
 * Trae lo justo para que el muro de pago tenga algo que cerrar: un centro, una
 * dirección de centro con credencial y una sesión con la que pedir las rutas
 * hijas (`/brief/[id]`), que es donde el gateo se rompió en la web.
 */

export const ESENCIAL_SLUG = "e2e-esencial-gateo";
export const ESENCIAL_PASSWORD = "demo1234";
export const ESENCIAL_DIRECTOR_EMAIL = "e2e.esencial.director@example.com";

export type EsencialOrg = {
  orgId: string;
  centerId: string;
  directorEmail: string;
  directorUserId: string;
  sessionId: string;
  memberId: string;
};

export async function createEsencialOrg(): Promise<EsencialOrg> {
  await deleteEsencialOrg();

  const org = await prisma.organization.create({
    data: {
      name: "Gimnasio Esencial (e2e)",
      slug: ESENCIAL_SLUG,
      // Plan real del catálogo, no un estado inventado: `features: []` es lo
      // que hace que TODAS las rutas premium tengan que cerrarse.
      platformPlan: "esencial_mes",
      platformStatus: "ACTIVE",
    },
  });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro Esencial", slug: `${ESENCIAL_SLUG}-centro` },
  });

  const identity = await prisma.identity.create({
    data: { email: ESENCIAL_DIRECTOR_EMAIL, passwordHash: "x" },
  });
  await setPassword(identity.id, ESENCIAL_PASSWORD);
  const director = await prisma.user.create({
    data: {
      identityId: identity.id,
      orgId: org.id,
      centerId: center.id,
      name: "Dirección Esencial",
      email: ESENCIAL_DIRECTOR_EMAIL,
      role: "CENTER_DIRECTOR",
    },
  });
  await prisma.centerMembership.create({
    data: { orgId: org.id, userId: director.id, centerId: center.id, role: "CENTER_DIRECTOR", isPrimary: true, allocationPct: 100 },
  });

  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: "Bono grupos", type: "SESSION_PACK", sessionsIncluded: 10, priceCents: 6000 },
  });
  const memberIdentityEmail = "e2e.esencial.socio@example.com";
  const memberIdentity = await prisma.identity.create({ data: { email: memberIdentityEmail, passwordHash: "x" } });
  await setPassword(memberIdentity.id, ESENCIAL_PASSWORD);
  const memberUser = await prisma.user.create({
    data: {
      identityId: memberIdentity.id,
      orgId: org.id,
      centerId: center.id,
      name: "Socio Esencial",
      email: memberIdentityEmail,
      role: "MEMBER",
    },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      userId: memberUser.id,
      firstName: "Socio",
      lastName: "Esencial",
      email: memberIdentityEmail,
      state: "ACTIVE",
    },
  });
  await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      centerId: center.id,
      startDate: new Date(),
      priceCents: 6000,
      sessionsIncluded: 10,
      sessionsRemaining: 5,
    },
  });

  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + 1);
  const session = await prisma.classSession.create({
    data: {
      orgId: org.id,
      centerId: center.id,
      trainerId: director.id,
      name: "Clase Esencial",
      classType: "Grupo reducido",
      date: day,
      startTime: "18:00",
      endTime: "19:00",
      capacity: 8,
    },
  });
  await prisma.booking.create({
    data: { sessionId: session.id, occurrenceDate: day, memberId: member.id, status: "BOOKED" },
  });

  return {
    orgId: org.id,
    centerId: center.id,
    directorEmail: ESENCIAL_DIRECTOR_EMAIL,
    directorUserId: director.id,
    sessionId: session.id,
    memberId: member.id,
  };
}

/** Idempotente: se llama antes de crear y al terminar. */
export async function deleteEsencialOrg() {
  const org = await prisma.organization.findUnique({ where: { slug: ESENCIAL_SLUG }, select: { id: true } });
  if (!org) return;

  const bookings = await prisma.booking.findMany({ where: { session: { orgId: org.id } }, select: { id: true } });
  const bookingIds = bookings.map((b) => b.id);
  await prisma.sessionDebrief.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.sessionLedger.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.classSession.deleteMany({ where: { orgId: org.id } });
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.subscription.deleteMany({ where: { member: { orgId: org.id } } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  await prisma.membershipPlan.deleteMany({ where: { orgId: org.id } });
  await prisma.centerMembership.deleteMany({ where: { orgId: org.id } });
  const users = await prisma.user.findMany({ where: { orgId: org.id }, select: { id: true, identityId: true } });
  await prisma.mobileRefreshToken.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

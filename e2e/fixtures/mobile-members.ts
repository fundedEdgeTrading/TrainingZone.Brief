import { prisma } from "@/lib/prisma";
import { setPassword } from "@/lib/identity";
import { CONSENT_VERSION } from "@/lib/consent";

/**
 * Socios, sesiones y reservas de usar y tirar DENTRO de la organización de
 * demo, para los specs de la API móvil (E7-06 · E3, E6, E7 y E8).
 *
 * Se monta contra la base real y no contra un doble, por lo mismo que
 * `agenda-booking.test.ts`: lo que estos specs protegen —saldo de bonos,
 * estados de reserva, quién ve un dato de salud— solo se manifiesta en lo que
 * queda escrito.
 *
 * Va dentro de la organización de demo, no en una propia, porque la API móvil
 * se entra con credenciales reales y los roles de personal que se prueban
 * (recepción, dirección de centro) son los del seed: montar una organización
 * aparte obligaría a duplicar toda su plantilla para probar su ámbito.
 */

export const FIXTURE_TAG = "e2e-mobile";
export const FIXTURE_PASSWORD = "demo1234";

export type FixtureMember = {
  memberId: string;
  userId: string;
  email: string;
  subscriptionId: string;
};

export type FixtureContext = {
  orgId: string;
  centerId: string;
  centerName: string;
  trainerId: string;
  planId: string;
};

/** La Jota: es el centro cuyos roles usan el resto de specs. */
export async function fixtureContext(tag: string): Promise<FixtureContext> {
  const trainer = await prisma.user.findFirstOrThrow({
    where: { email: "entrenador@trainingzone.es" },
    select: { id: true, orgId: true, centerId: true },
  });
  const center = await prisma.center.findUniqueOrThrow({
    where: { id: trainer.centerId! },
    select: { id: true, name: true },
  });
  const plan = await prisma.membershipPlan.create({
    data: {
      orgId: trainer.orgId,
      name: `${FIXTURE_TAG}-${tag} bono grupos`,
      type: "SESSION_PACK",
      sessionsIncluded: 10,
      priceCents: 6000,
    },
  });
  return { orgId: trainer.orgId, centerId: center.id, centerName: center.name, trainerId: trainer.id, planId: plan.id };
}

/**
 * Socio con credencial propia: la API móvil se entra con email y contraseña, no
 * hay forma de firmar un token por la puerta de atrás sin dejar de probar el
 * camino real.
 */
export async function createFixtureMember(
  ctx: FixtureContext,
  tag: string,
  index: number,
  sessionsRemaining: number | null
): Promise<FixtureMember> {
  const email = `${FIXTURE_TAG}.${tag}.${index}@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "x" } });
  await setPassword(identity.id, FIXTURE_PASSWORD);

  const user = await prisma.user.create({
    data: {
      identityId: identity.id,
      orgId: ctx.orgId,
      centerId: ctx.centerId,
      name: `Socio ${tag} ${index}`,
      email,
      role: "MEMBER",
    },
  });
  const member = await prisma.member.create({
    data: {
      orgId: ctx.orgId,
      primaryCenterId: ctx.centerId,
      userId: user.id,
      firstName: `Socio${index}`,
      lastName: tag,
      email,
      state: "ACTIVE",
      // E5-08: sin esto el socio entra al portal detrás del muro de primera
      // sesión (edad, contacto de emergencia y declaración de salud) y no llega
      // a ver ninguna clase — el spec de paridad se caía ahí, no en la reserva.
      // El socio de estos fixtures es uno que ya pasó por la puerta.
      birthDate: new Date("1990-05-17"),
      emergencyContact: "Contacto de prueba · 600000000",
      consentHealth: true,
      // Con la versión vigente firmada: si no, el portal recibe al socio con el
      // aviso de reconsentimiento encima de la lista de clases.
      consentVersion: CONSENT_VERSION,
      consentHealthAt: new Date(),
    },
  });
  const subscription = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: ctx.planId,
      centerId: ctx.centerId,
      startDate: new Date(),
      priceCents: 6000,
      sessionsIncluded: 10,
      sessionsRemaining,
    },
  });

  return { memberId: member.id, userId: user.id, email, subscriptionId: subscription.id };
}

/**
 * Sesión de grupo reducido en el centro del contexto.
 *
 * `startsInHours` fija el hueco respecto a AHORA en lugar de un día suelto: la
 * ventana de cancelación se mide contra el instante de comienzo, así que "dentro
 * de 48 h" y "dentro de 2 h" son los dos casos que hacen falta y no se pueden
 * expresar con una fecha a pelo.
 */
export async function createFixtureSession(
  ctx: FixtureContext,
  tag: string,
  {
    capacity,
    startsInHours,
    centerId,
    trainerId,
  }: { capacity: number; startsInHours: number; centerId?: string; trainerId?: string }
) {
  const startsAt = new Date(Date.now() + startsInHours * 60 * 60 * 1000);
  const day = new Date(startsAt);
  day.setHours(0, 0, 0, 0);
  const hh = String(startsAt.getHours()).padStart(2, "0");
  const mm = String(startsAt.getMinutes()).padStart(2, "0");
  const endHour = String((startsAt.getHours() + 1) % 24).padStart(2, "0");

  const session = await prisma.classSession.create({
    data: {
      orgId: ctx.orgId,
      // Los specs de ámbito necesitan poner la sesión en OTRO centro: es
      // justamente el caso que prueban.
      centerId: centerId ?? ctx.centerId,
      trainerId: trainerId ?? ctx.trainerId,
      name: `${FIXTURE_TAG}-${tag} clase`,
      classType: "Grupo reducido",
      date: day,
      startTime: `${hh}:${mm}`,
      endTime: `${endHour}:${mm}`,
      capacity,
    },
  });
  return { sessionId: session.id, day, startsAt };
}

export const balanceOf = (subscriptionId: string) =>
  prisma.subscription
    .findUniqueOrThrow({ where: { id: subscriptionId }, select: { sessionsRemaining: true } })
    .then((s) => s.sessionsRemaining);

/** "YYYY-MM-DD" del día local, que es como viaja la ocurrencia por la API. */
export function dateParam(day: Date) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

/** Borra todo lo que cuelga del prefijo. Idempotente: se llama antes y después. */
export async function cleanupFixtures() {
  const members = await prisma.member.findMany({
    where: { email: { startsWith: `${FIXTURE_TAG}.` } },
    select: { id: true, userId: true },
  });
  const sessions = await prisma.classSession.findMany({
    where: { name: { startsWith: `${FIXTURE_TAG}-` } },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);
  const memberIds = members.map((m) => m.id);

  const bookings = await prisma.booking.findMany({
    where: { OR: [{ sessionId: { in: sessionIds } }, { memberId: { in: memberIds } }] },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);

  await prisma.sessionDebrief.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.sessionLedger.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.classSession.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.auditLog.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.subscription.deleteMany({ where: { memberId: { in: memberIds } } });
  // Todo lo que cuelga del socio con FK obligatoria. La lista sale del esquema
  // (los modelos con `memberId String` sin `?`) y no de ir persiguiendo el
  // error de clave ajena que toque: pasar por el portal web, por ejemplo, deja
  // `AnnouncementView`, que no tiene nada que ver con reservas.
  await prisma.announcementView.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.clientFeedback.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.selfAssessment.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.trainerDebrief.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.trainerRating.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.retentionAlert.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.memberNote.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.conversation.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.assessment.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.mesocycle.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.workoutProgram.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.performanceMetric.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.memberProgressEntry.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });

  // Por el PREFIJO DE EMAIL y no solo por los socios encontrados: si un
  // `beforeAll` se cae entre crear la identidad y crear el socio, la fila
  // huérfana bloquea la siguiente ejecución con un choque de email único —y el
  // fallo aparece en un test que no tiene nada que ver.
  const users = await prisma.user.findMany({
    where: { email: { startsWith: `${FIXTURE_TAG}.` } },
    select: { id: true, identityId: true },
  });
  // Reservar y cancelar genera avisos al socio: cuelgan del usuario con FK
  // obligatoria, así que se sueltan antes de borrarlo.
  await prisma.notification.deleteMany({ where: { recipientUserId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: `${FIXTURE_TAG}.` } } });
  await prisma.membershipPlan.deleteMany({ where: { name: { startsWith: `${FIXTURE_TAG}-` } } });
}

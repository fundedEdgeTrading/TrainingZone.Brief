import { prisma } from "@/lib/prisma";

/**
 * Organización de usar y tirar para la batería de regresión de E7-07.
 *
 * Mismo patrón que `agenda-booking.test.ts` —montar la organización contra
 * Postgres real y borrarla al terminar—, extraído aquí porque siete casos de la
 * historia necesitan exactamente el mismo decorado: un centro, un bono de
 * grupos, unos cuantos socios con saldo y sesiones con hora. Lo que cambia
 * entre ellos es lo que se hace encima, no el escenario.
 *
 * Cada fichero de la batería usa su propio `tag`, así que las organizaciones no
 * se pisan aunque los tests corran en el mismo proceso, y `cleanup` borra por
 * prefijo: una ejecución que se caiga a medias no deja al siguiente `npm run
 * test:unit` con filas huérfanas.
 *
 * No es código de producción: solo lo importan ficheros `*.test.ts`.
 */

export const E7_07_PREFIX = "e7-07";

export type RegressionMember = { id: string; userId: string; subscriptionId: string };

export type RegressionOrg = {
  orgId: string;
  centerId: string;
  trainerId: string;
  planId: string;
};

/** Centro con zona horaria explícita: U4 mide la ventana de cancelación con ella. */
export async function createRegressionOrg(tag: string, timezone = "Europe/Madrid"): Promise<RegressionOrg> {
  const slug = `${E7_07_PREFIX}-${tag}`;
  const org = await prisma.organization.create({
    data: { name: `Regresión ${tag}`, slug, platformPlan: "elite_ano", platformStatus: "ACTIVE" },
  });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro`, timezone },
  });
  const identity = await prisma.identity.create({ data: { email: `${slug}-trainer@example.com`, passwordHash: "x" } });
  const trainer = await prisma.user.create({
    data: {
      identityId: identity.id,
      orgId: org.id,
      centerId: center.id,
      name: `Entrenador ${tag}`,
      email: `${slug}-trainer@example.com`,
      role: "TRAINER",
    },
  });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: `Bono ${tag}`, type: "SESSION_PACK", sessionsIncluded: 10, priceCents: 6000 },
  });

  return { orgId: org.id, centerId: center.id, trainerId: trainer.id, planId: plan.id };
}

/** Socio con bono. `sessionsRemaining` a `null` = cuota ilimitada. */
export async function createRegressionMember(
  org: RegressionOrg,
  tag: string,
  index: number,
  sessionsRemaining: number | null = 5
): Promise<RegressionMember> {
  const email = `${E7_07_PREFIX}-${tag}-socio${index}@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "x" } });
  const user = await prisma.user.create({
    data: {
      identityId: identity.id,
      orgId: org.orgId,
      centerId: org.centerId,
      name: `Socio ${index}`,
      email,
      role: "MEMBER",
    },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.orgId,
      primaryCenterId: org.centerId,
      userId: user.id,
      firstName: `Socio${index}`,
      lastName: tag,
      email,
      state: "ACTIVE",
    },
  });
  const subscription = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: org.planId,
      centerId: org.centerId,
      startDate: new Date(),
      priceCents: 6000,
      sessionsIncluded: 10,
      sessionsRemaining,
    },
  });
  return { id: member.id, userId: user.id, subscriptionId: subscription.id };
}

/**
 * Sesión con su hora de comienzo situada respecto a AHORA.
 *
 * La hora va aparte del día (`ClassSession.date` guarda medianoche y
 * `startTime` es reloj de pared del centro), así que "dentro de N horas" hay
 * que traducirlo a las dos columnas: es exactamente lo que hace el código de
 * producción al medir la ventana de cancelación, y por eso los tests de U3 y U4
 * no pueden usar un día suelto.
 */
export async function createRegressionSession(
  org: RegressionOrg,
  name: string,
  { capacity, startsInHours, recurrence }: { capacity: number; startsInHours: number; recurrence?: "NONE" | "WEEKLY" }
) {
  const startsAt = new Date(Date.now() + startsInHours * 60 * 60 * 1000);
  const day = new Date(startsAt);
  day.setHours(0, 0, 0, 0);
  const hh = String(startsAt.getHours()).padStart(2, "0");
  const mm = String(startsAt.getMinutes()).padStart(2, "0");
  const endHour = String((startsAt.getHours() + 1) % 24).padStart(2, "0");

  const session = await prisma.classSession.create({
    data: {
      orgId: org.orgId,
      centerId: org.centerId,
      trainerId: org.trainerId,
      name,
      classType: "Grupo reducido",
      date: day,
      startTime: `${hh}:${mm}`,
      endTime: `${endHour}:${mm}`,
      capacity,
      recurrence: recurrence ?? "NONE",
    },
  });
  return { id: session.id, day, startsAt };
}

export const balanceOf = (subscriptionId: string) =>
  prisma.subscription
    .findUniqueOrThrow({ where: { id: subscriptionId }, select: { sessionsRemaining: true } })
    .then((s) => s.sessionsRemaining);

/**
 * Borra las organizaciones de UN fichero de la batería. Idempotente: se llama
 * antes y después.
 *
 * El `tag` no es decorativo: `npm run test:unit` ejecuta todos los ficheros en
 * el mismo proceso, así que un borrado por el prefijo entero se llevaba por
 * delante las organizaciones de los otros ficheros de E7-07 mientras estaban
 * usándolas — cada fichero pasaba en solitario y fallaban en bloque al correr
 * la suite. Cada uno limpia lo suyo y solo lo suyo.
 */
export async function cleanupRegressionOrgs(tag: string) {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: `${E7_07_PREFIX}-${tag}` } },
    select: { id: true },
  });
  for (const org of orgs) {
    const bookings = await prisma.booking.findMany({ where: { session: { orgId: org.id } }, select: { id: true } });
    const bookingIds = bookings.map((b) => b.id);
    await prisma.sessionDebrief.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.sessionLedger.deleteMany({ where: { subscription: { member: { orgId: org.id } } } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.classSession.deleteMany({ where: { orgId: org.id } });
    await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
    await prisma.subscription.deleteMany({ where: { member: { orgId: org.id } } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    const users = await prisma.user.findMany({ where: { orgId: org.id }, select: { id: true, identityId: true } });
    await prisma.notification.deleteMany({ where: { recipientUserId: { in: users.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { orgId: org.id } });
    await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
    await prisma.membershipPlan.deleteMany({ where: { orgId: org.id } });
    await prisma.centerMembership.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }

  // Y las identidades por prefijo de email, no solo las que cuelgan de un
  // usuario encontrado: una ejecución que se caiga entre crear la identidad y
  // crear su usuario deja una fila huérfana que bloquea la siguiente con un
  // choque de email único, y el fallo aparece en un test que no tiene nada que
  // ver con lo que se rompió.
  await prisma.identity.deleteMany({ where: { email: { startsWith: `${E7_07_PREFIX}-${tag}` } } });
}

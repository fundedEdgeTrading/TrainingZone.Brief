import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { notifyConsecutiveNoShows, NO_SHOW_STREAK_ENTITY } from "@/lib/no-show-alerts";
import { CONSECUTIVE_NO_SHOW_THRESHOLD } from "@/lib/no-show";

/**
 * E1-07: la alerta de tres faltas llega solo a la dirección del centro del
 * socio.
 *
 * `no-show-alerts.ts` seleccionaba `role in [OWNER, CENTER_DIRECTOR]` de toda
 * la organización, mientras la documentación (CRM_REGLAS_NEGOCIO.md, RB-RES-009)
 * dice "dirección **del centro**". Con eso, el nombre y apellidos de un socio de
 * La Jota —y el hecho de que se está descolgando— aparecían en la bandeja de la
 * dirección de Santander.
 */

const SUFFIX = "test-alerta-faltas-ambito";

type Fixture = {
  orgId: string;
  laJota: string;
  puertaDelCarmen: string;
  santander: string;
  owner: string;
  dirJota: string;
  dirPuerta: string;
  dirSantander: string;
  memberJota: string;
  memberDosCentros: string;
};
let fx: Fixture;

async function makeCenter(orgId: string, name: string, slug: string) {
  return prisma.center.create({ data: { orgId, name, slug: `${SUFFIX}-${slug}` } });
}

async function makeDirector(orgId: string, tag: string, centerId: string | null, role: "OWNER" | "CENTER_DIRECTOR") {
  const identity = await prisma.identity.create({
    data: { email: `${SUFFIX}-${tag}@example.com`, passwordHash: "x" },
  });
  return prisma.user.create({
    data: { orgId, identityId: identity.id, name: tag, email: identity.email, role, centerId },
  });
}

/** Un socio con la racha ya cumplida: N faltas seguidas sin avisar, en `centerIds`. */
async function makeMemberWithStreak(primaryCenterId: string, tag: string, centerIds: string[]) {
  const member = await prisma.member.create({
    data: {
      orgId: fx.orgId,
      primaryCenterId,
      firstName: "Socio",
      lastName: tag,
      email: `${SUFFIX}-${tag}@example.com`,
      state: "ACTIVE",
    },
  });

  let day = 1;
  for (const centerId of centerIds) {
    // Una sesión por centro, con tantas faltas como haga falta para cruzar el
    // umbral repartidas entre ellas.
    const session = await prisma.classSession.create({
      data: {
        orgId: fx.orgId,
        centerId,
        name: `EP ${tag}`,
        classType: "Personal Training",
        date: new Date(2026, 0, day),
        startTime: "10:00",
        endTime: "11:00",
        capacity: 1,
      },
    });
    for (let i = 0; i < CONSECUTIVE_NO_SHOW_THRESHOLD; i++) {
      await prisma.booking.create({
        data: {
          sessionId: session.id,
          memberId: member.id,
          status: "NO_SHOW",
          noShowReason: "FORGOT",
          occurrenceDate: new Date(2026, 0, day++),
        },
      });
    }
  }
  return member.id;
}

async function recipientsFor(memberId: string): Promise<string[]> {
  await prisma.notification.deleteMany({ where: { orgId: fx.orgId } });
  await notifyConsecutiveNoShows(fx.orgId, memberId);
  const notifications = await prisma.notification.findMany({
    where: { orgId: fx.orgId, entityType: NO_SHOW_STREAK_ENTITY, entityId: memberId },
    select: { recipientUserId: true },
  });
  return notifications.map((n) => n.recipientUserId).sort();
}

async function wipe() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: SUFFIX } },
    select: { id: true },
  });
  for (const { id: orgId } of orgs) {
    await prisma.notification.deleteMany({ where: { orgId } });
    await prisma.booking.deleteMany({ where: { session: { orgId } } });
    await prisma.classSession.deleteMany({ where: { orgId } });
    await prisma.member.deleteMany({ where: { orgId } });
    await prisma.centerMembership.deleteMany({ where: { orgId } });
    const users = await prisma.user.findMany({ where: { orgId }, select: { identityId: true } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
    await prisma.center.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
}

before(async () => {
  await wipe();
  const org = await prisma.organization.create({
    data: { name: "Faltas", slug: SUFFIX, platformPlan: "avanzado_mes", platformStatus: "ACTIVE" },
  });
  const laJota = await makeCenter(org.id, "La Jota", "la-jota");
  const puerta = await makeCenter(org.id, "Puerta del Carmen", "puerta");
  const santander = await makeCenter(org.id, "Santander", "santander");

  const owner = await makeDirector(org.id, "owner", null, "OWNER");
  const dirJota = await makeDirector(org.id, "dir-jota", laJota.id, "CENTER_DIRECTOR");
  const dirPuerta = await makeDirector(org.id, "dir-puerta", puerta.id, "CENTER_DIRECTOR");
  const dirSantander = await makeDirector(org.id, "dir-santander", santander.id, "CENTER_DIRECTOR");

  fx = {
    orgId: org.id,
    laJota: laJota.id,
    puertaDelCarmen: puerta.id,
    santander: santander.id,
    owner: owner.id,
    dirJota: dirJota.id,
    dirPuerta: dirPuerta.id,
    dirSantander: dirSantander.id,
    memberJota: "",
    memberDosCentros: "",
  };
  fx.memberJota = await makeMemberWithStreak(fx.laJota, "jota", [fx.laJota]);
  fx.memberDosCentros = await makeMemberWithStreak(fx.laJota, "dos-centros", [fx.laJota, fx.puertaDelCarmen]);
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

test("E1-07 · la alerta la reciben el OWNER y la dirección del centro del socio", async () => {
  assert.deepEqual(await recipientsFor(fx.memberJota), [fx.owner, fx.dirJota].sort());
});

test("E1-07 · no la recibe la dirección de los demás centros", async () => {
  const recipients = await recipientsFor(fx.memberJota);
  assert.ok(!recipients.includes(fx.dirSantander), "Santander no tiene nada que ver con este socio");
  assert.ok(!recipients.includes(fx.dirPuerta));
});

test("E1-07 · un socio que entrena en dos centros avisa a las dos direcciones", async () => {
  const recipients = await recipientsFor(fx.memberDosCentros);
  assert.deepEqual(recipients, [fx.owner, fx.dirJota, fx.dirPuerta].sort());
  assert.ok(!recipients.includes(fx.dirSantander));
});

test("E1-07 · dirección imputada por CenterMembership también entra", async () => {
  // El ámbito de una dirección no es solo su centro base: `centerScopeFor` suma
  // las filas de `CenterMembership`, y esta alerta usa el mismo criterio.
  await prisma.centerMembership.create({
    data: { orgId: fx.orgId, userId: fx.dirSantander, centerId: fx.laJota, role: "CENTER_DIRECTOR" },
  });

  assert.ok((await recipientsFor(fx.memberJota)).includes(fx.dirSantander));

  await prisma.centerMembership.deleteMany({ where: { userId: fx.dirSantander } });
});

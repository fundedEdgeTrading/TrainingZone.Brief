import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { isMemberInScope } from "@/lib/center-scope";
import { resolveExistingMemberCheckoutCenter } from "@/lib/member-billing";
import { createSubscriptionFromPlan } from "@/lib/subscriptions";

/**
 * HU-ST-29 §5 · Los dos huecos de ámbito de centro en las puertas de cobro.
 *
 * El plan de "una cuenta de Stripe por centro" (docs/hu/HU-ST-29) está
 * bloqueado: toca `prisma/schema.prisma`, congelado este trimestre, y la
 * pregunta de negocio del §2 sigue sin respuesta. Pero su §5 identifica dos
 * fallos que existen **hoy**, con una sola cuenta conectada por organización, y
 * que son el mecanismo exacto por el que se fugaría dinero entre centros en
 * cuanto haya más de una cuenta. Se arreglan por separado y este fichero es lo
 * que impide que vuelvan.
 *
 * 1. `createStripeCheckoutAction` recibía `memberId` de un formulario y abría el
 *    cobro sin mirar el ámbito de centro de quien cobra — a diferencia de
 *    `registerManualPayment`, en el mismo fichero, que sí lo miraba.
 * 2. El checkout público de la landing usaba el `centerId` del segmento de URL
 *    para un socio ya existente sin comprobar que tuviera relación con él. La
 *    ruta es anónima: el email no demuestra ser nadie.
 */

const SLUG = "test-hu-st-29-ambito-cobro";

type Fixture = {
  orgId: string;
  laJota: string;
  puertaDelCarmen: string;
  socioDeLaJota: string;
  recepcionDePuertaDelCarmen: { id: string; role: "RECEPTION"; orgId: string; centerId: string };
  direccionDeOrganizacion: { id: string; role: "OWNER"; orgId: string; centerId: null };
};
let fx: Fixture;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Ámbito de cobro", slug: SLUG } });
  const [laJota, puertaDelCarmen] = await Promise.all([
    prisma.center.create({ data: { orgId: org.id, name: "La Jota", slug: `${SLUG}-la-jota` } }),
    prisma.center.create({ data: { orgId: org.id, name: "Puerta del Carmen", slug: `${SLUG}-pdc` } }),
  ]);

  const socio = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: laJota.id,
      firstName: "Socia",
      lastName: "De La Jota",
      email: `${SLUG}-socia@example.com`,
    },
  });

  const email = `${SLUG}-recepcion@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "no-usable-en-tests" } });
  const recepcion = await prisma.user.create({
    data: {
      orgId: org.id,
      identityId: identity.id,
      name: "Recepción de Puerta del Carmen",
      email,
      role: "RECEPTION",
      centerId: puertaDelCarmen.id,
    },
  });

  fx = {
    orgId: org.id,
    laJota: laJota.id,
    puertaDelCarmen: puertaDelCarmen.id,
    socioDeLaJota: socio.id,
    recepcionDePuertaDelCarmen: { id: recepcion.id, role: "RECEPTION", orgId: org.id, centerId: puertaDelCarmen.id },
    direccionDeOrganizacion: { id: "no-existe", role: "OWNER", orgId: org.id, centerId: null },
  };
});

after(async () => {
  if (!fx) return;
  await prisma.sessionLedger.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.subscription.deleteMany({ where: { member: { orgId: fx.orgId } } });
  await prisma.membershipPlan.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.member.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.user.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.organization.deleteMany({ where: { id: fx.orgId } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// §5.1 · Cobro desde recepción
// ---------------------------------------------------------------------------

test("§5.1 · recepción de otro centro queda fuera del ámbito del socio", async () => {
  // Es el hecho que la acción no estaba consultando: la guarda existía y
  // funcionaba, simplemente nadie la llamaba desde `createStripeCheckoutAction`.
  assert.equal(await isMemberInScope(fx.recepcionDePuertaDelCarmen, fx.socioDeLaJota), false);
});

test("§5.1 · dirección de organización sí manda sobre todos sus centros", async () => {
  // La corrección no puede cerrarle la puerta a quien sí la tiene abierta:
  // `OWNER` no tiene frontera de centro dentro de SU organización.
  assert.equal(await isMemberInScope(fx.direccionDeOrganizacion, fx.socioDeLaJota), true);
});

test("§5.1 · createStripeCheckoutAction comprueba el ámbito antes de abrir el cobro", () => {
  // La acción exige una sesión real, así que aquí se fija la costura: la
  // comprobación tiene que estar y tiene que estar ANTES de llamar a Stripe.
  const fuente = readFileSync("src/app/(app)/billing/actions.ts", "utf8");
  const inicio = fuente.indexOf("export async function createStripeCheckoutAction");
  assert.ok(inicio > 0, "la acción tiene que seguir existiendo");
  const cuerpo = fuente.slice(inicio, fuente.indexOf("\n}", inicio));

  const guarda = cuerpo.indexOf("memberIsInScope");
  const checkout = cuerpo.indexOf("createMemberCheckout(");
  assert.ok(guarda > 0, "createStripeCheckoutAction tiene que comprobar el ámbito de centro");
  assert.ok(checkout > 0, "y seguir siendo la que abre el checkout");
  assert.ok(guarda < checkout, "la comprobación va antes de tocar Stripe, no después");
  assert.ok(cuerpo.includes("OUT_OF_CENTER_SCOPE"), "mismo mensaje que su acción vecina");
});

// ---------------------------------------------------------------------------
// §5.2 · Checkout público de la landing
// ---------------------------------------------------------------------------

test("§5.2 · el centro de la URL vale si es el centro habitual del socio", async () => {
  const centerId = await resolveExistingMemberCheckoutCenter({
    memberId: fx.socioDeLaJota,
    primaryCenterId: fx.laJota,
    requestedCenterId: fx.laJota,
  });
  assert.equal(centerId, fx.laJota);
});

test("§5.2 · un centro ajeno al socio NO se acepta desde una URL anónima", async () => {
  // Éste es el fallo: cualquiera que supiera el email de la socia podía abrir
  // /hazte-socio/<org>/puerta-del-carmen y atribuir la venta a ese centro.
  const centerId = await resolveExistingMemberCheckoutCenter({
    memberId: fx.socioDeLaJota,
    primaryCenterId: fx.laJota,
    requestedCenterId: fx.puertaDelCarmen,
  });
  assert.equal(centerId, fx.laJota, "la venta cae al centro del propio socio, no al de la URL");
});

test("§5.2 · pero un socio con bono en ese centro sí puede comprar allí (RB-AGENDA-003)", async () => {
  // La regla no puede romper el caso legítimo: un socio puede tener bonos vivos
  // en varios centros de la misma organización a la vez.
  const plan = await prisma.membershipPlan.create({
    data: { orgId: fx.orgId, name: "Bono de prueba", type: "SESSION_PACK", priceCents: 5000, sessionsIncluded: 10 },
  });
  // Por el camino de verdad: el alta del bono abre su asiento en `SessionLedger`
  // (invariante del trimestre), no se escribe `sessionsRemaining` a mano.
  const bono = await createSubscriptionFromPlan(prisma, {
    memberId: fx.socioDeLaJota,
    centerId: fx.puertaDelCarmen,
    plan,
  });

  try {
    const centerId = await resolveExistingMemberCheckoutCenter({
      memberId: fx.socioDeLaJota,
      primaryCenterId: fx.laJota,
      requestedCenterId: fx.puertaDelCarmen,
    });
    assert.equal(centerId, fx.puertaDelCarmen, "ya entrena ahí: la relación existe y la venta se le atribuye");
  } finally {
    await prisma.sessionLedger.deleteMany({ where: { subscriptionId: bono.id } });
    await prisma.subscription.delete({ where: { id: bono.id } });
    await prisma.membershipPlan.delete({ where: { id: plan.id } });
  }
});

test("§5.2 · la ruta pública no vuelve a pasar el centro de la URL a pelo", () => {
  const fuente = readFileSync("src/app/api/hazte-socio/[orgSlug]/[centerSlug]/checkout/route.ts", "utf8");
  const inicio = fuente.indexOf("const result = existingMember");
  const fin = fuente.indexOf("createProspectMemberCheckout({", inicio);
  const ramaSocioExistente = fuente.slice(inicio, fin);
  assert.ok(inicio > 0 && fin > inicio, "la rama del socio ya existente tiene que seguir ahí");
  assert.ok(
    ramaSocioExistente.includes("resolveExistingMemberCheckoutCenter"),
    "el centro del socio existente se resuelve, no se copia del segmento de URL"
  );
  assert.equal(
    /centerId:\s*ctx\.center\.id/.test(ramaSocioExistente),
    false,
    "y no queda ningún camino que lo copie tal cual"
  );
});

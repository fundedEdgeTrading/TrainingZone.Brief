import "dotenv/config";
import test, { after, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { confirmDemoCheckoutAction } from "@/app/demo-checkout/actions";

/**
 * E1-11: `confirmDemoCheckoutAction` repite la comprobación que hace su página.
 *
 * `/demo-checkout` redirige a `/planes` si Stripe está configurado, pero **una
 * server action es un endpoint por sí misma**: queda registrada en el build y
 * es invocable aunque la página redirija. Al otro lado,
 * `provisionDemoOrganization` crea una `Organization` con
 * `platformStatus: "ACTIVE"` — es decir, una organización operativa dada de
 * alta sin pagar.
 *
 * El test comprueba las dos mitades que importan: que devuelve error, y que NO
 * queda ninguna organización creada. Un error con el alta hecha sería la misma
 * fuga.
 */

const ORG_NAME = "Gimnasio de prueba E1-11";
const EMAIL = "e1-11-demo-checkout@example.com";
const PLAN = "esencial_mes";

function formData(email: string) {
  const data = new FormData();
  data.set("name", ORG_NAME);
  data.set("email", email);
  return data;
}

let originalKey: string | undefined;

/** El alta crea organización + credencial OWNER + invitación: se borra entero. */
async function wipe() {
  const orgs = await prisma.organization.findMany({
    where: { name: ORG_NAME },
    select: { id: true },
  });
  for (const { id: orgId } of orgs) {
    await prisma.invitation.deleteMany({ where: { orgId } });
    const users = await prisma.user.findMany({ where: { orgId }, select: { identityId: true } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
}

before(async () => {
  originalKey = process.env.STRIPE_SECRET_KEY;
  await wipe();
});

afterEach(wipe);

after(async () => {
  if (originalKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalKey;
  await prisma.$disconnect();
});

test("E1-11 · con STRIPE_SECRET_KEY presente, la action devuelve error y no crea nada", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_e1_11";

  const result = await confirmDemoCheckoutAction(PLAN, formData(EMAIL));
  assert.equal(result.ok, false);

  const created = await prisma.organization.count({ where: { name: ORG_NAME } });
  assert.equal(created, 0, "no puede quedar una Organization dada de alta sin pagar");
});

test("E1-11 · el corte va ANTES de mirar el plan: un plan inexistente da igual", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_e1_11";

  // Con Stripe activo esta action no existe para nadie, sea cual sea el plan.
  const result = await confirmDemoCheckoutAction("plan-que-no-existe", formData(EMAIL));
  assert.equal(result.ok, false);
});

test("E1-11 · en modo demo el comportamiento actual no cambia", async () => {
  delete process.env.STRIPE_SECRET_KEY;

  const result = await confirmDemoCheckoutAction(PLAN, formData(`demo-${Date.now()}@example.com`));
  assert.equal(result.ok, true, "sin Stripe, el alta de demostración sigue funcionando");
});

test("E1-11 · el cupo Fundador se sigue comprobando, después de esta", async () => {
  delete process.env.STRIPE_SECRET_KEY;
  const originalEnabled = process.env.PLATFORM_PLAN_FUNDADOR_ENABLED;
  process.env.PLATFORM_PLAN_FUNDADOR_ENABLED = "false";

  // La oferta apagada sigue cortando por su propia razón, no por la nueva.
  const result = await confirmDemoCheckoutAction("fundador", formData(`fundador-${Date.now()}@example.com`));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error, "Ese plan no está disponible.");

  if (originalEnabled === undefined) delete process.env.PLATFORM_PLAN_FUNDADOR_ENABLED;
  else process.env.PLATFORM_PLAN_FUNDADOR_ENABLED = originalEnabled;
});

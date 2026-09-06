import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import {
  PLAN_TYPES,
  resolvePlanType,
  saveMembershipPlan,
  setMembershipPlanActive,
  validateMembershipPlan,
} from "@/lib/membership-plans";

/**
 * E4-29 · Editar un producto tiene que hacer lo mismo desde la web y desde la
 * app. Antes no: la app no invalidaba el precio de Stripe, borraba en vez de
 * archivar, y convertía en bono de sesiones cualquier producto de grupo que
 * tocara.
 */

const SLUG = "e2e-membership-plans-test";
let orgId: string;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Productos", slug: SLUG } });
  orgId = org.id;
});

after(async () => {
  if (!orgId) return;
  await prisma.onlineWorkout.deleteMany({ where: { orgId } });
  await prisma.membershipPlan.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Tipo de producto
// ---------------------------------------------------------------------------

test("E4-29 · editar un DROP_IN desde la app no lo convierte en SESSION_PACK", () => {
  // La app manda la modalidad de tres valores. Como el producto ya es de grupo,
  // su tipo se conserva: es el fallo que se llevaba por delante las sesiones
  // sueltas de cualquier gimnasio que editara desde el móvil.
  assert.equal(resolvePlanType("DROP_IN", { serviceKind: "GROUP", sessionsIncluded: null }), "DROP_IN");
  // El dúo consume sesiones de grupo (`planServiceKind`), así que llega con
  // `serviceKind: "GROUP"` y tampoco se convierte en bono de sesiones.
  assert.equal(resolvePlanType("DUO", { serviceKind: "GROUP", sessionsIncluded: 8 }), "DUO");
});

test("E4-29 · los seis valores de PlanType son alcanzables", () => {
  for (const planType of PLAN_TYPES) {
    assert.equal(resolvePlanType(null, { planType, sessionsIncluded: 8 }), planType);
  }
  assert.equal(PLAN_TYPES.length, 6);
});

test("E4-29 · cambiar de modalidad sí reasigna el tipo", () => {
  assert.equal(resolvePlanType("DROP_IN", { serviceKind: "EP", sessionsIncluded: 8 }), "PERSONAL_TRAINING");
  assert.equal(resolvePlanType("DROP_IN", { serviceKind: "ONLINE", sessionsIncluded: null }), "ONLINE");
});

test("E4-29 · un bono sin sesiones no se guarda, venga de donde venga", () => {
  const base = { name: "Bono", priceCents: 12000, sessionsIncluded: null };
  assert.match(validateMembershipPlan({ ...base, planType: "SESSION_PACK" }, null) ?? "", /cuántas sesiones/);
  // Y con la modalidad de la app, el mismo mensaje.
  assert.match(validateMembershipPlan({ ...base, planType: "PERSONAL_TRAINING" }, null) ?? "", /cuántas sesiones/);
  assert.equal(validateMembershipPlan({ ...base, planType: "MONTHLY" }, null), null);
});

// ---------------------------------------------------------------------------
// El mismo producto, editado por las dos vías
// ---------------------------------------------------------------------------

test("E4-29 · el mismo plan editado por las dos vías da el mismo resultado", async () => {
  // Producto de partida, con el espejo de Stripe ya creado.
  const created = await saveMembershipPlan(orgId, {
    name: "Bono 10 sesiones",
    planType: "SESSION_PACK",
    priceCents: 30000,
    sessionsIncluded: 10,
    validityDays: 90,
    description: "Diez sesiones para tres meses.",
  });
  assert.equal(created.ok, true);
  const planId = created.ok ? created.id : "";
  await prisma.membershipPlan.update({
    where: { id: planId },
    data: { stripeProductId: "prod_test", stripePriceId: "price_test", stripeAccountId: "acct_test" },
  });

  // (1) Vía web: tipo explícito y precio nuevo.
  const web = await saveMembershipPlan(orgId, {
    planId,
    name: "Bono 10 sesiones",
    planType: "SESSION_PACK",
    priceCents: 32000,
    sessionsIncluded: 10,
    validityDays: 90,
    description: "Diez sesiones para tres meses.",
  });
  assert.equal(web.ok, true);
  const afterWeb = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: planId } });
  assert.equal(afterWeb.priceCents, 32000);
  assert.equal(afterWeb.stripePriceId, null, "cambiar el precio invalida el espejo de Stripe");
  assert.equal(afterWeb.stripeProductId, "prod_test", "el producto de Stripe no se toca: solo el precio");

  // Se restaura el espejo para repetir el experimento por la otra vía.
  await prisma.membershipPlan.update({ where: { id: planId }, data: { stripePriceId: "price_test", priceCents: 30000 } });

  // (2) Vía app: modalidad de tres valores, sin validez (la app no la manda).
  const movil = await saveMembershipPlan(orgId, {
    planId,
    name: "Bono 10 sesiones",
    serviceKind: "GROUP",
    priceCents: 32000,
    sessionsIncluded: 10,
    description: "Diez sesiones para tres meses.",
  });
  assert.equal(movil.ok, true);
  const afterMobile = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: planId } });

  assert.equal(afterMobile.priceCents, 32000);
  assert.equal(afterMobile.stripePriceId, null, "desde la app el precio obsoleto se quedaba vivo");
  assert.equal(afterMobile.type, afterWeb.type, "el tipo no cambia por la vía de entrada");
  assert.equal(afterMobile.validityDays, 90, "lo que la app no manda, se conserva");
  assert.equal(afterMobile.description, afterWeb.description);
  assert.equal(afterMobile.sessionsIncluded, afterWeb.sessionsIncluded);
});

test("E4-29 · borrar archiva, nunca borra", async () => {
  const created = await saveMembershipPlan(orgId, {
    name: "Cuota que se retira",
    planType: "MONTHLY",
    priceCents: 4900,
  });
  assert.equal(created.ok, true);
  const planId = created.ok ? created.id : "";

  const archived = await setMembershipPlanActive(orgId, planId, false);
  assert.equal(archived.ok, true);

  const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } });
  assert.ok(plan, "la fila sigue ahí: el histórico de cobros cuelga de ella");
  assert.equal(plan?.active, false);
});

test("E4-29 · un producto de otra organización no se toca", async () => {
  const otra = await prisma.organization.create({ data: { name: "Otra", slug: `${SLUG}-otra` } });
  const suyo = await prisma.membershipPlan.create({
    data: { orgId: otra.id, name: "Suyo", type: "MONTHLY", priceCents: 5000 },
  });

  const result = await saveMembershipPlan(orgId, { planId: suyo.id, name: "Robado", planType: "MONTHLY", priceCents: 1 });
  assert.equal(result.ok, false);

  const sinTocar = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: suyo.id } });
  assert.equal(sinTocar.name, "Suyo");

  await prisma.membershipPlan.deleteMany({ where: { orgId: otra.id } });
  await prisma.organization.delete({ where: { id: otra.id } });
});

// ---------------------------------------------------------------------------
// E12-03 · el plan ONLINE no es vendible sin contenido que entregar
// ---------------------------------------------------------------------------

test("E12-03 · un plan ONLINE sin contenido se guarda oculto y avisa", async () => {
  const result = await saveMembershipPlan(orgId, {
    name: "Online sin vídeos",
    planType: "ONLINE",
    priceCents: 2900,
    active: true,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.warning, "sin contenido, tiene que avisar de que se ha guardado oculto");

  const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: result.id } });
  assert.equal(plan.active, false, "no puede quedar visible sin contenido que entregar");
});

test("E12-03 · activar un plan ONLINE sin contenido se rechaza", async () => {
  const created = await saveMembershipPlan(orgId, {
    name: "Online por activar",
    planType: "ONLINE",
    priceCents: 2900,
    active: false,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const activated = await setMembershipPlanActive(orgId, created.id, true);
  assert.equal(activated.ok, false);
});

test("E12-03 · con contenido publicado, el plan ONLINE se activa sin problema", async () => {
  await prisma.onlineWorkout.create({
    data: {
      orgId,
      title: "Movilidad en casa",
      category: "Movilidad",
      level: "Principiante",
      durationMin: 20,
      videoUrl: "https://example.com/video.mp4",
    },
  });

  const result = await saveMembershipPlan(orgId, {
    name: "Online con contenido",
    planType: "ONLINE",
    priceCents: 2900,
    active: true,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.warning, undefined);

  const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: result.id } });
  assert.equal(plan.active, true);

  await prisma.onlineWorkout.deleteMany({ where: { orgId } });
});

// ---------------------------------------------------------------------------
// Regresión: que no vuelva a haber dos caminos
// ---------------------------------------------------------------------------

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) found.push(full);
  }
  return found;
}

test("E4-29 · nadie borra un producto de la base de datos", () => {
  const offenders = sourceFiles("src").filter((file) => /membershipPlan\.delete\b/.test(readFileSync(file, "utf8")));
  assert.deepEqual(
    offenders,
    [],
    `Borrado directo de productos en: ${offenders.join(", ")}. Se archiva (RB-VENTA-002): ` +
      "un producto tiene cobros colgando y borrarlo deja el histórico sin referencia."
  );
});

import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { listOrganizationsForAdmin, getPlatformMetrics } from "@/lib/platform-admin-queries";
import { createAssistedOrganization, resendOwnerActivationByOrgId } from "@/lib/provisioning";
import { monthlyPriceCents, getPlatformPlan } from "@/lib/platform-plans";

/**
 * E6-08 · back-office `/apta`. `PLATFORM_ADMIN` no tenía ni una pantalla
 * propia: con dos clientes se sobrevive con SQL, con cien no. Cubre las tres
 * piezas de servidor: el listado con búsqueda/filtro y sus métricas, y las
 * dos acciones (alta asistida fuera de Stripe, reenvío de activación) — las
 * dos dejan traza en AuditLog con quién y con qué.
 */

const SLUG = "e6-08-apta-test";
let actorUserId: string;
let actorOrgId: string;

before(async () => {
  // Limpieza de arranque: por si una ejecución anterior de este fichero se
  // interrumpió antes de su `after()`.
  await prisma.identity.deleteMany({ where: { email: { contains: SLUG } } });
  const actorOrg = await prisma.organization.create({ data: { name: "Apta soporte", slug: `${SLUG}-apta` } });
  actorOrgId = actorOrg.id;
  const identity = await prisma.identity.create({ data: { email: `${SLUG}-soporte@example.com`, passwordHash: "x" } });
  const actor = await prisma.user.create({
    data: { identityId: identity.id, orgId: actorOrgId, name: "Soporte", email: identity.email, role: "PLATFORM_ADMIN" },
  });
  actorUserId = actor.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { orgId: { in: await orgIdsOfThisTest() } } });
  await prisma.invitation.deleteMany({ where: { email: { contains: SLUG } } });
  await prisma.user.deleteMany({ where: { email: { contains: SLUG } } });
  await prisma.organization.deleteMany({ where: { slug: { contains: SLUG } } });
  await prisma.identity.deleteMany({ where: { email: { contains: SLUG } } });
  await prisma.$disconnect();
});

async function orgIdsOfThisTest() {
  const orgs = await prisma.organization.findMany({ where: { slug: { contains: SLUG } }, select: { id: true } });
  return orgs.map((o) => o.id);
}

test("E6-08 · alta asistida crea la organización, su director y una invitación, y deja traza en AuditLog", async () => {
  const email = `${SLUG}-director@example.com`;
  const result = await createAssistedOrganization({
    name: "Gimnasio Asistido",
    email,
    planCode: "avanzado_mes",
    paymentMethod: "TRANSFERENCIA",
    justification: "Factura nº 2026-045",
    actorUserId,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const org = await prisma.organization.findUnique({ where: { id: result.orgId } });
  assert.equal(org?.platformStatus, "ACTIVE");
  assert.equal(org?.platformPlan, "avanzado_mes");

  const owner = await prisma.user.findFirst({ where: { orgId: result.orgId, role: "OWNER" } });
  assert.equal(owner?.email, email);

  const invitation = await prisma.invitation.findFirst({ where: { orgId: result.orgId, type: "OWNER" } });
  assert.ok(invitation);
  assert.equal(invitation?.usedAt, null);

  const log = await prisma.auditLog.findFirst({ where: { orgId: result.orgId, action: "PLATFORM_ORG_ASSISTED_SIGNUP" } });
  assert.equal(log?.actorUserId, actorUserId);
  const metadata = log?.metadata as { planCode?: string; paymentMethod?: string; justification?: string } | null;
  assert.equal(metadata?.planCode, "avanzado_mes");
  assert.equal(metadata?.paymentMethod, "TRANSFERENCIA");
  assert.equal(metadata?.justification, "Factura nº 2026-045");
});

test("E6-08 · alta asistida no duplica una organización con el mismo director", async () => {
  const email = `${SLUG}-duplicado@example.com`;
  const first = await createAssistedOrganization({
    name: "Gimnasio Uno",
    email,
    planCode: "esencial_mes",
    paymentMethod: "FACTURA",
    justification: "Factura A",
    actorUserId,
  });
  assert.equal(first.ok, true);

  const second = await createAssistedOrganization({
    name: "Gimnasio Dos",
    email,
    planCode: "esencial_mes",
    paymentMethod: "FACTURA",
    justification: "Factura B",
    actorUserId,
  });
  assert.equal(second.ok, false);
});

test("E6-08 · reenviar activación renueva la invitación y deja traza en AuditLog", async () => {
  const email = `${SLUG}-reenvio@example.com`;
  const created = await createAssistedOrganization({
    name: "Gimnasio Reenvío",
    email,
    planCode: "esencial_mes",
    paymentMethod: "OTRO",
    justification: "Efectivo en mano",
    actorUserId,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const before = await prisma.invitation.findFirstOrThrow({ where: { orgId: created.orgId, type: "OWNER" } });

  const result = await resendOwnerActivationByOrgId(created.orgId, actorUserId);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.email, email);

  const after = await prisma.invitation.findUniqueOrThrow({ where: { id: before.id } });
  assert.ok(after.expiresAt.getTime() >= before.expiresAt.getTime());

  const log = await prisma.auditLog.findFirst({ where: { orgId: created.orgId, action: "PLATFORM_ACTIVATION_RESENT" } });
  assert.equal(log?.actorUserId, actorUserId);
});

test("E6-08 · reenviar activación falla si ya no hay invitación pendiente (organización ya activada)", async () => {
  const email = `${SLUG}-yaactiva@example.com`;
  const created = await createAssistedOrganization({
    name: "Gimnasio Ya Activo",
    email,
    planCode: "esencial_mes",
    paymentMethod: "OTRO",
    justification: "Efectivo",
    actorUserId,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  await prisma.invitation.updateMany({ where: { orgId: created.orgId, type: "OWNER" }, data: { usedAt: new Date() } });

  const result = await resendOwnerActivationByOrgId(created.orgId, actorUserId);
  assert.equal(result.ok, false);
});

test("E6-08 · el listado busca por nombre/email y filtra por estado de plataforma", async () => {
  const nameNeedle = `${SLUG}-buscable`;
  const active = await createAssistedOrganization({
    name: nameNeedle,
    email: `${SLUG}-buscable@example.com`,
    planCode: "esencial_mes",
    paymentMethod: "OTRO",
    justification: "x",
    actorUserId,
  });
  assert.equal(active.ok, true);
  if (!active.ok) return;
  await prisma.organization.update({ where: { id: active.orgId }, data: { platformStatus: "CANCELLED" } });

  const byName = await listOrganizationsForAdmin({ query: nameNeedle });
  assert.equal(byName.length, 1);
  assert.equal(byName[0].id, active.orgId);

  const byStatus = await listOrganizationsForAdmin({ query: nameNeedle, status: "ACTIVE" });
  assert.equal(byStatus.length, 0);

  const byCancelled = await listOrganizationsForAdmin({ query: nameNeedle, status: "CANCELLED" });
  assert.equal(byCancelled.length, 1);
});

test("E6-08 · el listado no expone ningún dato de salud del socio, solo su recuento", async () => {
  const row = (await listOrganizationsForAdmin({ query: SLUG }))[0];
  assert.ok(row);
  const keys = Object.keys(row);
  for (const forbidden of ["injuries", "healthRecord", "conditions", "aptitude", "consent"]) {
    assert.ok(!keys.some((k) => k.toLowerCase().includes(forbidden.toLowerCase())), `filtró un campo de salud: ${forbidden}`);
  }
  assert.equal(typeof row.membersCount, "number");
});

test("E6-08 · las métricas de plataforma cuentan por estado y agregan el MRR de las organizaciones que facturan", async () => {
  const metrics = await getPlatformMetrics();
  assert.ok(metrics.active >= 1);
  assert.ok(metrics.cancelled >= 1);
  assert.equal(typeof metrics.mrrCents, "number");
  assert.ok(metrics.mrrCents >= 0);
});

test("E6-08 · monthlyPriceCents mensualiza el anual y no cuenta a Fundador (pago único)", () => {
  const mes = getPlatformPlan("avanzado_mes")!;
  const ano = getPlatformPlan("avanzado_ano")!;
  const fundador = getPlatformPlan("fundador")!;
  assert.equal(monthlyPriceCents(mes), 12900);
  assert.equal(monthlyPriceCents(ano), Math.round((1290 / 12) * 100));
  assert.equal(monthlyPriceCents(fundador), null);
});

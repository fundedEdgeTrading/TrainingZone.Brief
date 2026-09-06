import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import {
  effectiveRetentionDays,
  getRetentionDays,
  RETENTION_DEFAULTS,
  retentionCutoff,
  retentionElapsed,
  runDataRetention,
} from "@/lib/data-retention";

/**
 * E10-08 · Motor de conservación.
 *
 * Se prueba contra la base real: lo que importa es qué fila queda y qué fila
 * desaparece, y eso un doble de `prisma` lo daría por bueno sin comprobarlo. La
 * organización de prueba se monta y se borra en cada pasada.
 */

const SUFFIX = "e2e-retention-test";
const DAY_MS = 86_400_000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

type Fixture = { orgId: string; centerId: string };

async function createFixture(tag: string): Promise<Fixture> {
  const org = await prisma.organization.create({ data: { name: `Retención ${tag}`, slug: `${SUFFIX}-${tag}` } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: "Centro", slug: `${SUFFIX}-${tag}-c` } });
  return { orgId: org.id, centerId: center.id };
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  for (const org of orgs) {
    const members = await prisma.member.findMany({ where: { orgId: org.id }, select: { id: true } });
    const memberIds = members.map((m) => m.id);
    const leads = await prisma.lead.findMany({ where: { orgId: org.id }, select: { id: true } });
    await prisma.healthRecord.deleteMany({
      where: { OR: [{ memberId: { in: memberIds } }, { leadId: { in: leads.map((l) => l.id) } }] },
    });
    await prisma.memberProgressEntry.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.leadNote.deleteMany({ where: { orgId: org.id } });
    await prisma.lead.deleteMany({ where: { orgId: org.id } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.invitation.deleteMany({ where: { orgId: org.id } });
    await prisma.retentionPolicy.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    // El AuditLog es append-only para el rol de la aplicación (E10-14) pero en
    // local la conexión es la propietaria, que sí puede: la limpieza de la
    // suite no es una operación de producto.
    await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/**
 * Escenario principal ("ex-socios"): un socio de baja en 2019 conservaba
 * íntegras lesiones, fotos y bioimpedancia porque `cancelledAt` no disparaba
 * nada. Al cumplirse el plazo, los datos clínicos se anonimizan.
 */
test("al cumplirse el plazo, los datos clínicos de un ex-socio se desligan de la persona", async () => {
  const fx = await createFixture("exsocio");
  const antiguo = RETENTION_DEFAULTS.HEALTH_DATA.retentionDays + 30;
  const member = await prisma.member.create({
    data: {
      orgId: fx.orgId,
      primaryCenterId: fx.centerId,
      firstName: "Ana",
      lastName: "Baja",
      email: `${SUFFIX}-ana@example.com`,
      state: "CANCELLED",
      cancelledAt: daysAgo(antiguo),
    },
  });
  const record = await prisma.healthRecord.create({
    data: { memberId: member.id, type: "INJURY", description: "Lumbalgia", severity: "LOW" },
  });
  await prisma.memberProgressEntry.create({
    data: { memberId: member.id, weightKg: 70, photoFrontUrl: "data:image/jpeg;base64,AAA" },
  });

  const reports = await runDataRetention(fx.orgId);
  const salud = reports.find((r) => r.rule === "saludDeExSocios");
  assert.equal(salud?.affected, 1);

  const afterRun = await prisma.healthRecord.findUniqueOrThrow({ where: { id: record.id } });
  assert.equal(afterRun.memberId, null, "el registro de salud sigue colgando del socio");
  assert.equal(await prisma.memberProgressEntry.count({ where: { memberId: member.id } }), 0);

  // Idempotente: una segunda pasada no vuelve a contar al mismo socio.
  const second = await runDataRetention(fx.orgId);
  assert.equal(second.find((r) => r.rule === "saludDeExSocios")?.affected, 0);
});

test("un socio activo no pierde nada, por antiguo que sea", async () => {
  const fx = await createFixture("activo");
  const member = await prisma.member.create({
    data: {
      orgId: fx.orgId,
      primaryCenterId: fx.centerId,
      firstName: "Luis",
      lastName: "Activo",
      email: `${SUFFIX}-luis@example.com`,
      state: "ACTIVE",
      joinedAt: daysAgo(4000),
      cancelledAt: null,
    },
  });
  await prisma.healthRecord.create({
    data: { memberId: member.id, type: "INJURY", description: "Hombro", severity: "LOW" },
  });

  await runDataRetention(fx.orgId);
  assert.equal(await prisma.healthRecord.count({ where: { memberId: member.id } }), 1);
});

/** Escenario "purgas": invitaciones caducadas y leads que no cerraron. */
test("se purgan las invitaciones caducadas y los leads que no cerraron", async () => {
  const fx = await createFixture("purgas");
  await prisma.invitation.create({
    data: {
      orgId: fx.orgId,
      type: "MEMBER",
      token: `${SUFFIX}-token-viejo`,
      email: `${SUFFIX}-viejo@example.com`,
      expiresAt: daysAgo(400),
    },
  });
  await prisma.invitation.create({
    data: {
      orgId: fx.orgId,
      type: "MEMBER",
      token: `${SUFFIX}-token-vivo`,
      email: `${SUFFIX}-vivo@example.com`,
      expiresAt: new Date(Date.now() + 7 * DAY_MS),
    },
  });

  const leadViejo = await prisma.lead.create({
    data: {
      orgId: fx.orgId,
      centerId: fx.centerId,
      firstName: "Perdido",
      lastName: "Hace mucho",
      phone: "600000000",
      postalCode: "50001",
      occupation: "—",
      goals: "—",
      hasTrainedBefore: false,
      channel: "Web",
      status: "NO_CERRADO",
      contactedAt: daysAgo(500),
    },
  });
  await prisma.healthRecord.create({
    data: { leadId: leadViejo.id, type: "CHRONIC_CONDITION", description: "Asma", severity: "LOW" },
  });
  await prisma.lead.create({
    data: {
      orgId: fx.orgId,
      centerId: fx.centerId,
      firstName: "En",
      lastName: "Seguimiento",
      phone: "600000001",
      postalCode: "50001",
      occupation: "—",
      goals: "—",
      hasTrainedBefore: false,
      channel: "Web",
      status: "SEGUIMIENTO",
      contactedAt: daysAgo(500),
    },
  });

  const reports = await runDataRetention(fx.orgId);
  assert.equal(reports.find((r) => r.rule === "invitacionesCaducadas")?.affected, 1);
  assert.equal(reports.find((r) => r.rule === "leadsNoConvertidos")?.affected, 1);
  assert.equal(await prisma.invitation.count({ where: { orgId: fx.orgId } }), 1);
  // Un lead vivo, por antiguo que sea, sigue teniendo finalidad.
  assert.equal(await prisma.lead.count({ where: { orgId: fx.orgId } }), 1);
  // Y su dato de salud no se queda huérfano.
  assert.equal(await prisma.healthRecord.count({ where: { leadId: leadViejo.id } }), 0);
});

/** Escenario "traza": cada pasada deja cuántas filas afectó y a qué regla. */
test("cada pasada deja constancia de qué regla afectó a cuántas filas", async () => {
  const fx = await createFixture("traza");
  const reports = await runDataRetention(fx.orgId);

  const run = await prisma.auditLog.findFirst({
    where: { orgId: fx.orgId, action: "DATA_RETENTION_RUN" },
    select: { metadata: true },
  });
  assert.ok(run, "la pasada no dejó apunte en AuditLog");
  const metadata = run.metadata as { reports?: { rule: string; affected: number }[] };
  assert.equal(metadata.reports?.length, reports.length);
  for (const r of metadata.reports ?? []) {
    assert.equal(typeof r.rule, "string");
    assert.equal(typeof r.affected, "number");
  }
});

/**
 * Escenario "validación posterior": el despacho ajusta los plazos SIN tocar
 * código, cambiando la fila de `RetentionPolicy`. Y no puede relajar el suelo.
 */
test("los plazos se ajustan desde datos, y el suelo legal no se puede relajar", async () => {
  const fx = await createFixture("plazos");
  await prisma.retentionPolicy.create({
    data: { orgId: fx.orgId, category: "HEALTH_DATA", retentionDays: 3650, minimumLegalDays: 0 },
  });
  await prisma.retentionPolicy.create({
    // Un plazo por debajo del mínimo legal: la restricción de base de datos lo
    // impide al escribir, y el motor tampoco se fía de que exista.
    data: { orgId: fx.orgId, category: "CONTRACT_BILLING", retentionDays: 30, minimumLegalDays: 0 },
  });

  const days = await getRetentionDays(fx.orgId);
  assert.equal(days.HEALTH_DATA, 3650);
  assert.equal(days.CONTRACT_BILLING, RETENTION_DEFAULTS.CONTRACT_BILLING.minimumLegalDays);
  // Sin fila, el plazo de partida.
  assert.equal(days.UNCONVERTED_LEAD, RETENTION_DEFAULTS.UNCONVERTED_LEAD.retentionDays);
});

// ---------- Núcleo puro ----------

test("effectiveRetentionDays respeta el suelo y deja subir el plazo", () => {
  assert.equal(effectiveRetentionDays("AUDIT_LOG", { retentionDays: 10, minimumLegalDays: 0 }), RETENTION_DEFAULTS.AUDIT_LOG.minimumLegalDays);
  assert.equal(effectiveRetentionDays("AUDIT_LOG", { retentionDays: 5000, minimumLegalDays: 0 }), 5000);
  assert.equal(effectiveRetentionDays("AUDIT_LOG", null), RETENTION_DEFAULTS.AUDIT_LOG.retentionDays);
});

test("el cómputo arranca en el hecho, no en la fecha de la pasada", () => {
  const now = new Date("2026-09-06T00:00:00.000Z");
  assert.equal(retentionElapsed(new Date("2020-01-01"), 365, now), true);
  assert.equal(retentionElapsed(new Date("2026-09-01"), 365, now), false);
  assert.equal(retentionElapsed(null, 0, now), false);
  assert.equal(retentionCutoff(10, now).toISOString(), "2026-08-27T00:00:00.000Z");
});

test("toda categoría del esquema tiene plazo de partida, norma y hecho de arranque", () => {
  for (const [category, def] of Object.entries(RETENTION_DEFAULTS)) {
    assert.ok(def.norm.trim().length > 0, `${category} sin norma citada`);
    assert.ok(def.countedFrom.trim().length > 0, `${category} sin hecho de arranque`);
    assert.ok(def.retentionDays >= def.minimumLegalDays, `${category} propone menos que su propio suelo`);
  }
});

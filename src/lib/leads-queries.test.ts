import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { createLead, missingLeadFields, updateLeadDetails } from "@/lib/leads-queries";

/**
 * E8-15 · captura de lead en dos pasos. Antes `postalCode`, `occupation` y
 * `goals` eran obligatorios en el alta — un formulario de admisión, no una
 * captura de lead. Ahora solo nombre, teléfono, centro y canal lo son; el
 * resto se completa después, sin bloquear la gestión comercial.
 */

const SLUG = "e8-15-leads-test";
let orgId: string;
let centerId: string;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Leads", slug: SLUG } });
  orgId = org.id;
  const center = await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-centro` } });
  centerId = center.id;
});

after(async () => {
  if (!orgId) return;
  // `createLead` deja traza en AuditLog (consentimiento comercial): sin
  // borrarla primero, la FK bloquea el borrado de la organización.
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.lead.deleteMany({ where: { orgId } });
  await prisma.center.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

test("E8-15 · un lead se crea solo con nombre, teléfono, centro y canal", async () => {
  const result = await createLead({
    orgId,
    centerId,
    firstName: "Ana",
    lastName: "Rápida",
    phone: "600000001",
    postalCode: "",
    occupation: "",
    goals: "",
    hasTrainedBefore: false,
    channel: "Instagram",
  });
  assert.equal(result.ok, true);
});

test("E8-15 · un código postal inválido, si se da, se rechaza igual", async () => {
  const result = await createLead({
    orgId,
    centerId,
    firstName: "Bea",
    lastName: "Test",
    phone: "600000002",
    postalCode: "12",
    occupation: "",
    goals: "",
    hasTrainedBefore: false,
    channel: "Instagram",
  });
  assert.equal(result.ok, false);
});

test("E8-15 · la ficha señala qué falta", () => {
  assert.deepEqual(missingLeadFields({ postalCode: "", occupation: "", goals: "" }), [
    "Código postal",
    "Ocupación",
    "Objetivos",
  ]);
  assert.deepEqual(missingLeadFields({ postalCode: "28001", occupation: "Diseñadora", goals: "Perder peso" }), []);
});

test("E8-15 · completar datos desde la ficha del lead", async () => {
  const created = await createLead({
    orgId,
    centerId,
    firstName: "Cris",
    lastName: "Completar",
    phone: "600000003",
    postalCode: "",
    occupation: "",
    goals: "",
    hasTrainedBefore: false,
    channel: "Instagram",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const updated = await updateLeadDetails(orgId, created.leadId, {
    postalCode: "28001",
    occupation: "Diseñadora",
    goals: "Tonificar",
  });
  assert.equal(updated.ok, true);

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: created.leadId } });
  assert.equal(lead.postalCode, "28001");
  assert.deepEqual(missingLeadFields(lead), []);
});

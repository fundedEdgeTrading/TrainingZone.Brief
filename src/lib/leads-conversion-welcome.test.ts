import "dotenv/config";
import test, { after, before, mock } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import { createLead, initiateLeadConversion } from "@/lib/leads-queries";

/**
 * QA-ALTA-04 · Convertir un lead creaba el socio y su invitación, pero nadie
 * le mandaba el enlace: el alta quedaba a la espera de un acceso que el socio
 * no sabía que existía. Se comprueba contra la frontera real —la llamada HTTP
 * a Brevo—, no contra un detalle interno del mailer.
 */

const SLUG = "qa-alta-04-bienvenida";
let orgId = "";
let centerId = "";
const sent: { to: string; subject: string; html: string }[] = [];
const previousKey = process.env.BREVO_API_KEY;

before(async () => {
  await cleanup();
  process.env.BREVO_API_KEY = "test-key";
  mock.method(globalThis, "fetch", async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { to: { email: string }[]; subject: string; htmlContent: string };
    sent.push({ to: body.to[0]!.email, subject: body.subject, html: body.htmlContent });
    return new Response("{}", { status: 201 });
  });
  const org = await prisma.organization.create({ data: { name: "Gimnasio Bienvenida", slug: SLUG, platformStatus: "ACTIVE" } });
  orgId = org.id;
  const center = await prisma.center.create({ data: { orgId, name: "Centro Bienvenida", slug: `${SLUG}-centro` } });
  centerId = center.id;
});

after(async () => {
  mock.restoreAll();
  if (previousKey === undefined) delete process.env.BREVO_API_KEY;
  else process.env.BREVO_API_KEY = previousKey;
  await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  const where = { orgId: org.id };
  await prisma.auditLog.deleteMany({ where });
  await prisma.memberNote.deleteMany({ where });
  await prisma.lead.deleteMany({ where });
  await prisma.invitation.deleteMany({ where });
  await prisma.member.deleteMany({ where });
  await prisma.center.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: org.id } });
}

test("QA-ALTA-04 · convertir un lead envía la bienvenida con el enlace de su invitación", async () => {
  const created = await createLead({
    orgId,
    centerId,
    firstName: "Carla",
    lastName: "Convertida",
    phone: "600000601",
    email: `carla@${SLUG}.test`,
    postalCode: "",
    occupation: "",
    goals: "",
    hasTrainedBefore: false,
    channel: "Instagram",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const converted = await initiateLeadConversion(orgId, created.leadId, { closeType: "EMBUDO" });
  assert.equal(converted.ok, true);
  if (!converted.ok) return;

  const welcome = sent.filter((m) => m.to === `carla@${SLUG}.test`);
  assert.equal(welcome.length, 1, "una y solo una bienvenida");
  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { memberId: converted.memberId } });
  assert.ok(welcome[0]!.html.includes(invitation.token), "el enlace del correo es el de la invitación vigente");
  assert.match(welcome[0]!.subject, /Gimnasio Bienvenida/);
});

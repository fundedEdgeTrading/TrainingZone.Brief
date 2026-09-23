import "dotenv/config";
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { authenticate, hashPassword } from "@/lib/identity";
import { completeMemberOnboarding, completeStaffOnboarding } from "./[token]/actions";

/**
 * QA-ALTA-09 · Activación de cuenta por invitación.
 *
 * Estas acciones se abren SIN sesión, solo con el token del correo, así que se
 * llaman tal cual: lo que el formulario deja o no deja hacer no cuenta, cuenta
 * lo que el servidor acepta.
 *
 * Vive fuera de `[token]/` a propósito: `node --test` trata las rutas como
 * glob y `[token]` es una clase de caracteres; dentro de esa carpeta el test no
 * casaría consigo mismo y se saltaría sin avisar.
 */

const SLUG = "p8-onboarding-actions";
const PASSWORD = "clave-nueva-123";
const OLD_PASSWORD = "clave-de-siempre-1";

let orgId = "";
let centerId = "";

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.assessment.deleteMany({ where: { orgId: org.id } });
  await prisma.invitation.deleteMany({ where: { orgId: org.id } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

before(async () => {
  await cleanup();
  orgId = (await prisma.organization.create({ data: { name: "Onboarding P8", slug: SLUG } })).id;
  centerId = (await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-c` } })).id;
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.assessment.deleteMany({ where: { orgId } });
  await prisma.invitation.deleteMany({ where: { orgId } });
  await prisma.member.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

let seq = 0;

async function memberInvitation() {
  seq += 1;
  const email = `${SLUG}-socio-${seq}@example.com`;
  const member = await prisma.member.create({
    data: { orgId, primaryCenterId: centerId, firstName: "Nora", lastName: "Socia", email, state: "PROSPECT" },
  });
  const invitation = await prisma.invitation.create({
    data: {
      orgId,
      type: "MEMBER",
      token: `${SLUG}-m-${seq}`,
      email,
      memberId: member.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  return { email, member, invitation };
}

const ALL_CONSENTS = {
  consentContract: true,
  consentHealth: true,
  consentImages: true,
  consentMarketing: false,
  consentAI: false,
};

async function existingIdentity(email: string, passwordSet: boolean) {
  return prisma.identity.create({
    data: {
      email,
      passwordHash: await hashPassword(OLD_PASSWORD),
      passwordSetAt: passwordSet ? new Date() : null,
    },
  });
}

test("QA-ALTA-09 · el servidor exige el consentimiento de salud", async () => {
  const { member, invitation } = await memberInvitation();
  const result = await completeMemberOnboarding(invitation.token, {
    ...ALL_CONSENTS,
    consentHealth: false,
    password: PASSWORD,
  });
  assert.equal(result.ok, false);
  const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
  assert.equal(after.userId, null, "sin salud no se activa la cuenta");
  assert.equal((await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).usedAt, null);
});

test("QA-ALTA-09 · el contrato no se marca aceptado sin la casilla", async () => {
  const { member, invitation } = await memberInvitation();
  const result = await completeMemberOnboarding(invitation.token, {
    ...ALL_CONSENTS,
    consentContract: false,
    password: PASSWORD,
  });
  assert.equal(result.ok, false);
  // `consentContract` nace a true por defecto en el esquema (congelado): la
  // prueba de aceptación es la fecha, y sin casilla no puede haberla.
  const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
  assert.equal(after.consentContractAt, null);
  assert.equal(after.userId, null);
});

test("QA-ALTA-09 · con todo firmado se activa, se consume el enlace y queda en AuditLog", async () => {
  const { email, member, invitation } = await memberInvitation();
  const result = await completeMemberOnboarding(invitation.token, { ...ALL_CONSENTS, password: PASSWORD });
  assert.deepEqual(result, { ok: true });

  const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
  assert.ok(after.userId);
  assert.equal(after.consentContract, true);
  assert.equal(after.consentHealth, true);
  assert.ok((await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).usedAt);
  assert.equal((await authenticate(email, PASSWORD)).ok, true);

  const audit = await prisma.auditLog.findFirst({
    where: { orgId, memberId: member.id, action: "MEMBER_ONBOARDING_CONSENTS_RECORDED" },
  });
  assert.ok(audit, "los consentimientos del onboarding tienen que poder demostrarse");
  assert.deepEqual(
    { health: (audit.metadata as Record<string, unknown>).health, images: (audit.metadata as Record<string, unknown>).images },
    { health: true, images: true }
  );

  const again = await completeMemberOnboarding(invitation.token, { ...ALL_CONSENTS, password: PASSWORD });
  assert.equal(again.ok, false, "el enlace es de un solo uso");
});

test("QA-ALTA-09 · un socio que ya tenía contraseña en Apta entra con la suya: no se le cambia", async () => {
  const { email, invitation } = await memberInvitation();
  await existingIdentity(email, true);

  const result = await completeMemberOnboarding(invitation.token, { ...ALL_CONSENTS, password: PASSWORD });
  assert.deepEqual(result, { ok: true });
  assert.equal((await authenticate(email, OLD_PASSWORD)).ok, true, "sigue valiendo la de siempre");
  assert.equal((await authenticate(email, PASSWORD)).ok, false);
});

test("QA-ALTA-09 · una identidad sin contraseña (invitada y sin activar) recibe la que se elige aquí", async () => {
  const { email, invitation } = await memberInvitation();
  await existingIdentity(email, false);

  const result = await completeMemberOnboarding(invitation.token, { ...ALL_CONSENTS, password: PASSWORD });
  assert.deepEqual(result, { ok: true });
  assert.equal((await authenticate(email, PASSWORD)).ok, true, "si no, la persona no puede entrar");
});

test("QA-ALTA-09 · el personal que ya tiene contraseña no la ve sobrescrita al aceptar (RB-ID-003)", async () => {
  const email = `${SLUG}-entrenador@example.com`;
  const identity = await existingIdentity(email, true);
  const user = await prisma.user.create({
    data: { identityId: identity.id, orgId, centerId, name: "Entrenador", email, role: "TRAINER" },
  });
  const invitation = await prisma.invitation.create({
    data: { orgId, type: "STAFF", token: `${SLUG}-staff`, email, userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) },
  });

  const result = await completeStaffOnboarding(invitation.token, PASSWORD);
  assert.deepEqual(result, { ok: true });
  assert.equal((await authenticate(email, OLD_PASSWORD)).ok, true);
  assert.equal((await authenticate(email, PASSWORD)).ok, false);
  assert.ok((await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).usedAt);
});

test("QA-ALTA-09 · el personal nuevo fija su contraseña y consume el enlace", async () => {
  const email = `${SLUG}-recepcion@example.com`;
  const identity = await existingIdentity(email, false);
  const user = await prisma.user.create({
    data: { identityId: identity.id, orgId, centerId, name: "Recepción", email, role: "RECEPTION" },
  });
  const invitation = await prisma.invitation.create({
    data: { orgId, type: "STAFF", token: `${SLUG}-staff-2`, email, userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) },
  });

  assert.equal((await completeStaffOnboarding(invitation.token, "corta")).ok, false);
  assert.deepEqual(await completeStaffOnboarding(invitation.token, PASSWORD), { ok: true });
  assert.equal((await authenticate(email, PASSWORD)).ok, true);
  assert.equal((await completeStaffOnboarding(invitation.token, PASSWORD)).ok, false, "un solo uso");
});

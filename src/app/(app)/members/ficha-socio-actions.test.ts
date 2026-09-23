import "dotenv/config";
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * P8 · Acciones de la ficha del socio (QA-ALTA-07 y QA-ALTA-08).
 *
 * Son server actions con `requireRole`, y `auth()` necesita una petición de
 * Next de verdad. Lo único que se sustituye es esa puerta (`@/lib/session`) y
 * `next/cache`, que fuera de una petición no tiene dónde invalidar: el rol, el
 * ámbito de centro, `health-access.ts` y la base de datos son los reales. Así lo
 * que se prueba es la acción entera, no una copia de su lógica.
 *
 * Los módulos se sustituyen en la caché de `require` ANTES de cargar la acción;
 * por eso `./[id]/actions` se importa dentro de `before` y no arriba.
 *
 * Vive aquí y no junto a `[id]/actions.ts` a propósito: `npm run test:unit`
 * pasa cada ruta a `node --test`, que la trata como glob, y `[id]` es una clase
 * de caracteres. Un test dentro de `[id]/` no casaría consigo mismo y se
 * saltaría sin avisar.
 */

type FakeSession = { user: { id: string; role: Role; orgId: string; centerId: string | null } };
let currentSession: FakeSession | null = null;

function stubModule(specifier: string, exports: Record<string, unknown>) {
  const resolved = require.resolve(specifier);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports } as NodeJS.Module;
}

stubModule("@/lib/session", {
  requireSession: async () => {
    if (!currentSession) throw new Error("test sin sesión");
    return currentSession;
  },
});
stubModule("next/cache", { revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {} });

let actions: typeof import("./[id]/actions");

const SLUG = "p8-ficha-socio-actions";

let orgId = "";
let centerId = "";
let memberId = "";
const users: Record<"OWNER" | "RECEPTION" | "TRAINER", string> = { OWNER: "", RECEPTION: "", TRAINER: "" };

function actAs(role: keyof typeof users) {
  currentSession = { user: { id: users[role], role, orgId, centerId: role === "OWNER" ? null : centerId } };
}

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.healthRecord.deleteMany({ where: { member: { orgId: org.id } } });
  await prisma.invitation.deleteMany({ where: { orgId: org.id } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

before(async () => {
  actions = await import("./[id]/actions");
  await cleanup();
  orgId = (await prisma.organization.create({ data: { name: "Ficha P8", slug: SLUG } })).id;
  centerId = (await prisma.center.create({ data: { orgId, name: "Centro P8", slug: `${SLUG}-a` } })).id;
  for (const role of Object.keys(users) as (keyof typeof users)[]) {
    const identity = await prisma.identity.create({
      data: { email: `${SLUG}-${role.toLowerCase()}@example.com`, passwordHash: "no-se-usa" },
    });
    users[role] = (
      await prisma.user.create({
        data: {
          identityId: identity.id,
          orgId,
          centerId: role === "OWNER" ? null : centerId,
          name: role,
          email: identity.email,
          role,
        },
      })
    ).id;
  }
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.healthRecord.deleteMany({ where: { member: { orgId } } });
  await prisma.invitation.deleteMany({ where: { orgId, type: "MEMBER" } });
  await prisma.member.deleteMany({ where: { orgId } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: `${SLUG}-socia` } } });
  await prisma.organization.update({ where: { id: orgId }, data: { allowsMinors: false, minimumAgeYears: 18 } });
  memberId = (
    await prisma.member.create({
      data: {
        orgId,
        primaryCenterId: centerId,
        firstName: "Lucía",
        lastName: "Socia",
        email: `${SLUG}-socia@example.com`,
        birthDate: new Date("1990-04-10T00:00:00.000Z"),
        state: "ACTIVE",
      },
    })
  ).id;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

function injuryForm() {
  const fd = new FormData();
  fd.set("memberId", memberId);
  fd.set("type", "INJURY");
  fd.set("severity", "MEDIUM");
  fd.set("description", "Tendinopatía del supraespinoso");
  fd.set("zoneCode", "HOMBRO");
  fd.set("side", "DERECHA");
  fd.set("injuryDatePrecision", "UNKNOWN");
  return fd;
}

test("QA-ALTA-07 · sin consentimiento de salud, el alta de lesión da error visible y no guarda nada", async () => {
  actAs("TRAINER");
  const result = await actions.addHealthRecord(injuryForm());
  assert.equal(result.ok, false, "un ok:true aquí es el falso positivo del hallazgo");
  if (!result.ok) assert.match(result.error, /consentimiento/i);
  assert.equal(await prisma.healthRecord.count({ where: { memberId } }), 0);
});

test("QA-ALTA-07 · con consentimiento, la lesión se guarda y la acción lo dice", async () => {
  await prisma.member.update({ where: { id: memberId }, data: { consentHealth: true, consentHealthAt: new Date() } });
  actAs("TRAINER");
  const result = await actions.addHealthRecord(injuryForm());
  assert.deepEqual(result, { ok: true });
  assert.equal(await prisma.healthRecord.count({ where: { memberId } }), 1);
});

/** El formulario de la ficha tal cual lo manda el panel: todos los campos, con lo que ya hay. */
async function memberDataForm(changes: Record<string, string> = {}) {
  const m = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  const fd = new FormData();
  const values: Record<string, string> = {
    memberId,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    phone: m.phone ?? "",
    birthDate: m.birthDate ? m.birthDate.toISOString().slice(0, 10) : "",
    sex: m.sex ?? "",
    occupation: m.occupation ?? "",
    centerId: m.primaryCenterId,
    emergencyContact: m.emergencyContact ?? "",
    address: m.address ?? "",
    addressLine2: m.addressLine2 ?? "",
    postalCode: m.postalCode ?? "",
    city: m.city ?? "",
    province: m.province ?? "",
    country: m.country ?? "",
    ...changes,
  };
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

/** Fecha de nacimiento de alguien que hoy tiene `years` años. */
function birthDateForAge(years: number) {
  const d = new Date();
  return `${d.getUTCFullYear() - years}-01-01`;
}

test("QA-ALTA-08 · el entrenador no puede cambiar el email ni la fecha de nacimiento", async () => {
  actAs("TRAINER");
  const changes: Record<string, string>[] = [
    { email: `${SLUG}-otra@example.com` },
    { birthDate: "1991-01-01" },
    { phone: "699000000" },
  ];
  for (const change of changes) {
    const result = await actions.updateMemberData(await memberDataForm(change));
    assert.equal(result.ok, false, `el entrenador ha podido cambiar ${Object.keys(change)[0]}`);
  }
  const m = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  assert.equal(m.email, `${SLUG}-socia@example.com`);
  assert.equal(m.birthDate?.toISOString().slice(0, 10), "1990-04-10");
  assert.equal(m.phone, null);
});

test("QA-ALTA-08 · el entrenador sí edita lo deportivo con el mismo formulario", async () => {
  actAs("TRAINER");
  const result = await actions.updateMemberData(await memberDataForm({ occupation: "Enfermera", sex: "FEMALE" }));
  assert.deepEqual(result, { ok: true });
  const m = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  assert.equal(m.occupation, "Enfermera");
  assert.equal(m.sex, "FEMALE");
});

test("QA-ALTA-08 · sin cuenta activa, cambiar el email se lleva la invitación pendiente y le cambia el token", async () => {
  const invitation = await prisma.invitation.create({
    data: {
      orgId,
      type: "MEMBER",
      token: `${SLUG}-token-viejo`,
      email: `${SLUG}-socia@example.com`,
      memberId,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  actAs("RECEPTION");
  const nuevo = `${SLUG}-socia-bien@example.com`;
  const result = await actions.updateMemberData(await memberDataForm({ email: nuevo.toUpperCase() }));
  assert.deepEqual(result, { ok: true });

  assert.equal((await prisma.member.findUniqueOrThrow({ where: { id: memberId } })).email, nuevo);
  const after = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
  assert.equal(after.email, nuevo);
  assert.notEqual(after.token, invitation.token, "el enlace que salió a la dirección vieja deja de valer");
  assert.equal(after.usedAt, null);
});

test("QA-ALTA-08 · con la cuenta ya activada, el email no se cambia desde la ficha", async () => {
  const identity = await prisma.identity.create({
    data: { email: `${SLUG}-socia@example.com`, passwordHash: "no-se-usa", passwordSetAt: new Date() },
  });
  const user = await prisma.user.create({
    data: { identityId: identity.id, orgId, name: "Lucía", email: identity.email, role: "MEMBER" },
  });
  await prisma.member.update({ where: { id: memberId }, data: { userId: user.id } });

  actAs("OWNER");
  const result = await actions.updateMemberData(await memberDataForm({ email: `${SLUG}-socia-nueva@example.com` }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /usuario de acceso/);
  assert.equal((await prisma.member.findUniqueOrThrow({ where: { id: memberId } })).email, `${SLUG}-socia@example.com`);
  assert.equal((await prisma.identity.findUniqueOrThrow({ where: { id: identity.id } })).email, identity.email);

  await prisma.member.update({ where: { id: memberId }, data: { userId: null } });
  await prisma.user.delete({ where: { id: user.id } });
});

test("QA-ALTA-08 · cambiar la fecha de nacimiento vuelve a pasar el control de edad", async () => {
  actAs("RECEPTION");
  const menor = await actions.updateMemberData(await memberDataForm({ birthDate: birthDateForAge(16) }));
  assert.equal(menor.ok, false, "el centro no admite menores");
  assert.equal(
    (await prisma.member.findUniqueOrThrow({ where: { id: memberId } })).birthDate?.toISOString().slice(0, 10),
    "1990-04-10"
  );

  const adulto = await actions.updateMemberData(await memberDataForm({ birthDate: "1988-11-02" }));
  assert.deepEqual(adulto, { ok: true });
});

test("QA-ALTA-08 · si el centro admite menores, sin tutor acreditado la fecha de un menor no entra", async () => {
  await prisma.organization.update({ where: { id: orgId }, data: { allowsMinors: true, minimumAgeYears: 14 } });
  actAs("RECEPTION");
  const sinTutor = await actions.updateMemberData(await memberDataForm({ birthDate: birthDateForAge(16) }));
  assert.equal(sinTutor.ok, false);
  if (!sinTutor.ok) assert.match(sinTutor.error, /tutor/);

  await prisma.member.update({
    where: { id: memberId },
    data: {
      guardianName: "Marta Tutora",
      guardianIdDocument: "00000000T",
      guardianConsentAt: new Date(),
      guardianEvidence: "Firma en el centro",
    },
  });
  const conTutor = await actions.updateMemberData(await memberDataForm({ birthDate: birthDateForAge(16) }));
  assert.deepEqual(conTutor, { ok: true });
});

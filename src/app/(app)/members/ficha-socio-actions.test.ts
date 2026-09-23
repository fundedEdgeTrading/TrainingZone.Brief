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
let otherCenterId = "";
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
  otherCenterId = (await prisma.center.create({ data: { orgId, name: "Centro P8 B", slug: `${SLUG}-b` } })).id;
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

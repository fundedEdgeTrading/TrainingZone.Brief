import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { signAccessToken } from "@/lib/mobile-auth";
import { saveSession, deleteSession } from "@/lib/agenda-queries";
import { requireApiCenterScope } from "@/app/api/mobile/v1/_lib/api-guards";
import { POST as createSessionRoute } from "@/app/api/mobile/v1/agenda/sessions/route";
import { PATCH as updateSessionRoute, DELETE as deleteSessionRoute } from "@/app/api/mobile/v1/agenda/sessions/[id]/route";

/**
 * E1-02 (RB-SEG-002): los endpoints de agenda móvil aplican el mismo ámbito de
 * centro que la web.
 *
 * El hallazgo se verificó con dos cuentas reales: una entrenadora imputada solo
 * a La Jota **creó** una sesión en Puerta del Carmen, **renombró** una a
 * "AUDIT-HIJACKED" y **borró** la que había creado, las tres con `200`. La web
 * ya validaba centro de origen y de destino en `saveSessionAction`; el espejo
 * móvil no replicó ninguno de los dos controles.
 *
 * Los cuatro casos de rechazo atraviesan los handlers reales, no
 * `requireApiCenterScope` por separado: lo que falló aquí no fue la guarda, fue
 * que nadie la llamaba. Y cada uno comprueba además el efecto en la base de
 * datos, porque un 404 con la escritura hecha seguiría siendo la misma fuga.
 */

const SUFFIX = "test-agenda-mobile-scope";
const BASE = "http://localhost/api/mobile/v1/agenda/sessions";

type Fixture = {
  orgId: string;
  laJota: string;
  puertaDelCarmen: string;
  santander: string;
  trainerId: string;
  token: string;
  ownSessionId: string;
  foreignSessionId: string;
};
let fx: Fixture;

function authed(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { authorization: `Bearer ${fx.token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Cuerpo completo: sin todos los campos obligatorios el handler corta en el 400. */
function sessionBody(centerId: string, title: string) {
  return {
    centerId,
    trainerId: fx.trainerId,
    title,
    type: "personal" as const,
    date: "2026-01-12",
    startTime: "10:00",
    endTime: "11:00",
  };
}

async function makeSession(centerId: string, name: string) {
  const s = await prisma.classSession.create({
    data: {
      orgId: fx.orgId,
      centerId,
      trainerId: fx.trainerId,
      name,
      classType: "Personal Training",
      date: new Date(2026, 0, 12),
      startTime: "10:00",
      endTime: "11:00",
      capacity: 1,
    },
  });
  return s.id;
}

async function wipe() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: SUFFIX } },
    select: { id: true },
  });
  for (const { id: orgId } of orgs) {
    await prisma.booking.deleteMany({ where: { session: { orgId } } });
    await prisma.classSession.deleteMany({ where: { orgId } });
    await prisma.centerMembership.deleteMany({ where: { orgId } });
    const users = await prisma.user.findMany({ where: { orgId }, select: { identityId: true } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
    await prisma.center.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
}

before(async () => {
  await wipe();
  const org = await prisma.organization.create({
    data: { name: "Agenda móvil", slug: SUFFIX, platformPlan: "avanzado_mes", platformStatus: "ACTIVE" },
  });
  const centerFor = (name: string, slug: string) =>
    prisma.center.create({ data: { orgId: org.id, name, slug: `${SUFFIX}-${slug}` } });
  const laJota = await centerFor("La Jota", "la-jota");
  const puertaDelCarmen = await centerFor("Puerta del Carmen", "puerta");
  const santander = await centerFor("Santander", "santander");

  const identity = await prisma.identity.create({
    data: { email: `${SUFFIX}-trainer@example.com`, passwordHash: "x" },
  });
  const trainer = await prisma.user.create({
    data: {
      orgId: org.id,
      identityId: identity.id,
      name: "Entrenadora",
      email: identity.email,
      role: "TRAINER",
      centerId: laJota.id,
    },
  });
  // Imputada a dos de los tres centros; Santander queda fuera de su ámbito.
  await prisma.centerMembership.createMany({
    data: [
      { orgId: org.id, userId: trainer.id, centerId: laJota.id, role: "TRAINER", isPrimary: true },
      { orgId: org.id, userId: trainer.id, centerId: puertaDelCarmen.id, role: "TRAINER" },
    ],
  });

  fx = {
    orgId: org.id,
    laJota: laJota.id,
    puertaDelCarmen: puertaDelCarmen.id,
    santander: santander.id,
    trainerId: trainer.id,
    token: await signAccessToken({ sub: trainer.id, role: "TRAINER", orgId: org.id, centerId: laJota.id }),
    ownSessionId: "",
    foreignSessionId: "",
  };
  fx.ownSessionId = await makeSession(laJota.id, "EP propia");
  fx.foreignSessionId = await makeSession(santander.id, "EP de Santander");
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

test("E1-02 · crear una sesión en un centro ajeno responde 404 y no crea nada", async () => {
  const before = await prisma.classSession.count({ where: { centerId: fx.santander } });

  const res = await createSessionRoute(authed(BASE, "POST", sessionBody(fx.santander, "EP colada")));
  assert.equal(res.status, 404);

  assert.equal(await prisma.classSession.count({ where: { centerId: fx.santander } }), before);
});

test("E1-02 · renombrar una sesión ajena responde 404 y la sesión no cambia", async () => {
  // El vector real: se manda el centro PROPIO en el cuerpo junto al id de una
  // sesión ajena. Si solo se validara el destino, esto pasaría.
  const res = await updateSessionRoute(
    authed(`${BASE}/${fx.foreignSessionId}`, "PATCH", sessionBody(fx.laJota, "AUDIT-HIJACKED")),
    { params: Promise.resolve({ id: fx.foreignSessionId }) }
  );
  assert.equal(res.status, 404);

  const session = await prisma.classSession.findUniqueOrThrow({ where: { id: fx.foreignSessionId } });
  assert.equal(session.name, "EP de Santander");
  assert.equal(session.centerId, fx.santander, "tampoco se la ha traído a su centro");
});

test("E1-02 · borrar una sesión ajena responde 404 y la sesión sigue existiendo", async () => {
  const res = await deleteSessionRoute(authed(`${BASE}/${fx.foreignSessionId}`, "DELETE"), {
    params: Promise.resolve({ id: fx.foreignSessionId }),
  });
  assert.equal(res.status, 404);

  assert.ok(await prisma.classSession.findUnique({ where: { id: fx.foreignSessionId } }));
});

test("E1-02 · mover una sesión propia a un centro fuera del ámbito responde 404", async () => {
  const res = await updateSessionRoute(
    authed(`${BASE}/${fx.ownSessionId}`, "PATCH", sessionBody(fx.santander, "EP propia")),
    { params: Promise.resolve({ id: fx.ownSessionId }) }
  );
  assert.equal(res.status, 404);

  const session = await prisma.classSession.findUniqueOrThrow({ where: { id: fx.ownSessionId } });
  assert.equal(session.centerId, fx.laJota, "se valida el centro de ORIGEN y el de DESTINO");
});

test("E1-02 · dentro del ámbito, las tres operaciones funcionan igual que hoy", async () => {
  // El camino feliz de los handlers termina en `revalidateSessionViews`, que
  // necesita el contexto de petición de Next y no existe fuera del servidor: se
  // comprueba por separado que la guarda deja pasar los centros imputados y que
  // el guardado y el borrado siguen haciendo lo de siempre. Los cuatro casos de
  // rechazo, que es lo que esta historia arregla, sí atraviesan el handler
  // entero, porque cortan antes de llegar ahí.
  const claims = { sub: fx.trainerId, role: "TRAINER" as const, orgId: fx.orgId, centerId: fx.laJota };
  assert.equal((await requireApiCenterScope(claims, fx.laJota)).ok, true);
  assert.equal((await requireApiCenterScope(claims, fx.puertaDelCarmen)).ok, true);

  const input = {
    centerId: fx.puertaDelCarmen,
    trainerId: fx.trainerId,
    title: "EP nueva",
    type: "personal" as const,
    date: new Date(2026, 0, 12),
    startTime: "10:00",
    endTime: "11:00",
    memberId: null,
    capacity: null,
    selfBookable: true,
    isTrial: false,
    recurrence: "NONE" as const,
    recUntil: null,
  };
  const created = await saveSession(fx.orgId, input);
  assert.equal(created.ok, true);
  const id = created.ok ? created.session.id : "";

  const renamed = await saveSession(fx.orgId, { ...input, id, title: "EP renombrada" });
  assert.equal(renamed.ok, true);
  assert.equal((await prisma.classSession.findUniqueOrThrow({ where: { id } })).name, "EP renombrada");

  // E2-01: borrar firma cada devolución de bono en `AuditLog`, así que la
  // operación necesita saber quién la pide.
  assert.equal((await deleteSession(fx.orgId, id, { actorUserId: fx.trainerId })).ok, true);
  assert.equal(await prisma.classSession.findUnique({ where: { id } }), null);
});

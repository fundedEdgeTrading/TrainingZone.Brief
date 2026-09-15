import "dotenv/config";
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { isPublicPath } from "@/lib/public-paths";
import {
  ACCOUNT_DELETION_PUBLIC_PATH,
  ACCOUNT_DELETION_PORTAL_PATH,
  accountDeletionDueDate,
  confirmPasswordForUser,
  getAccountDeletionDisclosure,
  getLatestDeletionRequest,
  getOpenDeletionRequest,
  requestAccountDeletion,
  resolveAccountDeletion,
} from "@/lib/account-deletion";

/**
 * E5-15 · Borrado de cuenta desde la app y desde el portal.
 *
 * Un test por escenario de la historia, en su orden, más las invariantes del
 * trimestre que esta pista toca: ámbito de centro, datos de salud por
 * `health-access.ts` y una sola fuente de rótulos entre web y app.
 */

const SLUG = "e5-15-borrado-cuenta";
const PASSWORD = "contrasena-de-prueba-1";

let orgId = "";
let centerId = "";
let otherCenterId = "";
let memberId = "";
let memberUserId = "";
/** Dirección de OTRO centro de la misma organización: no debe poder resolver. */
let otherDirectorId = "";
let ownerId = "";
let trainerId = "";

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.accountDeletionRequest.deleteMany({ where: { orgId: org.id } });
  await prisma.healthRecord.deleteMany({ where: { member: { orgId: org.id } } });
  await prisma.retentionPolicy.deleteMany({ where: { orgId: org.id } });
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

async function makeUser(role: "MEMBER" | "OWNER" | "CENTER_DIRECTOR" | "TRAINER", key: string, centre: string | null) {
  const identity = await prisma.identity.create({
    data: {
      email: `${SLUG}-${key}@example.com`,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      passwordSetAt: new Date(),
    },
  });
  const user = await prisma.user.create({
    data: {
      identityId: identity.id,
      orgId,
      centerId: centre,
      name: `Usuario ${key}`,
      email: identity.email,
      role,
    },
  });
  return user.id;
}

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Borrado de cuenta", slug: SLUG } });
  orgId = org.id;
  centerId = (await prisma.center.create({ data: { orgId, name: "Centro uno", slug: `${SLUG}-c1` } })).id;
  otherCenterId = (await prisma.center.create({ data: { orgId, name: "Centro dos", slug: `${SLUG}-c2` } })).id;

  memberUserId = await makeUser("MEMBER", "socio", centerId);
  ownerId = await makeUser("OWNER", "direccion", null);
  otherDirectorId = await makeUser("CENTER_DIRECTOR", "direccion-otro-centro", otherCenterId);
  trainerId = await makeUser("TRAINER", "entrenador", centerId);

  const member = await prisma.member.create({
    data: {
      orgId,
      primaryCenterId: centerId,
      userId: memberUserId,
      firstName: "Ana",
      lastName: "Socia",
      email: `${SLUG}-socia@example.com`,
    },
  });
  memberId = member.id;

  // Un dato del art. 9 para poder comprobar que NO se enumera al socio.
  await prisma.healthRecord.create({
    data: {
      member: { connect: { id: memberId } },
      type: "INJURY",
      zoneCode: "HOMBRO",
      side: "DERECHA",
      description: "Molestia declarada.",
      severity: "MEDIUM",
    },
  });
});

beforeEach(async () => {
  await prisma.accountDeletionRequest.deleteMany({ where: { orgId } });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Escenario 1 · solicitud desde la app
// ---------------------------------------------------------------------------

test("E5-15 · escenario 1: desde la app se explica qué pasa con los datos antes de confirmar", async () => {
  const disclosure = await getAccountDeletionDisclosure({
    memberId,
    orgId,
    actorUserId: memberUserId,
    actorRole: "MEMBER",
  });
  assert.ok(disclosure, "el socio tiene que poder ver el plan sobre su propia ficha");

  const keys = disclosure.effects.map((e) => e.key);
  for (const expected of ["payments", "healthRecords", "progressEntries", "bookings", "identity"]) {
    assert.ok(keys.includes(expected as never), `falta el bloque "${expected}" en lo que ve el socio`);
  }
  // Cada bloque dice qué se hace con él: ni un "etc." ni un bloque sin detalle.
  for (const effect of disclosure.effects) {
    assert.ok(effect.detail.length > 0, `el bloque "${effect.key}" no explica nada`);
  }
});

test("E5-15 · escenario 1: la solicitud desde la app se guarda con su origen", async () => {
  const result = await requestAccountDeletion({ memberId, orgId, actorUserId: memberUserId, source: "MOBILE_APP" });
  assert.ok(result.ok);
  assert.equal(result.request.source, "MOBILE_APP");
  assert.equal(result.request.status, "PENDING");
});

test("E5-15 · escenario 1: la confirmación con contraseña rechaza la que no es", async () => {
  assert.deepEqual(await confirmPasswordForUser(memberUserId, PASSWORD), { ok: true });
  assert.deepEqual(await confirmPasswordForUser(memberUserId, "otra-cosa"), {
    ok: false,
    reason: "WRONG_PASSWORD",
  });
});

test("E5-15 · escenario 1: una identidad sin contraseña utilizable se distingue de una contraseña mal puesta", async () => {
  // Alta por invitación que nunca fijó contraseña: el hash existe pero es
  // inservible. Decirle "la contraseña no es correcta" la manda a un callejón
  // sin salida; hay que poder ofrecerle fijar una.
  const identity = await prisma.identity.create({
    data: { email: `${SLUG}-sin-clave@example.com`, passwordHash: await bcrypt.hash("lo-que-sea", 10) },
  });
  const user = await prisma.user.create({
    data: { identityId: identity.id, orgId, name: "Sin clave", email: identity.email, role: "MEMBER" },
  });

  assert.deepEqual(await confirmPasswordForUser(user.id, "lo-que-sea"), { ok: false, reason: "NO_PASSWORD" });
});

// ---------------------------------------------------------------------------
// Escenario 2 · solicitud desde el portal web
// ---------------------------------------------------------------------------

test("E5-15 · escenario 2: la misma ruta existe desde el portal web, sin necesidad de la app", async () => {
  const result = await requestAccountDeletion({ memberId, orgId, actorUserId: memberUserId, source: "WEB_PORTAL" });
  assert.ok(result.ok);
  assert.equal(result.request.source, "WEB_PORTAL");

  // Y es la MISMA fila y el mismo plazo, no una vía paralela con otras reglas.
  const open = await getOpenDeletionRequest(memberId, orgId);
  assert.equal(open?.id, result.request.id);
  assert.deepEqual(open?.dueAt, result.request.dueAt);
});

test("E5-15 · escenario 2: la pantalla del portal existe y usa el mismo origen que la app", () => {
  const page = readFileSync(join("src", "app", "(app)", "portal", "perfil", "borrar-cuenta", "page.tsx"), "utf8");
  assert.match(page, /getAccountDeletionDisclosure/, "el portal tiene que pintar el plan compartido");
  assert.match(page, /requireRole\(\["MEMBER"\]\)/);

  const route = readFileSync(
    join("src", "app", "api", "mobile", "v1", "portal", "account-deletion", "route.ts"),
    "utf8",
  );
  // Espejo móvil: mismo origen del texto, misma guarda de socio. Una copia del
  // texto dentro del bundle de Expo es el fallo que ya está documentado.
  assert.match(route, /getAccountDeletionDisclosure/);
  assert.match(route, /requireMember/);

  const screen = readFileSync(join("apps", "mobile", "src", "app", "borrar-cuenta.tsx"), "utf8");
  assert.match(screen, /useAccountDeletion/, "la app pide el texto, no lo lleva dentro");
  assert.doesNotMatch(
    screen,
    /art\. 30 CCom|art\. 1964 CC/,
    "la app no debe llevar su propia copia de la tabla de plazos: la sirve el servidor",
  );
});

test("E5-15 · escenario 2: un socio no puede pedir el borrado de la ficha de otro", async () => {
  const otro = await prisma.member.create({
    data: {
      orgId,
      primaryCenterId: centerId,
      firstName: "Otro",
      lastName: "Socio",
      email: `${SLUG}-otro@example.com`,
    },
  });

  const result = await requestAccountDeletion({
    memberId: otro.id,
    orgId,
    actorUserId: memberUserId,
    source: "WEB_PORTAL",
  });
  assert.equal(result.ok, false);
  await prisma.member.delete({ where: { id: otro.id } });
});

// ---------------------------------------------------------------------------
// Escenario 3 · plazo de un mes (art. 12.3 RGPD) con acuse
// ---------------------------------------------------------------------------

test("E5-15 · escenario 3: el plazo es un mes natural, no treinta días", () => {
  assert.deepEqual(
    accountDeletionDueDate(new Date("2026-09-08T09:00:00Z")),
    new Date("2026-10-08T09:00:00Z"),
    "un mes exacto cuando el día existe en el mes siguiente",
  );
  // El 31 de enero no tiene equivalente en febrero: `setUTCMonth` desbordaría
  // al 2 o al 3 de marzo, que es MÁS de un mes y por tanto fuera de plazo.
  assert.deepEqual(accountDeletionDueDate(new Date("2026-01-31T10:00:00Z")), new Date("2026-02-28T10:00:00Z"));
  assert.deepEqual(accountDeletionDueDate(new Date("2028-01-31T10:00:00Z")), new Date("2028-02-29T10:00:00Z"));
  assert.deepEqual(accountDeletionDueDate(new Date("2026-12-15T10:00:00Z")), new Date("2027-01-15T10:00:00Z"));
});

test("E5-15 · escenario 3: la fila nace con su fecha límite, que es la prueba del plazo", async () => {
  const now = new Date("2026-09-15T08:00:00Z");
  const result = await requestAccountDeletion({
    memberId,
    orgId,
    actorUserId: memberUserId,
    source: "WEB_PORTAL",
    now,
  });
  assert.ok(result.ok);
  assert.deepEqual(result.request.requestedAt, now);
  assert.deepEqual(result.request.dueAt, new Date("2026-10-15T08:00:00Z"));
});

test("E5-15 · escenario 3: dos plazos en paralelo sobre lo mismo no tienen sentido", async () => {
  const first = await requestAccountDeletion({ memberId, orgId, actorUserId: memberUserId, source: "WEB_PORTAL" });
  assert.ok(first.ok);

  const second = await requestAccountDeletion({ memberId, orgId, actorUserId: memberUserId, source: "MOBILE_APP" });
  assert.ok(second.ok, "pedirlo dos veces no puede ser un error para el socio");
  assert.equal(second.alreadyOpen, true);
  assert.equal(second.request.id, first.request.id, "la que ya está abierta ES la respuesta");

  const count = await prisma.accountDeletionRequest.count({ where: { memberId, status: "PENDING" } });
  assert.equal(count, 1);
});

// ---------------------------------------------------------------------------
// Escenario 4 · obligaciones de conservación: los cobros se DISOCIAN
// ---------------------------------------------------------------------------

test("E5-15 · escenario 4: el texto que ve el socio dice que los cobros se disocian, no que se borran", async () => {
  const disclosure = await getAccountDeletionDisclosure({
    memberId,
    orgId,
    actorUserId: memberUserId,
    actorRole: "MEMBER",
  });
  assert.ok(disclosure);

  const payments = disclosure.effects.find((e) => e.key === "payments");
  assert.ok(payments);
  assert.equal(payments.action, "DISSOCIATE", "borrar un justificante dentro del plazo de prescripción es el art. 200 LGT");
  assert.match(payments.legalBasis ?? "", /art\. 30 CCom/);
  assert.match(payments.legalBasis ?? "", /art\. 66 LGT/);
});

test("E5-15 · escenario 4: el texto sale del MISMO plan que ejecuta el borrado", async () => {
  // Si el texto se redactara aparte podría volver a describir un tratamiento
  // que no ocurre (§7 CN-05). La garantía no es la redacción: es el origen.
  const { getSuppressionPlan } = await import("@/lib/member-suppression");
  const plan = await getSuppressionPlan(memberId, orgId);
  const disclosure = await getAccountDeletionDisclosure({
    memberId,
    orgId,
    actorUserId: ownerId,
    actorRole: "OWNER",
  });
  assert.ok(plan && disclosure);

  assert.deepEqual(
    disclosure.effects.map((e) => ({ key: e.key, label: e.label, action: e.action, detail: e.detail })),
    plan.effects.map((e) => ({ key: e.key, label: e.label, action: e.action, detail: e.detail })),
    "dirección y socio leen exactamente lo mismo",
  );
});

test("E5-15 · escenario 4: los plazos salen de la configuración del centro, no de un número escrito a mano", async () => {
  const sieteAnios = 7 * 365;
  await prisma.retentionPolicy.create({
    data: { orgId, category: "CONTRACT_BILLING", retentionDays: sieteAnios, minimumLegalDays: 4 * 365 },
  });
  try {
    const disclosure = await getAccountDeletionDisclosure({
      memberId,
      orgId,
      actorUserId: memberUserId,
      actorRole: "MEMBER",
    });
    assert.ok(disclosure);
    assert.equal(disclosure.retention.billingDays, sieteAnios, "el plazo lo manda RetentionPolicy (D-C3)");
    // Y se enseña con su advertencia: la tabla de docs/legal/03 sigue marcada
    // ⟦PENDIENTE: validación — 00.C.3⟧, así que la cifra no se presenta como
    // un dictamen cerrado.
    assert.equal(disclosure.retention.pendingLegalReview, true);
  } finally {
    await prisma.retentionPolicy.deleteMany({ where: { orgId } });
  }
});

test("E5-15 · escenario 4: la interfaz conserva la marca ⟦PENDIENTE⟧ de la validación jurídica", () => {
  const web = readFileSync(
    join("src", "app", "(app)", "portal", "perfil", "borrar-cuenta", "effects-list.tsx"),
    "utf8",
  );
  const app = readFileSync(join("apps", "mobile", "src", "app", "borrar-cuenta.tsx"), "utf8");
  for (const [name, source] of [["portal", web], ["app", app]] as const) {
    assert.match(source, /⟦PENDIENTE/, `${name} debe seguir marcando que los plazos no están validados`);
    assert.match(source, /D-C3/, `${name} debe citar la decisión que lo deja pendiente`);
  }
});

// ---------------------------------------------------------------------------
// Escenario 5 · URL web pública accesible desde la ficha de tienda
// ---------------------------------------------------------------------------

test("E5-15 · escenario 5: la URL pública existe y no exige sesión", () => {
  assert.equal(ACCOUNT_DELETION_PUBLIC_PATH, "/borrar-cuenta");
  assert.equal(isPublicPath(ACCOUNT_DELETION_PUBLIC_PATH), true, "el proxy la rebotaría a /login");
  // La ruta autenticada es OTRA: la pública explica el procedimiento, la del
  // portal lo ejecuta.
  assert.equal(isPublicPath(ACCOUNT_DELETION_PORTAL_PATH), false);

  const page = readFileSync(join("src", "app", "borrar-cuenta", "page.tsx"), "utf8");
  assert.doesNotMatch(page, /requireRole|requireSession/, "una URL de borrado con sesión no cumple lo que pide la tienda");
  assert.match(page, /art\. 12\.3/, "tiene que decir cuánto tarda");
  assert.match(page, /disocian/, "y qué pasa con los cobros");
});

// ---------------------------------------------------------------------------
// Escenario 6 · trazabilidad: solicitud y resolución en AuditLog
// ---------------------------------------------------------------------------

test("E5-15 · escenario 6: la solicitud y su resolución quedan en AuditLog", async () => {
  const created = await requestAccountDeletion({
    memberId,
    orgId,
    actorUserId: memberUserId,
    source: "MOBILE_APP",
  });
  assert.ok(created.ok);

  const requested = await prisma.auditLog.findFirst({
    where: { orgId, action: "ACCOUNT_DELETION_REQUESTED", entityId: created.request.id },
  });
  assert.ok(requested, "sin apunte no hay forma de acreditar cuándo empezó a correr el mes");
  assert.equal(requested.actorUserId, memberUserId);
  assert.equal(requested.memberId, memberId);
  assert.equal((requested.metadata as { source?: string }).source, "MOBILE_APP");

  const resolved = await resolveAccountDeletion({
    requestId: created.request.id,
    actor: { id: ownerId, role: "OWNER", orgId, centerId: null },
    status: "COMPLETED",
    resolutionNotes: "Datos borrados; los cobros se disocian por conservación obligatoria.",
  });
  assert.ok(resolved.ok);
  assert.equal(resolved.request.status, "COMPLETED");

  const trace = await prisma.auditLog.findFirst({
    where: { orgId, action: "ACCOUNT_DELETION_RESOLVED", entityId: created.request.id },
  });
  assert.ok(trace);
  assert.equal(trace.actorUserId, ownerId);
  assert.equal((trace.metadata as { onTime?: boolean }).onTime, true);

  // Y el socio lo ve: resolverla sin que pueda saberlo es justo lo que la
  // historia no permite.
  const latest = await getLatestDeletionRequest(memberId, orgId);
  assert.equal(latest?.status, "COMPLETED");
  assert.match(latest?.resolutionNotes ?? "", /disocian/);
});

test("E5-15 · escenario 6: una solicitud ya resuelta no se vuelve a resolver", async () => {
  const created = await requestAccountDeletion({ memberId, orgId, actorUserId: memberUserId, source: "WEB_PORTAL" });
  assert.ok(created.ok);
  const actor = { id: ownerId, role: "OWNER" as const, orgId, centerId: null };

  assert.equal((await resolveAccountDeletion({ requestId: created.request.id, actor, status: "COMPLETED", resolutionNotes: "Hecho." })).ok, true);
  const second = await resolveAccountDeletion({
    requestId: created.request.id,
    actor,
    status: "REJECTED",
    resolutionNotes: "Me lo repienso.",
  });
  assert.equal(second.ok, false);
});

// ---------------------------------------------------------------------------
// Invariantes del trimestre
// ---------------------------------------------------------------------------

test("E5-15 · ámbito de centro: la dirección de otro centro no resuelve esta solicitud", async () => {
  const created = await requestAccountDeletion({ memberId, orgId, actorUserId: memberUserId, source: "WEB_PORTAL" });
  assert.ok(created.ok);

  const fuera = await resolveAccountDeletion({
    requestId: created.request.id,
    actor: { id: otherDirectorId, role: "CENTER_DIRECTOR", orgId, centerId: otherCenterId },
    status: "COMPLETED",
    resolutionNotes: "No es de mi centro.",
  });
  assert.equal(fuera.ok, false);
  assert.match(fuera.ok === false ? fuera.error : "", /no es de uno de tus centros/i);

  // La misma dirección, imputada al centro del socio, sí puede.
  const dentro = await resolveAccountDeletion({
    requestId: created.request.id,
    actor: { id: otherDirectorId, role: "CENTER_DIRECTOR", orgId, centerId },
    status: "COMPLETED",
    resolutionNotes: "Atendida.",
  });
  assert.equal(dentro.ok, true);
});

test("E5-15 · ámbito de centro: recepción no resuelve una solicitud de borrado", async () => {
  const created = await requestAccountDeletion({ memberId, orgId, actorUserId: memberUserId, source: "WEB_PORTAL" });
  assert.ok(created.ok);

  const recepcion = await resolveAccountDeletion({
    requestId: created.request.id,
    actor: { id: ownerId, role: "RECEPTION", orgId, centerId },
    status: "COMPLETED",
    resolutionNotes: "No debería poder.",
  });
  assert.equal(recepcion.ok, false);
});

test("E5-15 · salud: la pantalla que enumera qué se borra no le cuenta los registros al socio", async () => {
  const antes = await prisma.auditLog.count({ where: { orgId, action: "HEALTH_RECORD_READ" } });

  const disclosure = await getAccountDeletionDisclosure({
    memberId,
    orgId,
    actorUserId: memberUserId,
    actorRole: "MEMBER",
  });
  assert.ok(disclosure, "un rol sin autorización recibe la pantalla sin recuentos, NUNCA un error");
  assert.equal(disclosure.healthCountsVisible, false);

  const salud = disclosure.effects.find((e) => e.key === "healthRecords");
  assert.ok(salud);
  assert.equal(salud.count, null, "el número de lesiones es el dato de salud");
  assert.doesNotMatch(salud.detail, /\d+ registros/, "ni enumerado dentro del texto");
  // Sigue diciendo qué se hace con ellos: quitarle el recuento no es ocultarle
  // el tratamiento.
  assert.ok(salud.detail.length > 0);

  const despues = await prisma.auditLog.count({ where: { orgId, action: "HEALTH_RECORD_READ" } });
  assert.equal(despues, antes, "no se ha leído ningún dato de salud, así que no hay nada que registrar");
});

test("E5-15 · salud: un rol autorizado sí ve los recuentos, y su lectura queda registrada", async () => {
  const antes = await prisma.auditLog.count({ where: { orgId, action: "HEALTH_RECORD_READ" } });

  const disclosure = await getAccountDeletionDisclosure({
    memberId,
    orgId,
    actorUserId: trainerId,
    actorRole: "TRAINER",
  });
  assert.ok(disclosure);
  assert.equal(disclosure.healthCountsVisible, true);
  assert.equal(disclosure.effects.find((e) => e.key === "healthRecords")?.count, 1);

  const despues = await prisma.auditLog.count({ where: { orgId, action: "HEALTH_RECORD_READ" } });
  assert.ok(despues > antes, "todo acceso a datos de salud deja AuditLog");
});

test("E5-15 · la supresión del socio no revienta contra la solicitud que él mismo pidió", async () => {
  // `AccountDeletionRequest.memberId` es FK RESTRICT: sin limpiarla,
  // `deleteMember` (E10-09) fallaría con P2003 justo con el socio que ejerció
  // su derecho. La prueba de que el plazo se cumplió no se pierde: vive en el
  // `AuditLog`, que es append-only y no cuelga de `Member`.
  const actions = readFileSync(join("src", "app", "(app)", "members", "[id]", "actions.ts"), "utf8");
  const limpieza = actions.indexOf("accountDeletionRequest.deleteMany");
  const borrado = actions.indexOf("tx.member.delete(");
  assert.ok(limpieza > 0, "deleteMember tiene que soltar la solicitud de borrado");
  assert.ok(limpieza < borrado, "y hacerlo ANTES de borrar la ficha");
});

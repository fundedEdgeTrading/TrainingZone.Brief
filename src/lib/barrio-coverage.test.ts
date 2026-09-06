import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import { coverageSentence, geometryNote, hasGaps, type Coverage } from "@/lib/barrio-coverage";
import { getMapCoverage } from "@/lib/barrio-coverage-queries";
import { memberStatesFor } from "@/lib/barrio-map-params";

/**
 * E11-05 · El `FROM "PostalCodeArea"` de la agregación descarta cualquier CP que
 * no esté entre las filas sembradas: un socio de Madrid con CP 28001 no sale en
 * ningún sitio, y el mapa no decía cuánta gente no estaba enseñando. Dirección
 * miraba un plano sin saber si valía por el 90 % de su cartera o por el 40 %.
 */

const PREFIX = "e2e-cobertura-test";
let orgId = "";

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({
    data: { name: "Cobertura", slug: `${PREFIX}-org`, platformStatus: "ACTIVE" },
  });
  orgId = org.id;
  const center = await prisma.center.create({
    data: { orgId, name: "Centro cobertura", slug: `${PREFIX}-centro` },
  });

  // 50001 está sembrado (Zaragoza); 28001 no lo está (Madrid, fuera de
  // cobertura); y uno sin código postal en la ficha. `state` explícito porque
  // el esquema pone PROSPECT por defecto, y un prospecto no cuenta como socio.
  await prisma.member.createMany({
    data: [
      { orgId, primaryCenterId: center.id, firstName: "A", lastName: "Uno", email: `${PREFIX}-1@example.com`, postalCode: "50001", state: "ACTIVE" },
      { orgId, primaryCenterId: center.id, firstName: "B", lastName: "Dos", email: `${PREFIX}-2@example.com`, postalCode: "50001", state: "ACTIVE" },
      { orgId, primaryCenterId: center.id, firstName: "C", lastName: "Tres", email: `${PREFIX}-3@example.com`, postalCode: "28001", state: "ACTIVE" },
      { orgId, primaryCenterId: center.id, firstName: "D", lastName: "Cuatro", email: `${PREFIX}-4@example.com`, postalCode: null, state: "ACTIVE" },
    ],
  });
  // `Lead.postalCode` es obligatorio en el esquema, así que un lead nunca cae en
  // la cesta de "sin código postal": o está representado o está fuera de
  // cobertura. La cesta se mantiene igualmente porque los socios sí la usan.
  const leadBase = { orgId, centerId: center.id, occupation: "—", goals: "—", hasTrainedBefore: false, channel: "Test" };
  await prisma.lead.createMany({
    data: [
      { ...leadBase, firstName: "L", lastName: "Uno", phone: "600000001", postalCode: "50001" },
      { ...leadBase, firstName: "L", lastName: "Dos", phone: "600000002", postalCode: "08001" },
    ],
  });
});

after(cleanup);

async function cleanup() {
  await prisma.lead.deleteMany({ where: { organization: { slug: `${PREFIX}-org` } } });
  await prisma.member.deleteMany({ where: { organization: { slug: `${PREFIX}-org` } } });
  await prisma.center.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

test("se distingue «sin código postal» de «fuera de cobertura»", async () => {
  const coverage = await getMapCoverage(orgId);
  // Son dos ausencias con dos arreglos distintos: la primera la arregla
  // recepción rellenando la ficha; la segunda, dar de alta esa ciudad.
  assert.deepEqual(coverage.members, { total: 4, represented: 2, noPostalCode: 1, outsideCoverage: 1 });
  assert.deepEqual(coverage.leads, { total: 2, represented: 1, noPostalCode: 0, outsideCoverage: 1 });
  assert.equal(hasGaps(coverage), true);
});

test("el ámbito de centro se respeta: el pie cuenta lo mismo que el plano", async () => {
  const vacio = await getMapCoverage(orgId, { centerIds: [] });
  assert.equal(vacio.members.total, 0);
  assert.equal(vacio.leads.total, 0);
});

test("la redacción es la del informe", () => {
  const coverage: Coverage = { total: 468, represented: 412, noPostalCode: 31, outsideCoverage: 25 };
  assert.equal(
    coverageSentence(coverage, "socio", "socios"),
    "Se representan 412 de 468 socios: 31 sin código postal y 25 en zonas fuera de cobertura."
  );
});

test("cuando no falta nadie no se enumeran dos ceros", () => {
  // Enumerar ausencias que no existen es ruido, y hace que el aviso de verdad
  // se lea como decoración.
  const completo: Coverage = { total: 30, represented: 30, noPostalCode: 0, outsideCoverage: 0 };
  assert.equal(coverageSentence(completo, "socio", "socios"), "Se representan 30 de 30 socios.");
  assert.equal(hasGaps({ members: completo, leads: completo }), false);

  const soloUno: Coverage = { total: 5, represented: 4, noPostalCode: 1, outsideCoverage: 0 };
  assert.equal(coverageSentence(soloUno, "socio", "socios"), "Se representan 4 de 5 socios: 1 sin código postal.");
});

test("sin nadie que situar se dice eso, y no «0 de 0»", () => {
  const nada: Coverage = { total: 0, represented: 0, noPostalCode: 0, outsideCoverage: 0 };
  assert.equal(coverageSentence(nada, "lead", "leads"), "Todavía no hay leads que situar.");
});

test("la nota declara las DOS aproximaciones encadenadas", () => {
  const teselada = geometryNote(false);
  // La nota anterior solo advertía de una y dejaba creyendo que la otra mitad
  // era exacta.
  assert.match(teselada, /código postal y barrio/);
  assert.match(teselada, /teselación/);

  // Y se condiciona a cuál se está usando (E11-08).
  const real = geometryNote(true);
  assert.match(real, /barrios reales/);
  assert.ok(!real.includes("teselación"));
});

// ---------- E11-01 · el pie cuenta lo mismo que el mapa ----------

test("E11-01 · por defecto no se cuentan cancelados ni prospectos", async () => {
  const center = await prisma.center.findFirstOrThrow({ where: { slug: `${PREFIX}-centro` } });
  await prisma.member.createMany({
    data: [
      { orgId, primaryCenterId: center.id, firstName: "E", lastName: "Baja", email: `${PREFIX}-5@example.com`, postalCode: "50001", state: "CANCELLED" },
      { orgId, primaryCenterId: center.id, firstName: "F", lastName: "Prospecto", email: `${PREFIX}-6@example.com`, postalCode: "50001", state: "PROSPECT" },
    ],
  });

  // Un cancelado no es un socio y un prospecto todavía no lo es: contarlos hace
  // que un barrio con fuga masiva se siga pintando oscuro.
  const vivos = await getMapCoverage(orgId, { memberStates: memberStatesFor("activos") });
  assert.equal(vivos.members.total, 4);

  const todos = await getMapCoverage(orgId, { memberStates: memberStatesFor("todos") });
  assert.equal(todos.members.total, 6);

  const bajas = await getMapCoverage(orgId, { memberStates: memberStatesFor("bajas") });
  assert.equal(bajas.members.total, 1);
});

test("E11-01 · un lead ya convertido no se cuenta dos veces", async () => {
  const center = await prisma.center.findFirstOrThrow({ where: { slug: `${PREFIX}-centro` } });
  const socio = await prisma.member.findFirstOrThrow({ where: { email: `${PREFIX}-1@example.com` } });
  await prisma.lead.create({
    data: {
      orgId,
      centerId: center.id,
      firstName: "L",
      lastName: "Convertido",
      phone: "600000003",
      postalCode: "50001",
      occupation: "—",
      goals: "—",
      hasTrainedBefore: false,
      channel: "Test",
      // La misma persona: si contara como lead Y como socio, la etiqueta "leads
      // sin convertir" sería falsa y la conversión del barrio, imposible.
      convertedMemberId: socio.id,
    },
  });

  const coverage = await getMapCoverage(orgId);
  assert.equal(coverage.leads.total, 2);
});

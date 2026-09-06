import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import {
  buildTimeClockCsv,
  collectTimeClockEntries,
  TIMECLOCK_EXPORT_HEADERS,
  TIMECLOCK_RETENTION_YEARS,
  type TimeClockExportRow,
} from "@/lib/timeclock-export";
import { NO_TIME_TRACKING_NOTICE } from "@/lib/service-terms";

const SUFFIX = "e2e-timeclock-test";

const ROW: TimeClockExportRow = {
  workDate: "2026-03-02",
  userName: "Ana Ruiz",
  userEmail: "ana@example.com",
  centerName: "La Jota",
  clockIn: "09:05",
  clockOut: "17:20",
  minutes: 495,
  signedAt: "2026-03-02T17:25:00.000Z",
};

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.timeClockEntry.deleteMany({ where: { orgId: org.id } });
    await prisma.user.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
  await prisma.identity.deleteMany({ where: { email: { startsWith: SUFFIX }, memberships: { none: {} } } });
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/**
 * E10-21, escenario principal: apagar el módulo NO apaga la obligación. El
 * plazo de cuatro años del art. 34.9 ET sigue corriendo aunque la
 * funcionalidad desaparezca, así que lo registrado se exporta ANTES de retirar
 * el modelo.
 */
test("los fichajes registrados se exportan íntegros antes de retirar el módulo", async () => {
  const org = await prisma.organization.create({ data: { name: "Fichajes", slug: `${SUFFIX}-org` } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: "La Jota", slug: `${SUFFIX}-c` } });
  const identity = await prisma.identity.create({ data: { email: `${SUFFIX}-ana@example.com`, passwordHash: "x" } });
  const user = await prisma.user.create({
    data: { identityId: identity.id, orgId: org.id, name: "Ana Ruiz", email: identity.email, role: "TRAINER" },
  });

  await prisma.timeClockEntry.createMany({
    data: [
      {
        orgId: org.id,
        userId: user.id,
        centerId: center.id,
        workDate: new Date("2026-03-02T00:00:00.000Z"),
        clockIn: "09:05",
        clockOut: "17:20",
        signedAt: new Date("2026-03-02T17:25:00.000Z"),
      },
      // Jornada sin salida: se exporta igual, sin inventarse el cómputo.
      {
        orgId: org.id,
        userId: user.id,
        centerId: center.id,
        workDate: new Date("2026-03-03T00:00:00.000Z"),
        clockIn: "09:00",
        clockOut: null,
      },
    ],
  });

  const rows = await collectTimeClockEntries(org.id);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].workDate, "2026-03-02");
  assert.equal(rows[0].userName, "Ana Ruiz");
  assert.equal(rows[0].centerName, "La Jota");
  assert.equal(rows[0].minutes, 495);
  assert.equal(rows[1].clockOut, null);
  assert.equal(rows[1].minutes, null, "una jornada sin salida no puede tener minutos calculados");
});

test("el CSV lleva la cabecera completa y una fila por fichaje", () => {
  const csv = buildTimeClockCsv([ROW, { ...ROW, workDate: "2026-03-03" }]);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0].replace("﻿", ""), TIMECLOCK_EXPORT_HEADERS.join(";"));
  assert.match(lines[1], /Ana Ruiz/);
  assert.match(lines[1], /495/);
});

/** El fichero acaba en una gestoría: acentos legibles y campos bien escapados. */
test("el CSV escapa los campos con separador y lleva BOM para Excel", () => {
  const csv = buildTimeClockCsv([{ ...ROW, centerName: 'Centro "Norte"; anexo' }]);
  assert.equal(csv.startsWith("﻿"), true);
  assert.match(csv, /"Centro ""Norte""; anexo"/);
});

test("una exportación vacía sigue siendo un CSV con cabecera", () => {
  const csv = buildTimeClockCsv([]);
  assert.equal(csv.trim().replace("﻿", ""), TIMECLOCK_EXPORT_HEADERS.join(";"));
});

/** Escenario "declaración por escrito": consta que Apta no presta el servicio. */
test("la declaración dice expresamente que Apta no presta registro de jornada", () => {
  assert.match(NO_TIME_TRACKING_NOTICE.title, /no presta registro de jornada/i);
  assert.match(NO_TIME_TRACKING_NOTICE.body, /34\.9/);
  assert.match(NO_TIME_TRACKING_NOTICE.body, /por su propio medio/);
  assert.equal(TIMECLOCK_RETENTION_YEARS, 4);
  assert.match(NO_TIME_TRACKING_NOTICE.body, /cuatro años/);
});

/** Escenario "si algún día vuelve": lo que le faltaba al diseño anterior. */
test("si vuelve, el diseño contempla pausas, jornada partida e inalterabilidad", () => {
  const list = NO_TIME_TRACKING_NOTICE.ifItComesBack.join(" ").toLowerCase();
  for (const expected of ["pausas", "jornada partida", "extraordinarias", "inalterabilidad", "representación"]) {
    assert.ok(list.includes(expected), `falta: ${expected}`);
  }
});

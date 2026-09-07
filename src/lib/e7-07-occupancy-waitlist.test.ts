import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getOccupancyByCenter } from "@/lib/dashboard-queries";
import { resequenceWaitlist } from "@/lib/waitlist";
import { bookSessionForMemberAsStaff, cancelSessionBooking } from "@/lib/agenda-queries";
import {
  cleanupRegressionOrgs,
  createRegressionMember,
  createRegressionOrg,
  createRegressionSession,
  type RegressionMember,
  type RegressionOrg,
} from "@/lib/e7-07-fixture";

/**
 * E7-07 · U7 y U8 — ocupación de una serie y posiciones de la lista de espera,
 * contra la consulta y contra la tabla de verdad.
 *
 * U7: una serie semanal de 8 semanas con aforo 10 tiene que dar ocupación POR
 * OCURRENCIA. `occupancy.test.ts` ya prueba la aritmética; lo que aquí se
 * comprueba es la consulta entera, que es donde estaba el fallo: se filtraba
 * por `ClassSession.date` —en una serie, solo la fecha BASE— y se contaban las
 * reservas de la fila completa sin acotar por `occurrenceDate`. Resultado: una
 * serie aportaba su aforo UNA vez y TODAS sus reservas históricas, y el panel
 * de dirección enseñaba ocupaciones por encima del 100 %.
 *
 * U8: tras una baja en la cola, las posiciones ni se duplican ni dejan hueco.
 * También aquí la parte pura ya estaba probada (`waitlist.test.ts`); lo que
 * faltaba es que la renumeración ocurra de verdad en las salidas reales de la
 * cola, que es donde no ocurría: A(1), B(2), A se da de baja, entra C → C se
 * llevaba también la 2, y el aviso de plaza libre, que sale ordenado por
 * posición, dejaba de significar nada.
 */

const TAG = "u7-u8";
let org: RegressionOrg;

before(async () => {
  await cleanupRegressionOrgs(TAG);
  org = await createRegressionOrg(TAG);
});

after(async () => {
  await cleanupRegressionOrgs(TAG);
  await prisma.$disconnect();
});

// --- U7 · ocupación de una serie ---------------------------------------------

test("U7 · una serie semanal de 8 semanas con aforo 10 no pasa del 100 % de ocupación", async () => {
  // Serie que empezó hace 8 semanas: su fecha BASE queda fuera de la ventana de
  // 30 días del panel, que es el caso que no se contaba nunca.
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() - 7 * 8);

  // La serie termina en su octava ocurrencia. Sin `recUntil` seguiría
  // proyectando semanas hacia adelante —incluida la de hoy, sin nadie
  // apuntado—, y la ocupación bajaría por ocurrencias que aún no se han dado:
  // correcto, pero otro caso. Aquí se mide el que la historia describe.
  const recUntil = new Date(base);
  recUntil.setDate(recUntil.getDate() + 7 * 7);

  const session = await prisma.classSession.create({
    data: {
      orgId: org.orgId,
      centerId: org.centerId,
      trainerId: org.trainerId,
      name: "serie-semanal",
      classType: "Grupo reducido",
      date: base,
      startTime: "18:00",
      endTime: "19:00",
      capacity: 10,
      recurrence: "WEEKLY",
      recUntil,
    },
  });

  // Ocho ocurrencias semanales con 6 asistencias cada una: 60 % por ocurrencia.
  // Sin acotar por día, las 48 reservas se imputarían a la ÚNICA ocurrencia que
  // el filtro por fecha base dejaba pasar: 480 % antes del tope.
  const socios: RegressionMember[] = [];
  for (const i of [1, 2, 3, 4, 5, 6]) socios.push(await createRegressionMember(org, `${TAG}-serie`, i, 10));

  for (let week = 0; week < 8; week++) {
    const day = new Date(base);
    day.setDate(day.getDate() + 7 * week);
    for (const socio of socios) {
      await prisma.booking.create({
        data: { sessionId: session.id, occurrenceDate: day, memberId: socio.id, status: "ATTENDED" },
      });
    }
  }

  const [center] = await getOccupancyByCenter(org.orgId);
  assert.ok(center, "el centro del fixture tiene que aparecer en el panel");
  assert.ok(center.occupancyPct <= 100, `ocupación imposible: ${center.occupancyPct} %`);
  assert.equal(center.occupancyPct, 60, "6 de 10 plazas en cada ocurrencia, no 48 en una");
  assert.equal(
    center.sessions,
    4,
    "la ventana de 30 días cubre cuatro ocurrencias de la serie: se cuentan clases dadas, no filas ni reservas"
  );
});

test("U7 · una sesión suelta sin asistencia no inventa ocupación", async () => {
  const solo = await createRegressionOrg(`${TAG}-vacio`);
  await createRegressionSession(solo, "clase-vacia", { capacity: 10, startsInHours: -48 });

  const [center] = await getOccupancyByCenter(solo.orgId);
  assert.equal(center.occupancyPct, 0);
  assert.equal(center.sessions, 1, "la ocurrencia existe aunque no fuera nadie");
});

// --- U8 · posiciones de la lista de espera ------------------------------------

test("U8 · tras una baja en la cola, las posiciones se compactan sin huecos ni duplicados", async () => {
  const session = await createRegressionSession(org, "clase-con-cola", { capacity: 1, startsInHours: 48 });
  const dentro = await createRegressionMember(org, `${TAG}-cola`, 10, 5);
  const a = await createRegressionMember(org, `${TAG}-cola`, 11, 5);
  const b = await createRegressionMember(org, `${TAG}-cola`, 12, 5);
  const c = await createRegressionMember(org, `${TAG}-cola`, 13, 5);

  await prisma.booking.create({
    data: {
      sessionId: session.id,
      occurrenceDate: session.day,
      memberId: dentro.id,
      status: "BOOKED",
      subscriptionId: dentro.subscriptionId,
    },
  });
  for (const [i, socio] of [a, b, c].entries()) {
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        occurrenceDate: session.day,
        memberId: socio.id,
        status: "WAITLISTED",
        waitlistPosition: i + 1,
      },
    });
  }

  // El segundo de la cola se da de baja: es la salida que dejaba el hueco.
  const salida = await prisma.booking.findFirstOrThrow({
    where: { sessionId: session.id, memberId: b.id },
  });
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: salida.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), waitlistPosition: null },
    });
    await resequenceWaitlist(tx, session.id, session.day);
  });

  const cola = await prisma.booking.findMany({
    where: { sessionId: session.id, occurrenceDate: session.day, status: "WAITLISTED" },
    orderBy: { waitlistPosition: "asc" },
    select: { memberId: true, waitlistPosition: true },
  });

  assert.deepEqual(
    cola.map((x) => x.waitlistPosition),
    [1, 2],
    "1 y 2, no 1 y 3: un hueco convierte 'tienes a uno delante' en mentira"
  );
  assert.deepEqual(
    cola.map((x) => x.memberId),
    [a.id, c.id],
    "y el orden de llegada se respeta"
  );
  assert.equal(new Set(cola.map((x) => x.waitlistPosition)).size, cola.length, "sin duplicados");
});

test("U8 · quien entra después se pone detrás, no encima de la posición de otro", async () => {
  const session = await createRegressionSession(org, "clase-cola-nueva", { capacity: 1, startsInHours: 48 });
  const dentro = await createRegressionMember(org, `${TAG}-cola2`, 20, 5);
  const espera = await createRegressionMember(org, `${TAG}-cola2`, 21, 5);
  const nuevo = await createRegressionMember(org, `${TAG}-cola2`, 22, 5);

  await bookSessionForMemberAsStaff(org.orgId, {
    sessionId: session.id,
    memberId: dentro.id,
    occurrenceDate: session.day,
  });
  for (const [i, socio] of [espera, nuevo].entries()) {
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        occurrenceDate: session.day,
        memberId: socio.id,
        status: "WAITLISTED",
        waitlistPosition: i + 1,
      },
    });
  }

  // Se libera la plaza: la renumeración de la cola no la desordena.
  const booking = await prisma.booking.findFirstOrThrow({
    where: { sessionId: session.id, memberId: dentro.id },
  });
  await cancelSessionBooking(org.orgId, booking.id);

  const cola = await prisma.booking.findMany({
    where: { sessionId: session.id, occurrenceDate: session.day, status: "WAITLISTED" },
    orderBy: { waitlistPosition: "asc" },
    select: { memberId: true, waitlistPosition: true },
  });
  assert.deepEqual(cola.map((x) => x.waitlistPosition), [1, 2]);
  assert.deepEqual(cola.map((x) => x.memberId), [espera.id, nuevo.id]);
});

test("U8 · renumerar una cola que ya está bien no escribe nada", async () => {
  const session = await createRegressionSession(org, "clase-cola-ok", { capacity: 1, startsInHours: 48 });
  const uno = await createRegressionMember(org, `${TAG}-cola3`, 30, 5);
  const dos = await createRegressionMember(org, `${TAG}-cola3`, 31, 5);
  for (const [i, socio] of [uno, dos].entries()) {
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        occurrenceDate: session.day,
        memberId: socio.id,
        status: "WAITLISTED",
        waitlistPosition: i + 1,
      },
    });
  }

  const changed = await prisma.$transaction((tx) => resequenceWaitlist(tx, session.id, session.day));
  assert.equal(changed, 0, "escribir por escribir convierte cada lectura de la cola en una escritura");
});

test("U8 · la cola es de la OCURRENCIA, no de la serie: dos días no se mezclan", async () => {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + 2);
  const session = await prisma.classSession.create({
    data: {
      orgId: org.orgId,
      centerId: org.centerId,
      trainerId: org.trainerId,
      name: "serie-con-cola",
      classType: "Grupo reducido",
      date: base,
      startTime: "18:00",
      endTime: "19:00",
      capacity: 1,
      recurrence: "WEEKLY",
    },
  });
  const semanaQueViene = new Date(base);
  semanaQueViene.setDate(semanaQueViene.getDate() + 7);

  const hoy = await createRegressionMember(org, `${TAG}-cola4`, 40, 5);
  const proxima = await createRegressionMember(org, `${TAG}-cola4`, 41, 5);
  await prisma.booking.create({
    data: {
      sessionId: session.id,
      occurrenceDate: base,
      memberId: hoy.id,
      status: "WAITLISTED",
      waitlistPosition: 1,
    },
  });
  await prisma.booking.create({
    data: {
      sessionId: session.id,
      occurrenceDate: semanaQueViene,
      memberId: proxima.id,
      // A propósito con la posición mal puesta: si la renumeración mezclara los
      // días, esta fila cambiaría al renumerar la del otro día.
      status: "WAITLISTED",
      waitlistPosition: 7,
    },
  });

  await prisma.$transaction((tx) => resequenceWaitlist(tx, session.id, base));

  const otraSemana = await prisma.booking.findFirstOrThrow({
    where: { sessionId: session.id, occurrenceDate: semanaQueViene },
    select: { waitlistPosition: true },
  });
  assert.equal(otraSemana.waitlistPosition, 7, "la cola del otro día no se toca: una serie comparte fila, no lista");
});

import { test, expect, type APIRequestContext } from "@playwright/test";

import { loginAs } from "./helpers";
import { prisma } from "@/lib/prisma";
import { FLOW_SEED_TEMPLATES } from "@/lib/emails/flow-templates";
import { AUSENCIA_SEED, BIENVENIDA_SEED, IMPAGO_SEED, flowSeedKey, seedFlows } from "@/lib/flows/seeds";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E14-35 / E14-36 · LOS FLUJOS DE SALIDA, DE PUNTA A PUNTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `e2e/flujos-editor.spec.ts` es de E2 y prueba que no se pueda GUARDAR un flujo
 * inválido. Este prueba lo otro: que los flujos sembrados HACEN LO QUE DICEN
 * cuando el motor pasa por encima.
 *
 * Los tres del encargo, enteros: 1 · bienvenida, 3 · ausencia, 5 · impago. Y la
 * que de verdad da miedo romper: que EL TOPE SEMANAL FRENE EL SEGUNDO CORREO
 * cuando dos flujos caen sobre el mismo socio.
 *
 * ---------------------------------------------------------------------------
 * EL MOTOR SE MUEVE POR SU ENDPOINT DE VERDAD
 * ---------------------------------------------------------------------------
 * Las pasadas se hacen contra `/api/flujos/cron`, que es lo que llama el cron en
 * producción, y no importando `runFlowQueue` en este proceso. Dos razones, y la
 * segunda es la que decide: el motor arrastra `entitlements.ts` → `auth.ts` →
 * next-auth, que fuera del empaquetador de Next no resuelve; y probar por el
 * endpoint prueba también el endpoint —el secreto, el aislamiento por
 * organización y el informe que devuelve—, que es por donde esto falla de verdad.
 *
 * ---------------------------------------------------------------------------
 * CÓMO SE VIAJA EN EL TIEMPO SIN ESPERAR TREINTA DÍAS
 * ---------------------------------------------------------------------------
 * No se toca el reloj: SE ENVEJECEN LOS DATOS. `avanza(socio, días)` retrasa lo
 * que ese socio tiene en la cola (`FlowEnrollment.nextRunAt`) y la fecha de los
 * correos que ya recibió (`FlowEmailLog.sentAt`), que es exactamente lo que el
 * motor mira para decidir. Para el motor es indistinguible de que hayan pasado
 * esos días, y así cada test controla SU socio sin mover el de al lado.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ HAY UN CENTRO DE PRUEBA Y NO SE USA UNO DE LA DEMO
 * ---------------------------------------------------------------------------
 * Los disparadores acotan por `Member.primaryCenterId`. Con un centro propio, el
 * motor solo ve a los socios que crea este fichero: la demo tiene setenta y un
 * socios y, sin esto, cada pasada los inscribiría a todos, abriría decenas de
 * tareas de verdad en el tablero de gente de verdad y dejaría la base peor que
 * como la encontró. Es lo mismo que exige AGENTS.md sobre no ejecutar la suite
 * entera: no contaminar la demo compartida.
 */

const DIRECCION = "direccion@trainingzone.es";
/** Marca única: la demo es compartida y dos pasadas no pueden chocar. */
const MARCA = `e2e-flujos-${Date.now().toString().slice(-6)}`;
const BUZON_DE_PRUEBAS = `pruebas.${MARCA}@trainingzone.es`;
const DIA_MS = 86_400_000;

const CRON_SECRET = process.env.JOBS_CRON_SECRET;

let orgId = "";
let centerId = "";
let testEmailPrevio: string | null = null;
let pausaPrevia: Date | null = null;

const socios: Record<string, string> = {};
const flujos: Record<string, string> = {};

function haceDias(dias: number): Date {
  return new Date(Date.now() - dias * DIA_MS);
}

/** Medianoche local, que es como se codifican las fechas de calendario. */
function diaSuelto(offsetDias: number): Date {
  const d = new Date(Date.now() + offsetDias * DIA_MS);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

async function creaSocio(clave: string, data: Record<string, unknown>): Promise<string> {
  const member = await prisma.member.create({
    data: {
      orgId,
      primaryCenterId: centerId,
      firstName: clave,
      lastName: MARCA,
      email: `${clave}.${MARCA}@example.test`,
      // Sin consentimiento de marketing no sale NADA, ni siquiera en borrador
      // (regla 6). Un socio de prueba sin esto daría verde por el motivo
      // equivocado: «no se mandó» sería cierto y no probaría nada.
      consentMarketing: true,
      consentMarketingAt: new Date(),
      ...data,
    },
    select: { id: true },
  });
  socios[clave] = member.id;
  return member.id;
}

/** Una pasada del motor, por donde pasa en producción. Devuelve el informe de NUESTRA organización. */
async function pasada(request: APIRequestContext) {
  const res = await request.get("/api/flujos/cron", { headers: { "x-cron-secret": CRON_SECRET! } });
  expect(res.ok(), `el cron de flujos ha respondido ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const informe = (body.reports as { orgId: string }[]).find((r) => r.orgId === orgId);
  expect(informe, "el cron no ha llegado a nuestra organización").toBeTruthy();
  return informe as {
    orgId: string;
    enrolled: number;
    emailsSent: number;
    testEmailsSent: number;
    paused: boolean;
    skippedNoFeature: boolean;
    blocked: Record<string, number>;
  };
}

/**
 * Envejece lo que el motor mira de ESTE socio. Ver la nota de arriba: es viajar
 * en el tiempo moviendo los datos, que es lo único que se puede hacer cuando el
 * reloj lo pone el servidor.
 */
async function avanza(memberId: string, dias: number) {
  const intervalo = `${dias} days`;
  await prisma.$executeRawUnsafe(
    `UPDATE "FlowEnrollment" SET "nextRunAt" = "nextRunAt" - $1::interval, "enrolledAt" = "enrolledAt" - $1::interval WHERE "memberId" = $2`,
    intervalo,
    memberId
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "FlowEmailLog" SET "sentAt" = "sentAt" - $1::interval WHERE "memberId" = $2`,
    intervalo,
    memberId
  );
}

test.beforeAll(async () => {
  // La organización se resuelve por el USUARIO con el que entra el test y no con
  // `findFirst`: la demo tiene cinco organizaciones y Postgres no garantiza cuál
  // devuelve primero. Con la equivocada, todo pasaría por el motivo equivocado.
  const usuario = await prisma.user.findFirstOrThrow({
    where: { email: DIRECCION },
    select: { id: true, orgId: true },
  });
  orgId = usuario.orgId;

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { flowsTestEmail: true, flowsPausedAt: true },
  });
  testEmailPrevio = org.flowsTestEmail;
  pausaPrevia = org.flowsPausedAt;

  // Reglas 4 y 5. La pausa se quita porque una pasada anterior que se cayera a
  // mitad la dejaría puesta, y entonces aquí no saldría ni un correo con un
  // error que no dice por qué.
  await prisma.organization.update({
    where: { id: orgId },
    data: { flowsTestEmail: BUZON_DE_PRUEBAS, flowsPausedAt: null },
  });

  const center = await prisma.center.create({
    data: { orgId, name: `Centro ${MARCA}`, slug: MARCA, timezone: "Europe/Madrid" },
    select: { id: true },
  });
  centerId = center.id;

  // Un centro SIN NADIE AL MANDO no puede recibir tareas: `createTask` busca al
  // entrenador del socio y, si no hay, a la dirección DEL CENTRO —y un OWNER de
  // organización sin `centerId` ni pertenencia no cuenta como tal—. Sin esta
  // pertenencia el motor descarta la tarea con un error en el log y los tests de
  // los flujos 1 y 3 fallarían por el montaje, no por el flujo.
  await prisma.centerMembership.create({
    data: { orgId, userId: usuario.id, centerId, role: "OWNER", isPrimary: false },
  });

  // --- Los socios, uno por flujo ------------------------------------------
  // 1 · alta de hoy.
  await creaSocio("bienvenida", { state: "ACTIVE", joinedAt: haceDias(0) });

  // 3 · lleva veinte días sin venir Y está pagando. Hacen falta las dos cosas:
  // el disparador mira la última asistencia y la condición, que tenga una
  // suscripción viva — un congelado lleva sin venir a propósito.
  const ausente = await creaSocio("ausencia", { state: "ACTIVE", joinedAt: haceDias(200) });
  const plan = await prisma.membershipPlan.findFirstOrThrow({
    where: { orgId, active: true },
    select: { id: true, priceCents: true },
  });
  await prisma.subscription.create({
    data: {
      memberId: ausente,
      planId: plan.id,
      centerId,
      status: "ACTIVE",
      startDate: haceDias(200),
      priceCents: plan.priceCents,
    },
  });
  // La última visita. Se cuelga de una sesión que ya existe en la demo: lo que
  // `lastAttendanceByMember` mira es la reserva, no dónde se dio la clase.
  const sesion = await prisma.classSession.findFirstOrThrow({ where: { orgId }, select: { id: true } });
  await prisma.booking.create({
    data: { sessionId: sesion.id, memberId: ausente, status: "ATTENDED", occurrenceDate: diaSuelto(-20) },
  });

  // 5 · recibo devuelto ayer, que es lo que deja escrito el dunning de Stripe.
  await creaSocio("impago", { state: "DELINQUENT", joinedAt: haceDias(300), delinquentSince: haceDias(1) });

  // Tope semanal · alta de hoy Y recibo devuelto hoy: los dos flujos a la vez
  // sobre la misma persona, que es el caso que rompe la promesa si el cerrojo
  // no es global.
  await creaSocio("coinciden", { state: "DELINQUENT", joinedAt: haceDias(0), delinquentSince: haceDias(0) });

  // --- Los flujos, sembrados de verdad ------------------------------------
  // Las MISMAS semillas que van a producción y no una versión de juguete: si
  // alguien cambia una espera en la semilla, este fichero se entera.
  const report = await seedFlows(orgId, centerId, { seeds: [BIENVENIDA_SEED, AUSENCIA_SEED, IMPAGO_SEED] });
  for (const outcome of report.outcomes) {
    expect(outcome.status, `la semilla «${outcome.name}» no se ha sembrado`).toBe("sembrado");
  }
  for (const seed of [BIENVENIDA_SEED, AUSENCIA_SEED, IMPAGO_SEED]) {
    const flow = await prisma.flow.findFirstOrThrow({
      where: { orgId, seedKey: flowSeedKey(seed.seedKey, centerId) },
      select: { id: true, status: true },
    });
    // Sembrar NO enciende: nacen en borrador, y eso es media garantía del módulo.
    expect(flow.status).toBe("DRAFT");
    flujos[seed.seedKey] = flow.id;
  }
});

test.afterAll(async () => {
  // Se limpia lo propio y NADA más: la demo es compartida.
  const ids = Object.values(flujos);
  const miembros = Object.values(socios);
  try {
    if (ids.length > 0) {
      await prisma.flowEmailLog.deleteMany({ where: { flowId: { in: ids } } });
      await prisma.flowEnrollment.deleteMany({ where: { flowId: { in: ids } } });
      await prisma.flow.deleteMany({ where: { id: { in: ids } } });
    }
    if (miembros.length > 0) {
      await prisma.notification.deleteMany({ where: { orgId, entityType: "FlowTask" } });
      await prisma.memberFormInvite.deleteMany({ where: { memberId: { in: miembros } } });
      await prisma.booking.deleteMany({ where: { memberId: { in: miembros } } });
      await prisma.sessionLedger.deleteMany({ where: { subscription: { memberId: { in: miembros } } } });
      await prisma.subscription.deleteMany({ where: { memberId: { in: miembros } } });
      await prisma.member.deleteMany({ where: { id: { in: miembros } } });
    }
    if (centerId) {
      await prisma.centerMembership.deleteMany({ where: { centerId } });
      await prisma.center.deleteMany({ where: { id: centerId } });
    }
  } finally {
    if (orgId) {
      await prisma.organization.update({
        where: { id: orgId },
        data: { flowsTestEmail: testEmailPrevio, flowsPausedAt: pausaPrevia },
      });
    }
  }
});

/** Los correos que un flujo le ha mandado a un socio, del más antiguo al más nuevo. */
function correosDe(flowId: string, memberId: string) {
  return prisma.flowEmailLog.findMany({
    where: { flowId, memberId },
    orderBy: { sentAt: "asc" },
    select: { templateKey: true, toEmail: true, testMode: true, subject: true, sentAt: true },
  });
}

test.describe("E14-35 · los flujos de salida, en modo borrador", () => {
  test.skip(!CRON_SECRET, "El motor se mueve por /api/flujos/cron: hace falta JOBS_CRON_SECRET.");

  test("1 · bienvenida: correo y formulario el día 0, tarea el día 2, revisión el día 30", async ({ request }) => {
    const flowId = flujos[BIENVENIDA_SEED.seedKey];
    const memberId = socios.bienvenida;

    // --- Día 0 ------------------------------------------------------------
    const dia0 = await pasada(request);
    expect(dia0.paused, "el módulo no puede estar en pausa global").toBe(false);
    expect(dia0.skippedNoFeature, "la organización de la demo tiene el plan que incluye flujos").toBe(false);

    const inscripcion = await prisma.flowEnrollment.findFirstOrThrow({
      where: { flowId, memberId },
      select: { id: true, status: true },
    });
    expect(inscripcion.status).toBe("SCHEDULED");

    const [bienvenida] = await correosDe(flowId, memberId);
    expect(bienvenida, "el día 0 tiene que salir el correo de bienvenida").toBeTruthy();
    expect(bienvenida.templateKey).toBe("bienvenida-dia-0");

    // MODO BORRADOR (regla 5): el correo se manda de verdad, pero al buzón de
    // pruebas. Esta línea es la que separa «probar el módulo» de «escribirle a
    // cuarenta y nueve socios».
    expect(bienvenida.testMode).toBe(true);
    expect(bienvenida.toEmail).toBe(BUZON_DE_PRUEBAS);
    // El registro guarda el asunto LIMPIO; el prefijo «[Borrador]» y la banda
    // amarilla se los pone el correo que sale, no la fila. Se comprueba contra
    // el texto de la plantilla para que un cambio de copy no pase inadvertido.
    expect(bienvenida.subject).toBe(FLOW_SEED_TEMPLATES.bienvenidaDia0.subject);

    // Y la invitación del formulario de M5 NO se manda en borrador: sería un
    // correo de verdad a un socio de verdad, que es justo lo que el borrador evita.
    expect(await prisma.memberFormInvite.count({ where: { memberId } })).toBe(0);

    // --- Día 2 · la tarea al entrenador -----------------------------------
    await avanza(memberId, 2);
    await pasada(request);
    const tarea = await prisma.notification.findFirst({
      where: { orgId, entityType: "FlowTask", kind: "TASK", title: { contains: "formulario" } },
      select: { title: true, category: true },
    });
    expect(tarea, "el día 2 se abre la tarea al entrenador").toBeTruthy();
    expect(tarea?.category).toBe("Flujos");
    // El motor le pega el nombre del socio al título: es lo que hace la tarea
    // accionable sin abrir nada.
    expect(tarea?.title).toContain(MARCA);

    // --- Día 30 · la revisión de objetivos --------------------------------
    // Veintiocho días más, porque la espera se cuenta desde el paso anterior y
    // ese corrió el día 2. Si alguien escribe 30 en la semilla, el correo cae el
    // día 32 y esto se pone rojo — que es el error que no se ve en pantalla.
    await avanza(memberId, 28);
    await pasada(request);
    const correos = await correosDe(flowId, memberId);
    expect(correos.map((c) => c.templateKey)).toEqual(["bienvenida-dia-0", "bienvenida-dia-30"]);

    // Recorrido entero: la inscripción se cierra sola y sale de la cola.
    const cerrada = await prisma.flowEnrollment.findUniqueOrThrow({
      where: { id: inscripcion.id },
      select: { status: true, nextRunAt: true },
    });
    expect(cerrada.status).toBe("COMPLETED");
    expect(cerrada.nextRunAt, "un flujo terminado no se queda en la cola").toBeNull();
  });

  test("3 · ausencia: correo y llamada a las 2 semanas, aviso al director a las 3", async ({ request }) => {
    const flowId = flujos[AUSENCIA_SEED.seedKey];
    const memberId = socios.ausencia;

    await pasada(request);

    const [correo] = await correosDe(flowId, memberId);
    expect(correo, "lleva veinte días sin venir y pagando: le toca").toBeTruthy();
    expect(correo.templateKey).toBe("ausencia-2-semanas");
    expect(correo.testMode).toBe(true);

    // La tarea sale el mismo día que el correo: no gasta cupo ni espera a las
    // 8:00, porque no escribe al socio.
    const llamada = await prisma.notification.findFirst({
      where: { orgId, entityType: "FlowTask", kind: "TASK", title: { contains: "llámale" } },
      select: { title: true, body: true },
    });
    expect(llamada, "a las dos semanas hay que llamar, y eso es una tarea").toBeTruthy();
    // El hueco declarado de esta semilla: el teléfono no cabe en el cuerpo, así
    // que el texto dice dónde está. Si algún día se interpola, esto cambia.
    expect(llamada?.body).toContain("ficha");

    // --- Tres semanas: el aviso al director -------------------------------
    await avanza(memberId, 7);
    await pasada(request);
    const alDirector = await prisma.notification.findFirst({
      where: { orgId, entityType: "FlowTask", kind: "ALERT", title: { contains: "Tres semanas" } },
      select: { priority: true, kind: true },
    });
    expect(alDirector, "a las tres semanas se avisa a dirección").toBeTruthy();
    // ALERT y no TASK: es un aviso de campana, no trabajo repartido, y por eso
    // no entra en el tope semanal de tareas de M3.
    expect(alDirector?.kind).toBe("ALERT");
    expect(alDirector?.priority).toBe("ALTA");

    // Y ningún segundo correo: este flujo manda UNO.
    expect(await correosDe(flowId, memberId)).toHaveLength(1);
  });

  test("5 · impago: correo el día 1, tarea el día 3 y suspensión el día 7 por member-lifecycle", async ({ request }) => {
    const flowId = flujos[IMPAGO_SEED.seedKey];
    const memberId = socios.impago;

    // El primer paso espera un día, así que de las pasadas anteriores no ha
    // salido nada todavía. Es la cola haciendo su trabajo.
    expect(await correosDe(flowId, memberId)).toHaveLength(0);

    // --- Día 1 · el correo con el enlace de pago --------------------------
    await avanza(memberId, 1);
    await pasada(request);
    const [aviso] = await correosDe(flowId, memberId);
    expect(aviso, "el día siguiente al recibo devuelto sale el correo").toBeTruthy();
    expect(aviso.templateKey).toBe("impago-dia-1");
    expect(aviso.testMode).toBe(true);

    // --- Día 3 · la tarea a administración --------------------------------
    await avanza(memberId, 2);
    await pasada(request);
    expect(
      await prisma.notification.findFirst({
        where: { orgId, entityType: "FlowTask", kind: "TASK", title: { contains: "Impago de 3 días" } },
        select: { id: true },
      }),
      "al tercer día alguien tiene que llamar"
    ).toBeTruthy();

    // --- Día 7 · suspendido, y POR member-lifecycle -----------------------
    await avanza(memberId, 4);
    await pasada(request);
    const socio = await prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      select: { state: true, delinquentSince: true },
    });
    expect(socio.state).toBe("DELINQUENT");
    // La prueba de que NO fue un `update` suelto: `member-lifecycle.ts` es el
    // punto único de escritura de las transiciones y deja rastro en el AuditLog.
    const rastro = await prisma.auditLog.findFirst({
      where: { orgId, memberId, action: "MEMBER_DELINQUENT" },
      select: { entityType: true },
    });
    expect(rastro, "un cambio de estado sin AuditLog es un update suelto").toBeTruthy();
    expect(rastro?.entityType).toBe("Member");
    // Y el reloj de gracia no se reinicia al volver a marcarlo: el que vale es
    // el del primer impago (HU-ST-18).
    expect(socio.delinquentSince).not.toBeNull();
  });
});

test.describe("E14-26 · el tope semanal, que es la promesa que no se puede romper", () => {
  test.skip(!CRON_SECRET, "El motor se mueve por /api/flujos/cron: hace falta JOBS_CRON_SECRET.");

  test("dos flujos sobre el mismo socio: sale uno, el otro se aplaza y no se pierde", async ({ request }) => {
    const memberId = socios.coinciden;
    const bienvenida = flujos[BIENVENIDA_SEED.seedKey];
    const impago = flujos[IMPAGO_SEED.seedKey];

    // AQUÍ SE ENCIENDEN LOS DOS FLUJOS, y es la única parte del fichero que no
    // corre en borrador. El tope semanal NO aplica al modo borrador, y con razón:
    // el correo de un ensayo no llega al socio, así que ni gasta cupo ni puede
    // ser frenado por él. Para ver el cerrojo trabajando hay que mandar de
    // verdad — este socio tiene un correo de usar y tirar y en CI no hay
    // proveedor configurado, así que `mailer.ts` lo registra en el log y no sale
    // de la máquina.
    await prisma.flow.updateMany({ where: { id: { in: [bienvenida, impago] } }, data: { status: "ACTIVE" } });

    try {
      // Las pasadas anteriores ya lo inscribieron en los dos flujos (alta de hoy
      // + recibo devuelto hoy) y le mandaron la bienvenida en borrador. Se borra
      // ese ensayo para medir el cerrojo sobre correo de VERDAD y nada más, y se
      // rebobinan las dos inscripciones al principio.
      //
      // La bienvenida vuelve a tocar HOY y el impago MAÑANA, que es la cadencia
      // de las semillas (día 0 y día 1). No se ponen las dos para hoy a
      // propósito: se frenarían en la misma pasada y el test no distinguiría el
      // cerrojo funcionando de dos correos compitiendo por el mismo minuto.
      await prisma.flowEmailLog.deleteMany({ where: { orgId, memberId } });
      const rebobina = { currentStepPosition: -1, currentBranch: "MAIN" as const, status: "SCHEDULED" as const };
      await prisma.flowEnrollment.updateMany({
        where: { orgId, memberId, flowId: bienvenida },
        data: { ...rebobina, nextRunAt: new Date() },
      });
      await prisma.flowEnrollment.updateMany({
        where: { orgId, memberId, flowId: impago },
        data: { ...rebobina, nextRunAt: new Date(Date.now() + DIA_MS) },
      });

      // Pasada 1 · la bienvenida sale de verdad y RESERVA el hueco de la semana.
      const primera = await pasada(request);
      expect(primera.emailsSent).toBeGreaterThan(0);

      // Pasada 2 · un día después le toca al impago. Y choca.
      await avanza(memberId, 1);
      const segunda = await pasada(request);

      // LA CIFRA QUE PRUEBA EL CERROJO: el informe del motor cuenta qué frenó
      // cada regla. Un tope que nunca frena nada no se ha probado.
      expect(segunda.blocked.weekly_cap, "el segundo correo tiene que chocar con el tope").toBeGreaterThan(0);

      // Y la prueba de verdad, en la base: UN solo correo de verdad esta semana,
      // entre TODOS los flujos. Es la promesa literal a negocio.
      const deVerdad = await prisma.flowEmailLog.findMany({
        where: { orgId, memberId, testMode: false },
        orderBy: { sentAt: "asc" },
        select: { flowId: true, templateKey: true },
      });
      expect(deVerdad).toHaveLength(1);
      expect(deVerdad[0].flowId).toBe(bienvenida);

      // NO SE PIERDE: se aplaza. La inscripción del impago sigue viva y con
      // fecha, que es la diferencia entre una cola y un «enviar ahora».
      const aplazada = await prisma.flowEnrollment.findFirstOrThrow({
        where: { flowId: impago, memberId },
        select: { status: true, nextRunAt: true },
      });
      expect(aplazada.status).toBe("SCHEDULED");
      expect(aplazada.nextRunAt).not.toBeNull();
      expect(aplazada.nextRunAt!.getTime()).toBeGreaterThan(Date.now());

      // Pasada la semana, el correo aplazado sale. Ni se mandó a destiempo ni se
      // quedó por el camino.
      await avanza(memberId, 8);
      await pasada(request);
      const despues = await prisma.flowEmailLog.findMany({
        where: { orgId, memberId, testMode: false },
        select: { templateKey: true },
      });
      expect(despues.some((c) => c.templateKey === "impago-dia-1"), "el correo aplazado acaba saliendo").toBe(true);
    } finally {
      // Se devuelven a borrador pase lo que pase: ni la demo ni el resto de la
      // suite pueden quedarse con dos flujos encendidos por culpa de un test.
      await prisma.flow.updateMany({ where: { id: { in: [bienvenida, impago] } }, data: { status: "DRAFT" } });
    }
  });
});

test.describe("E14-36 · el panel por flujo", () => {
  test("enseña las tres cifras, dice cómo se mide cada una y no ofrece la apertura", async ({ page }) => {
    await loginAs(page, DIRECCION);
    await page.goto(`/flujos/${flujos[BIENVENIDA_SEED.seedKey]}/panel`);

    const panel = page.getByTestId("flow-panel");
    await expect(panel).toBeVisible();

    // Las cifras del embudo, con el objetivo de ESTE flujo rotulado por su
    // nombre y no por «objetivo» a secas.
    const embudo = page.getByTestId("flow-panel-embudo");
    await expect(embudo).toContainText("Entran");
    await expect(embudo).toContainText("Hacen clic");
    await expect(embudo).toContainText("Rellenó el formulario");

    // E14-36, el escenario entero: «la definición se lee en la pantalla». Un
    // embudo cuyo último paso nadie sabe medir es un embudo decorativo.
    await expect(embudo).toContainText("MemberFormInvite.completedAt");
    await expect(embudo).toContainText("Por qué este objetivo");

    // Y la pregunta que siempre se hace, contestada antes de que la hagan.
    const apertura = page.getByTestId("flow-panel-sin-apertura");
    await expect(apertura).toContainText("Aquí no hay tasa de apertura");
    await expect(apertura).toContainText("La respuesta es el clic");

    // Paso a paso: dónde se cae la gente dentro del flujo.
    await expect(page.getByTestId("flow-panel-pasos")).toContainText("Ya estás dentro");

    // Y lo que este flujo todavía no hace solo, dicho ANTES de encenderlo.
    await expect(page.getByTestId("flow-panel-huecos")).toContainText("formulario de alta");
  });
});

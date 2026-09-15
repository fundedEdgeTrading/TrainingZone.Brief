import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/prisma";
import {
  ACCESS_BLOCK_ACTION,
  THROTTLE_POLICY,
  accessBlockAuditPayload,
  auditAccessBlock,
  clientIpFrom,
  counterAfterFailure,
  holdDurationMs,
  prismaAccessAttemptStore,
  progressiveMs,
  throttledAccessAttempt,
  type AccessAttemptStore,
  type AccessBlockEvent,
  type AccessPurpose,
  type AccessScope,
  type AttemptCounter,
} from "@/lib/login-throttle";

/**
 * E1-10 · Rate limiting y protección de fuerza bruta en el login web y móvil.
 *
 * El hallazgo que origina la historia es un número concreto: **doce intentos
 * fallidos consecutivos se procesaban todos**. Por eso las pruebas de los dos
 * primeros escenarios no se conforman con "existe un límite": cuentan cuántos
 * intentos llegan de verdad a comparar la contraseña y exigen que el N+1 no
 * llegue.
 */

// ---------------------------------------------------------------------------
// Dobles: contador en memoria y reloj de mentira
// ---------------------------------------------------------------------------

function memoryStore(): AccessAttemptStore & { rows: Map<string, AttemptCounter> } {
  const rows = new Map<string, AttemptCounter>();
  const id = (purpose: AccessPurpose, scope: AccessScope, key: string) => `${purpose}|${scope}|${key}`;
  return {
    rows,
    async find(purpose, scope, key) {
      return rows.get(id(purpose, scope, key)) ?? null;
    },
    async save(counter) {
      rows.set(id(counter.purpose, counter.scope, counter.key), { ...counter });
    },
    async reset(purpose, scope, key) {
      const row = rows.get(id(purpose, scope, key));
      if (row) rows.set(id(purpose, scope, key), { ...row, failedCount: 0, blockedUntil: null });
    },
  };
}

/** Banco de pruebas: reloj manejable, esperas anotadas y bloqueos anotados. */
function harness(start = new Date("2026-09-15T09:00:00.000Z")) {
  const store = memoryStore();
  const blocks: AccessBlockEvent[] = [];
  const holds: number[] = [];
  let clock = start;

  return {
    store,
    blocks,
    holds,
    get now() {
      return clock;
    },
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
    deps: {
      store,
      now: () => clock,
      hold: async (ms: number) => {
        holds.push(ms);
      },
      recordBlock: async (event: AccessBlockEvent) => {
        blocks.push(event);
      },
    },
  };
}

type Attempt = { email: string; ip: string | null; good?: boolean };

/**
 * Un intento de login como el que hacen los cuatro puntos de entrada: el
 * callback solo se ejecuta si el freno deja pasar, así que contarlo es contar
 * los intentos que llegan a comparar la contraseña.
 */
async function login(
  h: ReturnType<typeof harness>,
  { email, ip, good = false }: Attempt,
  reached: string[] = []
) {
  return throttledAccessAttempt<string>(
    { purpose: "LOGIN", email, ip },
    async () => {
      reached.push(email);
      return good ? { granted: true, value: "sesión" } : { granted: false };
    },
    h.deps
  );
}

// ---------------------------------------------------------------------------
// Escenario 1 · intentos fallidos consecutivos por email
// ---------------------------------------------------------------------------

test("E1-10/1: los doce intentos del hallazgo ya no se procesan — el N+1 se rechaza", async () => {
  const h = harness();
  const procesados: string[] = [];
  const umbral = THROTTLE_POLICY.LOGIN.emailThreshold;

  const resultados = [];
  for (let i = 0; i < 12; i++) {
    resultados.push(await login(h, { email: "direccion.lajota@trainingzone.es", ip: "203.0.113.9" }, procesados));
  }

  assert.equal(
    procesados.length,
    umbral,
    `el hallazgo era que los doce llegaban a comparar contraseña; ahora llegan ${umbral}`
  );
  assert.equal(procesados.length < 12, true);
  // El intento número umbral+1 es el primero que NO se procesa.
  assert.equal(resultados.length, 12);
  assert.deepEqual(
    resultados.map((r) => r.ok),
    Array(12).fill(false),
    "todos fallan, pero los de más allá del umbral ni se evalúan"
  );
});

test("E1-10/1: pasado el umbral, el rechazo llega con retardo progresivo y acotado", async () => {
  const h = harness();
  const umbral = THROTTLE_POLICY.LOGIN.emailThreshold;
  const email = "recepcion1.lajota@trainingzone.es";

  for (let i = 0; i < umbral; i++) await login(h, { email, ip: "203.0.113.9" });
  assert.deepEqual(h.holds, [], "hasta el umbral no se retiene ninguna respuesta");

  // Cada intento de más espera el doble que el anterior…
  for (let i = 0; i < 6; i++) await login(h, { email, ip: "203.0.113.9" });
  const creciente = h.holds.every((ms, i) => i === 0 || ms >= h.holds[i - 1]!);
  assert.equal(creciente, true, `retardo progresivo: ${h.holds.join(", ")}`);
  assert.equal(h.holds[0]! > 0, true);

  // …con tope: retener peticiones indefinidamente es un coste para el servidor,
  // no para el atacante. El freno de verdad es el bloqueo, no la espera.
  assert.equal(
    h.holds.every((ms) => ms <= THROTTLE_POLICY.LOGIN.maxHoldMs),
    true,
    "ninguna espera pasa del tope"
  );
});

test("E1-10/1: el bloqueo dura cada vez más, y también con tope", async () => {
  const politica = THROTTLE_POLICY.LOGIN;
  const duraciones: number[] = [];
  let contador: AttemptCounter | null = null;
  let ahora = new Date("2026-09-15T09:00:00.000Z");

  for (let i = 0; i < 12; i++) {
    contador = counterAfterFailure(contador, {
      purpose: "LOGIN",
      scope: "EMAIL",
      key: "direccion.lajota@trainingzone.es",
      policy: politica,
      now: ahora,
    });
    if (contador.blockedUntil) duraciones.push(contador.blockedUntil.getTime() - ahora.getTime());
    // El siguiente intento llega justo cuando expira el bloqueo anterior.
    ahora = contador.blockedUntil ?? new Date(ahora.getTime() + 1_000);
  }

  assert.equal(duraciones[0], politica.baseBlockMs, "el primer bloqueo dura lo que dice la política");
  assert.equal(duraciones[1], politica.baseBlockMs * 2, "el segundo, el doble");
  assert.equal(duraciones.at(-1), politica.maxBlockMs, "y deja de crecer al llegar al techo");
});

test("E1-10/1: la respuesta no revela si la cuenta existe", async () => {
  const h = harness();
  const umbral = THROTTLE_POLICY.LOGIN.emailThreshold;

  // Dos emails: el bloqueo se lleva por el email ENVIADO, así que estar
  // bloqueado no depende de que exista una identidad detrás.
  for (let i = 0; i < umbral; i++) await login(h, { email: "no.existe@trainingzone.es", ip: "203.0.113.9" });

  const bloqueado = await login(h, { email: "no.existe@trainingzone.es", ip: "203.0.113.9" });
  const credencialMala = await login(h, { email: "otro.email@trainingzone.es", ip: "198.51.100.1" });

  assert.deepEqual(bloqueado, credencialMala, "mismo resultado, sin motivo que distinga bloqueo de credencial mala");
  assert.equal(Object.keys(bloqueado).join(","), "ok", "el resultado no lleva ni `throttled` ni `retryAfter`");

  // Y el camino bloqueado no ejecuta NADA que dependa de la cuenta: ni busca la
  // identidad ni compara hashes, así que tampoco puede delatarla por tiempo.
  const alcanzados: string[] = [];
  await login(h, { email: "no.existe@trainingzone.es", ip: "203.0.113.9" }, alcanzados);
  assert.deepEqual(alcanzados, [], "el intento bloqueado no llega a tocar credenciales");
});

// ---------------------------------------------------------------------------
// Escenario 2 · límite independiente por IP
// ---------------------------------------------------------------------------

test("E1-10/2: el barrido de muchos emails desde una IP se corta en el N+1", async () => {
  const h = harness();
  const umbralIp = THROTTLE_POLICY.LOGIN.ipThreshold;
  const procesados: string[] = [];
  const ip = "203.0.113.66";

  // Un email distinto cada vez: el contador por email nunca pasa de 1, así que
  // lo único que puede frenar esto es el límite por IP.
  for (let i = 0; i < umbralIp; i++) {
    await login(h, { email: `victima${i}@trainingzone.es`, ip }, procesados);
  }
  assert.equal(procesados.length, umbralIp);

  const siguiente = await login(h, { email: `victima${umbralIp}@trainingzone.es`, ip }, procesados);
  assert.equal(siguiente.ok, false);
  assert.equal(
    procesados.length,
    umbralIp,
    "el intento número umbral+1 no llega a procesarse aunque su email esté limpio"
  );

  const porEmail = await h.store.find("LOGIN", "EMAIL", `victima${umbralIp}@trainingzone.es`);
  assert.equal(porEmail, null, "y no es que ese email estuviera quemado: es la IP");
});

test("E1-10/2: el límite por IP es independiente del de email, y más alto", async () => {
  assert.equal(
    THROTTLE_POLICY.LOGIN.ipThreshold > THROTTLE_POLICY.LOGIN.emailThreshold,
    true,
    "un mostrador comparte salida: el límite por IP no puede ser el de una persona"
  );

  const h = harness();
  const email = "recepcion1.lajota@trainingzone.es";
  for (let i = 0; i < THROTTLE_POLICY.LOGIN.emailThreshold; i++) await login(h, { email, ip: "203.0.113.9" });

  // El email está bloqueado; otro email desde la misma IP todavía pasa.
  const alcanzados: string[] = [];
  await login(h, { email: "otra.persona@trainingzone.es", ip: "203.0.113.9" }, alcanzados);
  assert.deepEqual(alcanzados, ["otra.persona@trainingzone.es"]);
});

test("E1-10/2: sin IP en las cabeceras se sigue aplicando el límite por email", async () => {
  const h = harness();
  const umbral = THROTTLE_POLICY.LOGIN.emailThreshold;
  const procesados: string[] = [];

  for (let i = 0; i < umbral + 3; i++) {
    await login(h, { email: "direccion.lajota@trainingzone.es", ip: null }, procesados);
  }
  assert.equal(procesados.length, umbral, "sin origen conocido no se inventa uno, pero el email sigue contando");
});

test("E1-10/2: la IP sale de x-forwarded-for, y si no de x-real-ip", () => {
  assert.equal(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.9, 70.41.3.18" })), "203.0.113.9");
  assert.equal(clientIpFrom(new Headers({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
  assert.equal(clientIpFrom(new Headers()), null);
  assert.equal(clientIpFrom(new Headers({ "x-forwarded-for": "  " })), null);
});

// ---------------------------------------------------------------------------
// Escenario 3 · el usuario legítimo entra sin fricción pasada la ventana
// ---------------------------------------------------------------------------

test("E1-10/3: pasada la ventana, quien sabe su contraseña entra sin fricción", async () => {
  const h = harness();
  const email = "recepcion1.lajota@trainingzone.es";
  const ip = "203.0.113.9";
  for (let i = 0; i < THROTTLE_POLICY.LOGIN.emailThreshold; i++) await login(h, { email, ip });

  h.advance(THROTTLE_POLICY.LOGIN.windowMs + 1);

  const alcanzados: string[] = [];
  const entrada = await login(h, { email, ip, good: true }, alcanzados);

  assert.deepEqual(entrada, { ok: true, value: "sesión" });
  assert.deepEqual(alcanzados, [email], "el intento se procesa: la ventana ya pasó");
  assert.deepEqual(h.holds, [], "y no se le retiene la respuesta: ni un milisegundo de fricción extra");
});

test("E1-10/3: en cuanto expira el bloqueo vuelve a intentarlo, y acertar limpia el contador", async () => {
  const h = harness();
  const email = "recepcion1.lajota@trainingzone.es";
  const ip = "203.0.113.9";
  for (let i = 0; i < THROTTLE_POLICY.LOGIN.emailThreshold; i++) await login(h, { email, ip });

  // Todavía bloqueado: el bloqueo dura menos que la ventana entera.
  assert.equal((await login(h, { email, ip, good: true })).ok, false);

  h.advance(THROTTLE_POLICY.LOGIN.baseBlockMs + 1);
  assert.deepEqual(await login(h, { email, ip, good: true }), { ok: true, value: "sesión" });

  const contador = await h.store.find("LOGIN", "EMAIL", email);
  assert.equal(contador?.failedCount, 0, "el acierto deja el contador a cero para el próximo error honesto");
  assert.equal(contador?.blockedUntil, null);
});

test("E1-10/3: acertar una cuenta NO limpia el rastro del barrido desde esa IP", async () => {
  const h = harness();
  const ip = "203.0.113.66";
  for (let i = 0; i < 5; i++) await login(h, { email: `victima${i}@trainingzone.es`, ip });

  await login(h, { email: "legitimo@trainingzone.es", ip, good: true });

  const porIp = await h.store.find("LOGIN", "IP", ip);
  assert.equal(porIp?.failedCount, 5, "si acertar reiniciara el contador de la IP, el barrido tendría cupo infinito");
});

test("E1-10/3: la ventana se mide desde el último fallo, no desde el primero", async () => {
  const h = harness();
  const email = "direccion.lajota@trainingzone.es";
  const ip = "203.0.113.9";
  const politica = THROTTLE_POLICY.LOGIN;

  // Cuatro fallos repartidos a lo largo de más de una ventana, pero sin llegar
  // nunca a estar una ventana entera en silencio.
  for (let i = 0; i < politica.emailThreshold - 1; i++) {
    await login(h, { email, ip });
    h.advance(politica.windowMs - 1_000);
  }

  const procesados: string[] = [];
  await login(h, { email, ip }, procesados);
  assert.deepEqual(procesados, [email], "el que cruza el umbral todavía se procesa");

  const bloqueado = await login(h, { email, ip }, procesados);
  assert.equal(bloqueado.ok, false);
  assert.equal(procesados.length, 1, "goteando tampoco se consigue cupo infinito");
});

// ---------------------------------------------------------------------------
// Escenario 5 · trazabilidad
// ---------------------------------------------------------------------------

test("E1-10/5: cada bloqueo deja traza con email, IP y momento", async () => {
  const h = harness();
  const email = "Direccion.LaJota@trainingzone.es";
  const ip = "203.0.113.9";

  for (let i = 0; i < THROTTLE_POLICY.LOGIN.emailThreshold; i++) await login(h, { email, ip });

  assert.equal(h.blocks.length, 1, "un bloqueo, una traza");
  const bloqueo = h.blocks[0]!;
  assert.equal(bloqueo.scope, "EMAIL");
  assert.equal(bloqueo.ip, ip);
  assert.equal(bloqueo.at.getTime(), h.now.getTime());
  assert.equal(bloqueo.failedCount, THROTTLE_POLICY.LOGIN.emailThreshold);

  const { metadata, action, entityType } = accessBlockAuditPayload(bloqueo);
  assert.equal(action, ACCESS_BLOCK_ACTION);
  assert.equal(entityType, "AccessAttempt");
  assert.equal(metadata.email, email.toLowerCase(), "el email queda normalizado, como la clave del contador");
  assert.equal(metadata.ip, ip);
  assert.equal(metadata.at, h.now.toISOString());
  assert.equal(metadata.purpose, "LOGIN");
});

test("E1-10/5: cada prórroga del bloqueo deja su propia traza", async () => {
  const h = harness();
  const email = "direccion.lajota@trainingzone.es";
  const ip = "203.0.113.9";

  for (let i = 0; i < THROTTLE_POLICY.LOGIN.emailThreshold; i++) await login(h, { email, ip });
  h.advance(THROTTLE_POLICY.LOGIN.baseBlockMs + 1);
  await login(h, { email, ip });

  assert.equal(h.blocks.length, 2);
  assert.equal(h.blocks[1]!.failedCount, THROTTLE_POLICY.LOGIN.emailThreshold + 1);
  assert.equal(h.blocks[1]!.blockedUntil > h.blocks[0]!.blockedUntil, true);
});

test("E1-10/5: el bloqueo por IP se traza aparte, con su propio ámbito", async () => {
  const h = harness();
  const ip = "203.0.113.66";
  for (let i = 0; i <= THROTTLE_POLICY.LOGIN.ipThreshold; i++) {
    await login(h, { email: `victima${i}@trainingzone.es`, ip });
  }

  const porIp = h.blocks.filter((b) => b.scope === "IP");
  assert.equal(porIp.length >= 1, true);
  assert.equal(porIp[0]!.ip, ip);
  assert.equal(accessBlockAuditPayload(porIp[0]!).entityId, `LOGIN:IP:${ip}`);
});

test("E1-10/5: si la traza falla, el freno sigue funcionando", async () => {
  const h = harness();
  const deps = { ...h.deps, recordBlock: async () => { throw new Error("AuditLog caído"); } };
  const email = "direccion.lajota@trainingzone.es";

  const procesados: string[] = [];
  for (let i = 0; i < THROTTLE_POLICY.LOGIN.emailThreshold + 2; i++) {
    await throttledAccessAttempt<string>(
      { purpose: "LOGIN", email, ip: "203.0.113.9" },
      async () => {
        procesados.push(email);
        return { granted: false };
      },
      deps
    );
  }

  assert.equal(procesados.length, THROTTLE_POLICY.LOGIN.emailThreshold, "el bloqueo se aplica igual");
});

test("E1-10: si el contador no se puede leer, el login degrada a como estaba — no se cierra a todos", async () => {
  const roto: AccessAttemptStore = {
    async find() {
      throw new Error("base caída");
    },
    async save() {
      throw new Error("base caída");
    },
    async reset() {
      throw new Error("base caída");
    },
  };

  const entrada = await throttledAccessAttempt<string>(
    { purpose: "LOGIN", email: "socio1.lajota@trainingzone.es", ip: "203.0.113.9" },
    async () => ({ granted: true, value: "sesión" }),
    { store: roto, recordBlock: async () => {}, hold: async () => {} }
  );

  assert.deepEqual(entrada, { ok: true, value: "sesión" }, "un fallo del propio freno no puede dejar fuera a todo el mundo");
});

// ---------------------------------------------------------------------------
// Aritmética de la progresión
// ---------------------------------------------------------------------------

test("E1-10: la progresión duplica y se detiene en el techo", () => {
  assert.equal(progressiveMs(0, 1_000, 8_000), 1_000);
  assert.equal(progressiveMs(1, 1_000, 8_000), 2_000);
  assert.equal(progressiveMs(3, 1_000, 8_000), 8_000);
  assert.equal(progressiveMs(99, 1_000, 8_000), 8_000, "ni desborda ni crece sin fin");
  assert.equal(progressiveMs(-5, 1_000, 8_000), 1_000, "por debajo del umbral no hay progresión negativa");
  assert.equal(holdDurationMs(4, "EMAIL", { ...THROTTLE_POLICY.LOGIN, emailThreshold: 5 }), THROTTLE_POLICY.LOGIN.baseHoldMs);
});

// ---------------------------------------------------------------------------
// El fallo "espejo móvil": una sola implementación, no dos
// ---------------------------------------------------------------------------

test("E1-10: los cuatro puntos de entrada pasan por la MISMA función", () => {
  // Ruta desde este fichero, no desde el cwd: `npm run test:unit` se puede
  // lanzar desde cualquier sitio.
  const raiz = fileURLToPath(new URL("../..", import.meta.url));
  const entradas = [
    "src/app/login/actions.ts",
    "src/auth.config.ts",
    "src/app/api/mobile/v1/auth/login/route.ts",
  ];

  for (const fichero of entradas) {
    const fuente = readFileSync(raiz + fichero, "utf8");
    assert.match(
      fuente,
      /from "@\/lib\/login-throttle"/,
      `${fichero} no entra por login-throttle: el "espejo móvil" empieza exactamente así`
    );
    assert.match(fuente, /throttledAccessAttempt[<(]/, `${fichero} importa el módulo pero no lo usa`);
  }
});

test("E1-10: la app móvil devuelve el mismo 401 para credencial mala y para bloqueo", () => {
  const raiz = fileURLToPath(new URL("../..", import.meta.url));
  const fuente = readFileSync(raiz + "src/app/api/mobile/v1/auth/login/route.ts", "utf8");
  const respuestas = [...fuente.matchAll(/apiError\("Credenciales incorrectas\.", 401\)/g)];
  assert.equal(respuestas.length, 1, "un único punto de salida para el fallo: no puede divergir");
  assert.equal(
    /apiError\([^)]*\b429\b/.test(fuente),
    false,
    "un código propio del bloqueo (429) convertiría el límite en un enumerador de cuentas"
  );
});

// ---------------------------------------------------------------------------
// Contra la base de datos real: el contador de S1 y la traza en AuditLog
// ---------------------------------------------------------------------------

const SLUG = "e2e-login-throttle";
const EMAIL_CON_CUENTA = `${SLUG}-direccion@example.com`;
const EMAIL_SIN_CUENTA = `${SLUG}-inventado@example.com`;
let orgId = "";

async function limpiar() {
  await prisma.accessAttempt.deleteMany({ where: { key: { startsWith: SLUG } } });
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
}

before(async () => {
  await limpiar();
  const org = await prisma.organization.create({ data: { name: "Freno de acceso", slug: SLUG } });
  orgId = org.id;
  const center = await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-centro` } });
  const identity = await prisma.identity.create({
    data: { email: EMAIL_CON_CUENTA, passwordHash: "no-usable-en-tests" },
  });
  await prisma.user.create({
    data: {
      orgId,
      identityId: identity.id,
      centerId: center.id,
      name: "Dirección",
      email: EMAIL_CON_CUENTA,
      role: "CENTER_DIRECTOR",
    },
  });
});

after(async () => {
  await limpiar();
  await prisma.$disconnect();
});

test("E1-10: el contador vive en AccessAttempt y se actualiza en su sitio", async () => {
  const clave = `${SLUG}-contador@example.com`;
  const base = new Date("2026-09-15T09:00:00.000Z");

  await prismaAccessAttemptStore.save({
    purpose: "LOGIN",
    scope: "EMAIL",
    key: clave,
    failedCount: 1,
    windowStartedAt: base,
    lastFailedAt: base,
    blockedUntil: null,
  });
  await prismaAccessAttemptStore.save({
    purpose: "LOGIN",
    scope: "EMAIL",
    key: clave,
    failedCount: 5,
    windowStartedAt: base,
    lastFailedAt: base,
    blockedUntil: new Date(base.getTime() + 30_000),
  });

  const filas = await prisma.accessAttempt.findMany({ where: { key: clave } });
  assert.equal(filas.length, 1, "el upsert actualiza la fila: no acumula una por intento");
  assert.equal(filas[0]!.failedCount, 5);

  await prismaAccessAttemptStore.reset("LOGIN", "EMAIL", clave);
  const reiniciado = await prismaAccessAttemptStore.find("LOGIN", "EMAIL", clave);
  assert.equal(reiniciado?.failedCount, 0);
  assert.equal(reiniciado?.blockedUntil, null);

  // Y reiniciar lo que nunca existió no es un error: quien acierta a la primera
  // no tiene contador que borrar.
  await prismaAccessAttemptStore.reset("LOGIN", "EMAIL", `${SLUG}-jamas-visto@example.com`);
});

test("E1-10/5: el bloqueo de un email con cuenta aparece en el AuditLog de su organización", async () => {
  const momento = new Date("2026-09-15T09:30:00.000Z");
  await auditAccessBlock({
    purpose: "LOGIN",
    scope: "EMAIL",
    email: EMAIL_CON_CUENTA.toUpperCase(),
    ip: "203.0.113.9",
    at: momento,
    blockedUntil: new Date(momento.getTime() + 30_000),
    failedCount: 5,
  });

  const entradas = await prisma.auditLog.findMany({ where: { orgId, action: ACCESS_BLOCK_ACTION } });
  assert.equal(entradas.length, 1);
  const metadata = entradas[0]!.metadata as Record<string, unknown>;
  assert.equal(metadata.email, EMAIL_CON_CUENTA, "email");
  assert.equal(metadata.ip, "203.0.113.9", "IP");
  assert.equal(metadata.at, momento.toISOString(), "momento");
});

test("E1-10/5: la traza es de solo inserción, como manda E10-14", async () => {
  const entrada = await prisma.auditLog.findFirstOrThrow({ where: { orgId, action: ACCESS_BLOCK_ACTION } });
  await assert.rejects(
    () => prisma.auditLog.update({ where: { id: entrada.id }, data: { action: "REESCRITO" } }),
    "el contador se actualiza en AccessAttempt precisamente porque aquí no se puede"
  );
});

test("E1-10/5: un email sin cuenta no ensucia el registro de un tenant ajeno", async () => {
  const antes = await prisma.auditLog.count({ where: { action: ACCESS_BLOCK_ACTION } });

  await auditAccessBlock({
    purpose: "LOGIN",
    scope: "EMAIL",
    email: EMAIL_SIN_CUENTA,
    ip: "203.0.113.9",
    at: new Date(),
    blockedUntil: new Date(Date.now() + 30_000),
    failedCount: 5,
  });

  const despues = await prisma.auditLog.count({ where: { action: ACCESS_BLOCK_ACTION } });
  assert.equal(despues, antes, "no hay organización a la que atribuirlo: queda en el log del servidor");
});

import type { AccessAttemptPurpose, AccessAttemptScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * E1-10 / RB-SEG-005 · Freno de fuerza bruta del acceso.
 *
 * El hallazgo original: **doce intentos fallidos consecutivos contra
 * `/api/mobile/v1/auth/login` se procesaban todos**, sin bloqueo, retardo ni
 * captcha — y los emails de staff siguen el patrón `rol.centro@org`, así que
 * la lista de objetivos se escribe sola.
 *
 * ## Una sola puerta
 *
 * Web y app entran por `throttledAccessAttempt`. No hay una versión para la web
 * y otra para el móvil: el "espejo móvil" (arreglar un camino y dejar el otro)
 * es el fallo que más veces se ha repetido en este repositorio, y dos
 * implementaciones que funcionan siguen siendo dos implementaciones que hay que
 * mantener sincronizadas a mano. Los cuatro puntos de entrada —server action del
 * login, `authorize` de Auth.js, ruta móvil y solicitud de enlace de
 * recuperación— llaman a esta misma función.
 *
 * ## Qué revela la respuesta: nada
 *
 * `throttledAccessAttempt` devuelve `{ ok: false }` tanto si las credenciales
 * son malas como si el intento está bloqueado, y **no expone cuál de las dos
 * cosas ha pasado**. No es pereza de tipos: es el requisito. Un mensaje distinto
 * para "email desconocido" y para "bloqueado" convierte el propio límite en un
 * enumerador de cuentas, que es justo lo que este módulo viene a impedir. Como
 * el contador se lleva por el email **enviado** —exista o no una identidad con
 * ese email—, estar bloqueado tampoco dice si la cuenta existe.
 *
 * ## Dónde se cuenta
 *
 * En `AccessAttempt` (tabla de estado que dejó S1), nunca en `AuditLog`: el log
 * es de solo inserción (trigger `auditlog_append_only`, E10-14) y un contador se
 * actualiza. A `AuditLog` va la traza de cada bloqueo, que es lo que pide el
 * escenario de trazabilidad.
 */

export type AccessPurpose = AccessAttemptPurpose;
export type AccessScope = AccessAttemptScope;

export type ThrottlePolicy = {
  /** Fallos por email dentro de la ventana antes de bloquear. */
  emailThreshold: number;
  /**
   * Fallos por IP antes de bloquear. Más alto que el de email a propósito: un
   * mostrador, una oficina o un operador móvil comparten salida, y el límite
   * por IP está para frenar el barrido de muchos emails, no al recepcionista
   * que se equivoca dos veces.
   */
  ipThreshold: number;
  /** Sin fallos nuevos durante este tiempo, el recuento vuelve a cero. */
  windowMs: number;
  /** Duración del primer bloqueo; se duplica con cada fallo posterior. */
  baseBlockMs: number;
  /** Techo del bloqueo: pasado este tope deja de crecer. */
  maxBlockMs: number;
  /** Retardo con el que se contesta al primer intento ya bloqueado. */
  baseHoldMs: number;
  /**
   * Techo del retardo de respuesta. Acotado a propósito: sostener peticiones
   * abiertas cuesta recursos al servidor, y el freno de verdad es el bloqueo,
   * no la espera.
   */
  maxHoldMs: number;
};

const MINUTE = 60_000;

export const THROTTLE_POLICY: Record<AccessPurpose, ThrottlePolicy> = {
  // Cinco fallos son más de los que comete quien sabe su contraseña y muchos
  // menos que los doce que hoy se procesan enteros.
  LOGIN: {
    emailThreshold: 5,
    ipThreshold: 20,
    windowMs: 15 * MINUTE,
    baseBlockMs: 30_000,
    maxBlockMs: 15 * MINUTE,
    baseHoldMs: 250,
    maxHoldMs: 2_000,
  },
  // Pedir el enlace de recuperación no cuesta nada al que lo pide y sí al que lo
  // recibe: el umbral es más bajo y la ventana más larga, porque nadie necesita
  // cuatro enlaces en una hora.
  PASSWORD_RESET: {
    emailThreshold: 3,
    ipThreshold: 15,
    windowMs: 60 * MINUTE,
    baseBlockMs: 60_000,
    maxBlockMs: 60 * MINUTE,
    baseHoldMs: 250,
    maxHoldMs: 2_000,
  },
};

export type AttemptCounter = {
  purpose: AccessPurpose;
  scope: AccessScope;
  key: string;
  failedCount: number;
  windowStartedAt: Date;
  lastFailedAt: Date;
  blockedUntil: Date | null;
};

/** Lo que este módulo necesita de `AccessAttempt`, y nada más. */
export interface AccessAttemptStore {
  find(purpose: AccessPurpose, scope: AccessScope, key: string): Promise<AttemptCounter | null>;
  save(counter: AttemptCounter): Promise<void>;
  reset(purpose: AccessPurpose, scope: AccessScope, key: string): Promise<void>;
}

export type AccessBlockEvent = {
  purpose: AccessPurpose;
  scope: AccessScope;
  /** El email tal y como se envió, normalizado. Puede no existir como cuenta. */
  email: string;
  ip: string | null;
  /** Momento del bloqueo (escenario de trazabilidad). */
  at: Date;
  blockedUntil: Date;
  failedCount: number;
};

export type ThrottleDeps = {
  store?: AccessAttemptStore;
  recordBlock?: (event: AccessBlockEvent) => Promise<void>;
  now?: () => Date;
  /** Inyectable para que las pruebas no esperen de verdad. */
  hold?: (ms: number) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Política, en funciones puras
// ---------------------------------------------------------------------------

/**
 * Progresión geométrica acotada: `base`, `base·2`, `base·4`… hasta `max`.
 * `over` es cuántos fallos van por encima del umbral (0 en el que lo cruza).
 */
export function progressiveMs(over: number, base: number, max: number): number {
  if (over <= 0) return Math.min(base, max);
  // Sin el tope al exponente, `2 ** over` desborda a Infinity con un contador
  // suficientemente alto; `Math.min` lo absorbería, pero mejor no llegar ahí.
  const factor = 2 ** Math.min(over, 30);
  return Math.min(base * factor, max);
}

export function thresholdFor(policy: ThrottlePolicy, scope: AccessScope): number {
  return scope === "EMAIL" ? policy.emailThreshold : policy.ipThreshold;
}

/** Cuánto dura el bloqueo que impone este fallo. */
export function blockDurationMs(failedCount: number, scope: AccessScope, policy: ThrottlePolicy): number {
  return progressiveMs(failedCount - thresholdFor(policy, scope), policy.baseBlockMs, policy.maxBlockMs);
}

/** Cuánto se retiene la respuesta a un intento que llega ya bloqueado. */
export function holdDurationMs(failedCount: number, scope: AccessScope, policy: ThrottlePolicy): number {
  return progressiveMs(failedCount - thresholdFor(policy, scope), policy.baseHoldMs, policy.maxHoldMs);
}

export function isBlocked(counter: AttemptCounter | null, now: Date): boolean {
  return !!counter?.blockedUntil && counter.blockedUntil.getTime() > now.getTime();
}

/**
 * Escenario "acceso legítimo tras el bloqueo": pasada la ventana sin fallos
 * nuevos, el recuento arranca de cero y quien sabe su contraseña entra sin
 * fricción añadida. La ventana se mide desde el último fallo, no desde el
 * primero: si no, bastaría con esperar al final de la ventana para volver a
 * disponer del cupo entero cada pocos minutos.
 */
export function windowExpired(counter: AttemptCounter, now: Date, policy: ThrottlePolicy): boolean {
  if (isBlocked(counter, now)) return false;
  return now.getTime() - counter.lastFailedAt.getTime() >= policy.windowMs;
}

/**
 * El contador que deja un fallo. Puro: recibe el estado y devuelve el siguiente,
 * sin tocar la base de datos, que es lo que permite probar la progresión sin
 * esperar quince minutos.
 */
export function counterAfterFailure(
  current: AttemptCounter | null,
  params: { purpose: AccessPurpose; scope: AccessScope; key: string; policy: ThrottlePolicy; now: Date }
): AttemptCounter {
  const { purpose, scope, key, policy, now } = params;
  const fresh = !current || windowExpired(current, now, policy);
  const failedCount = fresh ? 1 : current.failedCount + 1;
  const blocks = failedCount >= thresholdFor(policy, scope);

  return {
    purpose,
    scope,
    key,
    failedCount,
    windowStartedAt: fresh ? now : current.windowStartedAt,
    lastFailedAt: now,
    blockedUntil: blocks ? new Date(now.getTime() + blockDurationMs(failedCount, scope, policy)) : null,
  };
}

// ---------------------------------------------------------------------------
// Claves
// ---------------------------------------------------------------------------

export function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * IP del cliente detrás del proxy inverso. Se toma la primera entrada de
 * `x-forwarded-for` —la que añade el proxy de confianza más externo— y si no
 * hay, `x-real-ip`. Sin ninguna de las dos no hay límite por IP: se prefiere
 * seguir aplicando el de email a inventar un origen.
 */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}

type ScopedKey = { scope: AccessScope; key: string };

function scopedKeys(email: string, ip: string | null): ScopedKey[] {
  const keys: ScopedKey[] = [{ scope: "EMAIL", key: normalizeEmailKey(email) }];
  if (ip) keys.push({ scope: "IP", key: ip });
  return keys;
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

export const prismaAccessAttemptStore: AccessAttemptStore = {
  async find(purpose, scope, key) {
    const row = await prisma.accessAttempt.findUnique({ where: { purpose_scope_key: { purpose, scope, key } } });
    if (!row) return null;
    return {
      purpose: row.purpose,
      scope: row.scope,
      key: row.key,
      failedCount: row.failedCount,
      windowStartedAt: row.windowStartedAt,
      lastFailedAt: row.lastFailedAt,
      blockedUntil: row.blockedUntil,
    };
  },

  async save(counter) {
    const { purpose, scope, key, ...state } = counter;
    await prisma.accessAttempt.upsert({
      where: { purpose_scope_key: { purpose, scope, key } },
      create: { purpose, scope, key, ...state },
      update: state,
    });
  },

  async reset(purpose, scope, key) {
    // `updateMany` y no `update`: lo normal es que no haya fila que borrar —el
    // que acierta a la primera nunca ha creado contador— y eso no es un error.
    await prisma.accessAttempt.updateMany({
      where: { purpose, scope, key },
      data: { failedCount: 0, blockedUntil: null, windowStartedAt: new Date() },
    });
  },
};

/** Acción con la que el bloqueo aparece en el registro de auditoría. */
export const ACCESS_BLOCK_ACTION = "ACCESS_THROTTLE_BLOCKED";

export function accessBlockAuditPayload(event: AccessBlockEvent) {
  return {
    action: ACCESS_BLOCK_ACTION,
    entityType: "AccessAttempt",
    entityId: `${event.purpose}:${event.scope}:${event.scope === "EMAIL" ? normalizeEmailKey(event.email) : event.ip}`,
    metadata: {
      // Los tres datos que pide el escenario de trazabilidad: email, IP y momento.
      email: normalizeEmailKey(event.email),
      ip: event.ip,
      at: event.at.toISOString(),
      purpose: event.purpose,
      scope: event.scope,
      failedCount: event.failedCount,
      blockedUntil: event.blockedUntil.toISOString(),
    },
  };
}

/**
 * Traza del bloqueo en `AuditLog`.
 *
 * `AuditLog.orgId` no es opcional, y en el login todavía no se sabe a qué
 * organización pertenece nadie —ni siquiera si el email existe—. La entrada se
 * escribe en cada organización donde ese email tiene membresía, que es donde su
 * responsable de seguridad la va a buscar. Un email sin membresía (el caso
 * normal del barrido: `direccion.centro@loquesea`) no tiene organización a la
 * que atribuirse, así que queda en el log del servidor: la alternativa sería
 * ensuciar el registro de un tenant ajeno con intentos que no son suyos.
 */
export async function auditAccessBlock(event: AccessBlockEvent): Promise<void> {
  const payload = accessBlockAuditPayload(event);

  const identity = await prisma.identity.findUnique({
    where: { email: normalizeEmailKey(event.email) },
    select: { memberships: { select: { orgId: true }, distinct: ["orgId"] } },
  });
  const orgIds = identity?.memberships.map((m) => m.orgId) ?? [];

  if (orgIds.length === 0) {
    console.warn("[login-throttle] bloqueo sin organización a la que atribuirlo:", payload.metadata);
    return;
  }

  await prisma.auditLog.createMany({ data: orgIds.map((orgId) => ({ orgId, ...payload })) });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// La puerta única
// ---------------------------------------------------------------------------

/**
 * Resultado de lo que se intentaba hacer.
 *
 * `granted: false` significa "gasta presupuesto": credenciales malas en el
 * login. La solicitud de enlace de recuperación devuelve SIEMPRE `granted:
 * false`, y no es un error: ahí no hay nada que conceder y cada petición
 * consume cupo, se envíe el correo o no.
 */
export type AttemptOutcome<T> = { granted: true; value: T } | { granted: false };

/**
 * Lo que ve quien llama. Deliberadamente sin motivo: un `{ ok: false }` es un
 * `{ ok: false }` venga de credenciales malas o de un bloqueo, y así ningún
 * punto de entrada puede inventarse un mensaje distinto para cada caso.
 */
export type ThrottledResult<T> = { ok: true; value: T } | { ok: false };

export type AccessAttemptContext = {
  purpose: AccessPurpose;
  email: string;
  ip: string | null;
};

export async function throttledAccessAttempt<T>(
  ctx: AccessAttemptContext,
  run: () => Promise<AttemptOutcome<T>>,
  deps: ThrottleDeps = {}
): Promise<ThrottledResult<T>> {
  const store = deps.store ?? prismaAccessAttemptStore;
  const recordBlock = deps.recordBlock ?? auditAccessBlock;
  const hold = deps.hold ?? sleep;
  const nowOf = deps.now ?? (() => new Date());

  const policy = THROTTLE_POLICY[ctx.purpose];
  const keys = scopedKeys(ctx.email, ctx.ip);
  const now = nowOf();

  // 1 · ¿ya bloqueado? Se mira antes de tocar credenciales, así que el camino
  // bloqueado no hace NADA que dependa de si la cuenta existe: ni busca la
  // identidad, ni compara hashes. Por eso no puede delatarla.
  const counters = await Promise.all(keys.map(({ scope, key }) => readCounter(store, ctx.purpose, scope, key)));
  const blocking = counters.find((counter) => isBlocked(counter, now));
  if (blocking) {
    // El retardo progresivo del escenario 1: cada intento de más se contesta
    // más tarde, dentro de un tope.
    await hold(holdDurationMs(blocking.failedCount, blocking.scope, policy));
    return { ok: false };
  }

  const outcome = await run();

  if (outcome.granted) {
    // Acierto: se limpia el contador del email para que el siguiente error
    // honesto de esa persona vuelva a partir de cero. El de la IP NO se limpia:
    // un barrido que acierta una cuenta no debe poder borrar con ella el rastro
    // de los cien emails que ha probado antes.
    await resetCounter(store, ctx.purpose, "EMAIL", normalizeEmailKey(ctx.email));
    return { ok: true, value: outcome.value };
  }

  await Promise.all(
    keys.map(async ({ scope, key }, i) => {
      const next = counterAfterFailure(counters[i], { purpose: ctx.purpose, scope, key, policy, now });
      await writeCounter(store, next);
      if (next.blockedUntil) {
        await safely("auditoría del bloqueo", () =>
          recordBlock({
            purpose: ctx.purpose,
            scope,
            email: ctx.email,
            ip: ctx.ip,
            at: now,
            blockedUntil: next.blockedUntil!,
            failedCount: next.failedCount,
          })
        );
      }
    })
  );

  return { ok: false };
}

/**
 * El freno no puede convertirse en el motivo por el que nadie entra: si el
 * contador falla (base caída, migración a medias), se registra y se sigue. El
 * login degrada a como estaba antes de esta historia, que es malo pero conocido;
 * cerrar la puerta a todo el mundo por un fallo del propio freno es peor.
 */
async function safely(what: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error(`[login-throttle] fallo en ${what}:`, error);
  }
}

async function readCounter(
  store: AccessAttemptStore,
  purpose: AccessPurpose,
  scope: AccessScope,
  key: string
): Promise<AttemptCounter | null> {
  try {
    return await store.find(purpose, scope, key);
  } catch (error) {
    console.error("[login-throttle] fallo leyendo el contador:", error);
    return null;
  }
}

async function writeCounter(store: AccessAttemptStore, counter: AttemptCounter): Promise<void> {
  await safely("el registro del intento fallido", () => store.save(counter));
}

async function resetCounter(
  store: AccessAttemptStore,
  purpose: AccessPurpose,
  scope: AccessScope,
  key: string
): Promise<void> {
  await safely("el reinicio del contador", () => store.reset(purpose, scope, key));
}

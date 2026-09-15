import type { MemberState, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { orgHasFeature } from "@/lib/entitlements";
import { lastAttendanceByMember } from "@/lib/members-queries";
import { getMemberServiceKinds, type ServiceKind } from "@/lib/session-balance";
import { DEFAULT_TIMEZONE, zonedToday } from "@/lib/date-utils";
import {
  AUTOMATIC_TAG_DESCRIPTION,
  AUTOMATIC_TAG_KEYS,
  AUTOMATIC_TAG_LABEL,
  AUTOMATIC_TAG_TONE,
  MANUAL_SEED_TAGS,
  type AutomaticTagKey,
} from "@/lib/tags";

/**
 * E1 · El motor de etiquetas automáticas: nueve reglas, DIECIOCHO comportamientos.
 *
 * Cada regla PONE Y QUITA. Lo segundo es la mitad que se olvida siempre: «2
 * semanas sin venir» tiene que desaparecer sola cuando el socio vuelve, o el
 * flujo de ausencia le escribe a alguien que ya está entrenando otra vez. Por
 * eso el motor no «añade etiquetas»: RECONCILIA: calcula el conjunto que el
 * socio debería tener hoy y lo cuadra con el que tiene, en los dos sentidos.
 *
 * SIETE DE LAS NUEVE NO CALCULAN NADA AQUÍ. Reusan la señal que ya existe en
 * otro sitio, que es lo que evita tener dos criterios para lo mismo:
 *
 *   impago                 → `Member.state = DELINQUENT` (HU-ST-18)
 *   congelado              → `Member.state = FROZEN`
 *   excliente              → `Member.state = CANCELLED`
 *   bono por acabarse      → misma condición que `runLowPackBalanceRule`
 *                            (`Subscription.sessionsRemaining <= 2 && > 0`)
 *   cumple este mes        → `Member.birthDate`, en el calendario del centro
 *                            (mismo criterio de zona horaria que `birthday-jobs.ts`)
 *   primeros 30 días       → `Member.joinedAt`
 *   grupo / personal       → el plan contratado, vía `getMemberServiceKinds`
 *                            (`ServiceKind`, fuente única con `service-labels.ts`)
 *
 * LA ÚNICA CON CÁLCULO PROPIO es «2 semanas sin venir», y NO reutiliza
 * `computeRetentionSignal` a propósito. No es la misma pregunta:
 *
 *   · Retención (G.3) pregunta «¿ha bajado su ritmo respecto a SU línea base?».
 *     Necesita hábito previo —descarta a quien venía menos de 0,4 veces por
 *     semana— y compara doce semanas contra dos. Quien entrenaba una vez cada
 *     diez días y desaparece no genera señal ahí, y sin embargo lleva un mes
 *     sin pisar el centro.
 *   · Esta etiqueta pregunta «¿cuántos días hace que no viene?», sin línea base
 *     y sin cooldown: es un hecho, no una tendencia. Se pone a los 14 días y se
 *     cae sola el día que vuelve a asistir.
 *
 * Lo que sí se reutiliza es el DATO: `lastAttendanceByMember` (Booking ATTENDED
 * sobre `occurrenceDate`), que es exactamente la «última visita» que dirección
 * ya mira en el listado. Dos pantallas que digan fechas distintas de la última
 * visita del mismo socio es el fallo que esto evita.
 *
 * ÁMBITO DE CENTRO. `MemberTag` no lleva `centerId`: el centro de una etiqueta
 * es el del socio. El motor nunca lee ni escribe fuera de una lista EXPLÍCITA
 * de centros — la del ámbito de quien llama (`centerScopeFor`) o, cuando lo
 * llama el cron, la lista de centros de la organización, no un «todos» tácito.
 * Un socio que no esté en esa lista no se lee, no se etiqueta y no se desetiqueta.
 */

type Db = PrismaClient | typeof prisma;

/** A los 14 días sin asistir se pone la etiqueta; el día que vuelve, se cae. */
export const ABSENCE_DAYS = 14;
/** «Primeros 30 días» cuenta desde el alta, con el día 30 ya fuera. */
export const FIRST_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Lo que una regla necesita saber de un socio. Es un fotograma: sale de la base
 * de datos una vez y las nueve reglas deciden sobre él SIN volver a consultar,
 * que es lo que las hace probables sin base de datos.
 */
export type TagRuleFacts = {
  memberId: string;
  state: MemberState;
  joinedAt: Date;
  birthDate: Date | null;
  /**
   * Hoy, a medianoche, en el calendario del centro del socio. Se calcula fuera
   * (`zonedToday`) y viaja en el fotograma: un cron en UTC a las 00:00 cambiaría
   * de mes un día antes que el centro español en horario de verano.
   */
  todayInCenter: Date;
  /** Modalidades de sus suscripciones ACTIVE (`getMemberServiceKinds`). */
  serviceKinds: ServiceKind[];
  /** Algún bono activo con 1 o 2 sesiones restantes (`runLowPackBalanceRule`). */
  lowPackBalance: boolean;
  /** Última sesión ASISTIDA. `null` = no ha venido nunca. */
  lastAttendanceAt: Date | null;
};

export type TagRule = {
  key: AutomaticTagKey;
  applies: (facts: TagRuleFacts, now: Date) => boolean;
};

/**
 * De alta en la casa: cliente, prueba, suspendido por impago o congelado.
 * PROSPECT todavía no es socio y CANCELLED ya no lo es.
 */
const ON_THE_BOOKS: MemberState[] = ["ACTIVE", "TRIAL", "DELINQUENT", "FROZEN"];

function daysSince(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / DAY_MS);
}

export const AUTOMATIC_TAG_RULES: TagRule[] = [
  {
    // El plan contratado, no la sala en la que entrena: la fuente es la
    // suscripción ACTIVE, igual que en la ficha y en el filtro de `/members`.
    key: "grupo_reducido",
    applies: (f) => f.state !== "CANCELLED" && f.serviceKinds.includes("GROUP"),
  },
  {
    key: "entrenamiento_personal",
    applies: (f) => f.state !== "CANCELLED" && f.serviceKinds.includes("EP"),
  },
  {
    // Solo cliente o prueba: dar la bienvenida a quien entró hace tres semanas
    // y ya está en impago o de baja es peor que callarse.
    key: "primeros_30_dias",
    applies: (f, now) =>
      (f.state === "ACTIVE" || f.state === "TRIAL") && daysSince(f.joinedAt, now) < FIRST_DAYS,
  },
  {
    key: "bono_por_acabarse",
    applies: (f) => f.state === "ACTIVE" && f.lowPackBalance,
  },
  {
    // Quien nunca ha venido se cuenta desde el alta: si no, el socio que se dio
    // de alta hace dos meses y no ha aparecido nunca sería el único invisible,
    // justo el que más falta hace perseguir. Congelado e impago quedan fuera:
    // ya tienen su etiqueta y su flujo, y perseguir por ausencia a quien te
    // debe dinero —o a quien avisó de que se iba un mes— es ruido.
    key: "dos_semanas_sin_venir",
    applies: (f, now) =>
      (f.state === "ACTIVE" || f.state === "TRIAL") &&
      daysSince(f.lastAttendanceAt ?? f.joinedAt, now) >= ABSENCE_DAYS,
  },
  {
    // `delinquentSince` dice DESDE CUÁNDO, y por eso no entra en la condición:
    // un socio pasado a DELINQUENT antes de que existiera esa columna sigue
    // siendo un impago. El estado es la señal.
    key: "impago",
    applies: (f) => f.state === "DELINQUENT",
  },
  { key: "congelado", applies: (f) => f.state === "FROZEN" },
  { key: "excliente", applies: (f) => f.state === "CANCELLED" },
  {
    // El mes del centro, no el del servidor. A un excliente no se le felicita
    // (tampoco lo hace `birthday-jobs.ts`); a un congelado sí, que es de los
    // pocos motivos decentes para escribirle.
    key: "cumple_este_mes",
    applies: (f) =>
      f.birthDate !== null &&
      ON_THE_BOOKS.includes(f.state) &&
      f.birthDate.getUTCMonth() === f.todayInCenter.getMonth(),
  },
];

/** Las nueve decisiones sobre un socio y una fecha. Sin base de datos. */
export function evaluateAutomaticTags(facts: TagRuleFacts, now: Date): AutomaticTagKey[] {
  return AUTOMATIC_TAG_RULES.filter((rule) => rule.applies(facts, now)).map((rule) => rule.key);
}

/**
 * Lo que hay que mover para que lo que el socio TIENE sea lo que DEBERÍA tener.
 * La idempotencia del motor se demuestra aquí, sin base de datos: aplicado el
 * resultado, una segunda pasada con los mismos hechos devuelve dos listas
 * vacías.
 *
 * Las claves de `current` que no son de las nueve se ignoran: una automática que
 * ya no está en el catálogo del código no es nuestra y borrarla se llevaría por
 * delante el histórico de un flujo que la usó.
 */
export function diffAutomaticTags(
  current: Iterable<string>,
  desired: Iterable<AutomaticTagKey>
): { add: AutomaticTagKey[]; remove: AutomaticTagKey[] } {
  const has = new Set(current);
  const should = new Set<string>(desired);
  const add: AutomaticTagKey[] = [];
  const remove: AutomaticTagKey[] = [];

  for (const key of AUTOMATIC_TAG_KEYS) {
    if (should.has(key) && !has.has(key)) add.push(key);
    // Y ESTA ES LA OTRA MITAD: el socio volvió, pagó, descongeló o renovó el
    // bono, y la etiqueta se cae sola.
    if (!should.has(key) && has.has(key)) remove.push(key);
  }
  return { add, remove };
}

export type TagRuleReport = { added: number; removed: number; membersWithTag: number };

export type TagRunReport = {
  orgId: string;
  /** Centros sobre los que ha corrido la pasada. Nunca es un «todos» implícito. */
  centerIds: string[];
  membersEvaluated: number;
  added: number;
  removed: number;
  byRule: Record<AutomaticTagKey, TagRuleReport>;
};

function emptyByRule(): Record<AutomaticTagKey, TagRuleReport> {
  return Object.fromEntries(
    AUTOMATIC_TAG_KEYS.map((key) => [key, { added: 0, removed: 0, membersWithTag: 0 }])
  ) as Record<AutomaticTagKey, TagRuleReport>;
}

/**
 * Siembra (y mantiene al día) el catálogo de la organización.
 *
 * Es idempotente y vale como autorreparación: las nueve automáticas existen
 * siempre y con el rótulo y la definición que dice `tags.ts`, que es su fuente
 * única — de las automáticas manda el código, no la pantalla. Las dos manuales
 * de salida se crean si no están y NO se pisan después: el centro puede
 * renombrarlas y desactivarlas, y desactivar no borra la fila, así que la
 * siembra no las resucita.
 */
export async function ensureAutomaticTagDefinitions(orgId: string, db: Db = prisma): Promise<void> {
  for (const key of AUTOMATIC_TAG_KEYS) {
    const data = {
      label: AUTOMATIC_TAG_LABEL[key],
      description: AUTOMATIC_TAG_DESCRIPTION[key],
      color: AUTOMATIC_TAG_TONE[key],
      kind: "AUTOMATIC" as const,
      active: true,
    };
    await db.memberTagDefinition.upsert({
      where: { orgId_key: { orgId, key } },
      create: { orgId, key, ...data },
      update: data,
    });
  }

  for (const seed of MANUAL_SEED_TAGS) {
    const existing = await db.memberTagDefinition.findUnique({
      where: { orgId_key: { orgId, key: seed.key } },
      select: { id: true },
    });
    if (existing) continue;
    await db.memberTagDefinition.create({
      data: { orgId, key: seed.key, label: seed.label, color: seed.tone, kind: "MANUAL" },
    });
  }
}

/**
 * Una pasada del motor. Idempotente: dos seguidas no cambian nada ni duplican
 * nada —la unicidad `(memberId, tagDefinitionId)` lo sostiene desde la base de
 * datos— y cada puesta y cada retirada deja su `MemberTagEvent` con la regla
 * que la provocó, porque el panel de un flujo tiene que poder explicar por qué
 * entró un socio.
 *
 * `centerIds` es el ámbito: sin él, la lista de centros de la organización,
 * resuelta y explícita. Quien llame en nombre de una persona pasa
 * `centerScopeFor(user)` y el motor no toca un socio de otro centro.
 */
export async function runTagRules(
  orgId: string,
  now: Date = new Date(),
  opts: { centerIds?: string[]; db?: Db } = {}
): Promise<TagRunReport> {
  const db = opts.db ?? prisma;
  const empty: TagRunReport = {
    orgId,
    centerIds: opts.centerIds ?? [],
    membersEvaluated: 0,
    added: 0,
    removed: 0,
    byRule: emptyByRule(),
  };

  // Mismo criterio que `runRetentionAlertRule`: la inteligencia sobre el dato va
  // con el plan contratado. Sin esto, un cliente Esencial acumularía etiquetas
  // que su plan no le deja ver en ninguna pantalla.
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { platformPlan: true, platformStatus: true },
  });
  if (!org || !orgHasFeature(org, "marketing_automatizado")) return empty;

  const centerIds =
    opts.centerIds ??
    (await db.center.findMany({ where: { orgId }, select: { id: true } })).map((c) => c.id);
  if (centerIds.length === 0) return { ...empty, centerIds };

  await ensureAutomaticTagDefinitions(orgId, db);

  const definitions = await db.memberTagDefinition.findMany({
    where: { orgId, kind: "AUTOMATIC" },
    select: { id: true, key: true },
  });
  const idByKey = new Map(definitions.map((d) => [d.key, d.id]));
  const keyById = new Map(definitions.map((d) => [d.id, d.key]));

  // TODA lectura acotada: `primaryCenterId in centerIds`, no `orgId` a secas.
  const members = await db.member.findMany({
    where: { orgId, primaryCenterId: { in: centerIds } },
    select: {
      id: true,
      state: true,
      joinedAt: true,
      birthDate: true,
      primaryCenter: { select: { timezone: true } },
      subscriptions: {
        where: { status: "ACTIVE" },
        select: { status: true, sessionsRemaining: true, plan: { select: { type: true } } },
      },
    },
  });
  if (members.length === 0) return { ...empty, centerIds };

  const memberIds = members.map((m) => m.id);
  const [lastVisits, currentRows] = await Promise.all([
    lastAttendanceByMember(memberIds),
    db.memberTag.findMany({
      where: { orgId, memberId: { in: memberIds }, tagDefinition: { kind: "AUTOMATIC" } },
      select: { id: true, memberId: true, tagDefinitionId: true },
    }),
  ]);

  const currentByMember = new Map<string, Map<string, string>>();
  for (const row of currentRows) {
    const key = keyById.get(row.tagDefinitionId);
    // Una automática cuya clave ya no está en el catálogo del código no es
    // nuestra: no se toca. Quitarla aquí borraría el histórico de un flujo que
    // la usó sin que nadie lo haya pedido.
    if (!key) continue;
    const forMember = currentByMember.get(row.memberId) ?? new Map<string, string>();
    forMember.set(key, row.id);
    currentByMember.set(row.memberId, forMember);
  }

  const byRule = emptyByRule();
  const toAdd: { memberId: string; key: AutomaticTagKey }[] = [];
  const toRemove: { id: string; memberId: string; key: AutomaticTagKey }[] = [];

  for (const member of members) {
    const facts: TagRuleFacts = {
      memberId: member.id,
      state: member.state,
      joinedAt: member.joinedAt,
      birthDate: member.birthDate,
      todayInCenter: zonedToday(member.primaryCenter.timezone || DEFAULT_TIMEZONE),
      serviceKinds: getMemberServiceKinds(member.subscriptions),
      lowPackBalance: member.subscriptions.some(
        (s) => s.sessionsRemaining !== null && s.sessionsRemaining <= 2 && s.sessionsRemaining > 0
      ),
      lastAttendanceAt: lastVisits.get(member.id) ?? null,
    };

    const desired = evaluateAutomaticTags(facts, now);
    const current = currentByMember.get(member.id) ?? new Map<string, string>();
    const { add, remove } = diffAutomaticTags(current.keys(), desired);

    for (const key of desired) byRule[key].membersWithTag++;
    for (const key of add) toAdd.push({ memberId: member.id, key });
    for (const key of remove) toRemove.push({ id: current.get(key)!, memberId: member.id, key });
  }

  // Las escrituras van en una transacción por bloque: o entra la etiqueta con su
  // traza, o no entra ninguna de las dos. Una etiqueta sin `MemberTagEvent` es
  // exactamente lo que impide explicar por qué entró un socio en un flujo.
  if (toAdd.length > 0) {
    await db.$transaction([
      db.memberTag.createMany({
        data: toAdd.map((t) => ({
          orgId,
          memberId: t.memberId,
          tagDefinitionId: idByKey.get(t.key)!,
          ruleKey: t.key,
          assignedAt: now,
        })),
        // La unicidad la sostiene la base de datos; esto solo evita que dos
        // pasadas solapadas del cron se peleen por la misma fila.
        skipDuplicates: true,
      }),
      db.memberTagEvent.createMany({
        data: toAdd.map((t) => ({
          orgId,
          memberId: t.memberId,
          tagDefinitionId: idByKey.get(t.key)!,
          action: "ADDED" as const,
          ruleKey: t.key,
          createdAt: now,
        })),
      }),
    ]);
  }

  if (toRemove.length > 0) {
    await db.$transaction([
      db.memberTag.deleteMany({ where: { id: { in: toRemove.map((t) => t.id) } } }),
      db.memberTagEvent.createMany({
        data: toRemove.map((t) => ({
          orgId,
          memberId: t.memberId,
          tagDefinitionId: idByKey.get(t.key)!,
          action: "REMOVED" as const,
          ruleKey: t.key,
          createdAt: now,
        })),
      }),
    ]);
  }

  for (const t of toAdd) byRule[t.key].added++;
  for (const t of toRemove) byRule[t.key].removed++;

  return {
    orgId,
    centerIds,
    membersEvaluated: members.length,
    added: toAdd.length,
    removed: toRemove.length,
    byRule,
  };
}

/**
 * Lo que consume el cron: el número de MOVIMIENTOS de la pasada (puestas más
 * retiradas). Cero es la respuesta correcta de una segunda pasada seguida, y es
 * la forma más barata que tiene el cron de enseñar que el motor es idempotente.
 */
export async function runMemberTagRule(orgId: string, now: Date = new Date()): Promise<number> {
  const report = await runTagRules(orgId, now);
  return report.added + report.removed;
}

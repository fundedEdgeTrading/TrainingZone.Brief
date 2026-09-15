import "dotenv/config";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { prisma } from "@/lib/prisma";
import { AUTO_TASK_CAP_ENTITY, AUTO_TASK_RULES, autoTaskRuleFor } from "@/lib/tasks";
import { CONSECUTIVE_NO_SHOW_THRESHOLD, consecutiveNoShowsWithoutNotice } from "@/lib/no-show";
import { getStallSignals, isStalled } from "@/lib/stall-detection";

/**
 * E14-14 · Limpieza de las tareas automáticas repetidas.
 *
 * `npx tsx scripts/limpiar-tareas.ts` — **simulacro**: dice qué borraría y qué
 * agruparía, y NO toca nada.
 * `npx tsx scripts/limpiar-tareas.ts --ejecutar` — borra de verdad, después de
 * volcar a un fichero exactamente lo que va a borrar.
 *
 * Es un script y no una migración a propósito: una migración se ejecuta sola en
 * cada despliegue, en todos los entornos, sin que nadie mire el informe. Esto
 * borra filas de una base con datos que a alguien le importan, así que lo lanza
 * una persona, lee lo que va a pasar y decide.
 *
 * ## Lo que NO toca, nunca
 *
 * - **Tareas que ha encargado una persona** (`createdByUserId` no nulo). Por
 *   vieja o repetida que parezca, detrás hay alguien que pidió ese trabajo a
 *   otro alguien. No es basura del motor: es una conversación.
 * - **Tareas ya resueltas.** El histórico es el registro de lo que se hizo.
 * - **El aviso del tope semanal** (E14-12): lo escribe el motor pero habla de
 *   la bandeja de una persona, no de una situación que se pueda comprobar.
 *
 * ## Opciones
 *
 * - `--ejecutar`            borra de verdad (sin esto, simulacro)
 * - `--org <slug|id>`       acota a una organización
 * - `--volcado <ruta>`      dónde dejar el volcado (por defecto
 *                           `./exports/limpieza-tareas/<fecha>.json`)
 * - `--incluir-huerfanas`   borra también las que apuntan a un socio que ya no
 *                           está (fuera del conjunto por defecto: ver abajo)
 */

type Mode = { execute: boolean; orgFilter: string | null; dumpPath: string | null; includeOrphans: boolean };

function parseArgs(argv: string[]): Mode {
  const mode: Mode = { execute: false, orgFilter: null, dumpPath: null, includeOrphans: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--ejecutar") mode.execute = true;
    else if (arg === "--incluir-huerfanas") mode.includeOrphans = true;
    else if (arg === "--org") mode.orgFilter = argv[++i] ?? null;
    else if (arg === "--volcado") mode.dumpPath = argv[++i] ?? null;
    else if (arg.startsWith("--")) throw new Error(`Opción desconocida: ${arg}`);
  }
  return mode;
}

/**
 * Por qué se propone borrar una tarea. El orden importa: una tarea puede ser a
 * la vez duplicada y de una situación resuelta, y se clasifica por la primera
 * razón que la alcanza.
 */
type Reason = "duplicado" | "resuelta" | "huerfana" | "legado";

const REASON_LABEL: Record<Reason, string> = {
  duplicado: "duplicado exacto",
  resuelta: "la situación ya no se da",
  huerfana: "el socio ya no está",
  legado: "escrita con la clave vieja",
};

type Candidate = {
  id: string;
  orgId: string;
  rule: string;
  title: string;
  recipientUserId: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  reason: Reason;
};

type RuleReport = {
  rule: string;
  label: string;
  total: number;
  duplicado: number;
  resuelta: number;
  huerfana: number;
  legado: number;
  /** Lo que sobrevive al simulacro. */
  sobreviven: number;
};

/* ------------------------------------------------------------------------- *
 * Comprobadores por regla: ¿la situación que levantó la tarea sigue dándose?
 * ------------------------------------------------------------------------- */

/**
 * `null` = no hay forma de comprobarlo (regla de otra pista, sin un criterio
 * escrito aquí). Una tarea que no se puede comprobar **no se borra**: el script
 * prefiere dejar trabajo de más que tirar trabajo real.
 */
type StillOpenCheck = (memberOrEntityId: string) => Promise<boolean>;

function checksFor(orgId: string): Partial<Record<string, StillOpenCheck>> {
  return {
    [AUTO_TASK_RULES.lowPackBalance.entityType]: async (memberId) => {
      const sub = await prisma.subscription.findFirst({
        where: {
          memberId,
          status: "ACTIVE",
          sessionsRemaining: { lte: 2, gt: 0 },
          member: { orgId, state: "ACTIVE" },
        },
        select: { id: true },
      });
      return sub !== null;
    },

    [AUTO_TASK_RULES.fewSessionsScheduled.entityType]: async (memberId) => {
      const now = new Date();
      const isEpClient = await prisma.member.findFirst({
        where: {
          id: memberId,
          orgId,
          state: "ACTIVE",
          subscriptions: { some: { status: "ACTIVE", plan: { type: "PERSONAL_TRAINING" } } },
        },
        select: { id: true },
      });
      if (!isEpClient) return false;

      const future = await prisma.booking.findMany({
        where: { memberId, status: "BOOKED", session: { orgId, status: "SCHEDULED", date: { gte: now } } },
        select: { session: { select: { date: true } } },
        orderBy: { session: { date: "asc" } },
      });
      const last = future[future.length - 1]?.session.date;
      const coversLessThanTwoWeeks = !last || last.getTime() - now.getTime() < 14 * 24 * 60 * 60 * 1000;
      return future.length <= 4 || coversLessThanTwoWeeks;
    },

    [AUTO_TASK_RULES.noShowStreak.entityType]: async (memberId) => {
      const history = await prisma.booking.findMany({
        where: { memberId, status: { in: ["ATTENDED", "NO_SHOW"] } },
        select: { status: true, noShowReason: true },
        orderBy: [{ occurrenceDate: "desc" }, { bookedAt: "desc" }],
        take: 10,
      });
      return consecutiveNoShowsWithoutNotice(history) >= CONSECUTIVE_NO_SHOW_THRESHOLD;
    },

    [AUTO_TASK_RULES.stallRisk.entityType]: async (memberId) => {
      const member = await prisma.member.findFirst({ where: { id: memberId, orgId, state: "ACTIVE" }, select: { id: true } });
      if (!member) return false;
      return isStalled(await getStallSignals(memberId));
    },
  };
}

/* ------------------------------------------------------------------------- *
 * Las filas escritas con la clave vieja
 * ------------------------------------------------------------------------- */

/**
 * Antes de E14-11, estas tres reglas escribían todas `entityType = "Member"`.
 * Esas filas hay que reconocerlas por el texto, que es lo único que las
 * distingue, y **retirarlas**: si se dejan, el motor —que ahora escribe con la
 * entidad propia de cada regla— levanta su tarea correcta al lado, y en el
 * tablero se ven dos tarjetas de la misma situación.
 *
 * Retirarlas no pierde trabajo: las reglas son detectores sobre el estado de
 * hoy, así que la situación que siga dándose vuelve a escribirse en la
 * siguiente pasada, una sola vez y con dueño.
 *
 * No todo lo que lleva `entityType = "Member"` es de estas reglas —«mensaje
 * nuevo de un socio» (chat) y los avisos de impago también lo usan—, y por eso
 * el reconocimiento es por texto Y por tipo, y nunca por la entidad a secas.
 */
const LEGACY_PATTERNS: { pattern: RegExp; kind: "TASK" | "ALERT"; rule: keyof typeof AUTO_TASK_RULES }[] = [
  { pattern: /: pocas sesiones programadas$/, kind: "TASK", rule: "fewSessionsScheduled" },
  { pattern: /: le quedan \d+ sesiones del bono$/, kind: "TASK", rule: "lowPackBalance" },
  { pattern: /: riesgo de estancamiento$/, kind: "ALERT", rule: "stallRisk" },
];

type Identified = { rule: string; label: string; entityType: string; legacy: boolean; perRecipient: boolean };

/**
 * A qué regla pertenece una fila: por su entidad si ya usa la nueva, o por su
 * texto si es de las escritas con la clave vieja.
 */
function identify(task: { entityType: string | null; title: string; kind: string }): Identified {
  const key = autoTaskRuleFor(task.entityType);
  if (key) {
    return {
      rule: key,
      label: AUTO_TASK_RULES[key].label,
      entityType: AUTO_TASK_RULES[key].entityType,
      legacy: false,
      // Una regla de audiencia «persona» reparte a propósito una copia por
      // destinatario: ahí dos filas del mismo socio NO son un duplicado.
      perRecipient: AUTO_TASK_RULES[key].audience === "persona",
    };
  }

  if (task.entityType === "Member") {
    const legacy = LEGACY_PATTERNS.find((p) => p.kind === task.kind && p.pattern.test(task.title));
    if (legacy) {
      return {
        rule: legacy.rule,
        // El rótulo es el de la regla: que la fila lleve la clave vieja se
        // cuenta en su propia columna del informe, no en el nombre.
        label: AUTO_TASK_RULES[legacy.rule].label,
        entityType: AUTO_TASK_RULES[legacy.rule].entityType,
        legacy: true,
        perRecipient: AUTO_TASK_RULES[legacy.rule].audience === "persona",
      };
    }
  }

  const name = task.entityType ? `(sin catalogar) ${task.entityType}` : "(sin entidad)";
  // Sin catalogar no se sabe cómo reparte: se supone que cada destinatario
  // tiene la suya, que es la suposición que no borra trabajo de nadie.
  return { rule: name, label: name, entityType: task.entityType ?? "", legacy: false, perRecipient: true };
}

async function analyseOrg(orgId: string, orgName: string, mode: Mode) {
  // El universo: tareas AUTOMÁTICAS y ABIERTAS. Lo demás no entra ni a mirarse.
  const tasks = await prisma.notification.findMany({
    where: { orgId, createdByUserId: null, resolvedAt: null, entityType: { not: AUTO_TASK_CAP_ENTITY } },
    select: {
      id: true,
      title: true,
      body: true,
      kind: true,
      recipientUserId: true,
      entityType: true,
      entityId: true,
      priority: true,
      startedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const identified = new Map(tasks.map((task) => [task.id, identify(task)]));
  const candidates: Candidate[] = [];
  const marked = new Set<string>();

  const mark = (task: (typeof tasks)[number], reason: Reason) => {
    if (marked.has(task.id)) return;
    marked.add(task.id);
    candidates.push({
      id: task.id,
      orgId,
      rule: identified.get(task.id)!.rule,
      title: task.title,
      recipientUserId: task.recipientUserId,
      entityType: task.entityType,
      entityId: task.entityId,
      createdAt: task.createdAt,
      reason,
    });
  };

  /* ---- 1. El socio ya no está --------------------------------------------- *
   * Se mira antes que nada: una tarea sobre alguien que ya no existe no es
   * trabajo, ni aunque sea la única de su situación.                           */
  const aboutMember = (task: (typeof tasks)[number]) => {
    const id = identified.get(task.id)!;
    return Boolean(task.entityId) && id.entityType.startsWith("Member");
  };
  const memberIds = [...new Set(tasks.filter(aboutMember).map((t) => t.entityId as string))];
  const alive = new Set(
    (await prisma.member.findMany({ where: { id: { in: memberIds }, orgId }, select: { id: true } })).map((m) => m.id)
  );
  for (const task of tasks) {
    if (!aboutMember(task)) continue;
    if (!alive.has(task.entityId as string)) mark(task, "huerfana");
  }

  /* ---- 2. La situación ya no se da ---------------------------------------- *
   * Se vuelve a evaluar la condición de la regla contra los datos de hoy. Una
   * situación por (regla, entidad), aunque tenga siete copias abiertas.
   *
   * Sin comprobador —reglas de otras pistas— no se toca: el script prefiere
   * dejar trabajo de más que tirar trabajo real.                               */
  const checks = checksFor(orgId);
  const stillOpen = new Map<string, boolean>();
  const situationKey = (task: (typeof tasks)[number]) => `${identified.get(task.id)!.rule}|${task.entityId}`;
  /**
   * Clave de «es la misma tarea». Para una regla de centro basta (regla,
   * entidad): sobran todas menos una. Para una regla que reparte a propósito
   * una copia por persona, entra además el destinatario — si no, la limpieza le
   * quitaría el aviso a quien tiene derecho a recibirlo.
   */
  const duplicateKey = (task: (typeof tasks)[number]) =>
    identified.get(task.id)!.perRecipient ? `${situationKey(task)}|${task.recipientUserId}` : situationKey(task);

  for (const task of tasks) {
    if (marked.has(task.id) || !task.entityId) continue;
    const check = checks[identified.get(task.id)!.entityType];
    if (!check) continue;
    const key = situationKey(task);
    if (!stillOpen.has(key)) stillOpen.set(key, await check(task.entityId));
  }
  for (const task of tasks) {
    if (marked.has(task.id) || !task.entityId) continue;
    if (stillOpen.get(situationKey(task)) === false) mark(task, "resuelta");
  }

  /* ---- 3. Duplicado exacto ------------------------------------------------ *
   * Misma regla y misma entidad: sobra todo menos una. Es el abanico por
   * destinatario —una copia por cada persona de dirección— y las copias que
   * dejaron las pasadas del cron antes de E14-11.
   *
   * La clave de agrupación es la REGLA, no el `entityType` de la fila: con la
   * clave vieja las dos reglas comerciales escribían las dos `"Member"`, y
   * agrupar por ahí juntaría «pocas sesiones» con «bono acabándose» del mismo
   * socio y tiraría una de las dos, que son justo las que hay que conservar.
   *
   * ¿Cuál se queda? La que alguien ya ha empezado (`startedAt`), y si ninguna,
   * la más antigua: es la que lleva más tiempo a la vista y la que puede tener
   * la fecha límite que alguien le puso.                                       */
  const byKey = new Map<string, typeof tasks>();
  for (const task of tasks) {
    if (marked.has(task.id) || !task.entityId) continue;
    const key = duplicateKey(task);
    const list = byKey.get(key);
    if (list) list.push(task);
    else byKey.set(key, [task]);
  }

  let grouped = 0;
  const survivors: typeof tasks = [];
  for (const [, list] of byKey) {
    const keep = list.find((t) => t.startedAt) ?? list[0];
    survivors.push(keep);
    if (list.length < 2) continue;
    grouped++;
    for (const task of list) if (task.id !== keep.id) mark(task, "duplicado");
  }

  /* ---- 4. Escrita con la clave vieja -------------------------------------- *
   * Lo que llega hasta aquí es trabajo real y sin duplicar, pero todavía con la
   * clave vieja. Se retira igualmente: el motor ya escribe con la entidad
   * propia de cada regla y, si no, el tablero enseñaría dos tarjetas de lo
   * mismo. No se pierde nada — la situación sigue en los datos, así que la
   * próxima pasada del cron la vuelve a escribir, una sola vez y con dueño.     */
  let reborn = 0;
  for (const task of survivors) {
    if (marked.has(task.id)) continue;
    if (!identified.get(task.id)!.legacy) continue;
    mark(task, "legado");
    reborn++;
  }

  /* ---- Informe por regla --------------------------------------------------- */
  const rules = new Map<string, RuleReport>();
  for (const task of tasks) {
    const id = identified.get(task.id)!;
    if (!rules.has(id.rule)) {
      rules.set(id.rule, {
        rule: id.rule,
        label: id.label,
        total: 0,
        duplicado: 0,
        resuelta: 0,
        huerfana: 0,
        legado: 0,
        sobreviven: 0,
      });
    }
    rules.get(id.rule)!.total++;
  }
  for (const candidate of candidates) rules.get(candidate.rule)![candidate.reason]++;

  // Las huérfanas solo se borran si se pide: si un socio desapareció de la base,
  // lo primero que hay que mirar es por qué, no tapar el rastro.
  const toDelete = candidates.filter((c) => mode.includeOrphans || c.reason !== "huerfana");
  for (const report of rules.values()) {
    report.sobreviven =
      report.total - report.duplicado - report.resuelta - report.legado - (mode.includeOrphans ? report.huerfana : 0);
  }

  return {
    orgId,
    orgName,
    total: tasks.length,
    grouped,
    reborn,
    rules: [...rules.values()].sort((a, b) => b.total - a.total),
    candidates,
    toDelete,
  };
}

function printOrgReport(report: Awaited<ReturnType<typeof analyseOrg>>, mode: Mode) {
  console.info("");
  console.info(`━━ ${report.orgName} · ${report.total} tareas automáticas abiertas`);
  if (report.total === 0) {
    console.info("   Nada que limpiar.");
    return;
  }

  console.table(
    report.rules.map((r) => ({
      regla: r.label,
      hay: r.total,
      "duplicado exacto": r.duplicado,
      "ya resuelta": r.resuelta,
      "socio que no está": r.huerfana,
      "clave vieja": r.legado,
      sobreviven: r.sobreviven,
    }))
  );

  console.info(
    `   Agruparía ${report.grouped} situación(es) con más de una tarea abierta.` +
      ` Borraría ${report.toDelete.length} y sobrevivirían ${report.total - report.toDelete.length}.`
  );
  if (report.reborn > 0) {
    console.info(
      `   De lo retirado, ${report.reborn} situación(es) siguen dándose: el motor las vuelve a escribir` +
        " en la próxima pasada del cron, una sola vez y con dueño."
    );
  }
  if (!mode.includeOrphans) {
    const orphans = report.candidates.filter((c) => c.reason === "huerfana").length;
    if (orphans > 0) {
      console.info(`   ${orphans} apuntan a un socio que ya no está y NO se borran sin --incluir-huerfanas.`);
    }
  }
}

async function main() {
  const mode = parseArgs(process.argv.slice(2));

  const orgs = await prisma.organization.findMany({
    where: mode.orgFilter ? { OR: [{ id: mode.orgFilter }, { slug: mode.orgFilter }] } : undefined,
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  if (orgs.length === 0) {
    console.error("[E14-14] No hay ninguna organización que encaje con --org.");
    process.exitCode = 1;
    return;
  }

  console.info(
    mode.execute
      ? "[E14-14] MODO REAL: se van a borrar tareas automáticas. Antes se vuelca a fichero lo que se borra."
      : "[E14-14] SIMULACRO: no se toca nada. Añade --ejecutar para borrar de verdad."
  );

  const reports = [];
  for (const org of orgs) reports.push(await analyseOrg(org.id, org.name, mode));
  for (const report of reports) printOrgReport(report, mode);

  const toDelete = reports.flatMap((r) => r.toDelete);
  const total = reports.reduce((sum, r) => sum + r.total, 0);

  console.info("");
  console.info(`━━ TOTAL · ${total} tareas automáticas abiertas`);
  for (const reason of ["duplicado", "resuelta", "huerfana", "legado"] as Reason[]) {
    const n = reports.flatMap((r) => r.candidates).filter((c) => c.reason === reason).length;
    console.info(`   ${REASON_LABEL[reason]}: ${n}`);
  }
  const reborn = reports.reduce((sum, r) => sum + r.reborn, 0);
  console.info(`   se borrarían: ${toDelete.length} · sobrevivirían: ${total - toDelete.length}`);
  if (reborn > 0) {
    console.info(`   y el motor reescribirá ${reborn} situación(es) que siguen dándose, una tarea cada una.`);
  }

  if (toDelete.length === 0) {
    console.info("[E14-14] No hay nada que borrar.");
    return;
  }

  if (!mode.execute) {
    console.info("");
    console.info("[E14-14] Simulacro terminado. No se ha tocado la base de datos.");
    return;
  }

  // Reversible: el volcado va ANTES del borrado y con todo lo necesario para
  // reponer las filas, no solo sus identificadores.
  const rows = await prisma.notification.findMany({ where: { id: { in: toDelete.map((c) => c.id) } } });
  const dumpPath =
    mode.dumpPath ??
    path.join(process.cwd(), "exports", "limpieza-tareas", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await mkdir(path.dirname(dumpPath), { recursive: true });
  await writeFile(
    dumpPath,
    JSON.stringify(
      { generadoEl: new Date().toISOString(), motivos: Object.fromEntries(toDelete.map((c) => [c.id, c.reason])), filas: rows },
      null,
      2
    ),
    "utf8"
  );
  console.info(`[E14-14] Volcado de ${rows.length} filas en ${dumpPath}`);

  const { count } = await prisma.notification.deleteMany({ where: { id: { in: toDelete.map((c) => c.id) } } });
  console.info(`[E14-14] Borradas ${count} tareas automáticas. El volcado de arriba las contiene todas.`);
}

main()
  .catch((error) => {
    console.error("[E14-14] La limpieza falló:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

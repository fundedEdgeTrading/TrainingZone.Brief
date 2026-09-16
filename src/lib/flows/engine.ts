import type { FlowBranch, FlowStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site";
import { orgHasFeature } from "@/lib/entitlements";
import { DEFAULT_TIMEZONE } from "@/lib/date-utils";
import { MEMBER_EMAIL_PREFERENCES_SELECT, type MemberEmailPreferences } from "@/lib/email-preferences";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";
import { sendMail } from "@/lib/mailer";
import { FLOW_TEMPLATE_CUSTOM, renderFlowEmail } from "@/lib/emails/flow-templates";
import { runFlowAction, sendFlowFormInvite, type FlowActionContext } from "@/lib/flows/actions";
import { resolveBranchSwitch, hasBranches } from "@/lib/flows/branching";
import { isEmailAction } from "@/lib/flows/catalog";
import { flowClickUrl } from "@/lib/flows/click-tokens";
import { matchesAllConditions, type FlowConditionShape, type FlowMemberFacts } from "@/lib/flows/conditions";
import {
  WEEKLY_EMAIL_CAP_DAYS,
  canEnrollAgain,
  decideFlowSend,
  nextStepRunAt,
  type FlowDeferReason,
  type FlowHoldReason,
  type FlowSkipReason,
} from "@/lib/flows/safety";
import { candidatesForTrigger } from "@/lib/flows/triggers";

/**
 * ========================= E2 · EL MOTOR DE FLUJOS =========================
 *
 * ES UNA COLA, NO UN «ENVIAR AHORA». `FlowEnrollment.nextRunAt` guarda CUÁNDO
 * LE TOCA el paso siguiente, y el cron consume lo vencido. Por eso el cron
 * puede pasar a las 23:00: lo que toque entonces se reprograma a las 8:00 del
 * centro, ni se manda ni se pierde.
 *
 * Y HAY UN ÚNICO PUNTO DE SALIDA: `sendFlowEmail`. Todo correo de flujo pasa
 * por ahí, y ahí es donde se consulta el registro y SE RESERVA EL HUECO en la
 * misma transacción. Si cada flujo decidiera por su cuenta, dos flujos que
 * disparan el mismo día mandarían dos correos y la promesa se rompe el primer
 * martes. Nada más en el repositorio manda correo de flujo.
 *
 * Las seis reglas viven en `safety.ts` y son lógica pura con el reloj
 * inyectado. Aquí solo se leen datos, se pregunta a `decideFlowSend` y se
 * escribe el resultado.
 */

/* ------------------------------------------------------------------------- *
 * El informe de una pasada
 * ------------------------------------------------------------------------- */

export type FlowBlockedCounters = Record<FlowDeferReason | FlowHoldReason | FlowSkipReason, number>;

export function emptyBlockedCounters(): FlowBlockedCounters {
  return {
    paused: 0,
    flow_paused: 0,
    quiet_hours: 0,
    weekly_cap: 0,
    no_marketing_consent: 0,
    no_member_email: 0,
    no_test_email: 0,
  };
}

export type FlowRunReport = {
  orgId: string;
  /** Inscripciones nuevas de esta pasada. */
  enrolled: number;
  /** Pasos ejecutados (con acción, mande correo o no). */
  stepsRun: number;
  /** Correos que salieron DE VERDAD al socio. */
  emailsSent: number;
  /** Correos que fueron al buzón de pruebas (flujos en borrador). */
  testEmailsSent: number;
  /** Cuántos frenó CADA regla de seguridad. Es la prueba de que el cerrojo funciona. */
  blocked: FlowBlockedCounters;
  /** Inscripciones que terminaron el flujo en esta pasada. */
  completed: number;
  /** El módulo está en pausa global: nada salió y nada se perdió. */
  paused: boolean;
  /** La organización no tiene contratada la automatización de marketing. */
  skippedNoFeature: boolean;
};

function emptyReport(orgId: string): FlowRunReport {
  return {
    orgId,
    enrolled: 0,
    stepsRun: 0,
    emailsSent: 0,
    testEmailsSent: 0,
    blocked: emptyBlockedCounters(),
    completed: 0,
    paused: false,
    skippedNoFeature: false,
  };
}

/* ------------------------------------------------------------------------- *
 * EL PUNTO ÚNICO DE SALIDA
 * ------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

export type FlowEmailPayload = {
  subject: string;
  bodyText: string;
  ctaLabel?: string;
  /** Ruta interna del botón. El motor la envuelve para poder medir el clic. */
  ctaPath?: string;
  templateKey?: string;
};

export type FlowSendContext = {
  orgId: string;
  centerId: string;
  flowId: string;
  flowName: string;
  flowStatus: FlowStatus;
  enrollmentId: string | null;
  stepId: string | null;
  memberId: string;
  memberFirstName: string;
  memberEmail: string | null;
  prefs: MemberEmailPreferences;
  centerName: string;
  centerAddress: string | null;
  centerTimezone: string;
  brandLogoUrl: string;
  flowsPausedAt: Date | null;
  flowsTestEmail: string | null;
  now: Date;
};

export type FlowSendOutcome =
  | { kind: "sent"; emailLogId: string; testMode: boolean }
  | { kind: "defer"; runAt: Date; reason: FlowDeferReason }
  | { kind: "hold"; reason: FlowHoldReason }
  | { kind: "skip"; reason: FlowSkipReason };

/**
 * EL ÚNICO SITIO DEL REPOSITORIO POR EL QUE SALE UN CORREO DE FLUJO.
 *
 * Las seis reglas se aplican aquí, en este orden y por esta razón:
 *
 *  1. Se pregunta a `decideFlowSend` (puro) con el último envío que llegó al
 *     socio. Si no toca, se devuelve el aplazamiento y NO se escribe nada.
 *  2. Si toca, se abre una transacción, SE BLOQUEA LA FILA DEL SOCIO
 *     (`SELECT … FOR UPDATE`) y se vuelve a comprobar el tope dentro. Ese
 *     bloqueo es lo que hace verdad la promesa con dos crones solapados o dos
 *     pasadas concurrentes: sin él, dos transacciones leerían «no hay envíos
 *     esta semana» a la vez y las dos insertarían. Es el mismo patrón con el
 *     que `agenda-queries.ts` protege el aforo de una sesión.
 *  3. La fila de `FlowEmailLog` se inserta DENTRO de la transacción: eso es lo
 *     que RESERVA el hueco. El correo se manda después, ya con el hueco
 *     reservado — si el envío falla, el socio se queda sin ESE correo esta
 *     semana, que es infinitamente mejor que recibir tres.
 *  4. `idempotencyKey` (`<enrollment>:<step>`) con índice único impide que un
 *     reintento del cron mande el mismo paso dos veces.
 */
export async function sendFlowEmail(ctx: FlowSendContext, payload: FlowEmailPayload): Promise<FlowSendOutcome> {
  const lastFlowEmailAt = await lastRealFlowEmailAt(ctx.orgId, ctx.memberId, ctx.now);

  const decision = decideFlowSend({
    now: ctx.now,
    timeZone: ctx.centerTimezone,
    flowsPausedAt: ctx.flowsPausedAt,
    flowStatus: ctx.flowStatus,
    testEmail: ctx.flowsTestEmail,
    memberEmail: ctx.memberEmail,
    prefs: ctx.prefs,
    lastFlowEmailAt,
  });

  if (decision.kind !== "send") return decision;

  const idempotencyKey =
    ctx.enrollmentId && ctx.stepId ? `${ctx.enrollmentId}:${ctx.stepId}` : null;

  // ---- La transacción que reserva el hueco -------------------------------
  let emailLogId: string;
  try {
    emailLogId = await prisma.$transaction(async (tx) => {
      // El cerrojo. Todo envío de flujo a ESTE socio se serializa aquí, así que
      // «dos flujos el mismo minuto» deja de ser una carrera.
      await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${ctx.memberId} FOR UPDATE`;

      if (decision.countsTowardCap) {
        const yaEstaSemana = await tx.flowEmailLog.count({
          where: {
            orgId: ctx.orgId,
            memberId: ctx.memberId,
            testMode: false,
            sentAt: { gt: new Date(ctx.now.getTime() - WEEKLY_EMAIL_CAP_DAYS * DAY_MS) },
          },
        });
        // Segunda comprobación DENTRO del cerrojo: la de fuera decide, esta
        // garantiza. Si otro flujo se coló entre una y otra, aquí se ve.
        if (yaEstaSemana > 0) throw new WeeklyCapRace();
      }

      const row = await tx.flowEmailLog.create({
        data: {
          orgId: ctx.orgId,
          centerId: ctx.centerId,
          memberId: ctx.memberId,
          flowId: ctx.flowId,
          enrollmentId: ctx.enrollmentId,
          stepId: ctx.stepId,
          sentAt: ctx.now,
          subject: payload.subject,
          templateKey: payload.templateKey ?? FLOW_TEMPLATE_CUSTOM,
          toEmail: decision.toEmail,
          testMode: decision.testMode,
          idempotencyKey,
        },
        select: { id: true },
      });
      return row.id;
    });
  } catch (error) {
    if (error instanceof WeeklyCapRace) {
      return {
        kind: "defer",
        runAt: nextStepRunAt(ctx.now, WEEKLY_EMAIL_CAP_DAYS, ctx.centerTimezone),
        reason: "weekly_cap",
      };
    }
    // Choque del índice único de idempotencia: este paso YA salió. No es un
    // fallo — es el reintento del cron haciendo exactamente lo que debe.
    if (isUniqueViolation(error)) return { kind: "skip", reason: "no_member_email" };
    throw error;
  }

  // ---- El correo, ya con el hueco reservado ------------------------------
  const footer = memberEmailFooterLinks(ctx.memberId);
  const ctaUrl =
    payload.ctaLabel && payload.ctaPath
      ? flowClickUrl({ emailLogId, url: absoluteUrl(payload.ctaPath) })
      : undefined;

  void sendMail({
    to: decision.toEmail,
    // RB-MARCA-001: el socio no compró Apta, compró su gimnasio.
    fromName: ctx.centerName,
    subject: decision.testMode ? `[Borrador] ${payload.subject}` : payload.subject,
    html: renderFlowEmail({
      memberFirstName: ctx.memberFirstName,
      centerName: ctx.centerName,
      brandLogoUrl: ctx.brandLogoUrl,
      subject: payload.subject,
      bodyText: payload.bodyText,
      eyebrow: ctx.flowName,
      ctaLabel: payload.ctaLabel,
      ctaUrl,
      postalAddress: ctx.centerAddress ?? undefined,
      prefsToken: footer.token,
      testMode: decision.testMode,
      testModeRecipient: decision.testMode ? ctx.memberEmail : null,
    }),
    // Las cabeceras `List-Unsubscribe` las pone `mailer.ts`. No se monta un
    // segundo sistema de bajas.
    unsubscribeUrl: footer.oneClickUnsubscribeUrl,
  });

  return { kind: "sent", emailLogId, testMode: decision.testMode };
}

class WeeklyCapRace extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/** Último correo de flujo que LLEGÓ al socio. Lo del buzón de pruebas no cuenta. */
async function lastRealFlowEmailAt(orgId: string, memberId: string, now: Date): Promise<Date | null> {
  const row = await prisma.flowEmailLog.findFirst({
    where: {
      orgId,
      memberId,
      testMode: false,
      sentAt: { gt: new Date(now.getTime() - WEEKLY_EMAIL_CAP_DAYS * DAY_MS) },
    },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  return row?.sentAt ?? null;
}

/** El clic de un correo de flujo. Idempotente: el primero es el que cuenta. */
export async function recordFlowEmailClick(emailLogId: string): Promise<void> {
  await prisma.flowEmailLog.updateMany({
    where: { id: emailLogId, clickedAt: null },
    data: { clickedAt: new Date() },
  });
}

/**
 * La respuesta de un socio, marcada A MANO.
 *
 * Y aquí está dicho lo que el editor también avisa: NO HAY SEÑAL AUTOMÁTICA DE
 * RESPUESTA en este repositorio. `mailer.ts` manda por la API de Brevo con un
 * `Reply-To` del centro, así que lo que el socio conteste llega al buzón del
 * gimnasio y no a la aplicación. Montar recepción de correo entrante es un
 * módulo propio y no es esta pista. Mientras tanto, la rama «si responde» solo
 * se activa si alguien marca la respuesta aquí.
 */
export async function markFlowEmailReplied(emailLogId: string, at: Date = new Date()): Promise<void> {
  await prisma.flowEmailLog.updateMany({ where: { id: emailLogId, repliedAt: null }, data: { repliedAt: at } });
}

/* ------------------------------------------------------------------------- *
 * LA ENTRADA AL FLUJO · regla 3 dentro
 * ------------------------------------------------------------------------- */

export type EnrollResult =
  | { ok: true; enrollmentId: string }
  | { ok: false; reason: "already_enrolled" | "reentry_window" | "conditions" | "no_steps" };

/**
 * Mete a un socio en un flujo. LA REGLA 3 ESTÁ AQUÍ DENTRO, que es lo que evita
 * que cada llamante tenga que acordarse de ella.
 *
 * Dos comprobaciones y no una:
 *  · Una inscripción VIVA en el mismo flujo: no se entra dos veces a la vez.
 *  · Los 90 días desde la ÚLTIMA entrada, viva o no: se contesta con el índice
 *    `(memberId, flowId, enrolledAt)`, no recorriendo la tabla.
 */
export async function enrollMember(params: {
  orgId: string;
  flowId: string;
  centerId: string;
  memberId: string;
  firstStepWaitDays: number;
  timeZone: string;
  now: Date;
}): Promise<EnrollResult> {
  const viva = await prisma.flowEnrollment.findFirst({
    where: { flowId: params.flowId, memberId: params.memberId, status: "SCHEDULED" },
    select: { id: true },
  });
  if (viva) return { ok: false, reason: "already_enrolled" };

  const ultima = await prisma.flowEnrollment.findFirst({
    where: { memberId: params.memberId, flowId: params.flowId },
    orderBy: { enrolledAt: "desc" },
    select: { enrolledAt: true },
  });
  if (!canEnrollAgain(ultima?.enrolledAt ?? null, params.now)) {
    return { ok: false, reason: "reentry_window" };
  }

  const enrollment = await prisma.flowEnrollment.create({
    data: {
      orgId: params.orgId,
      centerId: params.centerId,
      flowId: params.flowId,
      memberId: params.memberId,
      status: "SCHEDULED",
      currentBranch: "MAIN",
      currentStepPosition: -1,
      // CUÁNDO LE TOCA, nunca «mándalo ya»: la espera del primer paso, ya
      // sacada de la ventana de silencio.
      nextRunAt: nextStepRunAt(params.now, params.firstStepWaitDays, params.timeZone),
      enrolledAt: params.now,
    },
    select: { id: true },
  });
  return { ok: true, enrollmentId: enrollment.id };
}

/* ------------------------------------------------------------------------- *
 * LA PASADA DEL CRON
 * ------------------------------------------------------------------------- */

const FLOW_WITH_DEFINITION = {
  id: true,
  name: true,
  status: true,
  centerId: true,
  triggerType: true,
  triggerConfig: true,
  center: { select: { name: true, address: true, timezone: true } },
  conditions: { select: { id: true, type: true, config: true, negated: true, stepId: true } },
  steps: {
    select: {
      id: true,
      branch: true,
      position: true,
      waitDays: true,
      actionType: true,
      actionConfig: true,
      branchAfterDays: true,
    },
    orderBy: [{ branch: "asc" }, { position: "asc" }],
  },
} satisfies Prisma.FlowSelect;

type FlowWithDefinition = Prisma.FlowGetPayload<{ select: typeof FLOW_WITH_DEFINITION }>;

/**
 * UNA PASADA del motor sobre una organización. El reloj entra por parámetro.
 *
 * Dos mitades, en este orden:
 *   1. ENTRAR — cada flujo vivo pregunta a su disparador quién ha caído en la
 *      ventana y los inscribe (regla 3 dentro).
 *   2. AVANZAR — se consume la cola de `(status, nextRunAt)`: lo vencido y nada
 *      más. Cada paso pasa por su condición y, si escribe al socio, por el
 *      punto único de salida.
 */
export async function runFlowQueue(orgId: string, now: Date = new Date()): Promise<FlowRunReport> {
  const report = emptyReport(orgId);

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      name: true,
      logoUrl: true,
      flowsPausedAt: true,
      flowsTestEmail: true,
      platformPlan: true,
      platformStatus: true,
    },
  });
  if (!org) return report;

  // El gateo de plan también aquí y no solo en la pantalla: una organización
  // que se queda sin la funcionalidad deja de mandar, no sigue mandando porque
  // el cron no mira el plan.
  if (!orgHasFeature(org, "marketing_automatizado")) {
    report.skippedNoFeature = true;
    return report;
  }

  // REGLA 4 · pausa global. Se para ANTES de leer nada más: lo encolado se
  // queda con su `nextRunAt` intacto y se reanuda solo al despausar.
  if (org.flowsPausedAt) {
    report.paused = true;
    report.blocked.paused = await prisma.flowEnrollment.count({
      where: { orgId, status: "SCHEDULED", nextRunAt: { lte: now } },
    });
    return report;
  }

  const brandLogoUrl = absoluteUrl(org.logoUrl || "/brand/tz-logo-white.png");

  const flows = await prisma.flow.findMany({
    // Los pausados no entran: ni inscriben ni avanzan.
    where: { orgId, status: { in: ["ACTIVE", "DRAFT"] } },
    select: FLOW_WITH_DEFINITION,
  });
  const flowById = new Map(flows.map((f) => [f.id, f]));

  // ---- 1 · ENTRAR --------------------------------------------------------
  for (const flow of flows) {
    report.enrolled += await enrollCandidates(orgId, flow, now);
  }

  // ---- 2 · AVANZAR -------------------------------------------------------
  const due = await prisma.flowEnrollment.findMany({
    // El índice `(status, nextRunAt)` es justo este barrido: igualdad por
    // estado y rango por fecha, en ese orden.
    where: { orgId, status: "SCHEDULED", nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    // Tope por pasada: una cola atascada no puede convertir el cron en un job
    // de dos horas que nadie puede reintentar.
    take: 500,
    select: {
      id: true,
      flowId: true,
      centerId: true,
      memberId: true,
      currentBranch: true,
      currentStepPosition: true,
      enrolledAt: true,
    },
  });

  for (const enrollment of due) {
    const flow = flowById.get(enrollment.flowId);
    if (!flow) continue;
    await advanceEnrollment({
      enrollment,
      flow,
      org: { id: orgId, name: org.name, flowsPausedAt: org.flowsPausedAt, flowsTestEmail: org.flowsTestEmail },
      brandLogoUrl,
      now,
      report,
    });
  }

  return report;
}

/** Un `Json?` de Prisma leído como objeto llano, sin fiarse de lo que hay dentro. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/* ------------------------------------------------------------------------- *
 * El fotograma del socio, para las condiciones
 * ------------------------------------------------------------------------- */

/**
 * Lo que las condiciones necesitan saber de un socio, cargado DE UNA VEZ para
 * todos los candidatos. Mismo patrón que `tag-engine.ts`: si cada condición
 * consultara por su cuenta, una cola de quinientas inscripciones dispararía
 * miles de consultas por pasada.
 *
 * El ámbito de centro NO se delega: los candidatos ya vienen acotados al centro
 * del flujo desde `triggers.ts`, y aquí se vuelve a filtrar por `orgId`.
 */
async function loadMemberFacts(
  orgId: string,
  memberIds: string[],
  opts: { needTrainers: boolean }
): Promise<Map<string, FlowMemberFacts>> {
  const out = new Map<string, FlowMemberFacts>();
  if (memberIds.length === 0) return out;

  const [members, tags, trainerRows] = await Promise.all([
    prisma.member.findMany({
      where: { id: { in: memberIds }, orgId },
      select: {
        id: true,
        primaryCenterId: true,
        state: true,
        joinedAt: true,
        subscriptions: { where: { status: "ACTIVE" }, select: { plan: { select: { type: true } } } },
      },
    }),
    // Por CLAVE y solo las activas: es el contrato con E1 y lo que hace que
    // renombrar una etiqueta no deje la condición apuntando a nada.
    prisma.memberTag.findMany({
      where: { orgId, memberId: { in: memberIds }, tagDefinition: { active: true } },
      select: { memberId: true, tagDefinition: { select: { key: true } } },
    }),
    opts.needTrainers
      ? prisma.booking.findMany({
          where: { memberId: { in: memberIds }, session: { trainerId: { not: null } } },
          select: { memberId: true, session: { select: { trainerId: true } } },
        })
      : Promise.resolve([] as { memberId: string; session: { trainerId: string | null } }[]),
  ]);

  const tagsByMember = new Map<string, string[]>();
  for (const row of tags) {
    const list = tagsByMember.get(row.memberId) ?? [];
    list.push(row.tagDefinition.key);
    tagsByMember.set(row.memberId, list);
  }

  const trainersByMember = new Map<string, string[]>();
  for (const row of trainerRows) {
    if (!row.session.trainerId) continue;
    const list = trainersByMember.get(row.memberId) ?? [];
    if (!list.includes(row.session.trainerId)) list.push(row.session.trainerId);
    trainersByMember.set(row.memberId, list);
  }

  for (const member of members) {
    out.set(member.id, {
      memberId: member.id,
      centerId: member.primaryCenterId,
      state: member.state,
      joinedAt: member.joinedAt,
      planTypes: [...new Set(member.subscriptions.map((s) => s.plan.type))],
      tagKeys: tagsByMember.get(member.id) ?? [],
      trainerUserIds: trainersByMember.get(member.id) ?? [],
    });
  }
  return out;
}

function conditionShapes(
  conditions: FlowWithDefinition["conditions"],
  stepId: string | null
): FlowConditionShape[] {
  return conditions
    .filter((c) => (stepId === null ? c.stepId === null : c.stepId === stepId))
    .map((c) => ({ type: c.type, config: asRecord(c.config), negated: c.negated }));
}

function needsTrainers(conditions: FlowWithDefinition["conditions"]): boolean {
  return conditions.some((c) => c.type === "TRAINER");
}

/* ------------------------------------------------------------------------- *
 * 1 · ENTRAR
 * ------------------------------------------------------------------------- */

/** Los que entran en un flujo en esta pasada, con sus condiciones DE ENTRADA. */
async function enrollCandidates(orgId: string, flow: FlowWithDefinition, now: Date): Promise<number> {
  const firstStep = flow.steps.find((s) => s.branch === "MAIN" && s.position === 0);
  // Un flujo sin tronco no inscribe a nadie: no habría nada que ejecutar. El
  // validador ya lo impide al guardar; esto cubre cualquier otra vía de siembra.
  if (!firstStep) return 0;

  const timeZone = flow.center.timezone || DEFAULT_TIMEZONE;
  const candidates = await candidatesForTrigger({
    orgId,
    centerId: flow.centerId,
    triggerType: flow.triggerType,
    triggerConfig: asRecord(flow.triggerConfig),
    now,
    timeZone,
  });
  if (candidates.length === 0) return 0;

  const entryConditions = conditionShapes(flow.conditions, null);
  const facts = await loadMemberFacts(orgId, candidates, { needTrainers: needsTrainers(flow.conditions) });

  let enrolled = 0;
  for (const memberId of candidates) {
    const memberFacts = facts.get(memberId);
    if (!memberFacts) continue;
    if (!matchesAllConditions(entryConditions, memberFacts, now)) continue;

    const result = await enrollMember({
      orgId,
      flowId: flow.id,
      centerId: flow.centerId,
      memberId,
      firstStepWaitDays: firstStep.waitDays,
      timeZone,
      now,
    });
    if (result.ok) enrolled++;
  }
  return enrolled;
}

/* ------------------------------------------------------------------------- *
 * 2 · AVANZAR
 * ------------------------------------------------------------------------- */

type DueEnrollment = {
  id: string;
  flowId: string;
  centerId: string;
  memberId: string;
  currentBranch: FlowBranch;
  currentStepPosition: number;
  enrolledAt: Date;
};

type OrgFrame = { id: string; name: string; flowsPausedAt: Date | null; flowsTestEmail: string | null };

/** Un paso de una inscripción vencida. */
async function advanceEnrollment(args: {
  enrollment: DueEnrollment;
  flow: FlowWithDefinition;
  org: OrgFrame;
  brandLogoUrl: string;
  now: Date;
  report: FlowRunReport;
}): Promise<void> {
  const { enrollment, flow, org, now, report } = args;
  const timeZone = flow.center.timezone || DEFAULT_TIMEZONE;

  // ¿Hay que cambiar de rama antes de seguir? Se mira el último correo de esta
  // inscripción: un clic manda sobre una respuesta marcada a mano.
  const branch = await resolveCurrentBranch(enrollment, flow, now);

  const steps = flow.steps.filter((s) => s.branch === branch).sort((a, b) => a.position - b.position);
  const nextPosition = branch === enrollment.currentBranch ? enrollment.currentStepPosition + 1 : 0;
  const step = steps.find((s) => s.position === nextPosition);

  if (!step) {
    // Se acabó la rama: el flujo está recorrido.
    await prisma.flowEnrollment.update({
      where: { id: enrollment.id },
      data: { status: "COMPLETED", completedAt: now, nextRunAt: null, currentBranch: branch },
    });
    report.completed++;
    return;
  }

  const member = await prisma.member.findFirst({
    where: { id: enrollment.memberId, orgId: org.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      user: { select: { email: true } },
      ...MEMBER_EMAIL_PREFERENCES_SELECT,
    },
  });
  if (!member) {
    await cancelEnrollment(enrollment.id, now, "El socio ya no existe.");
    return;
  }

  // La condición DE ESTE PASO (la que cuelga del paso, no la de entrada): el
  // socio sigue en el flujo, pero este paso no se ejecuta si no se cumple.
  const stepConditions = conditionShapes(flow.conditions, step.id);
  if (stepConditions.length > 0) {
    const facts = await loadMemberFacts(org.id, [enrollment.memberId], {
      needTrainers: needsTrainers(flow.conditions),
    });
    const memberFacts = facts.get(enrollment.memberId);
    if (!memberFacts || !matchesAllConditions(stepConditions, memberFacts, now)) {
      // Se salta el paso y se sigue: no se cancela la inscripción, que la
      // condición puede ser de este paso y no del flujo entero.
      if (await moveToNextStep(enrollment.id, branch, step.position, steps, now, timeZone)) report.completed++;
      return;
    }
  }

  // --- La acción -----------------------------------------------------------
  if (isEmailAction(step.actionType)) {
    const sendCtx: FlowSendContext = {
      orgId: org.id,
      centerId: enrollment.centerId,
      flowId: flow.id,
      flowName: flow.name,
      flowStatus: flow.status,
      enrollmentId: enrollment.id,
      stepId: step.id,
      memberId: member.id,
      memberFirstName: member.firstName,
      memberEmail: member.user?.email ?? member.email ?? null,
      prefs: member,
      centerName: flow.center.name,
      centerAddress: flow.center.address,
      centerTimezone: timeZone,
      brandLogoUrl: args.brandLogoUrl,
      flowsPausedAt: org.flowsPausedAt,
      flowsTestEmail: org.flowsTestEmail,
      now,
    };

    const action = asRecord(step.actionConfig);
    const outcome = await sendFlowEmail(sendCtx, {
      subject: String(action.subject ?? flow.name),
      bodyText: String(action.bodyText ?? ""),
      ctaLabel: typeof action.ctaLabel === "string" && action.ctaLabel ? action.ctaLabel : undefined,
      ctaPath: typeof action.ctaPath === "string" && action.ctaPath ? action.ctaPath : "/portal",
      templateKey: typeof action.templateKey === "string" ? action.templateKey : undefined,
    });

    switch (outcome.kind) {
      case "defer":
        report.blocked[outcome.reason]++;
        // SIGUE EN LA COLA. Esto es lo que hace que el cron de las 23:00 no
        // pierda nada: se reprograma, no se descarta.
        await prisma.flowEnrollment.update({
          where: { id: enrollment.id },
          data: { nextRunAt: outcome.runAt, currentBranch: branch },
        });
        return;
      case "hold":
        report.blocked[outcome.reason]++;
        // Ni se mueve: `nextRunAt` se queda donde estaba.
        return;
      case "skip":
        report.blocked[outcome.reason]++;
        // El correo no va a poder salir nunca por este motivo (no consiente, no
        // tiene email): el paso se da por cerrado y el flujo sigue. Lo que no se
        // hace es reintentarlo cada noche.
        if (await moveToNextStep(enrollment.id, branch, step.position, steps, now, timeZone)) report.completed++;
        return;
      case "sent":
        report.stepsRun++;
        if (outcome.testMode) report.testEmailsSent++;
        else report.emailsSent++;

        // El formulario de M5 va DESPUÉS de la puerta, y solo cuando el correo
        // llegaba de verdad: en borrador el socio no puede recibir una
        // invitación real, que es justo lo que el borrador viene a evitar.
        if (step.actionType === "SEND_FORM" && !outcome.testMode) {
          await sendFlowFormInvite(actionContext(org, flow, enrollment, member, step.id, now), asRecord(step.actionConfig));
        }
        if (await moveToNextStep(enrollment.id, branch, step.position, steps, now, timeZone, flow)) report.completed++;
        return;
    }
  }

  // Acciones que no escriben al socio: no gastan cupo y no esperan a las 8:00
  // —poner una etiqueta a las 23:00 no molesta a nadie—, pero sí obedecen la
  // pausa global, que ya se ha comprobado antes de llegar aquí.
  const result = await runFlowAction(
    step.actionType,
    step.actionConfig,
    actionContext(org, flow, enrollment, member, step.id, now)
  );
  if (result.ok) report.stepsRun++;
  else console.error(`[flujos] ${flow.name} · paso ${step.position}: ${result.error}`);

  if (await moveToNextStep(enrollment.id, branch, step.position, steps, now, timeZone, flow)) report.completed++;
}

function actionContext(
  org: OrgFrame,
  flow: FlowWithDefinition,
  enrollment: DueEnrollment,
  member: { id: string; firstName: string; lastName: string },
  stepId: string,
  now: Date
): FlowActionContext {
  return {
    orgId: org.id,
    centerId: enrollment.centerId,
    memberId: member.id,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
    flowId: flow.id,
    flowName: flow.name,
    enrollmentId: enrollment.id,
    stepId,
    now,
  };
}

/**
 * ¿En qué rama está el socio AHORA? Se mira el último correo de la inscripción
 * y se aplica `resolveBranchSwitch` (puro). Si toca cambiar, la nueva rama
 * empieza por su paso 0.
 */
async function resolveCurrentBranch(
  enrollment: DueEnrollment,
  flow: FlowWithDefinition,
  now: Date
): Promise<FlowBranch> {
  const available = [...new Set(flow.steps.map((s) => s.branch))];
  if (!hasBranches(available)) return enrollment.currentBranch;
  // Una vez fuera del tronco no se vuelve a ramificar: una rama es un desvío,
  // no un bucle. Sin esto, un correo de la rama con clic devolvería al socio a
  // la misma rama una y otra vez.
  if (enrollment.currentBranch !== "MAIN") return enrollment.currentBranch;

  const lastEmail = await prisma.flowEmailLog.findFirst({
    where: { enrollmentId: enrollment.id },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true, clickedAt: true, repliedAt: true, step: { select: { branchAfterDays: true } } },
  });
  if (!lastEmail) return enrollment.currentBranch;

  // El X de «si no responde en X días» lo lleva el primer paso de esa rama.
  const noReplyStep = flow.steps.find((s) => s.branch === "ON_NO_REPLY" && s.position === 0);

  const switched = resolveBranchSwitch(
    {
      sentAt: lastEmail.sentAt,
      clickedAt: lastEmail.clickedAt,
      repliedAt: lastEmail.repliedAt,
      branchAfterDays: noReplyStep?.branchAfterDays ?? null,
    },
    available,
    now
  );
  if (!switched) return enrollment.currentBranch;

  await prisma.flowEnrollment.update({
    where: { id: enrollment.id },
    data: { currentBranch: switched, currentStepPosition: -1 },
  });
  return switched;
}

/**
 * Deja la inscripción apuntando al paso siguiente, con su ESPERA ya sacada de
 * la ventana de silencio. Sin paso siguiente, el flujo queda completo.
 *
 * Cuando el flujo TIENE ramas y acaba de salir un correo, el despertar se
 * adelanta al plazo de «si no responde»: si no, el socio que hace clic hoy se
 * quedaría esperando a la espera del paso siguiente del tronco para ramificar.
 */
async function moveToNextStep(
  enrollmentId: string,
  branch: FlowBranch,
  currentPosition: number,
  steps: FlowWithDefinition["steps"],
  now: Date,
  timeZone: string,
  flow?: FlowWithDefinition
): Promise<boolean> {
  const next = steps.find((s) => s.position === currentPosition + 1);
  const branches = flow ? [...new Set(flow.steps.map((s) => s.branch))] : [];
  const conRamas = branch === "MAIN" && hasBranches(branches);

  if (!next && !conRamas) {
    await prisma.flowEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "COMPLETED", completedAt: now, nextRunAt: null, currentBranch: branch, currentStepPosition: currentPosition },
    });
    return true;
  }

  const porPaso = next ? nextStepRunAt(now, next.waitDays, timeZone) : null;
  // Con ramas montadas se vuelve a mirar al día siguiente aunque el tronco se
  // haya agotado: es cuando puede haber un clic que ramificar.
  const porRama = conRamas ? nextStepRunAt(now, 1, timeZone) : null;
  const runAt =
    porPaso && porRama ? new Date(Math.min(porPaso.getTime(), porRama.getTime())) : (porPaso ?? porRama);

  await prisma.flowEnrollment.update({
    where: { id: enrollmentId },
    data: { currentBranch: branch, currentStepPosition: currentPosition, nextRunAt: runAt },
  });
  return false;
}

/** Salida antes de tiempo. No se reanuda: volver a entrar es una inscripción nueva. */
async function cancelEnrollment(enrollmentId: string, now: Date, reason: string): Promise<void> {
  await prisma.flowEnrollment.update({
    where: { id: enrollmentId },
    data: { status: "CANCELLED", cancelledAt: now, cancelledReason: reason, nextRunAt: null },
  });
}

/* ------------------------------------------------------------------------- *
 * La entrada del cron
 * ------------------------------------------------------------------------- */

/**
 * Lo que llama `/api/jobs/run`, con la misma forma que el resto de reglas
 * temporales: devuelve un número para el resumen. El informe completo —qué
 * frenó cada regla— sale por `runFlowQueue`, que es lo que usa la pantalla.
 */
export async function runFlowEngineRule(orgId: string, now: Date = new Date()): Promise<number> {
  const report = await runFlowQueue(orgId, now);
  return report.emailsSent + report.testEmailsSent + report.stepsRun;
}

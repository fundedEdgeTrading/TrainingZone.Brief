import "dotenv/config";

import type { FlowStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { DEFAULT_TIMEZONE } from "@/lib/date-utils";
import { MEMBER_EMAIL_PREFERENCES_SELECT, type MemberEmailPreferences } from "@/lib/email-preferences";
import { isEmailAction } from "@/lib/flows/catalog";
import { matchesAllConditions, type FlowConditionShape, type FlowMemberFacts } from "@/lib/flows/conditions";
import {
  FLOW_DECISION_LABEL,
  canEnrollAgain,
  decideFlowSend,
  nextStepRunAt,
  type FlowDeferReason,
  type FlowHoldReason,
  type FlowSkipReason,
} from "@/lib/flows/safety";
import { candidatesForTrigger } from "@/lib/flows/triggers";
import type { FlowDraft } from "@/lib/flows/validate";

/**
 * SIMULACRO DEL MOTOR DE FLUJOS SOBRE LOS ÚLTIMOS 30 DÍAS DE LA DEMO.
 *
 * Contesta la pregunta con la que se cierra el encargo de E2: ¿cuántos correos
 * habría mandado el motor si los seis flujos de salida hubieran estado
 * encendidos, y CUÁNTOS HABRÍA FRENADO CADA REGLA DE SEGURIDAD? Ese segundo
 * número es la prueba de que el cerrojo funciona: un tope que nunca frena nada
 * no se ha probado.
 *
 * ES DE SOLO LECTURA. No escribe ni una fila: la cola, el registro de envíos y
 * el reloj son estructuras en memoria de este proceso, y las decisiones las
 * toma la MISMA `decideFlowSend` que usa el motor de verdad. Si este simulacro
 * y producción se separaran, sería porque alguien duplicó la regla.
 *
 *   npx tsx scripts/simular-flujos.ts [días]
 *
 * LOS SEIS FLUJOS DE AQUÍ NO SON LAS SEMILLAS. Las de verdad las escribe E3 en
 * `src/lib/flows/seeds/`, con sus textos. Estas son la forma mínima de cada uno
 * —disparador, condición y pasos— para poder contar. Si E3 cambia una espera,
 * el número cambia; el cerrojo, no.
 *
 * DOS LIMITACIONES, dichas porque cambian la lectura del número:
 *  1. El disparador de ausencia usa la última asistencia de HOY y no la que
 *     había en cada día simulado, así que sobreestima ligeramente a quien
 *     volvió a entrenar dentro de la ventana.
 *  2. El simulacro corre DOS ESCENARIOS: la cadencia real del módulo (las
 *     cuatro pasadas de `.github/workflows/flujos-cron.yml`) y el caso malo
 *     —un cron que pasa a las 23:00—, que es el que enseña la ventana de
 *     silencio trabajando.
 */

const DAY_MS = 86_400_000;

type SimFlow = Pick<FlowDraft, "name" | "triggerType" | "triggerConfig" | "conditions" | "steps"> & {
  status: FlowStatus;
};

/** Los seis del encargo, en su forma mínima. Ver la nota de arriba. */
const FLOWS: SimFlow[] = [
  {
    name: "1 · Bienvenida",
    status: "ACTIVE",
    triggerType: "MEMBER_JOINED",
    triggerConfig: {},
    conditions: [],
    steps: [
      { branch: "MAIN", position: 0, waitDays: 0, actionType: "SEND_EMAIL", actionConfig: {} },
      { branch: "MAIN", position: 1, waitDays: 2, actionType: "CREATE_TASK", actionConfig: {} },
      { branch: "MAIN", position: 2, waitDays: 28, actionType: "SEND_EMAIL", actionConfig: {} },
    ],
  },
  {
    name: "2 · Rama por producto (grupo reducido)",
    status: "ACTIVE",
    triggerType: "MEMBER_JOINED",
    triggerConfig: {},
    conditions: [{ type: "TAG", config: { tagKey: "grupo_reducido" }, negated: false }],
    steps: [{ branch: "MAIN", position: 0, waitDays: 1, actionType: "SEND_EMAIL", actionConfig: {} }],
  },
  {
    name: "3 · Ausencia",
    status: "ACTIVE",
    triggerType: "SESSIONS_ABSENCE",
    triggerConfig: { days: 14 },
    conditions: [],
    steps: [
      { branch: "MAIN", position: 0, waitDays: 0, actionType: "SEND_EMAIL", actionConfig: {} },
      { branch: "MAIN", position: 1, waitDays: 0, actionType: "CREATE_TASK", actionConfig: {} },
      { branch: "MAIN", position: 2, waitDays: 7, actionType: "NOTIFY_DIRECTOR", actionConfig: {} },
    ],
  },
  {
    name: "4 · Bono acabándose",
    status: "ACTIVE",
    triggerType: "PACK_BALANCE_BELOW",
    triggerConfig: { threshold: 2 },
    conditions: [],
    steps: [
      { branch: "MAIN", position: 0, waitDays: 0, actionType: "SEND_EMAIL", actionConfig: {} },
      { branch: "MAIN", position: 1, waitDays: 0, actionType: "CREATE_TASK", actionConfig: {} },
    ],
  },
  {
    name: "5 · Impago",
    status: "ACTIVE",
    triggerType: "PAYMENT_FAILED",
    triggerConfig: {},
    conditions: [],
    steps: [
      { branch: "MAIN", position: 0, waitDays: 1, actionType: "SEND_EMAIL", actionConfig: {} },
      { branch: "MAIN", position: 1, waitDays: 2, actionType: "CREATE_TASK", actionConfig: {} },
      { branch: "MAIN", position: 2, waitDays: 4, actionType: "CHANGE_STATE", actionConfig: { state: "DELINQUENT" } },
    ],
  },
  {
    name: "6 · Reactivación",
    status: "ACTIVE",
    triggerType: "MEMBER_STATE_CHANGED",
    triggerConfig: { state: "CANCELLED" },
    conditions: [],
    steps: [{ branch: "MAIN", position: 0, waitDays: 30, actionType: "SEND_EMAIL", actionConfig: {} }],
  },
];

type Blocked = Record<FlowDeferReason | FlowHoldReason | FlowSkipReason, number>;

type Enrollment = {
  flow: SimFlow;
  memberId: string;
  centerId: string;
  timeZone: string;
  stepIndex: number;
  nextRunAt: number;
  done: boolean;
};

type Scenario = {
  label: string;
  /** Horas UTC a las que pasa el cron en este escenario. */
  passHours: number[];
  /**
   * ARRANQUE EN FRÍO: los seis flujos se encienden EL MISMO DÍA sobre la base
   * de socios tal y como está hoy. Es el escenario que de verdad preocupa a
   * negocio —y el único en el que dos flujos coinciden sobre el mismo socio—,
   * porque en el día a día cada disparador va cayendo por su cuenta.
   */
  coldStart?: boolean;
};

type SimResult = {
  sent: number;
  nonEmailSteps: number;
  blocked: Blocked;
  enteredByFlow: Map<string, number>;
  sentByFlow: Map<string, number>;
  cappedMembers: Set<string>;
  silencedMembers: Set<string>;
};

async function main() {
  const days = Number(process.argv[2] ?? 30);
  const now = new Date();
  const from = new Date(now.getTime() - days * DAY_MS);

  // La organización con más socios, no «la primera»: en una base con varias
  // (la demo trae también organizaciones de prueba vacías) `findFirst` devuelve
  // lo que el motor de la base tenga más a mano, y el simulacro cambiaría de
  // sujeto entre dos ejecuciones sin que nadie lo notara.
  const [conMas] = await prisma.member.groupBy({
    by: ["orgId"],
    _count: { _all: true },
    orderBy: { _count: { orgId: "desc" } },
    take: 1,
  });
  const org = await prisma.organization.findFirstOrThrow({
    where: conMas ? { id: conMas.orgId } : {},
    select: { id: true, name: true, flowsPausedAt: true, flowsTestEmail: true },
  });
  const centers = await prisma.center.findMany({
    where: { orgId: org.id },
    select: { id: true, name: true, timezone: true },
  });

  const socios = await prisma.member.count({ where: { orgId: org.id } });
  const sinConsentimiento = await prisma.member.count({
    where: { orgId: org.id, OR: [{ consentMarketing: false }, { emailOptOutAt: { not: null } }] },
  });

  console.log(`\nSIMULACRO · ${org.name} · últimos ${days} días`);
  console.log(
    `${socios} socios en la organización, ${sinConsentimiento} sin consentimiento de marketing o dados de baja.`
  );

  const escenarios: Scenario[] = [
    // La cadencia real: cuatro pasadas dentro de la ventana buena.
    { label: "Cadencia real · 4 pasadas entre las 8:00 y las 22:00", passHours: [7, 11, 15, 19] },
    // El caso malo del encargo: una sola pasada, y de noche.
    { label: "Caso malo · una sola pasada, a las 23:00 del centro", passHours: [21] },
    // El día del encendido: los seis a la vez sobre la base entera.
    {
      label: "Arranque en frío · los seis flujos encendidos el mismo día",
      passHours: [7, 11, 15, 19],
      coldStart: true,
    },
  ];

  for (const escenario of escenarios) {
    const result = await simulate(escenario, { orgId: org.id, testEmail: org.flowsTestEmail, centers, from, now, days });
    report(escenario, result);
  }
}

async function simulate(
  escenario: Scenario,
  ctx: {
    orgId: string;
    testEmail: string | null;
    centers: { id: string; name: string; timezone: string }[];
    from: Date;
    now: Date;
    days: number;
  }
): Promise<SimResult> {
  const { orgId, centers, from, now, days } = ctx;
  const org = { id: orgId, flowsTestEmail: ctx.testEmail };

  // --- El estado del simulacro, en memoria. Uno por escenario: el cerrojo
  // --- semanal no se puede heredar de una simulación anterior.
  const lastEmailByMember = new Map<string, number>();
  const lastEnrollmentByFlowMember = new Map<string, number>();
  const queue: Enrollment[] = [];
  const blocked: Blocked = {
    paused: 0,
    flow_paused: 0,
    quiet_hours: 0,
    weekly_cap: 0,
    no_marketing_consent: 0,
    no_member_email: 0,
    no_test_email: 0,
  };
  const sentByFlow = new Map<string, number>();
  const enteredByFlow = new Map<string, number>();
  let sent = 0;
  let nonEmailSteps = 0;
  // Un socio al que el tope frena una vez y luego otra sigue siendo UN socio
  // protegido, no dos: se cuentan las dos cosas.
  const cappedMembers = new Set<string>();
  const silencedMembers = new Set<string>();

  const memberCache = new Map<string, { prefs: MemberEmailPreferences; email: string | null } | null>();
  const factsCache = new Map<string, FlowMemberFacts | null>();

  async function memberOf(memberId: string) {
    if (!memberCache.has(memberId)) {
      const row = await prisma.member.findFirst({
        where: { id: memberId, orgId: org.id },
        select: { email: true, user: { select: { email: true } }, ...MEMBER_EMAIL_PREFERENCES_SELECT },
      });
      memberCache.set(
        memberId,
        row ? { prefs: row, email: row.user?.email ?? row.email ?? null } : null
      );
    }
    return memberCache.get(memberId) ?? null;
  }

  async function factsOf(memberId: string): Promise<FlowMemberFacts | null> {
    if (!factsCache.has(memberId)) {
      const member = await prisma.member.findFirst({
        where: { id: memberId, orgId: org.id },
        select: {
          id: true,
          primaryCenterId: true,
          state: true,
          joinedAt: true,
          subscriptions: { where: { status: "ACTIVE" }, select: { plan: { select: { type: true } } } },
          tags: { where: { tagDefinition: { active: true } }, select: { tagDefinition: { select: { key: true } } } },
        },
      });
      factsCache.set(
        memberId,
        member
          ? {
              memberId: member.id,
              centerId: member.primaryCenterId,
              state: member.state,
              joinedAt: member.joinedAt,
              planTypes: [...new Set(member.subscriptions.map((s) => s.plan.type))],
              tagKeys: member.tags.map((t) => t.tagDefinition.key),
              trainerUserIds: [],
            }
          : null
      );
    }
    return factsCache.get(memberId) ?? null;
  }

  // Las cuatro pasadas al día del cron de la cola, en UTC.
  const PASS_HOURS = escenario.passHours;

  for (let day = 0; day < days; day++) {
    const dayStart = new Date(from.getTime() + day * DAY_MS);

    for (const hour of PASS_HOURS) {
      const at = new Date(
        Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate(), hour, 0, 0)
      );
      if (at.getTime() > now.getTime()) continue;

      // ---- 1 · ENTRAR. Solo en la primera pasada del día: el disparador mira
      // una ventana de días, no de horas, y preguntarle cuatro veces al día no
      // trae a nadie nuevo. En el arranque en frío, además, SOLO el primer día:
      // lo que se está midiendo es qué pasa el día que se enciende todo.
      const enrollToday = hour === PASS_HOURS[0] && (!escenario.coldStart || day === 0);
      if (enrollToday) {
        for (const flow of FLOWS) {
          for (const center of centers) {
            const candidates = await candidatesForTrigger({
              orgId: org.id,
              centerId: center.id,
              triggerType: flow.triggerType,
              triggerConfig: (flow.triggerConfig ?? {}) as Record<string, unknown>,
              // En el arranque en frío se pregunta por el estado de HOY, que es
              // lo que se encontraría el motor el día que se enciende.
              now: escenario.coldStart ? now : at,
              timeZone: center.timezone || DEFAULT_TIMEZONE,
            });

            for (const memberId of candidates) {
              const facts = await factsOf(memberId);
              if (!facts) continue;
              const conditions = flow.conditions as FlowConditionShape[];
              if (!matchesAllConditions(conditions, facts, at)) continue;

              // Regla 3 · 90 días, y una sola inscripción viva por flujo.
              const key = `${flow.name}:${memberId}`;
              const last = lastEnrollmentByFlowMember.get(key);
              if (!canEnrollAgain(last ? new Date(last) : null, at)) continue;
              if (queue.some((e) => !e.done && e.flow.name === flow.name && e.memberId === memberId)) continue;

              lastEnrollmentByFlowMember.set(key, at.getTime());
              enteredByFlow.set(flow.name, (enteredByFlow.get(flow.name) ?? 0) + 1);
              queue.push({
                flow,
                memberId,
                centerId: center.id,
                timeZone: center.timezone || DEFAULT_TIMEZONE,
                stepIndex: 0,
                nextRunAt: nextStepRunAt(at, flow.steps[0].waitDays, center.timezone || DEFAULT_TIMEZONE).getTime(),
                done: false,
              });
            }
          }
        }
      }

      // ---- 2 · AVANZAR
      for (const enrollment of queue) {
        if (enrollment.done || enrollment.nextRunAt > at.getTime()) continue;
        const step = enrollment.flow.steps[enrollment.stepIndex];
        if (!step) {
          enrollment.done = true;
          continue;
        }

        if (!isEmailAction(step.actionType)) {
          nonEmailSteps++;
          advance(enrollment, at);
          continue;
        }

        const member = await memberOf(enrollment.memberId);
        const decision = decideFlowSend({
          now: at,
          timeZone: enrollment.timeZone,
          flowsPausedAt: null, // el simulacro mide el motor encendido, no la pausa de hoy
          flowStatus: enrollment.flow.status,
          testEmail: org.flowsTestEmail,
          memberEmail: member?.email ?? null,
          prefs: member?.prefs ?? {
            notifyVacancies: false,
            notifyBirthday: false,
            notifyAssessments: false,
            consentMarketing: false,
            emailOptOutAt: null,
          },
          lastFlowEmailAt: lastEmailByMember.has(enrollment.memberId)
            ? new Date(lastEmailByMember.get(enrollment.memberId)!)
            : null,
        });

        switch (decision.kind) {
          case "send":
            sent++;
            sentByFlow.set(enrollment.flow.name, (sentByFlow.get(enrollment.flow.name) ?? 0) + 1);
            if (decision.countsTowardCap) lastEmailByMember.set(enrollment.memberId, at.getTime());
            advance(enrollment, at);
            break;
          case "defer":
            blocked[decision.reason]++;
            if (decision.reason === "weekly_cap") cappedMembers.add(enrollment.memberId);
            if (decision.reason === "quiet_hours") silencedMembers.add(enrollment.memberId);
            enrollment.nextRunAt = decision.runAt.getTime();
            break;
          case "hold":
            blocked[decision.reason]++;
            break;
          case "skip":
            blocked[decision.reason]++;
            advance(enrollment, at);
            break;
        }
      }
    }
  }

  function advance(enrollment: Enrollment, at: Date) {
    enrollment.stepIndex++;
    const next = enrollment.flow.steps[enrollment.stepIndex];
    if (!next) {
      enrollment.done = true;
      return;
    }
    enrollment.nextRunAt = nextStepRunAt(at, next.waitDays, enrollment.timeZone).getTime();
  }

  return { sent, nonEmailSteps, blocked, enteredByFlow, sentByFlow, cappedMembers, silencedMembers };
}

function report(escenario: Scenario, r: SimResult) {
  const totalEntradas = [...r.enteredByFlow.values()].reduce((a, b) => a + b, 0);
  const frenados = Object.values(r.blocked).reduce((a, b) => a + b, 0);

  console.log(`\n${"─".repeat(72)}`);
  console.log(escenario.label);
  console.log("─".repeat(72));

  console.log(`ENTRADAS EN FLUJO      ${totalEntradas}`);
  for (const flow of FLOWS) {
    const entered = r.enteredByFlow.get(flow.name) ?? 0;
    const emails = r.sentByFlow.get(flow.name) ?? 0;
    console.log(`  ${flow.name.padEnd(38)} ${String(entered).padStart(4)} entran   ${String(emails).padStart(4)} correos`);
  }

  console.log(`\nCORREOS ENVIADOS       ${r.sent}`);
  console.log(`PASOS SIN CORREO       ${r.nonEmailSteps}  (tareas, avisos y cambios de estado: no gastan cupo)`);

  console.log(`\nFRENADOS POR REGLA     ${frenados}`);
  for (const [reason, count] of Object.entries(r.blocked)) {
    if (count === 0) continue;
    console.log(`  ${FLOW_DECISION_LABEL[reason as keyof Blocked].padEnd(46)} ${String(count).padStart(4)}`);
  }
  console.log(
    `\n  El tope semanal protegió a ${r.cappedMembers.size} ${r.cappedMembers.size === 1 ? "socio" : "socios"} distintos.`
  );
  console.log(
    `  La ventana de silencio aplazó correo a ${r.silencedMembers.size} ${r.silencedMembers.size === 1 ? "socio" : "socios"} distintos.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

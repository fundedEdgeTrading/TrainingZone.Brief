import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { membershipPath } from "@/lib/public-center-seo";
import { AUTOMATIC_TAG_LABEL, type AutomaticTagKey } from "@/lib/tags";
import { validateFlow } from "@/lib/flows/validate";

import { BIENVENIDA_SEED } from "@/lib/flows/seeds/bienvenida";
import { ENTRENAMIENTO_PERSONAL_SEED, GRUPO_REDUCIDO_SEED } from "@/lib/flows/seeds/rama-por-producto";
import { AUSENCIA_SEED } from "@/lib/flows/seeds/ausencia";
import { BONO_ACABANDOSE_SEED } from "@/lib/flows/seeds/bono-acabandose";
import { IMPAGO_SEED } from "@/lib/flows/seeds/impago";
import { REACTIVACION_SEED } from "@/lib/flows/seeds/reactivacion";
import { REFERRAL_90_DAYS_SEED } from "@/lib/flows/seeds/referral-90-days";
import { flowSeedKey, toFlowDraft, type FlowSeed } from "@/lib/flows/seeds/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E14-35 · LOS FLUJOS DE SALIDA · el catálogo y la siembra
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * EN EL ORDEN DE PRIORIDAD DEL ENCARGO, que es también el orden del corte de
 * alcance: si hubiera que entregar tres, son los tres primeros.
 *
 *   1 · Bienvenida            2 · Rama por producto (dos flujos, uno por etiqueta)
 *   3 · Ausencia              4 · Bono acabándose
 *   5 · Impago                6 · Reactivación
 *   7 · Referidos a los 90 días (la definición la dejó escrita R1)
 *
 * ---------------------------------------------------------------------------
 * LO QUE ESTA SIEMBRA **NO** HACE
 * ---------------------------------------------------------------------------
 * No enciende nada. Todo lo que se siembra NACE EN BORRADOR, igual que lo que se
 * monta desde el editor, y eso significa que se ejecuta de verdad pero TODO
 * envío va al buzón de pruebas de la organización. Encenderlo es un gesto
 * aparte, de una persona, en la pantalla del flujo. Sembrar no puede ser lo
 * mismo que empezar a escribirle a cuarenta y nueve socios.
 *
 * Tampoco toca nada que ya exista: si la semilla ya está sembrada en ese centro
 * —se reconoce por `Flow.seedKey`— se salta, y lo dice. Resembrar no puede
 * pisar el texto que el centro haya editado ni la cola que esté corriendo.
 *
 * ---------------------------------------------------------------------------
 * LO QUE SÍ HACE, Y ES LA MITAD DEL VALOR: AVISAR
 * ---------------------------------------------------------------------------
 * Antes de sembrar comprueba contra la base lo que cada flujo da por hecho —que
 * la etiqueta existe, que el programa de referidos está configurado, que hay
 * buzón de pruebas— y devuelve los avisos. Un flujo sembrado sobre una etiqueta
 * que no existe no falla: simplemente no le entra nadie nunca, y eso es lo peor
 * que puede pasar porque parece que funciona.
 */

export * from "@/lib/flows/seeds/types";
export { BIENVENIDA_SEED } from "@/lib/flows/seeds/bienvenida";
export { ENTRENAMIENTO_PERSONAL_SEED, GRUPO_REDUCIDO_SEED } from "@/lib/flows/seeds/rama-por-producto";
export { AUSENCIA_SEED } from "@/lib/flows/seeds/ausencia";
export { BONO_ACABANDOSE_SEED } from "@/lib/flows/seeds/bono-acabandose";
export { IMPAGO_SEED } from "@/lib/flows/seeds/impago";
export { REACTIVACION_SEED } from "@/lib/flows/seeds/reactivacion";
export {
  REFERRAL_90_DAYS_SEED,
  REFERRAL_90_DAYS_SEED_KEY,
  REFERRAL_ASK_AFTER_DAYS,
  REFERRAL_MIN_RATING,
} from "@/lib/flows/seeds/referral-90-days";

// Importar esto REGISTRA los resolutores del objetivo del panel. Va aquí y no
// en cada pantalla para que no se pueda olvidar en una de ellas: quien usa las
// semillas ya tiene medido el embudo.
export { FLOW_GOAL_RESOLVERS } from "@/lib/flows/seeds/goals";

/** Los siete, en el orden de prioridad del encargo. */
export const FLOW_SEEDS: FlowSeed[] = [
  BIENVENIDA_SEED,
  GRUPO_REDUCIDO_SEED,
  ENTRENAMIENTO_PERSONAL_SEED,
  AUSENCIA_SEED,
  BONO_ACABANDOSE_SEED,
  IMPAGO_SEED,
  REACTIVACION_SEED,
  REFERRAL_90_DAYS_SEED,
];

/** Los tres primeros del encargo: lo que se entrega si hay corte de alcance. */
export const FLOW_SEEDS_PRIORITARIAS: FlowSeed[] = FLOW_SEEDS.filter((s) => s.order <= 3);

export function flowSeedBySeedKey(seedKey: string): FlowSeed | null {
  // Acepta la clave pelada y la que lleva el centro pegado detrás, que es la
  // que de verdad está en `Flow.seedKey`.
  const pelada = seedKey.split(":")[0];
  return FLOW_SEEDS.find((s) => s.seedKey === pelada) ?? null;
}

/* ------------------------------------------------------------------------- *
 * Las rutas del botón que dependen del CENTRO (no del socio)
 * ------------------------------------------------------------------------- */

/**
 * `{membershipPath}` → la página pública de alta de ESTE centro.
 *
 * Se resuelve AL SEMBRAR y no al enviar, y esa diferencia es la que hace que
 * esto NO sea una interpolación por socio: la ruta depende del centro del flujo,
 * que es el mismo para todos los que entren, así que lo que se guarda en
 * `FlowStep.actionConfig` ya va entero y el motor sigue sin sustituir nada.
 *
 * Existe porque el destino de un excliente NO puede ser `/planes`: esa es la
 * tarifa de Apta, y el socio no compró Apta, compró su gimnasio (RB-MARCA-001).
 */
function resolveCtaPath(ctaPath: unknown, slugs: { orgSlug: string; centerSlug: string }): unknown {
  if (typeof ctaPath !== "string") return ctaPath;
  return ctaPath.replace("{membershipPath}", membershipPath(slugs.orgSlug, slugs.centerSlug));
}

function withResolvedPaths(
  actionConfig: Record<string, unknown>,
  slugs: { orgSlug: string; centerSlug: string }
): Record<string, unknown> {
  if (typeof actionConfig.ctaPath !== "string") return actionConfig;
  return { ...actionConfig, ctaPath: resolveCtaPath(actionConfig.ctaPath, slugs) };
}

/* ------------------------------------------------------------------------- *
 * La siembra
 * ------------------------------------------------------------------------- */

export type FlowSeedOutcome =
  | { seedKey: string; name: string; status: "sembrado"; flowId: string }
  | { seedKey: string; name: string; status: "ya-estaba"; flowId: string }
  | { seedKey: string; name: string; status: "se-sembraria" }
  | { seedKey: string; name: string; status: "invalido"; error: string };

export type FlowSeedReport = {
  orgId: string;
  centerId: string;
  centerName: string;
  outcomes: FlowSeedOutcome[];
  /** Lo que hay que mirar ANTES de encender. Ver la nota de arriba. */
  avisos: string[];
};

/**
 * Siembra los flujos de salida en UN centro. Idempotente por `Flow.seedKey`.
 *
 * El ámbito de centro NO se comprueba aquí y es deliberado, igual que en
 * `member-forms.ts::sendMemberForm`: este módulo no conoce al actor. Lo llama un
 * script de operación con la organización delante; si algún día lo llama una
 * acción de servidor, la comprobación va ahí, con la sesión, y no una copia
 * «espejo» a medias aquí — que es el fallo que más se repite en este repositorio.
 */
export async function seedFlows(
  orgId: string,
  centerId: string,
  opts: { seeds?: FlowSeed[]; dryRun?: boolean } = {}
): Promise<FlowSeedReport> {
  const seeds = opts.seeds ?? FLOW_SEEDS;

  const center = await prisma.center.findFirstOrThrow({
    where: { id: centerId, orgId },
    select: { id: true, name: true, slug: true, organization: { select: { slug: true } } },
  });
  const slugs = { orgSlug: center.organization.slug, centerSlug: center.slug };

  const report: FlowSeedReport = {
    orgId,
    centerId,
    centerName: center.name,
    outcomes: [],
    avisos: await avisosPrevios(orgId, centerId, seeds),
  };

  for (const seed of seeds) {
    const key = flowSeedKey(seed.seedKey, centerId);

    const yaEstaba = await prisma.flow.findFirst({ where: { orgId, seedKey: key }, select: { id: true } });
    if (yaEstaba) {
      report.outcomes.push({ seedKey: key, name: seed.name, status: "ya-estaba", flowId: yaEstaba.id });
      continue;
    }

    const draft = toFlowDraft(seed, centerId);
    draft.steps = draft.steps.map((s) => ({ ...s, actionConfig: withResolvedPaths(s.actionConfig, slugs) }));

    // LA MISMA VALIDACIÓN QUE EL EDITOR, y no una propia. Una semilla que no
    // pasaría por el formulario tampoco entra por la puerta de atrás.
    const validation = validateFlow(draft);
    if (!validation.ok) {
      report.outcomes.push({
        seedKey: key,
        name: seed.name,
        status: "invalido",
        error: validation.issues[0]?.message ?? "La semilla no es válida.",
      });
      continue;
    }

    // El simulacro llega HASTA AQUÍ a propósito: valida de verdad y calcula los
    // avisos, que es lo que se viene a ver, y no escribe ni una fila.
    if (opts.dryRun) {
      report.outcomes.push({ seedKey: key, name: seed.name, status: "se-sembraria" });
      continue;
    }

    const flowId = await prisma.$transaction(async (tx) => {
      const flow = await tx.flow.create({
        data: {
          orgId,
          centerId,
          name: seed.name,
          description: seed.description,
          // BORRADOR SIEMPRE. Ver la nota de arriba.
          status: "DRAFT",
          triggerType: seed.trigger.type,
          triggerConfig: seed.trigger.config as Prisma.InputJsonValue,
          goalKind: seed.goalKind,
          seedKey: key,
          createdByUserId: null,
        },
        select: { id: true },
      });

      const stepIds: string[] = [];
      for (const step of validation.draft.steps) {
        const created = await tx.flowStep.create({
          data: {
            orgId,
            flowId: flow.id,
            branch: step.branch,
            position: step.position,
            waitDays: step.waitDays,
            actionType: step.actionType,
            actionConfig: step.actionConfig as Prisma.InputJsonValue,
            branchAfterDays: step.branchAfterDays ?? null,
          },
          select: { id: true },
        });
        stepIds.push(created.id);
      }

      for (const [index, cond] of validation.draft.conditions.entries()) {
        await tx.flowCondition.create({
          data: {
            orgId,
            flowId: flow.id,
            stepId: cond.stepIndex === null || cond.stepIndex === undefined ? null : (stepIds[cond.stepIndex] ?? null),
            type: cond.type,
            config: cond.config as Prisma.InputJsonValue,
            negated: cond.negated ?? false,
            position: index,
          },
        });
      }

      return flow.id;
    });

    report.outcomes.push({ seedKey: key, name: seed.name, status: "sembrado", flowId });
  }

  return report;
}

/**
 * Lo que hay que mirar ANTES de encender, comprobado contra la base y no
 * supuesto. Cada aviso es una cosa que haría que un flujo pareciera funcionar y
 * no funcionara.
 */
async function avisosPrevios(orgId: string, centerId: string, seeds: FlowSeed[]): Promise<string[]> {
  const avisos: string[] = [];

  // 1 · Las etiquetas que segmentan. Un flujo cuya etiqueta no existe no falla:
  // no le entra nadie nunca, que es peor.
  const clavesUsadas = [
    ...new Set(
      seeds.flatMap((s) =>
        s.conditions.filter((c) => c.type === "TAG").map((c) => String(c.config.tagKey ?? ""))
      )
    ),
  ].filter(Boolean);
  if (clavesUsadas.length > 0) {
    const existentes = await prisma.memberTagDefinition.findMany({
      where: { orgId, key: { in: clavesUsadas }, active: true },
      select: { key: true },
    });
    const hay = new Set(existentes.map((t) => t.key));
    for (const clave of clavesUsadas) {
      if (hay.has(clave)) continue;
      const rotulo = AUTOMATIC_TAG_LABEL[clave as AutomaticTagKey] ?? clave;
      avisos.push(
        `La etiqueta «${rotulo}» (clave ${clave}) no está activa en esta organización: el flujo que segmenta ` +
          `por ella se sembrará, pero no le entrará nadie hasta que el motor de etiquetas la ponga.`
      );
    }
  }

  // 2 · El buzón de pruebas. Sin él, un flujo en borrador NO manda nada: la
  // decisión es `no_test_email` y el ensayo no se ve por ninguna parte.
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { flowsTestEmail: true, flowsPausedAt: true },
  });
  if (!org?.flowsTestEmail) {
    avisos.push(
      "No hay email de pruebas configurado. Todo lo que se siembra nace en borrador, y un borrador sin buzón de " +
        "pruebas no manda nada: ponlo en /flujos antes de probar."
    );
  }
  if (org?.flowsPausedAt) {
    avisos.push("El módulo de flujos está en PAUSA GLOBAL: lo sembrado se encola pero no sale hasta despausarlo.");
  }

  // 3 · El programa de referidos. El correo del flujo 7 pide un favor «a cambio
  // de lo que tenga puesto tu centro»; si no hay nada puesto, pide un favor a
  // cambio de nada.
  if (seeds.some((s) => s.seedKey === REFERRAL_90_DAYS_SEED.seedKey)) {
    const programa = await prisma.referralProgramConfig.findFirst({
      where: { orgId, centerId, active: true },
      select: { id: true },
    });
    if (!programa) {
      avisos.push(
        "Este centro no tiene programa de recomendaciones activo. El flujo 7 se siembra igual, pero NO lo " +
          "enciendas hasta configurarlo: el correo pide un favor a cambio de algo que todavía no existe."
      );
    }
  }

  // 4 · Los huecos de cada semilla, que son la parte que todavía hace una
  // persona. Se repiten aquí para que quien siembra los vea sin abrir el código.
  for (const seed of seeds) {
    for (const gap of seed.gaps) {
      avisos.push(`${seed.name} · falta ${gap.falta} Mientras tanto: ${gap.mientrasTanto}`);
    }
  }

  return avisos;
}

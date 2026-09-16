/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL SÉPTIMO FLUJO · «Pide la recomendación a los 90 días»
 *
 * ESTO ES UNA DEFINICIÓN, NO UNA IMPLEMENTACIÓN. La deja escrita R1 y LA MONTA
 * E3 sobre el motor de E2 (E14-34, último escenario). Aquí no se manda ningún
 * correo, no se inscribe a nadie y no se toca la cola: es el contrato del flujo
 * en las cuatro piezas de siempre —DISPARADOR → CONDICIÓN → ESPERA → ACCIÓN—
 * para que quien lo monte no tenga que reconstruir de memoria qué pidió
 * negocio.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * LO QUE PIDIÓ NEGOCIO, literal: «a los 90 días del alta, si la valoración es 8
 * o más, email pidiendo la recomendación con el enlace».
 *
 * ---------------------------------------------------------------------------
 * DE QUÉ MODELO SALE EL «8 O MÁS» · comprobado, no supuesto
 * ---------------------------------------------------------------------------
 * Es `TrainerRating.score`, y NO `Assessment`. El encargo pedía mirarlo porque
 * las dos cosas se llaman «valoración» en castellano y no son lo mismo:
 *
 *  · `TrainerRating` es la valoración que el SOCIO le pone a su ENTRENADOR.
 *    Tiene `score Int?` —y es el único modelo del esquema entero con una
 *    puntuación numérica: `grep "score" prisma/schema.prisma` devuelve esa
 *    línea y ninguna más—. La pantalla de RRHH la pinta como «{score}/10», así
 *    que la escala es 0-10 y «8 o más» son 8, 9 o 10.
 *    Encaja además por calendario: `CheckinScheduleConfig.trainerRatingDays`
 *    vale 90 por defecto, o sea que a los 90 días del alta el socio ACABA de
 *    recibir la petición de valorar. El flujo no pregunta dos veces; aprovecha
 *    la respuesta.
 *
 *  · `Assessment` es la VALORACIÓN FÍSICA por hitos (INITIAL, M1, M3, M6, M9,
 *    Y1). No tiene puntuación de ninguna clase: lleva `answers Json`,
 *    `dueDate`, `completedAt` y `memberPartAt`. No hay ningún «8» que leer ahí,
 *    y usarla obligaría a inventarse una puntuación a partir de respuestas
 *    libres. Además es dato de salud, con su control de acceso
 *    (`health-access.ts`): meterla en un disparador de marketing sería sacarla
 *    de su circuito.
 *
 * Conclusión para E3: la condición se resuelve con
 *   `TrainerRating` del socio, la más reciente, `score >= 8`.
 *
 * ---------------------------------------------------------------------------
 * EL HUECO DEL CATÁLOGO · esto es lo que hay que decidir antes de montarlo
 * ---------------------------------------------------------------------------
 * Los catálogos de E2 son enums CERRADOS y hoy la condición «valoración 8 o
 * más» NO SE PUEDE EXPRESAR con ninguno de ellos:
 *
 *  · `FlowConditionType` tiene CENTER, PLAN_TYPE, TAG, TENURE y TRAINER. No hay
 *    condición de puntuación.
 *  · `FlowTriggerType` tiene `RATING_BELOW` («valoración por debajo de N»), que
 *    es exactamente LO CONTRARIO de lo que pide este flujo. Sirve para el aviso
 *    de un socio descontento, no para pedirle un favor a uno contento.
 *
 * Hay dos salidas y NO las elige R1 —el motor es de E2 y los flujos son de E3—,
 * pero sí se dejan escritas para que la conversación empiece con las dos sobre
 * la mesa:
 *
 *  A) UNA ETIQUETA AUTOMÁTICA nueva en el motor de E1 («Valoración 8 o más»),
 *     y aquí una condición `TAG`. No toca esquema —`MemberTagDefinition` ya
 *     existe y el motor pone Y quita—, se ve en la ficha del socio y en
 *     `/etiquetas` con su definición en texto llano, y de paso queda disponible
 *     para segmentar a mano. Es la que R1 recomienda.
 *  B) Un valor nuevo en `FlowConditionType` (p. ej. `RATING_AT_LEAST`, con la N
 *     en `FlowCondition.config`). Es más directo, pero toca
 *     `prisma/schema.prisma`, que está CONGELADO este trimestre: hay que
 *     pedírselo a S2 y eso abre una migración para un solo flujo.
 *
 * Mientras no se decida, `conditions` lleva lo que SÍ se puede expresar hoy y
 * el hueco va aparte, en `pendingConditions`, a la vista y sin fingir que está
 * resuelto.
 *
 * ---------------------------------------------------------------------------
 * LAS REGLAS DE SEGURIDAD NO SE TOCAN
 * ---------------------------------------------------------------------------
 * Este flujo pasa por las seis del motor como cualquier otro: un email por
 * socio y semana entre TODOS los flujos, nada entre 22:00 y 8:00 (hora del
 * CENTRO), 90 días para reentrar, pausa global, modo borrador y
 * `canSendMemberEmail("marketing", …)`. Si alguna vez parece que este correo
 * «debería» saltarse el tope semanal, está mal diseñado: se cambia o se dice.
 * No es urgente — pedir una recomendación puede esperar a la semana que viene.
 */
import type { FlowActionType, FlowBranch, FlowGoalKind, FlowTriggerType } from "@prisma/client";

import { REFERRAL_LEAD_CHANNEL } from "@/lib/referrals";

/** Clave de la semilla. Es la que va a `Flow.seedKey`, y por eso es estable. */
export const REFERRAL_90_DAYS_SEED_KEY = "referidos-90-dias";

/** Los 90 días del encargo, en un solo sitio. */
export const REFERRAL_ASK_AFTER_DAYS = 90;

/** «8 o más», sobre `TrainerRating.score`, que es de 0 a 10. */
export const REFERRAL_MIN_RATING = 8;

/**
 * Una pieza de CONDICIÓN que hoy no cabe en `FlowConditionType`. Se declara
 * como dato —con lo que haría falta para resolverla— en vez de dejarla en un
 * comentario: así E3 la ve al abrir el fichero y el día que exista la condición
 * de verdad, esta entrada desaparece de un borrado.
 */
export type PendingFlowCondition = {
  /** Qué hay que comprobar, en castellano. */
  describe: string;
  /** Contra qué modelo y qué campo se resuelve. */
  source: string;
  /** Las salidas posibles, para que la decisión no se tome dos veces. */
  options: string[];
};

export type FlowSeedStep = {
  branch: FlowBranch;
  position: number;
  /** ESPERA, en horas, antes de ejecutar la acción de este paso. */
  waitHours: number;
  action: FlowActionType;
  /** Parámetros de la acción. Json en el esquema, igual que `triggerConfig`. */
  config: Record<string, unknown>;
};

export type FlowSeed = {
  seedKey: string;
  name: string;
  description: string;
  trigger: { type: FlowTriggerType; config: Record<string, unknown> };
  conditions: { type: "CENTER" | "PLAN_TYPE" | "TAG" | "TENURE" | "TRAINER"; config: Record<string, unknown> }[];
  pendingConditions: PendingFlowCondition[];
  steps: FlowSeedStep[];
  goalKind: FlowGoalKind;
};

/**
 * DISPARADOR → CONDICIÓN → ESPERA → ACCIÓN, en ese orden y sin nada más.
 *
 * El disparador es el ALTA (`MEMBER_JOINED`, que el motor ya cablea desde
 * `Member.joinedAt`) y la ESPERA de 90 días la hace la cola: no hay un
 * disparador «a los 90 días» ni hace falta, porque el motor es una cola y eso
 * es exactamente lo que sabe hacer. La condición `TENURE` es redundante con esa
 * espera A PROPÓSITO: entre el día 0 y el día 90 el socio ha podido congelarse
 * o darse de baja, y lo que se comprueba el día del envío es lo que vale.
 */
export const REFERRAL_90_DAYS_SEED: FlowSeed = {
  seedKey: REFERRAL_90_DAYS_SEED_KEY,
  name: "Pide la recomendación a los 90 días",
  description:
    "A los tres meses del alta, a quien está contento con su entrenador (valoración de 8 o más) se le pide que " +
    "traiga a un amigo, con su enlace de referido dentro. No se le pide a quien no ha valorado, ni a quien valoró " +
    "por debajo de 8: a ese hay que llamarle, no mandarle un favor.",

  trigger: { type: "MEMBER_JOINED", config: {} },

  conditions: [
    // Sigue siendo socio a los 90 días. `TENURE` en meses, como el resto del
    // catálogo de E2.
    { type: "TENURE", config: { minMonths: 3 } },
  ],

  pendingConditions: [
    {
      describe: `La valoración del socio a su entrenador es de ${REFERRAL_MIN_RATING} o más, sobre 10.`,
      source:
        "TrainerRating.score (Int?, escala 0-10), la fila más reciente del socio. NO Assessment: ese modelo no " +
        "tiene puntuación ninguna, es la valoración física por hitos y además es dato de salud.",
      options: [
        "A · etiqueta automática nueva del motor de E1 («Valoración 8 o más») y aquí una condición TAG. No toca esquema. Recomendada por R1.",
        "B · valor nuevo en FlowConditionType (RATING_AT_LEAST) con la N en FlowCondition.config. Toca prisma/schema.prisma, que está congelado: hay que pedírselo a S2.",
      ],
    },
  ],

  steps: [
    {
      branch: "MAIN",
      position: 0,
      // La ESPERA del encargo. En horas porque la cola de E2 razona en horas y
      // reprograma a las 8:00 del centro lo que caiga en la ventana de silencio.
      waitHours: REFERRAL_ASK_AFTER_DAYS * 24,
      action: "SEND_EMAIL",
      config: {
        // La plantilla la escribe E3 (`emails/flow-templates.ts`), con el
        // remitente del CENTRO: el socio no compró Apta, compró su gimnasio
        // (RB-MARCA-001).
        template: "referidos-pide-recomendacion",
        // El enlace del socio, que es lo único que este correo tiene que
        // llevar. Lo resuelve `referrals.ts`: `ensureReferralCode` para el
        // código y `referralLinkUrl` para la URL entera. NO se genera aquí otro
        // código ni otro formato de enlace — hay uno solo, y lo comparte con la
        // app nativa.
        include: ["referralLink"],
        referralLinkFrom: "@/lib/referrals#referralLinkUrl",
        // Para que el correo diga la verdad sobre qué se lleva cada uno, si el
        // centro tiene programa a doble cara.
        incentiveFrom: "@/lib/referral-rewards#publicIncentiveForReferred",
        leadChannel: REFERRAL_LEAD_CHANNEL,
      },
    },
  ],

  /**
   * El objetivo se mide contra datos que YA existen (E14-36): `REFERRAL_SENT`
   * es «el socio comparte su código», y eso se lee sin inventar nada — un
   * `Lead` con `referralCodeId` del código de este socio y `createdAt` posterior
   * al envío. No se miden aperturas (decisión 4 del plan): se mide el clic, que
   * el enlace es nuestro.
   */
  goalKind: "REFERRAL_SENT",
};

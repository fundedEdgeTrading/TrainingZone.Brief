/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL SÉPTIMO FLUJO · «Pide la recomendación a los 90 días»
 *
 * LA DEFINICIÓN LA DEJÓ ESCRITA R1 ANTES DE QUE EL MOTOR EXISTIERA; ESTE
 * FICHERO ES ESA DEFINICIÓN YA MONTADA SOBRE EL MOTOR DE E2 (E14-34, último
 * escenario). Lo que cambia respecto a lo que escribió R1 es el VOCABULARIO, y
 * solo eso — lo avisó E2 en `flows/index.ts` para que no se descubriera
 * depurando:
 *
 *   · la ESPERA de un paso es `FlowStep.waitDays`, en DÍAS. R1 la escribió como
 *     `waitHours: 90 * 24`; son 90 días y aquí van como 90.
 *   · la condición `TENURE` se configura con `{ months, direction: "min" |
 *     "max" }`, no con `minMonths`.
 *
 * El razonamiento de negocio de R1 se conserva entero, porque sigue siendo el
 * motivo por el que este flujo es como es.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * LO QUE PIDIÓ NEGOCIO, literal: «a los 90 días del alta, si la valoración es 8
 * o más, email pidiendo la recomendación con el enlace».
 *
 * ---------------------------------------------------------------------------
 * DE QUÉ MODELO SALE EL «8 O MÁS» · comprobado por R1, no supuesto
 * ---------------------------------------------------------------------------
 * Es `TrainerRating.score`, y NO `Assessment`. Las dos cosas se llaman
 * «valoración» en castellano y no son lo mismo:
 *
 *  · `TrainerRating` es la valoración que el SOCIO le pone a su ENTRENADOR.
 *    Tiene `score Int?` y es el único modelo del esquema con una puntuación
 *    numérica. La pantalla de RRHH la pinta como «{score}/10», así que la escala
 *    es 0-10 y «8 o más» son 8, 9 o 10. Encaja además por calendario:
 *    `CheckinScheduleConfig.trainerRatingDays` vale 90 por defecto, o sea que a
 *    los 90 días del alta el socio ACABA de recibir la petición de valorar. El
 *    flujo no pregunta dos veces: aprovecha la respuesta.
 *
 *  · `Assessment` es la VALORACIÓN FÍSICA por hitos. No tiene puntuación de
 *    ninguna clase, y además es dato de salud con su control de acceso
 *    (`health-access.ts`): meterla en un disparador de marketing sería sacarla
 *    de su circuito.
 *
 * ---------------------------------------------------------------------------
 * EL HUECO DEL CATÁLOGO SIGUE ABIERTO
 * ---------------------------------------------------------------------------
 * Hoy la condición «valoración 8 o más» NO SE PUEDE EXPRESAR: `FlowConditionType`
 * no tiene condición de puntuación, y `RATING_BELOW` es un DISPARADOR y es
 * exactamente lo contrario de lo que pide este flujo (sirve para el aviso de un
 * socio descontento, no para pedirle un favor a uno contento).
 *
 * E3 no lo cierra por su cuenta: el catálogo es de E2 y el esquema está
 * congelado. Va declarado abajo con las dos salidas que dejó escritas R1, y la
 * consecuencia de que siga abierto —a quién le llega este correo mientras
 * tanto— está dicha en `mientrasTanto` y se pinta en el panel del flujo.
 *
 * ---------------------------------------------------------------------------
 * LAS REGLAS DE SEGURIDAD NO SE TOCAN
 * ---------------------------------------------------------------------------
 * Pasa por las seis del motor como cualquier otro flujo. Si alguna vez parece
 * que este correo «debería» saltarse el tope semanal, está mal diseñado: pedir
 * una recomendación puede esperar perfectamente a la semana que viene.
 */
import { FLOW_SEED_TEMPLATES } from "@/lib/emails/flow-templates";

import type { FlowSeed } from "@/lib/flows/seeds/types";

/** Clave de la semilla. Es la que va a `Flow.seedKey`, y por eso es estable. */
export const REFERRAL_90_DAYS_SEED_KEY = "referidos-90-dias";

/** Los 90 días del encargo, en un solo sitio. */
export const REFERRAL_ASK_AFTER_DAYS = 90;

/** «8 o más», sobre `TrainerRating.score`, que es de 0 a 10. */
export const REFERRAL_MIN_RATING = 8;

/**
 * DISPARADOR → CONDICIÓN → ESPERA → ACCIÓN, en ese orden y sin nada más.
 *
 * El disparador es el ALTA (`MEMBER_JOINED`, que el motor cablea desde
 * `Member.joinedAt`) y la ESPERA de 90 días la hace la cola: no hay un
 * disparador «a los 90 días» ni hace falta, porque el motor es una cola y eso es
 * exactamente lo que sabe hacer. La condición `TENURE` es redundante con esa
 * espera A PROPÓSITO: entre el día 0 y el día 90 el socio ha podido congelarse o
 * darse de baja, y lo que se comprueba el día del envío es lo que vale.
 */
export const REFERRAL_90_DAYS_SEED: FlowSeed = {
  seedKey: REFERRAL_90_DAYS_SEED_KEY,
  order: 7,
  name: "7 · Pide la recomendación a los 90 días",
  description:
    "A los tres meses del alta, a quien está contento con su entrenador se le pide que traiga a un amigo, con " +
    "su enlace de referido. No se le pide a quien valoró por debajo de 8: a ese hay que llamarle, no mandarle " +
    "un favor. Ese filtro todavía no se puede expresar en el motor y está declarado como hueco.",

  trigger: { type: "MEMBER_JOINED", config: {} },

  conditions: [
    // Sigue siendo socio a los 90 días. Tres cosas que parecen detalles y no lo son:
    //
    //  · `stepIndex: 0` — LA CONDICIÓN CUELGA DEL PASO, NO DE LA ENTRADA. En el
    //    motor de E2, una condición sin paso se evalúa AL INSCRIBIR, y al
    //    inscribir el socio acaba de darse de alta: su antigüedad es CERO y no
    //    entraría nunca. Colgada del paso se evalúa el día del envío, que es lo
    //    que quiso decir R1 al escribir que la redundancia con la espera era «a
    //    propósito»: entre el día 0 y el día 90 el socio ha podido congelarse o
    //    darse de baja, y lo que vale es cómo esté el día que sale el correo.
    //  · EN MESES, como el resto del catálogo de E2.
    //  · con `direction` explícito: `{ minMonths: 3 }` —como lo escribió R1— no
    //    lo lee nadie, y la condición se cumpliría siempre.
    { type: "TENURE", config: { months: 3, direction: "min" }, stepIndex: 0 },
  ],

  steps: [
    {
      branch: "MAIN",
      position: 0,
      // La ESPERA del encargo, EN DÍAS. La cola la reprograma sola si cae en la
      // ventana de silencio del centro.
      waitDays: REFERRAL_ASK_AFTER_DAYS,
      actionType: "SEND_EMAIL",
      actionConfig: {
        subject: FLOW_SEED_TEMPLATES.referidos90Dias.subject,
        bodyText: FLOW_SEED_TEMPLATES.referidos90Dias.bodyText,
        ctaLabel: FLOW_SEED_TEMPLATES.referidos90Dias.ctaLabel,
        ctaPath: FLOW_SEED_TEMPLATES.referidos90Dias.ctaPath,
        templateKey: FLOW_SEED_TEMPLATES.referidos90Dias.key,
      },
    },
  ],

  /**
   * El objetivo se mide contra datos que YA existen (E14-36): `REFERRAL_SENT` es
   * «el socio comparte su código», y eso se lee sin inventar nada — un `Lead`
   * con el `referralCodeId` del código de este socio y `createdAt` posterior al
   * envío. No se miden aperturas: se mide el clic, que el enlace es nuestro.
   */
  goalKind: "REFERRAL_SENT",
  goalRationale:
    "Recomendó de verdad: un lead entrado por el código de referido de ESTE socio, con fecha posterior al " +
    "correo. Es el único de los tres pasos del embudo que cuesta dinero de verdad, y se lee sin inventar nada.",

  gaps: [
    {
      kind: "condicion",
      falta: `La condición «la valoración del socio a su entrenador es de ${REFERRAL_MIN_RATING} o más, sobre 10».`,
      afecta: "El filtro del correo del día 90. Es el filtro entero del flujo.",
      duenio:
        "`TrainerRating.score` existe (Int?, escala 0-10), pero `FlowConditionType` no tiene condición de " +
        "puntuación y es un enum de `prisma/schema.prisma`, congelado. `RATING_BELOW` es un disparador y es lo contrario.",
      mientrasTanto:
        "EL CORREO LE LLEGA A TODO EL QUE SIGA SIENDO SOCIO A LOS 90 DÍAS, haya valorado o no y con la nota que " +
        "sea. Por eso este flujo se siembra en BORRADOR como todos y conviene dejarlo así hasta que el filtro " +
        "exista: pedirle una recomendación a quien puso un 4 es peor que no pedírsela a nadie.",
      salidas: [
        "A · una etiqueta automática nueva del motor de E1 («Valoración 8 o más»), y aquí una condición TAG. No toca esquema, se ve en la ficha y en /etiquetas con su definición en texto llano, y de paso queda disponible para segmentar a mano. Es la que recomienda R1.",
        "B · un valor nuevo en FlowConditionType (RATING_AT_LEAST, con la N en FlowCondition.config). Más directo, pero toca prisma/schema.prisma: hay que pedírselo a S2 y abre una migración para un solo flujo.",
      ],
    },
    {
      kind: "dato-por-socio",
      falta: "El ENLACE DE REFERIDO del socio dentro del correo, que es lo único que este correo tiene que llevar.",
      afecta: "Paso 1 · el botón del correo.",
      duenio:
        "`sendFlowEmail` en `src/lib/flows/engine.ts` (E2): `ctaPath` es una ruta fija y el enlace es " +
        "`referralLinkUrl(code)`, propio de cada socio. Es el MISMO hueco que el enlace de pago del flujo 5.",
      mientrasTanto:
        "El texto no inventa ningún enlace ni ningún código: dice dónde está el suyo (recepción y su ficha) y " +
        "el botón lleva al portal. Tampoco da el importe de la recompensa, que es configurable por centro y " +
        "podría no existir.",
      salidas: [
        "A · el registro de resolutores de destino por socio que propone también el flujo 5. Una sola pieza en el motor resuelve los dos enlaces.",
        "B · que el portal del socio tenga su sección de referidos —hoy el panel de referidos solo está en la ficha que ve el personal—, y el botón lleve ahí. Sirve para más cosas que este correo.",
      ],
    },
    {
      kind: "dato-del-centro",
      falta: "Qué se lleva cada uno, que lo configura cada centro en su programa de recomendaciones.",
      afecta: "Paso 1 · el cuerpo del correo.",
      duenio: "`ReferralProgramConfig` existe (R1); lo que falta es interpolarlo, misma causa que arriba.",
      mientrasTanto:
        "El texto dice «tu centro tiene puesto qué se lleva cada uno» y no da ninguna cifra. NO SE INVENTA UN " +
        "IMPORTE. `seedFlows` avisa al sembrar si el centro todavía no tiene programa configurado: en ese caso " +
        "este flujo no debería encenderse, porque pide un favor a cambio de nada.",
      salidas: [
        "A · el mismo registro de resolutores, para trozos de texto además de para enlaces.",
        "B · dejarlo así y que el centro edite el cuerpo desde el editor cuando fije su programa.",
      ],
    },
  ],
};

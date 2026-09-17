import { FLOW_SEED_TEMPLATES } from "@/lib/emails/flow-templates";

import type { FlowSeed } from "@/lib/flows/seeds/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FLUJO 5 · IMPAGO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   Día 1 · correo con el enlace de pago
 *   Día 3 · tarea a administración
 *   Día 7 · pasa a suspendido, POR `member-lifecycle.ts` y no por un update suelto
 *
 * ---------------------------------------------------------------------------
 * LO QUE YA HACE EL REPOSITORIO ANTES DE QUE ESTE FLUJO EMPIECE
 * ---------------------------------------------------------------------------
 * Esto hay que leerlo antes de encender el flujo, porque cambia lo que significa
 * cada paso. Cuando Stripe devuelve un recibo, `stripe-dunning.ts` ya hace, solo
 * y el mismo día:
 *
 *  · `markDelinquent` → el socio pasa a DELINQUENT («Suspendido» en pantalla) y
 *    arranca `delinquentSince`, que es el reloj del periodo de gracia.
 *  · manda el correo TRANSACCIONAL de cobro fallido, que YA lleva el enlace
 *    firmado de recuperación (HU-ST-19). Ese correo no se puede desactivar y no
 *    gasta cupo: es la ejecución del servicio contratado, no publicidad.
 *  · abre un aviso a recepción.
 *  · y al agotarse los días de gracia de la organización (HU-ST-18, siete por
 *    defecto pero CONFIGURABLE), el acceso se corta solo.
 *
 * Así que este flujo NO es el que corta el acceso ni el que manda el primer
 * aviso: es el SEGUIMIENTO COMERCIAL de los siete días, que hoy hace recepción a
 * mano. Su valor es el paso 2 —que alguien llame antes de que el corte llegue— y
 * que el paso 3 deje el estado correcto también cuando el impago no vino de
 * Stripe (un recibo local, una marca a mano).
 *
 * EL PASO 3 ES IDEMPOTENTE Y ESTÁ PUESTO A PROPÓSITO. En el camino de Stripe el
 * socio ya está DELINQUENT, así que no cambia nada y `markDelinquent` no
 * reinicia el reloj de gracia. Lo que cubre es el caso en el que alguien lo
 * devolvió a ACTIVE a mano sin que el recibo entrara.
 *
 * ---------------------------------------------------------------------------
 * EL ENLACE DE PAGO · el hueco de verdad de este flujo
 * ---------------------------------------------------------------------------
 * El encargo es explícito: «el enlace YA EXISTE, es el de HU-ST-19, no generes
 * otro». Y no se genera otro. Lo que pasa es que el motor NO PUEDE LLEVARLO:
 * `FlowStep.actionConfig.ctaPath` es una ruta FIJA y el enlace de HU-ST-19 es
 * `memberBillingUrlFor(generateMemberDunningToken(memberId))`, firmado POR
 * SOCIO. No hay hueco en el motor donde meterlo, y abrirlo es tocar `engine.ts`,
 * que es de E2. Va declarado abajo, con su arreglo mínimo propuesto.
 *
 * Mientras tanto el botón lleva al socio a «Membresía» de su portal, donde está
 * su recibo pendiente y el mismo botón de pagar: un clic más, ningún enlace
 * inventado y ningún segundo sistema de cobro.
 */
export const IMPAGO_SEED: FlowSeed = {
  seedKey: "impago",
  order: 5,
  name: "5 · Impago",
  description:
    "Seguimiento de los siete días de un recibo devuelto: correo al día siguiente, tarea a administración al " +
    "tercer día y estado suspendido al séptimo. El aviso del primer día y el corte de acceso los hace el " +
    "dunning de Stripe por su cuenta; esto es la parte que hoy hace recepción a mano.",

  // `Member.delinquentSince`, que escribe `stripe-dunning.ts`. El disparador
  // mira la ventana de los últimos siete días, así que una pasada perdida del
  // cron no deja a nadie sin seguimiento.
  trigger: { type: "PAYMENT_FAILED", config: {} },

  conditions: [],

  steps: [
    {
      branch: "MAIN",
      position: 0,
      waitDays: 1,
      actionType: "SEND_EMAIL",
      actionConfig: {
        subject: FLOW_SEED_TEMPLATES.impagoDia1.subject,
        bodyText: FLOW_SEED_TEMPLATES.impagoDia1.bodyText,
        ctaLabel: FLOW_SEED_TEMPLATES.impagoDia1.ctaLabel,
        ctaPath: FLOW_SEED_TEMPLATES.impagoDia1.ctaPath,
        templateKey: FLOW_SEED_TEMPLATES.impagoDia1.key,
      },
    },
    {
      branch: "MAIN",
      position: 1,
      // Dos días después del correo: el día 3 del encargo.
      waitDays: 2,
      actionType: "CREATE_TASK",
      actionConfig: {
        title: "Impago de 3 días: llamada de administración",
        body:
          "Tres días con el recibo devuelto y sin respuesta al correo. Llamar antes de que se agote el periodo " +
          "de gracia, que es cuando el acceso se corta solo. Si hay acuerdo de pago, anotarlo en la ficha.",
        dueInDays: 1,
        // `trainerUserId` se deja SIN poner a propósito: una semilla no puede
        // traer el id de una persona concreta —cada organización tiene la suya—
        // y el motor ya resuelve el destinatario solo (entrenador del socio y,
        // si no hay, dirección del centro). Para que vaya a una persona de
        // administración en concreto, se elige en el editor del flujo.
      },
    },
    {
      branch: "MAIN",
      position: 2,
      // Cuatro días después de la tarea: el día 7 del encargo.
      waitDays: 4,
      actionType: "CHANGE_STATE",
      actionConfig: {
        // Pasa por `member-lifecycle.ts` (M4), que es el punto ÚNICO de
        // escritura de las transiciones y el que deja el `AuditLog`. Nunca un
        // `update` suelto sobre `Member.state`.
        state: "DELINQUENT",
      },
    },
  ],

  goalKind: "PAYMENT_RECOVERED",
  goalRationale:
    "El impago se cerró: se mide con el rastro que deja `member-lifecycle.ts` al limpiar la morosidad " +
    "(`MEMBER_DELINQUENCY_CLEARED` en el AuditLog) con fecha posterior al correo. Se usa el rastro y no " +
    "«`delinquentSince` está a null» porque un campo vacío no dice CUÁNDO se vació, y sin el cuándo el embudo " +
    "se apuntaría cobros que entraron antes de escribir.",

  gaps: [
    {
      kind: "dato-por-socio",
      falta:
        "Que el botón del correo lleve el enlace de «Pagar ahora» de HU-ST-19, que va firmado por socio.",
      afecta: "Paso 1 · el correo del día siguiente.",
      duenio:
        "`sendFlowEmail` en `src/lib/flows/engine.ts` (E2) construye el botón con " +
        "`flowClickUrl({ emailLogId, url: absoluteUrl(ctaPath) })`, y `ctaPath` es una ruta fija.",
      mientrasTanto:
        "El botón lleva a «Membresía» del portal, donde el socio ve su recibo pendiente y el mismo botón de " +
        "pagar. NO se genera un segundo enlace ni un segundo sistema de cobro: solo hay un clic de más.",
      salidas: [
        "A · un registro de resolutores de destino en el motor, como el de objetivos del panel: el paso declara una clave («enlace de pago», «enlace de referido») y `sendFlowEmail` la resuelve por socio justo antes de firmar el token de clic. Son pocas líneas y sirve también para el flujo 7.",
        "B · dejarlo así. Cuesta un clic al socio y no se pierde ninguna de las seis reglas.",
      ],
    },
    {
      kind: "dato-del-centro",
      falta: "Los días de gracia de la organización (HU-ST-18) dentro del texto del correo.",
      afecta: "Paso 1 · el cuerpo del correo.",
      duenio: "`Organization.dunningGraceDays` existe; lo que no hay es forma de interpolarlo (misma causa que arriba).",
      mientrasTanto:
        "El texto dice «pasado el periodo de gracia de tu centro» sin dar ningún número. NO SE INVENTA UN " +
        "SIETE: una organización con otro plazo recibiría un correo que miente sobre su propia política.",
      salidas: [
        "A · el mismo registro de resolutores de la salida A de arriba, pero para trozos de texto.",
        "B · dejarlo así. Sin número el texto es correcto para cualquier organización.",
      ],
    },
  ],
};

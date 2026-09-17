import { FLOW_SEED_TEMPLATES } from "@/lib/emails/flow-templates";

import type { FlowSeed } from "@/lib/flows/seeds/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FLUJO 6 · REACTIVACIÓN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   A los 30 días de la baja · correo
 *   Cada septiembre          · campaña a la etiqueta «Excliente»  ← NO SE ENTREGA
 *
 * De los seis es el que negocio hace a mano hoy, y el que justifica que M4
 * hiciera obligatorio el motivo de baja: quien se fue por una mudanza no debe
 * recibir el mismo correo que quien se fue por el precio. Al primero le estás
 * ofreciendo algo que no puede usar.
 *
 * ---------------------------------------------------------------------------
 * EL DISPARADOR MIRA EL RASTRO, NO EL ESTADO
 * ---------------------------------------------------------------------------
 * `MEMBER_STATE_CHANGED` con `state: CANCELLED` pregunta por el `AuditLog` que
 * deja `member-lifecycle.ts` (`MEMBER_CANCELLED`), no por `Member.state`. Es lo
 * que distingue «acaba de darse de baja» de «lleva dos años siéndolo»: sin eso,
 * encender este flujo le escribiría de golpe a todos los exclientes del
 * histórico, que es justo la campaña de septiembre pero sin quererlo y sin que
 * nadie la haya aprobado.
 *
 * Y es el único disparador del motor que NO se limita a los estados que siguen
 * «en los libros», precisamente porque este flujo existe para hablar con quien
 * acaba de salir.
 *
 * ---------------------------------------------------------------------------
 * LOS MOTIVOS DE BAJA · lo que el encargo pide y hoy no se puede escribir
 * ---------------------------------------------------------------------------
 * El motivo está en el dato: `Member.cancelReasonId` apunta a `CancelReason`, y
 * M4 lo hizo obligatorio. Lo que no existe es la CONDICIÓN: `FlowConditionType`
 * tiene CENTER, PLAN_TYPE, TAG, TENURE y TRAINER, y ninguna sabe leer el motivo
 * de baja. Sin ella no se pueden montar los dos correos distintos que pide el
 * encargo, así que va UNO SOLO y el texto no promete nada que dependa del
 * motivo: no ofrece descuento (sería inútil para quien se mudó) ni habla de
 * horarios (sería inútil para quien se fue por precio). Pregunta qué no encajó y
 * deja la puerta abierta. Está declarado abajo, con sus dos salidas.
 *
 * ---------------------------------------------------------------------------
 * LA CAMPAÑA DE SEPTIEMBRE · POR QUÉ NO ESTÁ AQUÍ
 * ---------------------------------------------------------------------------
 * NO SE ENTREGA, y no por falta de tiempo: EL MOTOR NO TIENE DISPARADOR DE
 * FECHA DE CALENDARIO. `FlowTriggerType` tiene `DATE_ANNIVERSARY` (meses desde
 * el alta de CADA socio) y `DATE_BIRTHDAY` (su cumpleaños); las dos son fechas
 * distintas para cada persona. «El 1 de septiembre de cada año, a todos los que
 * tengan la etiqueta Excliente» es una fecha FIJA IGUAL PARA TODOS, y eso no se
 * puede expresar hoy.
 *
 * Se podría haber forzado —un flujo con `DATE_ANNIVERSARY` no manda en
 * septiembre, manda en el aniversario de cada uno— y eso habría sido entregar
 * otra cosa con el mismo nombre. Va declarado como hueco y dicho en el informe.
 */
export const REACTIVACION_SEED: FlowSeed = {
  seedKey: "reactivacion-30-dias",
  order: 6,
  name: "6 · Reactivación",
  description:
    "A los treinta días de la baja, un correo que pregunta qué no encajó y deja la puerta abierta. Un mes es el " +
    "plazo que separa a quien echa de menos entrenar de quien se fue con razón. La campaña anual de septiembre " +
    "a los exclientes NO va aquí: el motor todavía no tiene disparador de fecha fija.",

  // El rastro de `member-lifecycle.ts`, no `Member.state`. Ver la nota de arriba.
  trigger: { type: "MEMBER_STATE_CHANGED", config: { state: "CANCELLED" } },

  conditions: [],

  steps: [
    {
      branch: "MAIN",
      position: 0,
      waitDays: 30,
      actionType: "SEND_EMAIL",
      actionConfig: {
        subject: FLOW_SEED_TEMPLATES.reactivacionDia30.subject,
        bodyText: FLOW_SEED_TEMPLATES.reactivacionDia30.bodyText,
        ctaLabel: FLOW_SEED_TEMPLATES.reactivacionDia30.ctaLabel,
        // `{membershipPath}` lo resuelve `seedFlows` AL SEMBRAR con los slugs
        // del centro del flujo: la página pública de alta de ESE gimnasio.
        // Nunca `/planes`, que es la tarifa de Apta — el socio no compró Apta
        // (RB-MARCA-001) y mandarle ahí sería enseñarle la factura del gimnasio.
        ctaPath: FLOW_SEED_TEMPLATES.reactivacionDia30.ctaPath,
        templateKey: FLOW_SEED_TEMPLATES.reactivacionDia30.key,
      },
    },
  ],

  goalKind: "RENEWED",
  goalRationale:
    "Volvió, y volver aquí significa contratar otra vez: una suscripción nueva posterior al correo, o una " +
    "recarga de bono en el libro de sesiones. «Volvió a entrenar» no serviría — un excliente no puede reservar, " +
    "así que la reserva llega siempre DESPUÉS de la contratación y llegaría tarde al embudo.",

  gaps: [
    {
      kind: "condicion",
      falta:
        "Una condición por MOTIVO DE BAJA, para que quien se fue por una mudanza no reciba el mismo correo que " +
        "quien se fue por el precio.",
      afecta: "La condición de entrada. Con ella, este flujo serían dos o tres, uno por familia de motivo.",
      duenio:
        "El dato existe (`Member.cancelReasonId` → `CancelReason`, obligatorio desde M4). Lo que falta es el " +
        "valor en `FlowConditionType`, que es un enum de `prisma/schema.prisma`, congelado.",
      mientrasTanto:
        "Va un solo correo, y su texto NO promete nada que dependa del motivo: no ofrece descuento ni habla de " +
        "horarios. Pregunta qué no encajó y deja la puerta abierta, que es verdad para todos.",
      salidas: [
        "A · etiquetas automáticas de E1 por familia de motivo («Baja por precio», «Baja por mudanza») y aquí una condición TAG. No toca esquema, y de paso el motivo se ve en la ficha y se puede segmentar a mano.",
        "B · un valor nuevo en FlowConditionType (CANCEL_REASON, con los ids en config). Más directo, pero el catálogo de motivos es libre por organización y una condición con ids dentro se rompe al reordenar el catálogo.",
      ],
    },
    {
      kind: "disparador",
      falta:
        "Un disparador de FECHA FIJA DEL CALENDARIO («el 1 de septiembre de cada año»), para la campaña anual a " +
        "la etiqueta «Excliente».",
      afecta: "La segunda mitad del flujo 6 del encargo, que POR ESO NO SE ENTREGA.",
      duenio: "`FlowTriggerType` es un enum de `prisma/schema.prisma`, congelado. El cableado sería de `triggers.ts` (E2).",
      mientrasTanto:
        "NADA: la campaña de septiembre se sigue haciendo a mano, igual que hoy. No se ha forzado con " +
        "`DATE_ANNIVERSARY` porque eso manda en el aniversario del alta de cada socio, que no es septiembre para " +
        "nadie salvo por casualidad, y se habría entregado otra cosa con el mismo nombre.",
      salidas: [
        "A · un valor nuevo en FlowTriggerType (DATE_FIXED, con día y mes en triggerConfig) cableado contra el calendario del centro. Es el mismo patrón que DATE_BIRTHDAY y lo tiene casi todo hecho en `triggers.ts`.",
        "B · una campaña de un disparo desde la pantalla de flujos —«mandar este flujo ahora a quien tenga esta etiqueta»— que no es un disparador sino un botón. Sirve para esta y para cualquier otra campaña de temporada.",
      ],
    },
  ],
};

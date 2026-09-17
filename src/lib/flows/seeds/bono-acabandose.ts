import { FLOW_SEED_TEMPLATES } from "@/lib/emails/flow-templates";

import type { FlowSeed } from "@/lib/flows/seeds/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FLUJO 4 · BONO ACABÁNDOSE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   Quedan 2 sesiones · tarea de venta al entrenador + correo de renovación
 *
 * Es la conversación que más vende del centro y hay que tenerla ANTES de que el
 * bono llegue a cero: con el saldo agotado el socio ya ha dejado de reservar, y
 * recuperar a quien dejó de venir cuesta diez veces más que renovarle a quien
 * todavía viene.
 *
 * ---------------------------------------------------------------------------
 * LA TRAMPA DE ESTE FLUJO, Y POR QUÉ HOY YA NO LA TIENE (E14-11, pista M3)
 * ---------------------------------------------------------------------------
 * El encargo avisaba: «esta es la regla que M3 arregló — hoy la deduplicación se
 * come la tarea del bono si el socio ya tiene otra abierta». COMPROBADO CONTRA
 * `main`, no dado por bueno:
 *
 *  · `trainer-alerts.ts::runLowPackBalanceRule` ya usa
 *    `AUTO_TASK_RULES.lowPackBalance.entityType`, una entidad PROPIA, en vez de
 *    compartir `entityType = "Member"` con la regla de «pocas sesiones
 *    programadas». Las dos tareas ya conviven. M3 está mezclada.
 *  · Y la tarea de ESTE flujo ni siquiera comparte espacio con ninguna de las
 *    dos: `actions.ts::flowTaskKey` deduplica por `inscripción:paso`
 *    (`entityType = "FlowTask"`), así que dos flujos distintos sobre el mismo
 *    socio abren dos tareas distintas, que es lo que hace falta.
 *
 * Dicho de otra forma: este flujo SÍ se puede probar de verdad, y la prueba de
 * que la tarea se crea está en `e2e/flujos.spec.ts`.
 *
 * LO QUE SÍ PUEDE FRENAR LA TAREA, y no es un fallo: el TOPE SEMANAL DE TAREAS
 * de M3 (E14-12). Si el entrenador ya tiene su cupo de tareas automáticas de la
 * semana, `createNotificationOnce` devuelve `capped` y la tarea se escribe en la
 * pasada siguiente que tenga hueco. El motor lo anota en el informe del cron.
 * La situación no se pierde: sigue ahí y se vuelve a intentar.
 */
export const BONO_ACABANDOSE_SEED: FlowSeed = {
  seedKey: "bono-acabandose",
  order: 4,
  name: "4 · Bono acabándose",
  description:
    "Cuando al bono le quedan dos sesiones: correo de renovación al socio y tarea de venta al entrenador. Se " +
    "avisa con dos sesiones de margen y no con cero, que es cuando el socio ya ha dejado de reservar.",

  // El MISMO umbral que `runLowPackBalanceRule` (saldo ≤ 2 y > 0): un bono
  // agotado es otra conversación, y esa la tiene recepción.
  trigger: { type: "PACK_BALANCE_BELOW", config: { threshold: 2 } },

  conditions: [],

  steps: [
    {
      branch: "MAIN",
      position: 0,
      waitDays: 0,
      actionType: "SEND_EMAIL",
      actionConfig: {
        subject: FLOW_SEED_TEMPLATES.bonoAcabandose.subject,
        bodyText: FLOW_SEED_TEMPLATES.bonoAcabandose.bodyText,
        ctaLabel: FLOW_SEED_TEMPLATES.bonoAcabandose.ctaLabel,
        ctaPath: FLOW_SEED_TEMPLATES.bonoAcabandose.ctaPath,
        templateKey: FLOW_SEED_TEMPLATES.bonoAcabandose.key,
      },
    },
    {
      branch: "MAIN",
      position: 1,
      waitDays: 0,
      actionType: "CREATE_TASK",
      actionConfig: {
        title: "Le quedan 2 sesiones del bono: ofrécele la renovación",
        body:
          "Es la conversación que más vende y hay que tenerla antes de que el bono llegue a cero. Pregúntale en " +
          "la próxima sesión si sigue y con qué tamaño de bono: hay quien se queda corto todos los meses y " +
          "nadie se lo ha dicho.",
        dueInDays: 3,
      },
    },
  ],

  goalKind: "RENEWED",
  goalRationale:
    "Renovó, y se mide contra dos datos que ya existen: una suscripción nueva posterior al envío, o un asiento " +
    "positivo en el libro de sesiones (`SessionLedger`) por compra o ajuste — que es lo que deja una recarga de " +
    "bono, porque ninguna operación mueve `sessionsRemaining` sin escribir ahí.",

  gaps: [],
};

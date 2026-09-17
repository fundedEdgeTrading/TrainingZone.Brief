import { FLOW_SEED_TEMPLATES } from "@/lib/emails/flow-templates";

import type { FlowSeed } from "@/lib/flows/seeds/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FLUJO 1 · BIENVENIDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   Día 0  · correo de bienvenida + el formulario de alta
 *   Día 2  · tarea al entrenador si no está relleno
 *   Día 30 · correo de revisión de objetivos
 *
 * EL FORMULARIO ES EL DE M5 Y NO OTRO. La acción `SEND_FORM` del motor delega
 * en `member-forms.ts`, que monta el `MemberFormInvite` con su token, su
 * caducidad y su correo. Aquí solo se elige el hito: `INITIAL`, que es el del
 * alta. Montar un segundo formulario habría dejado dos puertas al mismo dato y
 * ninguna de las dos alimentando la ficha.
 *
 * SALEN DOS CORREOS EL DÍA 0 Y ESO ES A PROPÓSITO (es como `engine.ts` ejecuta
 * `SEND_FORM`): el de bienvenida, que es el que pasa por el tope semanal y
 * lleva su pie de baja, y la invitación del formulario, que es transaccional y
 * lleva el enlace firmado. El segundo NO gasta cupo porque no es una
 * comunicación comercial: es el trámite del alta que el socio acaba de
 * contratar. Y en modo borrador el motor NO manda la invitación real — solo el
 * ensayo de la bienvenida —, que es justo lo que el borrador viene a evitar.
 *
 * ---------------------------------------------------------------------------
 * LA ESPERA SE CUENTA DESDE EL PASO ANTERIOR, no desde el alta
 * ---------------------------------------------------------------------------
 * `FlowStep.waitDays` es el hueco hasta el paso siguiente. Por eso el paso del
 * día 30 lleva `waitDays: 28`: el paso anterior corrió el día 2. Escribir aquí
 * 30 mandaría el correo de revisión el día 32 y nadie lo notaría en pantalla.
 */
export const BIENVENIDA_SEED: FlowSeed = {
  seedKey: "bienvenida",
  order: 1,
  name: "1 · Bienvenida",
  description:
    "Al alta: correo de bienvenida y formulario de alta el mismo día, tarea al entrenador a los dos días si no " +
    "está relleno, y a los treinta días una revisión de objetivos. Es el que evita que la primera sesión se " +
    "plantee a ciegas.",

  // `Member.joinedAt`, tal y como lo cuenta el listado de socios. El disparador
  // mira una ventana de siete días hacia atrás, así que una pasada perdida del
  // cron no deja a nadie fuera para siempre.
  trigger: { type: "MEMBER_JOINED", config: {} },

  // Sin condición de entrada: el alta nueva es el alta nueva. Acotarlo por plan
  // o por etiqueta dejaría fuera precisamente al socio que todavía no tiene
  // ninguna de las dos cosas el día que entra por la puerta.
  conditions: [],

  steps: [
    {
      branch: "MAIN",
      position: 0,
      waitDays: 0,
      actionType: "SEND_FORM",
      actionConfig: {
        // El hito del alta. `member-forms.ts` lo resuelve contra la
        // configuración de valoraciones del centro, así que un centro que haya
        // renombrado su hito inicial sigue funcionando.
        milestoneKey: "INITIAL",
        subject: FLOW_SEED_TEMPLATES.bienvenidaDia0.subject,
        bodyText: FLOW_SEED_TEMPLATES.bienvenidaDia0.bodyText,
        ctaLabel: FLOW_SEED_TEMPLATES.bienvenidaDia0.ctaLabel,
        ctaPath: FLOW_SEED_TEMPLATES.bienvenidaDia0.ctaPath,
        templateKey: FLOW_SEED_TEMPLATES.bienvenidaDia0.key,
      },
    },
    {
      branch: "MAIN",
      position: 1,
      waitDays: 2,
      actionType: "CREATE_TASK",
      actionConfig: {
        title: "Alta nueva: comprueba el formulario",
        body:
          "Se dio de alta hace dos días. Mira en su ficha si ha rellenado el formulario de alta; si no, llámale y " +
          "lo rellenáis por teléfono en cinco minutos. Sin eso, la primera sesión se plantea a ciegas.",
        dueInDays: 1,
      },
    },
    {
      branch: "MAIN",
      position: 2,
      // 28 días DESDE EL PASO ANTERIOR, que corrió el día 2. Total: día 30.
      waitDays: 28,
      actionType: "SEND_EMAIL",
      actionConfig: {
        subject: FLOW_SEED_TEMPLATES.bienvenidaDia30.subject,
        bodyText: FLOW_SEED_TEMPLATES.bienvenidaDia30.bodyText,
        ctaLabel: FLOW_SEED_TEMPLATES.bienvenidaDia30.ctaLabel,
        ctaPath: FLOW_SEED_TEMPLATES.bienvenidaDia30.ctaPath,
        templateKey: FLOW_SEED_TEMPLATES.bienvenidaDia30.key,
      },
    },
  ],

  goalKind: "FORM_COMPLETED",
  goalRationale:
    "Este flujo existe para que la ficha del socio nuevo deje de estar vacía, así que el objetivo es el " +
    "formulario relleno y no «que abra el correo» ni «que venga». Se mide contra dos datos que ya existen: la " +
    "invitación de M5 marcada como completada y la parte del socio de su valoración inicial.",

  gaps: [
    {
      kind: "condicion",
      falta:
        "Una condición «todavía no ha rellenado el formulario de alta» para colgarla del paso del día 2.",
      afecta: "Paso 2 · la tarea al entrenador.",
      duenio:
        "`FlowConditionType` es un enum cerrado de `prisma/schema.prisma` (congelado) y las condiciones las " +
        "evalúa `src/lib/flows/conditions.ts`, que es de E2.",
      mientrasTanto:
        "La tarea se abre para TODA alta nueva y su texto dice «comprueba si lo ha rellenado», que es verdad " +
        "en los dos casos. No se abre más de una por socio —la clave de deduplicación es inscripción + paso—, " +
        "pero el entrenador mira algunas fichas que ya estaban rellenas.",
      salidas: [
        "A · una etiqueta automática nueva del motor de E1 («Formulario de alta pendiente», que el propio motor quita al rellenarse) y aquí una condición TAG. No toca esquema y es la barata.",
        "B · un valor nuevo en FlowConditionType (FORM_PENDING). Toca prisma/schema.prisma, que está congelado: hay que pedírselo a S2.",
      ],
    },
  ],
};

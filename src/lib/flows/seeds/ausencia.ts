import { FLOW_SEED_TEMPLATES } from "@/lib/emails/flow-templates";

import { PLAN_TYPE_VALUES } from "@/lib/flows/validate";
import type { FlowSeed } from "@/lib/flows/seeds/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FLUJO 3 · AUSENCIA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   2 semanas sin sesión, pagando · correo al socio + tarea al entrenador
 *   3 semanas                     · aviso al director
 *
 * EL DATO DE «DOS SEMANAS SIN VENIR» ES UNO SOLO. El disparador
 * `SESSIONS_ABSENCE` del motor lee `lastAttendanceByMember`, que es exactamente
 * la misma consulta que alimenta la columna «última visita» del listado de
 * socios y la etiqueta automática «2 semanas sin venir» de E1. Aquí NO se
 * calcula una segunda vez: dos criterios distintos para la misma frase harían
 * que la etiqueta y este flujo contestaran cosas distintas sobre el mismo socio
 * y nadie sabría cuál mira dirección.
 *
 * ---------------------------------------------------------------------------
 * «PAGANDO» · qué significa aquí, y por qué se escribe como se escribe
 * ---------------------------------------------------------------------------
 * El encargo dice «2 semanas sin sesión PAGANDO», y eso es lo que separa a quien
 * paga y no viene —que es dinero que se va a ir— de quien ya está congelado o de
 * baja, a quien este correo le sentaría fatal.
 *
 * La condición se escribe con `PLAN_TYPE` y TODOS los tipos de plan, que sobre
 * el fotograma del socio (`conditions.ts`) significa literalmente «tiene al
 * menos una suscripción ACTIVA»: `FlowMemberFacts.planTypes` se carga solo con
 * las suscripciones vivas, así que un socio sin ninguna no casa con ninguna
 * lista. Es rodeo, sí, y está escrito aquí para que nadie lo lea como un
 * descuido: hoy el catálogo no tiene una condición «tiene suscripción activa» y
 * esta expresa lo mismo con lo que hay. Va declarada abajo como hueco.
 *
 * El disparador ya deja fuera a los exclientes por su cuenta —solo mira estados
 * que siguen «en los libros»—, pero un CONGELADO sí entraría, y un congelado por
 * viaje o por lesión lleva dos semanas sin venir a propósito. La condición lo
 * resuelve: congelar en Stripe es `pause_collection` y la suscripción pasa a
 * `PAUSED`, así que deja de contar como activa.
 */
export const AUSENCIA_SEED: FlowSeed = {
  seedKey: "ausencia-2-semanas",
  order: 3,
  name: "3 · Ausencia",
  description:
    "A las dos semanas sin pisar la sala, estando al corriente: correo al socio y tarea al entrenador para que " +
    "llame. A las tres semanas, aviso al director. Es el flujo que se come la mitad de las bajas si llega a tiempo.",

  // Los días van en `triggerConfig.days`, que es lo que valida el catálogo del
  // motor (mínimo 3, máximo 365). Catorce: las dos semanas del encargo.
  trigger: { type: "SESSIONS_ABSENCE", config: { days: 14 } },

  // Ver la nota larga de arriba: esto es «tiene suscripción activa».
  conditions: [{ type: "PLAN_TYPE", config: { planTypes: PLAN_TYPE_VALUES } }],

  steps: [
    {
      branch: "MAIN",
      position: 0,
      waitDays: 0,
      actionType: "SEND_EMAIL",
      actionConfig: {
        subject: FLOW_SEED_TEMPLATES.ausencia.subject,
        bodyText: FLOW_SEED_TEMPLATES.ausencia.bodyText,
        ctaLabel: FLOW_SEED_TEMPLATES.ausencia.ctaLabel,
        ctaPath: FLOW_SEED_TEMPLATES.ausencia.ctaPath,
        templateKey: FLOW_SEED_TEMPLATES.ausencia.key,
      },
    },
    {
      branch: "MAIN",
      position: 1,
      // El mismo día que el correo. Una tarea no manda correo al socio, así que
      // ni gasta cupo ni espera a las 8:00: no molesta a nadie.
      waitDays: 0,
      actionType: "CREATE_TASK",
      actionConfig: {
        title: "Dos semanas sin venir: llámale",
        body:
          "Lleva dos semanas sin pisar la sala y acaba de salirle el correo. Llámale hoy o mañana: tienes su " +
          "teléfono en su ficha. Una llamada a las dos semanas recupera; a las seis, ya no.",
        dueInDays: 2,
      },
    },
    {
      branch: "MAIN",
      position: 2,
      // Siete días después: la tercera semana del encargo.
      waitDays: 7,
      actionType: "NOTIFY_DIRECTOR",
      actionConfig: {
        title: "Tres semanas sin venir",
        body:
          "Van tres semanas sin venir y la llamada del entrenador no lo ha traído de vuelta. A partir de aquí la " +
          "baja es lo normal: si hay algo que ofrecer —congelar el mes, cambiar de horario, cambiar de " +
          "modalidad—, es ahora.",
      },
    },
  ],

  goalKind: "TRAINED_AGAIN",
  goalRationale:
    "Aquí el objetivo no admite discusión: el flujo existe para que el socio vuelva, así que se cumple cuando " +
    "hay una reserva ATTENDED posterior a la fecha del correo. Ni el clic ni la respuesta valen — se puede " +
    "contestar «la semana que viene voy» y no ir.",

  gaps: [
    {
      kind: "dato-por-socio",
      falta: "El TELÉFONO del socio dentro del cuerpo de la tarea, como pide el encargo.",
      afecta: "Paso 2 · la tarea al entrenador.",
      duenio:
        "`createTask` en `src/lib/flows/actions.ts` (E2) escribe `body` tal cual desde `actionConfig`, que es " +
        "texto fijo. La `Notification` que crea tampoco guarda el `memberId`, así que la tarea no enlaza con la ficha.",
      mientrasTanto:
        "El título de la tarea ya lleva el nombre del socio —se lo pega el motor— y el cuerpo dice dónde está " +
        "el teléfono. El entrenador da un clic de más; no se queda sin saber a quién llamar.",
      salidas: [
        "A · que `createTask` admita un puñado de huecos del socio (nombre, teléfono, última visita) y los sustituya al escribir la tarea. Es la barata y no toca esquema.",
        "B · que la `Notification` de flujo guarde el `memberId` y la pantalla de tareas enlace con la ficha. Sirve para todas las tareas de flujo, no solo para esta.",
      ],
    },
    {
      kind: "condicion",
      falta: "Una condición «tiene una suscripción activa», que es lo que el encargo llama «pagando».",
      afecta: "La condición de entrada.",
      duenio: "`FlowConditionType` es un enum cerrado de `prisma/schema.prisma`, congelado.",
      mientrasTanto:
        "Se escribe como `PLAN_TYPE` con todos los tipos, que sobre el fotograma del socio significa " +
        "exactamente eso. Funciona, pero se lee peor: por eso está aquí escrito y no solo en un comentario.",
      salidas: [
        "A · dejarlo así. Es correcto y no cuesta nada; solo hay que no borrarlo por creer que sobra.",
        "B · un valor nuevo en FlowConditionType (HAS_ACTIVE_SUBSCRIPTION). Toca esquema: hay que pedírselo a S2.",
      ],
    },
  ],
};

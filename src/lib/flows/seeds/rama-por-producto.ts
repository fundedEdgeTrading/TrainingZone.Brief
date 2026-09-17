import { FLOW_SEED_TEMPLATES } from "@/lib/emails/flow-templates";

import { WEEKLY_EMAIL_CAP_DAYS } from "@/lib/flows/safety";
import type { FlowSeed, FlowSeedGap } from "@/lib/flows/seeds/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FLUJO 2 · RAMA POR PRODUCTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   Etiqueta «Grupo reducido»          → horarios y cómo funciona la sala
 *   Etiqueta «Entrenamiento personal»  → otro contenido
 *
 * SON DOS FLUJOS Y NO UNO CON DOS RAMAS, y eso no es un atajo: las ramas del
 * motor (`ON_CLICK`, `ON_REPLY`, `ON_NO_REPLY`) son REACCIONES A UN CORREO, no
 * una bifurcación por segmento. Bifurcar por producto es lo que hace la
 * CONDICIÓN DE ENTRADA, y dos condiciones distintas son dos flujos. Es lo mismo
 * que dice el editor de las condiciones: todas se cumplen a la vez (Y lógico), y
 * un O lógico son dos flujos.
 *
 * LAS DOS ETIQUETAS LAS MANTIENE EL MOTOR DE E1 y aquí se consultan POR CLAVE,
 * nunca por rótulo: renombrar «Grupo reducido» en `/etiquetas` no puede dejar
 * este flujo apuntando a nada. Las claves (`grupo_reducido`,
 * `entrenamiento_personal`) son el contrato que E1 dejó escrito en `tags.ts`, y
 * las dos salen del plan contratado (`ServiceKind`), que ya es fuente única.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EL DISPARADOR ES EL ALTA, Y POR QUÉ EL CORREO SALE A LOS SIETE DÍAS
 * ---------------------------------------------------------------------------
 * No hay disparador de «etiqueta puesta» y no hace falta: las dos etiquetas se
 * derivan del plan contratado, así que llegan con el alta. El disparador es
 * `MEMBER_JOINED` y la etiqueta se comprueba EL DÍA DEL ENVÍO, no el del alta
 * —la condición de entrada se evalúa al inscribir y la del paso, al ejecutarlo—,
 * con lo que la pasada del motor de E1 ha tenido tiempo de sobra de ponerla.
 *
 * Y la espera es de SIETE días a propósito, que es el tope semanal del motor: el
 * día 0 el socio ya recibe la bienvenida, así que este correo se pone justo
 * donde el cupo vuelve a estar libre. Un flujo que necesite saltarse el tope
 * está mal diseñado; este no lo necesita, se coloca detrás. Si aun así coincide
 * con otro, el motor lo aplaza y llega más tarde — ni se manda a destiempo ni
 * se pierde.
 */
const ESPERA_DIAS = WEEKLY_EMAIL_CAP_DAYS;

/**
 * EL HUECO DE LOS DOS: el centro no tiene dónde escribir SUS normas.
 *
 * El encargo pide «horarios y normas de sala». Los horarios se resuelven sin
 * inventar nada: el correo no da ninguna hora y manda al portal, donde están
 * las sesiones de verdad y al día. Las NORMAS no tienen campo en ningún sitio
 * —`Center` tiene `description` y `openingHours`, y ninguna de las dos es eso—,
 * así que el texto dice las tres que valen en cualquier sala (llegar cinco
 * minutos antes, cancelar en cuanto se sepa, recoger el material) y remite al
 * entrenador para el resto. NO SE INVENTAN LAS DE ESTE CENTRO.
 */
const SIN_NORMAS_DE_SALA: FlowSeedGap = {
  kind: "dato-del-centro",
  falta: "Un sitio donde el centro escriba SUS normas de sala para que el correo las lleve.",
  afecta: "El cuerpo del correo de grupo reducido.",
  duenio: "`Center` no tiene ese campo (`prisma/schema.prisma`, congelado), y la pantalla sería de /organization.",
  mientrasTanto:
    "El texto dice las tres normas que valen en cualquier sala y remite al entrenador para lo demás. Ningún " +
    "horario va escrito en el correo: manda al portal, que es donde están los de verdad.",
  salidas: [
    "A · un campo de texto libre en la ficha del centro que la semilla copie al sembrar. Toca esquema: hay que pedírselo a S2.",
    "B · dejarlo así y que cada centro edite el cuerpo del correo desde el editor de flujos, que ya lo permite. No cuesta nada y funciona hoy.",
  ],
};

export const GRUPO_REDUCIDO_SEED: FlowSeed = {
  seedKey: "producto-grupo-reducido",
  order: 2,
  name: "2a · Rama por producto · grupo reducido",
  description:
    "A quien entra con la etiqueta «Grupo reducido»: dónde están los horarios, cómo se reserva y cómo funciona " +
    "la sala. Sale a los siete días del alta, justo cuando el cupo semanal que gastó la bienvenida vuelve a estar libre.",

  trigger: { type: "MEMBER_JOINED", config: {} },

  conditions: [{ type: "TAG", config: { tagKey: "grupo_reducido" } }],

  steps: [
    {
      branch: "MAIN",
      position: 0,
      waitDays: ESPERA_DIAS,
      actionType: "SEND_EMAIL",
      actionConfig: {
        subject: FLOW_SEED_TEMPLATES.grupoReducido.subject,
        bodyText: FLOW_SEED_TEMPLATES.grupoReducido.bodyText,
        ctaLabel: FLOW_SEED_TEMPLATES.grupoReducido.ctaLabel,
        ctaPath: FLOW_SEED_TEMPLATES.grupoReducido.ctaPath,
        templateKey: FLOW_SEED_TEMPLATES.grupoReducido.key,
      },
    },
  ],

  goalKind: "TRAINED_AGAIN",
  goalRationale:
    "El correo explica cómo se reserva, así que lo que prueba que sirvió es que el socio APAREZCA: una reserva " +
    "asistida posterior al envío. El clic solo diría que abrió el horario; esto dice que vino.",

  gaps: [SIN_NORMAS_DE_SALA],
};

export const ENTRENAMIENTO_PERSONAL_SEED: FlowSeed = {
  seedKey: "producto-entrenamiento-personal",
  order: 2,
  name: "2b · Rama por producto · entrenamiento personal",
  description:
    "A quien entra con la etiqueta «Entrenamiento personal»: cómo se mueve una hora, qué contarle al entrenador " +
    "y dónde ve sus sesiones. Sale a los siete días del alta, por lo mismo que su gemelo de grupos.",

  trigger: { type: "MEMBER_JOINED", config: {} },

  conditions: [{ type: "TAG", config: { tagKey: "entrenamiento_personal" } }],

  steps: [
    {
      branch: "MAIN",
      position: 0,
      waitDays: ESPERA_DIAS,
      actionType: "SEND_EMAIL",
      actionConfig: {
        subject: FLOW_SEED_TEMPLATES.entrenamientoPersonal.subject,
        bodyText: FLOW_SEED_TEMPLATES.entrenamientoPersonal.bodyText,
        ctaLabel: FLOW_SEED_TEMPLATES.entrenamientoPersonal.ctaLabel,
        ctaPath: FLOW_SEED_TEMPLATES.entrenamientoPersonal.ctaPath,
        templateKey: FLOW_SEED_TEMPLATES.entrenamientoPersonal.key,
      },
    },
  ],

  goalKind: "TRAINED_AGAIN",
  goalRationale:
    "Igual que en grupos: el correo sirve si el socio entrena. Una reserva asistida posterior al envío es la " +
    "única de las tres cifras que dice que la sesión ocurrió.",

  gaps: [SIN_NORMAS_DE_SALA],
};

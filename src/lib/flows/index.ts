/**
 * E2 · Motor de flujos de email marketing — punto de entrada del módulo.
 *
 * ESTE FICHERO LO DEJA PUESTO S2 Y LO LLENA E2. Está aquí, vacío y con firma,
 * para que las pistas que arrancan a la vez no se peleen por crear el
 * directorio. E3 monta sus seis flujos ENCIMA de esto y no lo modifica: si E3
 * necesita algo que el motor no hace, para y lo pide — cambiarlo por su cuenta
 * rompe las reglas de seguridad que E2 probó una por una.
 *
 * LA ESTRUCTURA ES FIJA y el editor no debe permitir nada más:
 *
 *     DISPARADOR → CONDICIÓN → ESPERA → ACCIÓN
 *
 * Los catálogos de cada pieza son enums de Prisma —`FlowTriggerType`,
 * `FlowConditionType`, `FlowActionType`, `FlowBranch`—, cerrados a propósito.
 *
 * Las ramas son `ON_CLICK`, `ON_REPLY` y `ON_NO_REPLY`. Negocio pidió «si
 * abre»: NO se mide la apertura en fase 1. Exige un píxel de traza y con él un
 * CMP con «rechazar todo» al mismo nivel visual que «aceptar todo» EN EL MISMO
 * CAMBIO (AGENTS.md), y eso es un módulo propio que afecta a toda la web. La
 * decisión está cerrada en el plan: se mide el CLIC, que el enlace es nuestro.
 *
 * ---------------------------------------------------------------------------
 * LAS SEIS REGLAS DE SEGURIDAD. Van desde el primer commit, no al final.
 * ---------------------------------------------------------------------------
 *
 *  1. MÁXIMO 1 EMAIL POR SOCIO Y SEMANA, ENTRE TODOS LOS FLUJOS. Es un cerrojo
 *     GLOBAL y es la regla que decide la arquitectura: si cada flujo decide por
 *     su cuenta, dos flujos que disparan el mismo día mandan dos correos. UN
 *     ÚNICO PUNTO DE SALIDA por el que pasa TODO envío de flujo, que consulta
 *     `FlowEmailLog` (índice `memberId, sentAt`) y RESERVA el hueco insertando
 *     la fila en la MISMA transacción que el envío.
 *     QUÉ CUENTA PARA EL TOPE, escrito aquí y no en la cabeza de nadie: solo el
 *     correo de flujo que llegó de verdad al socio (`testMode = false`). El
 *     correo transaccional que ya existe —recordatorio de sesión, preaviso
 *     SEPA, cobro fallido— NO cuenta: es la ejecución del servicio contratado,
 *     no una comunicación comercial, y silenciarlo dejaría al socio sin poder
 *     pagar ni entrar.
 *  2. NADA ENTRE 22:00 Y 8:00. Por eso el motor es UNA COLA y no un «enviar
 *     ahora»: el cron puede pasar a las 23:00, y lo que toque entonces se
 *     reprograma a las 8:00 — ni se manda ni se pierde. La hora es la DEL
 *     CENTRO (`Center.timezone` vía `timezone.ts`), no la del servidor: la
 *     ventana de cancelación ya se leyó mal una vez por esto.
 *  3. UN SOCIO NO REPITE EL MISMO FLUJO HASTA 90 DÍAS DESPUÉS. Se contesta con
 *     `FlowEnrollment` y su índice `(memberId, flowId, enrolledAt)`.
 *  4. PAUSA GLOBAL: `Organization.flowsPausedAt`. Para todos los flujos al
 *     instante, y lo encolado NO se pierde — `nextRunAt` se queda donde estaba.
 *  5. MODO BORRADOR: un flujo en `DRAFT` se ejecuta de verdad, pero todo envío
 *     va a `Organization.flowsTestEmail`. Es la única forma de probar esto sin
 *     escribir a 49 socios.
 *  6. Y la que ya es ley y ya está resuelta en el repositorio: TODO envío pasa
 *     por `canSendMemberEmail("marketing", …)`, que comprueba `consentMarketing`
 *     y la baja global. Si un flujo puede saltársela, el módulo es ilegal
 *     (art. 21 RGPD y art. 21 LSSI). El enlace de baja ya lo pone el pie de
 *     plantilla y las cabeceras `List-Unsubscribe` ya las pone `mailer.ts`: no
 *     se monta un segundo sistema de bajas.
 *
 * Los topes (1 por semana, 90 días) NO son columnas configurables, a propósito:
 * una regla de seguridad que se afloja desde una pantalla deja de serlo.
 *
 * ---------------------------------------------------------------------------
 * EL MAPA DEL MÓDULO · qué hace cada fichero
 * ---------------------------------------------------------------------------
 * PUROS (sin Prisma, con el reloj inyectado, probados sin base de datos):
 *
 *   safety.ts      LAS SEIS REGLAS. `decideFlowSend` es la decisión completa y
 *                  `nextAllowedSendAt` la ventana de silencio del CENTRO.
 *   catalog.ts     Las cuatro piezas, con de dónde sale la señal de cada
 *                  disparador. `catalog` lo importa también el editor.
 *   validate.ts    `validateFlow`: que NO se pueda construir un flujo inválido.
 *   conditions.ts  Las condiciones, sobre un fotograma del socio.
 *   branching.ts   Las tres ramas. Y por qué «si responde» no tiene señal hoy.
 *
 * CON BASE DE DATOS:
 *
 *   engine.ts      `sendFlowEmail` es EL ÚNICO PUNTO DE SALIDA: consulta el
 *                  registro y RESERVA el hueco en la misma transacción, con la
 *                  fila del socio bloqueada. `runFlowQueue` es la pasada del
 *                  cron; `enrollMember` la puerta de entrada, con la regla 3.
 *   triggers.ts    Los disparadores CABLEADOS a las señales que ya existen.
 *   actions.ts     Las acciones que no escriben al socio, delegando en el
 *                  módulo que ya sabe hacer cada cosa.
 *   queries.ts     Listado, edición, pausa global y buzón de pruebas, CON EL
 *                  ÁMBITO DE CENTRO DENTRO.
 *   panel.ts       El armazón del embudo y el hueco TIPADO del objetivo, que
 *                  rellena E3.
 *   click-tokens.ts El enlace firmado que sostiene «si hace clic» sin píxel.
 *
 * Los DISPARADORES ya existen como señal calculada y se CABLEAN, no se
 * recalculan: alta (`Member.joinedAt`), ausencia (`retention.ts` +
 * `lastAttendanceByMember`, y E1 ya tiene la etiqueta), bono bajo
 * (`runLowPackBalanceRule`), recibo fallido (`stripe-dunning.ts` /
 * `Member.delinquentSince`), cambio de estado (`member-lifecycle.ts`, M4),
 * cumpleaños (`birthday-jobs.ts`), formulario respondido (`member-forms.ts`,
 * M5) y valoración (`TrainerRating` / `Assessment`).
 *
 * ---------------------------------------------------------------------------
 * PARA E3 · dos detalles de vocabulario antes de montar las semillas
 * ---------------------------------------------------------------------------
 * `src/lib/flows/seeds/referral-90-days.ts` lo dejó escrito R1 ANTES de que
 * este motor existiera, así que su tipo `FlowSeed` es suyo y no coincide del
 * todo con el del motor. Se dice aquí para que no se descubra depurando:
 *
 *   · la ESPERA de un paso es `FlowStep.waitDays`, en DÍAS, no en horas. La
 *     semilla la escribe como `waitHours: 90 * 24`; son 90 días.
 *   · la condición `TENURE` se configura con `{ months, direction: "min" |
 *     "max" }`, no con `minMonths`.
 *
 * Y el hueco que R1 deja abierto —«valoración de 8 o más», que hoy no cabe en
 * `FlowConditionType`— sigue abierto: `RATING_BELOW` es un DISPARADOR y es lo
 * contrario de lo que pide ese flujo. La salida A que recomienda R1 (una
 * etiqueta automática de E1 y aquí una condición `TAG`) no toca esquema y
 * funciona con este motor tal cual está.
 *
 * LO QUE NO TIENE SEÑAL HOY, dicho aquí y no descubierto por quien venga
 * detrás: «SI RESPONDE». En este repositorio no hay recepción de correo
 * entrante —`mailer.ts` manda por la API de Brevo con un `Reply-To` del
 * centro—, así que la respuesta del socio llega al buzón del gimnasio y no a la
 * aplicación. `FlowEmailLog.repliedAt` solo lo marca una persona
 * (`markFlowEmailReplied`), y el editor lo avisa al elegir esa rama. No se
 * inventa la señal: eso sería peor que no tener la rama.
 */

export {
  runFlowQueue,
  runFlowEngineRule,
  enrollMember,
  sendFlowEmail,
  recordFlowEmailClick,
  markFlowEmailReplied,
  type FlowRunReport,
} from "@/lib/flows/engine";

export { validateFlow, type FlowDraft, type FlowValidationResult } from "@/lib/flows/validate";

export {
  decideFlowSend,
  nextAllowedSendAt,
  isWithinQuietHours,
  canEnrollAgain,
  WEEKLY_CAP_DEFINITION,
  WEEKLY_EMAIL_CAP_DAYS,
  FLOW_REENTRY_DAYS,
  QUIET_HOURS_START,
  QUIET_HOURS_END,
} from "@/lib/flows/safety";

export {
  flowFunnel,
  refreshFlowGoals,
  registerFlowGoalResolver,
  type FlowFunnel,
  type FlowGoalResolver,
} from "@/lib/flows/panel";

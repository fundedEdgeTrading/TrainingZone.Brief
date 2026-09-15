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
 * LO QUE FALTA POR ESCRIBIR, con la forma acordada
 * ---------------------------------------------------------------------------
 * Se deja como contrato en prosa y no como export declarado sin implementar:
 * un `declare const` es `undefined` en ejecución sin que TypeScript proteste.
 *
 *   runFlowQueue(now: Date, opts?: { orgId?: string }): Promise<FlowRunReport>
 *     Una pasada del cron sobre la cola. Lee `FlowEnrollment` por
 *     `(status, nextRunAt)`, aplica las seis reglas y avanza. Con el reloj
 *     INYECTADO: las reglas se prueban sin base de datos.
 *
 *   enrollMember(flowId: string, memberId: string, now: Date): Promise<…>
 *     La puerta de entrada, con la regla 3 dentro.
 *
 *   sendFlowEmail(…): Promise<…>
 *     EL ÚNICO PUNTO DE SALIDA. Regla 1 y regla 6 dentro, en la misma
 *     transacción. Nada más en el repositorio manda correo de flujo.
 *
 *   validateFlow(draft): FlowValidationResult
 *     Que NO se pueda construir un flujo inválido. Se valida en el servidor,
 *     no solo en el formulario.
 *
 * Los DISPARADORES ya existen como señal calculada y se CABLEAN, no se
 * recalculan: alta (`Member.joinedAt`), ausencia (`retention.ts` +
 * `lastAttendanceByMember`, y E1 ya tiene la etiqueta), bono bajo
 * (`runLowPackBalanceRule`), recibo fallido (`stripe-dunning.ts` /
 * `Member.delinquentSince`), cambio de estado (`member-lifecycle.ts`, M4),
 * cumpleaños (`birthday-jobs.ts`), formulario respondido (`member-forms.ts`,
 * M5) y valoración (`TrainerRating` / `Assessment`).
 */

export {};

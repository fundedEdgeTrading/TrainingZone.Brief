/**
 * M2 · Bonos por centro: canjeadas, restantes y caducidad.
 *
 * ESTE FICHERO LO DEJA PUESTO S2 Y LO LLENA M2.
 *
 * «Un bono acabándose es el momento de venta». Hoy el saldo está en la ficha de
 * cada socio y no está sumado en ninguna parte. Esto es agregar y pintar: NO
 * necesita esquema nuevo, `SessionLedger` lleva desde el lote 2 registrando
 * cada movimiento con su motivo, caducidad incluida.
 *
 * LAS CANJEADAS Y LAS DEVOLUCIONES SALEN DE `SessionLedger`, no de restar
 * `sessionsRemaining` a `sessionsIncluded`. Esa resta vuelve a fallar con los
 * bonos ajustados a mano, que es EXACTAMENTE el fallo que `SessionLedger` vino
 * a arreglar: lee el comentario de `Subscription.sessionsIncluded` (RB-RES-006)
 * antes de escribir la primera línea.
 *
 * LOS BONOS ILIMITADOS tienen `sessionsRemaining` null y TAMBIÉN dejan asiento
 * (`SessionLedger.balanceAfter` null). Cuéntalos aparte; no los sumes como
 * ceros.
 *
 * Respeta `DashboardOpts` (`centerId`/`centerIds`/`range`) como el resto del
 * panel, y el ámbito de centro vía `center-scope.ts`. Sin excepciones.
 *
 * ---------------------------------------------------------------------------
 * LO QUE FALTA POR ESCRIBIR, con la forma acordada
 * ---------------------------------------------------------------------------
 *
 *   getPackSummaryByCenter(opts: DashboardOpts): Promise<PackSummary[]>
 *     Por centro: sesiones CANJEADAS (asientos negativos de `SessionLedger` con
 *     motivo `BOOKING`), RESTANTES, ilimitados aparte, y CADUCIDAD — los que
 *     caducan en los próximos 30 días y los ya caducados sin consumir.
 *
 *   getPacksRunningOut(opts: DashboardOpts): Promise<…>
 *     La lista accionable: los bonos a punto de acabarse, que es lo que de
 *     verdad se mira.
 *
 * La agregación contra `SessionLedger` es aritmética pura y se prueba sin base
 * de datos. Escribe esos tests.
 */

export {};

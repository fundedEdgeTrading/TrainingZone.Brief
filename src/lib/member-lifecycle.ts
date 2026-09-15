/**
 * M4 · Tipos de persona: el ÚNICO punto de escritura de las transiciones de
 * estado de un socio.
 *
 * ESTE FICHERO LO DEJA PUESTO S2 Y LO LLENA M4.
 *
 * SON CUATRO TIPOS, NO TRES. Negocio pidió tres juntando congelado y
 * suspendido; van separados y la decisión está cerrada en el plan:
 *
 *   Cliente     → `MemberState.ACTIVE`
 *   Congelado   → `MemberState.FROZEN`      (voluntario: agosto, viaje, lesión)
 *   Suspendido  → `MemberState.DELINQUENT`  (impago)
 *   Excliente   → `MemberState.CANCELLED`
 *
 * Congelado e impago se separaron A PROPÓSITO en HU-ST-14 porque la lista de
 * morosos incluía a quien estaba de vacaciones, y volver a juntarlos deshace
 * ese arreglo y rompe el flujo 5 de E3, que necesita saber quién debe dinero.
 * EN LA PANTALLA se pueden agrupar bajo un rótulo; por dentro siguen siendo dos.
 * El enum `MemberState` no se toca.
 *
 * LOS DOS MOTIVOS SON OBLIGATORIOS, con el mismo patrón que `NoCloseReason` en
 * leads (RB-LEAD-011), que ya lo hace así. Sin motivo no hay campaña de
 * reactivación de septiembre que valga — ese es el uso real de esto, y es el
 * flujo 6 de E3: un excliente que se fue por mudanza no recibe lo mismo que uno
 * que se fue por precio.
 *
 *   Al CONGELAR: `Member.freezeReasonId` (catálogo `FreezeReason`) y
 *   `Member.frozenAt`. La FECHA DE VUELTA PREVISTA ya tiene sitio natural,
 *   `Subscription.pauseUntil`: úsalo, no dupliques la verdad. Por eso no hay
 *   columna de «vuelve el» en `Member`.
 *
 *   Al DAR DE BAJA: `Member.cancelReasonId` (catálogo `CancelReason`). La fecha
 *   ya es `Member.cancelledAt`.
 *
 * Los dos catálogos son por organización y editables sin desplegar, y se
 * referencian por CLAVE AJENA y no por texto copiado —a diferencia de
 * `Lead.channel`— justamente para que renombrar una entrada no deje huérfana la
 * segmentación del flujo 6.
 *
 * SOLO UN PUNTO DE ESCRITURA POR TRANSICIÓN. Hoy el estado se cambia desde
 * varios sitios: la ficha del socio, cobros, el cron de cancelaciones
 * programadas y el webhook de Stripe. BÚSCALOS TODOS antes de escribir nada:
 * una transición que no pase por aquí es un socio sin motivo, y el problema
 * vuelve en diciembre. Además, R1 y E2 se enganchan a este módulo —el código de
 * referido caduca con la baja, y el disparador «cambio de estado» de los flujos
 * lee de aquí—, así que un update suelto en otro fichero se los salta a los dos.
 *
 * ---------------------------------------------------------------------------
 * LO QUE FALTA POR ESCRIBIR, con la forma acordada
 * ---------------------------------------------------------------------------
 *
 *   freezeMember(user, memberId, { reasonId, resumeOn }): Promise<…>
 *   cancelMember(user, memberId, { reasonId }): Promise<…>
 *   reactivateMember(user, memberId): Promise<…>
 *   markDelinquent / clearDelinquency
 *
 *   memberKindOf(member): MemberKind
 *     Los cuatro tipos para la pantalla, derivados del estado. Una sola
 *     definición compartida por el filtro de `/members`, la columna y la
 *     agrupación, para que no haya dos criterios de «quién es excliente».
 *
 * Toda transición pasa por el ámbito de centro (`isMemberInScope`) y deja
 * `AuditLog`.
 */

export {};

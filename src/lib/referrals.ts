/**
 * R1 · Referidos con recompensa — enlace, embudo y estados.
 *
 * ESTE FICHERO LO DEJA PUESTO S2 Y LO LLENA R1.
 *
 * LA REGLA QUE MANDA SOBRE TODAS LAS DEMÁS: LA RECOMPENSA NO SE APLICA SOLA.
 * Se LIBERA en el alta del referido, y liberar significa CREAR UNA TAREA a
 * administración (`Notification`, que ya tiene motor) para validarla y marcarla
 * como pagada. Este módulo NO toca un recibo, ni un `Payment`, ni un cupón de
 * Stripe, JAMÁS. Si en algún momento parece más elegante aplicar el descuento
 * automáticamente: no lo es, y es la única línea del encargo que negocio
 * subrayó. Un sistema que toca recibos por su cuenta descuadra Stripe.
 *
 * EL EMBUDO NO SE DUPLICA. Quien entra por `/r/[code]` cae en `Lead` —el que ya
 * existe—, con `channel = "Referido"` (`LeadChannel` ya es configurable sin
 * desplegar, RB-LEAD-004) y `Lead.referredByMemberId` relleno, y SIGUE EL
 * EMBUDO NORMAL. No hay segundo embudo y no hay tabla de referidos.
 *
 * LOS ESTADOS SE DERIVAN, NO SE GUARDAN. invitado → valoración hecha → alta son
 * `Lead.status` y `Lead.convertedMemberId`: un lead con fecha de valoración ya
 * es `CON_FECHA_VALORACION`, y uno cerrado ya tiene su socio. Por eso no existe
 * ninguna columna de estado del referido en el esquema, y por eso no hay que
 * añadirla: dos estados en paralelo discrepan en una semana.
 *
 * ---------------------------------------------------------------------------
 * LO QUE FALTA POR ESCRIBIR, con la forma acordada
 * ---------------------------------------------------------------------------
 *
 *   ensureReferralCode(user: ScopedUser, memberId: string): Promise<ReferralCode>
 *     Código único por socio, visible en su ficha y preparado para la app. La
 *     generación ya está resuelta en `coupon-code.ts`: no se reinventa.
 *
 *   referralStateOf(lead): ReferralState
 *     La derivación de arriba, en un solo sitio, para que el panel y la
 *     recompensa no la calculen cada uno a su manera.
 *
 *   referralFunnelFor(user: ScopedUser, memberId: string): Promise<…>
 *     Los referidos de un embajador con su estado derivado.
 *
 * Y en `referral-rewards.ts`:
 *
 *   releaseReward(leadId, beneficiary): Promise<ReferralReward>
 *     Crea la `ReferralReward` y SU TAREA. Nada más. La unicidad
 *     `(leadId, beneficiary)` de la base de datos es lo que impide dos
 *     recompensas por el mismo alta.
 *
 *   reviewReward / markRewardPaid
 *     Los dos saltos de estado, con quién y cuándo en cada uno.
 *
 * ---------------------------------------------------------------------------
 * ANTIFRAUDE: tres reglas, y la primera es más difícil de lo que parece
 * ---------------------------------------------------------------------------
 *
 *  1. UN EXCLIENTE QUE SE FUE HACE MENOS DE `exMemberCooldownDays` NO CUENTA
 *     (`ReferralProgramConfig`, 180 días por defecto — configurable, no un
 *     literal). OJO: los socios IMPORTADOS de MyWellness traen su histórico en
 *     `Member.externalRef`, `lastAccessAt` y `accountCreatedAt`, y su
 *     `cancelledAt` puede no existir. Cuando NO SE PUEDE SABER, la respuesta
 *     segura es marcar la recompensa para REVISIÓN HUMANA
 *     (`ReferralReward.reviewRequired` + `reviewReason`), nunca dejarlo pasar:
 *     sobre ese hueco no se automatiza una decisión que reparte dinero.
 *  2. UNA RECOMPENSA POR ALTA. Ni dos por el mismo referido, ni por un referido
 *     que se da de baja y vuelve. Lo sostiene el `@@unique([leadId, beneficiary])`
 *     de `ReferralReward`, en la base de datos y no solo aquí.
 *  3. EL CÓDIGO CADUCA SI EL SOCIO SE DA DE BAJA (`ReferralCode.revokedAt`).
 *     M4 centralizó las transiciones de estado en `member-lifecycle.ts`:
 *     engánchate ahí, no pongas otro sitio desde el que se cambia el estado.
 *
 * DOS COSAS QUE HAY QUE PREGUNTAR ANTES DE CONSTRUIRLAS, no inventárselas:
 *  · El coste de los ANUNCIOS, para la comparativa de coste de captación del
 *    panel. Hoy no está en ninguna parte del repositorio.
 *  · De qué modelo sale el «valoración de 8 o más» del flujo de los 90 días:
 *    `TrainerRating` y `Assessment` no son lo mismo.
 */

export {};

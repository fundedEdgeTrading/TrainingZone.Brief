/**
 * E12-09 · resolución única de destino de notificación.
 *
 * Antes había DOS resolutores parcialmente disjuntos: `ENTITY_HREF` en
 * `notification-bell.tsx` (web) y `resolutionFor` en
 * `apps/mobile/src/app/(tabs)/notificaciones.tsx`. Un aviso de `Lead` llevaba
 * a la ficha en web y a la LISTA (descartando el id) en móvil; uno de
 * `Member` llevaba a la ficha en web y a una pantalla de entrenador en móvil
 * donde recepción y dirección no entraban; `Booking`/`ClassSession`/
 * `Subscription`/`Payment` no tenían enlace en web.
 *
 * Esta tabla es la fuente de verdad para la web (se importa directamente en
 * `notification-bell.tsx`). La app móvil vive en otro runtime (Expo/React
 * Native) sin módulos compartidos con la web, así que su equivalente
 * (`apps/mobile/src/notification-routes.ts`) es una réplica deliberada de
 * esta misma tabla — `notification-routes.test.ts` (web) comprueba que las
 * dos no se desincronizan.
 */

export type NotificationEntityType =
  | "Lead"
  | "Member"
  | "MemberNoShowStreak"
  | "Booking"
  | "ClassSession"
  | "Subscription"
  | "Payment";

export const NOTIFICATION_ENTITY_TYPES: NotificationEntityType[] = [
  "Lead",
  "Member",
  "MemberNoShowStreak",
  "Booking",
  "ClassSession",
  "Subscription",
  "Payment",
];

/**
 * Destino de un aviso, según quién lo toca. `null` = sin destino (aviso solo
 * informativo, o el rol no tiene una pantalla propia para esa entidad).
 *
 * El identificador SIEMPRE viaja en el destino cuando hay uno: ningún camino
 * lo descarta, aunque la pantalla de llegada (`/billing`, `/portal/agenda`)
 * todavía no sepa usarlo para resaltar la fila exacta — eso es preferible a
 * un enlace roto y a una lista genérica que finge no saber de qué aviso vino.
 */
export function notificationHref(
  entityType: string | null,
  entityId: string | null,
  isMember: boolean
): string | null {
  if (!entityType || !entityId) return null;

  switch (entityType as NotificationEntityType) {
    case "Lead":
      // El lead es trabajo comercial de staff: el socio nunca ve leads.
      return isMember ? null : `/leads/${entityId}`;
    case "Member":
    case "MemberNoShowStreak":
      // La alerta de faltas seguidas usa entidad propia para no deduplicarse
      // contra el resto de tareas del socio (no-show-alerts.ts), pero apunta
      // a la misma ficha que "Member".
      return isMember ? null : `/members/${entityId}`;
    case "Booking":
    case "ClassSession":
      return isMember ? "/portal/agenda" : `/agenda/session/${entityId}`;
    case "Subscription":
      return isMember ? "/portal/membresia" : `/billing?subscriptionId=${entityId}`;
    case "Payment":
      return isMember ? "/portal/membresia" : `/billing?paymentId=${entityId}`;
    default:
      return null;
  }
}

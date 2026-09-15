/**
 * E12-09 · resolución única de destino de notificación.
 *
 * Réplica deliberada de `src/lib/notification-routes.ts` (web) — este
 * proyecto (Expo/React Native) no comparte módulos con la web, así que no
 * hay forma de importar la misma tabla en los dos sitios. La web tiene un
 * test (`notification-routes.test.ts`) que compara ambos ficheros para que
 * no se desincronicen.
 *
 * Aquí el "destino" es una ruta de expo-router en vez de un href de
 * Next.js: por eso el shape es distinto (`{ path, params }` en vez de un
 * string), pero el criterio — qué entidad va a qué pantalla, según el rol —
 * es exactamente el mismo.
 */
export type NotificationEntityType =
  | "Lead"
  | "Member"
  | "MemberNoShowStreak"
  | "MemberFewSessionsScheduled"
  | "MemberLowPackBalance"
  | "MemberStallRisk"
  | "AutoTaskWeeklyCap"
  | "Booking"
  | "ClassSession"
  | "Subscription"
  | "Payment";

export const NOTIFICATION_ENTITY_TYPES: NotificationEntityType[] = [
  "Lead",
  "Member",
  "MemberNoShowStreak",
  "MemberFewSessionsScheduled",
  "MemberLowPackBalance",
  "MemberStallRisk",
  "AutoTaskWeeklyCap",
  "Booking",
  "ClassSession",
  "Subscription",
  "Payment",
];

export type NotificationRoute = { path: string; params?: Record<string, string> };

/**
 * `entityId` SIEMPRE viaja en `params` cuando hay destino: antes `Lead`
 * llevaba a la lista de leads y `Member` a la de mis-socios, descartando el
 * id en los dos casos. `mis-socios/[id]` ya existe y lo usa; `leads` no
 * tiene pantalla de detalle propia, así que recibe el id como `openId` y
 * `leads.tsx` resalta esa tarjeta (`tone="accent"`) — no es una ficha
 * propia, pero ya no es "abre la lista y adivina cuál".
 */
export function notificationRoute(
  entityType: string | null,
  entityId: string | null,
  isMember: boolean
): NotificationRoute | null {
  if (!entityType || !entityId) return null;

  switch (entityType as NotificationEntityType) {
    case "Lead":
      return isMember ? null : { path: "/leads", params: { openId: entityId } };
    case "Member":
    case "MemberNoShowStreak":
    case "MemberFewSessionsScheduled":
    case "MemberLowPackBalance":
    case "MemberStallRisk":
      // E14-11: una entidad por regla para que la deduplicación distinga la
      // regla; el id sigue siendo el del socio y el destino, su ficha.
      return isMember ? null : { path: `/mis-socios/${entityId}` };
    case "AutoTaskWeeklyCap":
      // E14-12: el aviso del tope va al tablero de tareas, que en la app es
      // la pestaña `/tareas`.
      return isMember ? null : { path: "/tareas", params: { recipientUserId: entityId } };
    case "Booking":
    case "ClassSession":
      return isMember ? { path: "/sesiones" } : { path: "/panel" };
    // No hay pantalla de cobros propia en la app de staff (solo /dashboard
    // resume ingresos y morosidad): es el destino más cercano que existe.
    case "Subscription":
      return isMember ? { path: "/consumo" } : { path: "/dashboard", params: { subscriptionId: entityId } };
    case "Payment":
      return isMember ? { path: "/consumo" } : { path: "/dashboard", params: { paymentId: entityId } };
    default:
      return null;
  }
}

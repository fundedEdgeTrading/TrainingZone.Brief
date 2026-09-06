/**
 * Constructores de respuesta de la API móvil (E7-01).
 *
 * Regla del módulo: **las fixtures se escriben CONTRA EL TIPO**. Cada
 * constructor declara su retorno como el DTO de `@/api/types`, así que si el
 * servidor cambia el contrato —un campo nuevo obligatorio, uno que cambia de
 * tipo, uno que se va— el fallo aparece aquí, en `tsc`, y no en producción
 * cuando alguien abre la pestaña. Es el único sitio del proyecto donde la app
 * verifica el contrato del servidor sin hablar con él.
 *
 * Cada constructor acepta una sobrescritura parcial: un test declara solo lo
 * que le importa y el resto es un valor por defecto plausible.
 */
import type {
  AgendaResponse,
  BookableSession,
  BookingStatus,
  BriefDetailResponse,
  BriefRosterEntry,
  LoginOrganization,
  LoginResponse,
  MeResponse,
  NotificationItem,
  NotificationsResponse,
  PendingFeedback,
  ProductItem,
  ProductsResponse,
  RefreshResponse,
  Role,
  ServiceKind,
  SessionBalance,
  UpcomingBooking,
} from "@/api/types";

/** Fecha fija: una fixture con `new Date()` dentro es un test que falla de noche. */
export const TEST_TODAY = "2026-03-16";

export function meResponse(overrides: Partial<MeResponse> = {}): MeResponse {
  const role: Role = overrides.role ?? "MEMBER";
  return {
    id: "user-1",
    name: "Marina Castillo",
    email: "marina.castillo@example.com",
    image: null,
    role,
    orgId: "org-1",
    centerId: "center-1",
    theme: "LIGHT",
    member:
      role === "MEMBER"
        ? { id: "member-1", firstName: "Marina", centerName: "TRAINING ZONE La Jota", hasActiveMembership: true }
        : null,
    ...overrides,
  };
}

export function loginResponse(overrides: Partial<LoginResponse> = {}): LoginResponse {
  return {
    accessToken: "access-token-1",
    refreshToken: "refresh-token-1",
    user: meResponse(),
    ...overrides,
  };
}

export function refreshResponse(overrides: Partial<RefreshResponse> = {}): RefreshResponse {
  return { accessToken: "access-token-2", refreshToken: "refresh-token-2", ...overrides };
}

export function loginOrganization(overrides: Partial<LoginOrganization> = {}): LoginOrganization {
  return { id: "org-1", name: "TRAINING ZONE", logoUrl: null, ...overrides };
}

export function bookableSession(overrides: Partial<BookableSession> = {}): BookableSession {
  const id = overrides.id ?? "session-1";
  const occurrenceDate = overrides.occurrenceDate ?? TEST_TODAY;
  return {
    id,
    occurrenceDate,
    key: `${id}:${occurrenceDate}`,
    name: "Grupo reducido",
    classType: "GROUP",
    date: occurrenceDate,
    startTime: "19:00",
    endTime: "20:00",
    capacity: 8,
    bookedCount: 4,
    room: "Sala 1",
    trainerName: "Marcos Iglesias",
    trainerImage: null,
    centerName: "TRAINING ZONE La Jota",
    startsAt: `${occurrenceDate}T19:00:00.000Z`,
    canBook: true,
    canCancelFreely: true,
    cancelWindowHours: 24,
    myBookingId: null,
    myBookingStatus: null as BookingStatus | null,
    ...overrides,
  };
}

export function sessionBalance(overrides: Partial<SessionBalance> = {}): SessionBalance {
  const unlimited = overrides.unlimited ?? false;
  const serviceKind: ServiceKind = overrides.serviceKind ?? "GROUP";
  return {
    serviceKind,
    // El rótulo lo resuelve el SERVIDOR con la fuente única (E12-04): la app no
    // tiene tabla de nombres, ni siquiera en las fixtures. Por defecto se usa la
    // propia clave; el test que quiera comprobar el texto pasa `serviceLabel`.
    serviceLabel: serviceKind,
    remaining: unlimited ? null : 4,
    unlimited,
    used: unlimited ? null : 4,
    total: unlimited ? null : 8,
    ...overrides,
  };
}

export function upcomingBooking(overrides: Partial<UpcomingBooking> = {}): UpcomingBooking {
  return {
    bookingId: "booking-1",
    status: "BOOKED",
    waitlistPosition: null,
    sessionId: "session-1",
    occurrenceDate: TEST_TODAY,
    sessionName: "Grupo reducido",
    classType: "GROUP",
    startsAt: `${TEST_TODAY}T19:00:00.000Z`,
    dayLabel: "Lunes 16 de marzo",
    startTime: "19:00",
    endTime: "20:00",
    centerName: "TRAINING ZONE La Jota",
    room: "Sala 1",
    trainerName: "Marcos Iglesias",
    trainerImage: null,
    sessionCancelled: false,
    full: false,
    canCancelFreely: true,
    cancelWindowHours: 24,
    ...overrides,
  };
}

export function pendingFeedback(overrides: Partial<PendingFeedback> = {}): PendingFeedback {
  return {
    bookingId: "booking-0",
    sessionName: "Grupo reducido",
    sessionDate: "2026-03-13",
    time: "19:00",
    focus: "Fuerza tren inferior",
    trainerName: "Marcos Iglesias",
    ...overrides,
  };
}

export function agendaResponse(overrides: Partial<AgendaResponse> = {}): AgendaResponse {
  return {
    sessions: [bookableSession()],
    balances: [sessionBalance()],
    pendingFeedback: [],
    upcomingBookings: [],
    ...overrides,
  };
}

export function notificationItem(overrides: Partial<NotificationItem> = {}): NotificationItem {
  // Sin `as NotificationItem`: una aserción aquí desactivaría justo lo que este
  // módulo existe para hacer, que es romper cuando el contrato cambie.
  return {
    id: "notification-1",
    kind: "WAITLIST_VACANCY",
    title: "Se ha liberado una plaza",
    body: "Hay hueco en Grupo reducido del lunes a las 19:00.",
    entityType: "Session",
    entityId: "session-1",
    dueDate: null,
    resolvedAt: null,
    createdAt: `${TEST_TODAY}T08:00:00.000Z`,
    ...overrides,
  };
}

export function notificationsResponse(overrides: Partial<NotificationsResponse> = {}): NotificationsResponse {
  return { notifications: [notificationItem()], ...overrides };
}

export function productItem(overrides: Partial<ProductItem> = {}): ProductItem {
  return {
    id: "product-1",
    name: "Bono 8 sesiones",
    description: null,
    imageUrl: null,
    priceCents: 8000,
    sessionsIncluded: 8,
    validityDays: 60,
    planType: "SESSION_PACK",
    serviceKind: "GROUP",
    visible: true,
    subscribersCount: null,
    featured: false,
    ...overrides,
  };
}

export function productsResponse(overrides: Partial<ProductsResponse> = {}): ProductsResponse {
  return {
    canManage: false,
    centerName: "TRAINING ZONE La Jota",
    planTypes: [
      { value: "SESSION_PACK", label: "Bono de sesiones" },
      { value: "MONTHLY", label: "Cuota mensual" },
    ],
    products: [productItem()],
    ...overrides,
  };
}

export function briefRosterEntry(overrides: Partial<BriefRosterEntry> = {}): BriefRosterEntry {
  return {
    bookingId: "booking-1",
    member: { id: "member-1", firstName: "Marina", lastName: "Castillo", state: "ACTIVE" },
    isNew: false,
    conditions: [],
    matchedRules: [],
    light: null,
    debrief: null,
    ...overrides,
  };
}

export function briefDetailResponse(overrides: Partial<BriefDetailResponse> = {}): BriefDetailResponse {
  return {
    session: {
      id: "session-1",
      name: "Grupo reducido",
      startTime: "19:00",
      centerName: "TRAINING ZONE La Jota",
      trainerName: "Marcos Iglesias",
      occurrenceDate: TEST_TODAY,
    },
    canSeeHealth: true,
    roster: [briefRosterEntry()],
    ...overrides,
  };
}

// DTOs de la API móvil (src/app/api/mobile/v1/**). Duplicados a propósito en
// esta primera versión en vez de un paquete `packages/shared-types` compartido
// (evita acoplar el bundler de Expo al workspace de Next para el MVP); si el
// contrato crece, extraerlo a un paquete compartido tal como describe el plan.

export type Role = "OWNER" | "CENTER_DIRECTOR" | "TRAINER" | "RECEPTION" | "MEMBER" | "HR_MANAGER" | "PLATFORM_ADMIN";

export type MeResponse = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  orgId: string;
  centerId: string | null;
};

export type ActivityResponse = {
  member: { id: string; firstName: string; lastName: string };
  progress: {
    totalAllTime: number;
    totalThisYear: number;
    totalThisMonth: number;
    bestMonthCount: number;
    bestMonthLabel: string;
  };
  monthlyActivity: { label: string; count: number }[];
  healthTransparency: { blockArea: string; light: "RED" | "AMBER" | "GREEN"; adaptation: string | null }[];
  plan: { planName: string; startDate: string } | null;
};

export type BookingStatus = "BOOKED" | "WAITLISTED" | "ATTENDED" | "NO_SHOW" | "CANCELLED";

export type BookableSession = {
  id: string;
  name: string;
  classType: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  trainerName: string | null;
  startsAt: string;
  canBook: boolean;
  myBookingId: string | null;
  myBookingStatus: BookingStatus | null;
};

export type ServiceKind = "GROUP" | "EP" | "ONLINE";

export type SessionBalance = { serviceKind: ServiceKind; remaining: number | null; unlimited: boolean };

export type PendingFeedback = {
  bookingId: string;
  sessionName: string;
  sessionDate: string;
  time: string;
  focus: string;
  trainerName: string | null;
};

export type AgendaResponse = {
  sessions: BookableSession[];
  balances: SessionBalance[];
  pendingFeedback: PendingFeedback[];
};

export type BookSessionResponse = { waitlisted: boolean };
export type CancelBookingResponse = { cancelled: boolean };

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  dueDate: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type NotificationsResponse = { notifications: NotificationItem[] };

export type LoginResponse = { accessToken: string; refreshToken: string; user: MeResponse };
export type RefreshResponse = { accessToken: string; refreshToken: string };

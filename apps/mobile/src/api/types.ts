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
  /** Un socio puede tener bonos de varios centros: la lista puede mezclarlos. */
  centerName: string;
  startsAt: string;
  canBook: boolean;
  myBookingId: string | null;
  myBookingStatus: BookingStatus | null;
};

export type ServiceKind = "GROUP" | "EP" | "ONLINE";

export type SessionBalance = {
  serviceKind: ServiceKind;
  remaining: number | null;
  unlimited: boolean;
  /** Sesiones ya gastadas del bono contratado (null si el bono es ilimitado). */
  used: number | null;
  total: number | null;
};

/** Reserva viva del socio, también fuera de la ventana de 7 días de `sessions`. */
export type UpcomingBooking = {
  bookingId: string;
  status: "BOOKED" | "WAITLISTED";
  waitlistPosition: number | null;
  sessionId: string;
  sessionName: string;
  classType: string;
  startsAt: string;
  /** Día de la clase en la zona del centro, ya formateado por el backend. */
  dayLabel: string;
  startTime: string;
  endTime: string;
  centerName: string;
  trainerName: string | null;
  sessionCancelled: boolean;
  canCancelFreely: boolean;
};

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
  upcomingBookings: UpcomingBooking[];
};

export type BookSessionResponse = { waitlisted: boolean };
export type CancelBookingResponse = { cancelled: boolean };

// ---------- Autoservicio de facturación (F6) ----------
// La app abre `url` en el navegador externo del dispositivo, nunca en un
// WebView incrustado (Stripe Checkout/Billing Portal no están pensados para eso).
export type BillingCheckoutResponse = { url: string };
export type BillingPortalResponse = { url: string };

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

// ---------- Mi evolución (socio) ----------

export type ProgressEntry = {
  id: string;
  date: string;
  measuredAt: string | null;
  source: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  waistCm: number | null;
  photoFrontUrl: string | null;
  photoSideUrl: string | null;
  photoBackUrl: string | null;
};

export type CompositionTile = { label: string; value: string | null; status?: string | null };

export type EvolutionResponse = {
  consentHealth: boolean;
  consentImages: boolean;
  progressEntries: ProgressEntry[];
  compositionTiles: CompositionTile[];
  measuredAt: string | null;
};

// ---------- Panel del entrenador ----------

export type TrainerAgendaSession = {
  id: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  title: string;
  status: "past" | "current" | "upcoming";
  meta: string;
  chipLabel: string;
  chipTone: "good" | "warning" | "critical" | "gold" | "neutral";
  secondsRemaining: number | null;
  secondsUntil: number | null;
  soloMember: string | null;
  soloMemberId: string | null;
};

export type TrainerEpClient = {
  id: string;
  firstName: string;
  lastName: string;
  note: string | null;
  planNames: string;
  attendedCount: number;
  adherencePct: number;
  nextLabel: string;
  light: "GREEN" | "AMBER" | "RED" | null;
};

export type TrainerPendingItem = {
  sessionId: string;
  occurrenceDate: string;
  label: string;
  relative: string;
  title: string;
  detail: string;
};

export type TrainerAptitudeAlert = {
  memberId: string;
  name: string;
  light: "AMBER" | "RED";
  zone: string | null;
  description: string;
  adaptation: string | null;
  meta: string;
};

export type TrainerPanelResponse = {
  epHours: string;
  groupHours: string;
  monthDelta: string;
  epClients: TrainerEpClient[];
  epClientsNewThisMonth: number;
  adherenceAvg: number;
  orgAdherencePct: number;
  todaySessions: TrainerAgendaSession[];
  currentSession: TrainerAgendaSession | null;
  nextSession: TrainerAgendaSession | null;
  todayProgressPct: number;
  completedCount: number;
  agendaDay: string;
  agendaIsToday: boolean;
  agendaSessions: TrainerAgendaSession[];
  pendingDebriefs: TrainerPendingItem[];
  pendingBriefs: TrainerPendingItem[];
  aptitudeAlerts: TrainerAptitudeAlert[];
  epSlotsPublished: number;
  epSlotsReserved: number;
  centerName: string | null;
};

// ---------- Session Brief ----------

export type BriefListItem = {
  id: string;
  occurrenceDate: string;
  isToday: boolean;
  dayLabel: string;
  startTime: string;
  name: string;
  centerName: string;
  trainerName: string | null;
  bookingsCount: number;
};

export type BriefListResponse = { sessions: BriefListItem[] };

export type BriefRosterEntry = {
  bookingId: string;
  member: { id: string; firstName: string; lastName: string; state: string };
  isNew: boolean;
  conditions: { zone: string | null; description: string; type: string }[];
  matchedRules: { injuryZone: string; blockArea: string; light: string; adaptation: string | null }[];
  light: "RED" | "AMBER" | "GREEN" | null;
  debrief: { feeling: "GREEN" | "AMBER" | "RED" } | null;
};

export type BriefDetailResponse = {
  session: { id: string; name: string; startTime: string; centerName: string; trainerName: string | null; occurrenceDate: string };
  canSeeHealth: boolean;
  roster: BriefRosterEntry[];
};

// ---------- Agenda operativa (entrenador/dirección) ----------

export type StaffSessionBooking = { id: string; status: BookingStatus; member: { id: string; firstName: string; lastName: string } };

export type StaffSession = {
  id: string;
  name: string;
  classType: string;
  startTime: string;
  endTime: string;
  capacity: number;
  isTrial: boolean;
  recurrence: "NONE" | "WEEKLY" | "WEEKDAYS";
  selfBookable: boolean;
  trainerId: string | null;
  trainerName: string | null;
  bookings: StaffSessionBooking[];
};

export type StaffAgendaResponse = {
  date: string;
  centers: { id: string; name: string }[];
  centerId: string | null;
  canEdit: boolean;
  trainers: { id: string; name: string }[];
  members: { id: string; firstName: string; lastName: string }[];
  sessions: StaffSession[];
};

export type SaveStaffSessionInput = {
  centerId: string;
  trainerId: string;
  title: string;
  type: "personal" | "reduced";
  date: string;
  startTime: string;
  endTime: string;
  memberId: string | null;
  isTrial: boolean;
  recurrence: "NONE" | "WEEKLY" | "WEEKDAYS";
  recUntil: string | null;
};

// ---------- Panel de control / anuncios / organización (dirección) ----------

export type DashboardKpis = {
  activeMembers: number;
  delinquent: number;
  frozen: number;
  openAlerts: number;
  monthRevenueCents: number;
  sessionsThisMonth: number;
};

export type DashboardResponse = {
  kpis: DashboardKpis;
  memberStateBreakdown: { state: string; count: number }[];
  occupancyByCenter: { center: string; occupancyPct: number; sessions: number }[];
  noShowRatePct: number;
};

export type AnnouncementCategory = "NEWS" | "EVENT" | "PROMO" | "ALERT";
export type AnnouncementAudience = "ALL" | "MEMBERS";

export type AnnouncementItem = {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  tags: string[];
  pinned: boolean;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  centerName: string;
  createdByName: string | null;
  viewsCount: number;
  createdAt: string;
};

export type AnnouncementsResponse = { centers: { id: string; name: string }[]; announcements: AnnouncementItem[] };

export type SaveAnnouncementInput = {
  title: string;
  body: string | null;
  imageUrl: string | null;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  centerId: string | null;
  pinned: boolean;
  tags: string[];
  startsAt: string | null;
  endsAt: string | null;
};

export type OrganizationResponse = {
  organization: { id: string; name: string; logoUrl: string | null } | null;
  centers: { id: string; name: string; timezone: string; membersCount: number; staffCount: number }[];
  staff: { id: string; name: string; email: string; role: Role; roleLabel: string; centerNames: string[]; invitationPending: boolean }[];
};

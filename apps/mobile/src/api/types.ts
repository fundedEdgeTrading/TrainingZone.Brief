// DTOs de la API móvil (src/app/api/mobile/v1/**). Duplicados a propósito en
// esta primera versión en vez de un paquete `packages/shared-types` compartido
// (evita acoplar el bundler de Expo al workspace de Next para el MVP); si el
// contrato crece, extraerlo a un paquete compartido tal como describe el plan.

export type Role =
  | "OWNER"
  | "CENTER_DIRECTOR"
  | "TRAINER"
  | "TRAINER_ADMIN"
  | "RECEPTION"
  | "MEMBER"
  | "HR_MANAGER"
  | "PLATFORM_ADMIN";

export type MeResponse = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  orgId: string;
  centerId: string | null;
  /** Solo para MEMBER: resuelve el gate de compra del primer login (A2). */
  member: {
    id: string;
    firstName: string;
    centerName: string;
    hasActiveMembership: boolean;
  } | null;
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
  /** Día concreto de la serie: el id de sesión no distingue ocurrencias. */
  occurrenceDate: string;
  /** `id:occurrenceDate` — clave estable de lista y de reserva. */
  key: string;
  name: string;
  classType: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  room: string | null;
  trainerName: string | null;
  trainerImage: string | null;
  /** Un socio puede tener bonos de varios centros: la lista puede mezclarlos. */
  centerName: string;
  startsAt: string;
  canBook: boolean;
  /** Cancelación gratuita: fuera de esa ventana, cancelar consume la sesión del bono. */
  canCancelFreely: boolean;
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
  occurrenceDate: string;
  sessionName: string;
  classType: string;
  startsAt: string;
  /** Día de la clase en la zona del centro, ya formateado por el backend. */
  dayLabel: string;
  startTime: string;
  endTime: string;
  centerName: string;
  room: string | null;
  trainerName: string | null;
  trainerImage: string | null;
  sessionCancelled: boolean;
  full: boolean;
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
  room: string | null;
  isTrial: boolean;
  recurrence: "NONE" | "WEEKLY" | "WEEKDAYS";
  selfBookable: boolean;
  trainerId: string | null;
  trainerName: string | null;
  trainerImage: string | null;
  bookings: StaffSessionBooking[];
};

export type StaffAgendaResponse = {
  date: string;
  centers: { id: string; name: string }[];
  centerId: string | null;
  canEdit: boolean;
  trainers: { id: string; name: string; image: string | null }[];
  members: { id: string; firstName: string; lastName: string }[];
  sessions: StaffSession[];
};

export type StaffSessionAttendee = {
  bookingId: string;
  memberId: string;
  name: string;
  status: BookingStatus;
};

export type StaffSessionAttendeesResponse = {
  occurrenceDate: string;
  capacity: number;
  attendees: StaffSessionAttendee[];
  bookableMembers: { id: string; firstName: string; lastName: string; waiting: boolean }[];
};

export type AddStaffBookingResponse = { claimedFromWaitlist: boolean };

export type SaveStaffSessionInput = {
  /** Presente = edición de una sesión existente (PATCH); ausente = alta (POST). */
  id?: string;
  centerId: string;
  trainerId: string;
  title: string;
  type: "personal" | "reduced";
  date: string;
  startTime: string;
  endTime: string;
  memberId: string | null;
  capacity?: number | null;
  isTrial: boolean;
  recurrence: "NONE" | "WEEKLY" | "WEEKDAYS";
  recUntil: string | null;
};

// ---------- Panel de control / anuncios / organización (dirección) ----------

export type DashboardResponse = {
  centers: { id: string; name: string }[];
  centerId: string | null;
  canChooseCenter: boolean;
  revenue: { monthCents: number; deltaPct: number | null; series: { label: string; cents: number }[] };
  members: { active: number; newThisMonth: number; churnedThisMonth: number };
  delinquency: { members: number; amountCents: number };
  attendance: { avgPct: number; noShowPct: number; sessionsHeld: number };
  /** null cuando el rol no puede leer valoraciones de entrenadores (RB-RRHH-011). */
  ranking: { trainerUserId: string; name: string; image: string | null; avgScore: number; count: number }[] | null;
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

// ---------- Catálogo y productos (A2 · D4 · D5) ----------

export type ProductItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  sessionsIncluded: number | null;
  validityDays: number | null;
  planType: string;
  serviceKind: ServiceKind;
  visible: boolean;
  /** null para el socio: solo dirección ve cuánta gente tiene contratado el bono. */
  subscribersCount: number | null;
  featured: boolean;
};

export type ProductsResponse = { canManage: boolean; centerName: string | null; products: ProductItem[] };

export type SaveProductInput = {
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  sessionsIncluded: number | null;
  validityDays: number | null;
  serviceKind: ServiceKind;
  visible: boolean;
};

/** El cobro con tarjeta se abre SIEMPRE en el navegador del dispositivo, nunca en un WebView. */
export type CheckoutResponse =
  | { mode: "stripe"; url: string; planName: string; priceCents: number }
  | { mode: "manual"; planName: string; priceCents: number; reason: string };

// ---------- Mis bonos (B4) ----------

export type MembershipItem = {
  id: string;
  planName: string;
  serviceKind: ServiceKind;
  status: "ACTIVE" | "FROZEN" | "CANCELLED" | "EXPIRED";
  unlimited: boolean;
  remaining: number | null;
  total: number | null;
  used: number | null;
  priceCents: number;
  centerName: string;
  renewsAt: string | null;
  cancelAt: string | null;
  pauseUntil: string | null;
  isRecurring: boolean;
};

export type ConsumptionItem = {
  bookingId: string;
  day: string;
  sessionName: string;
  startTime: string;
  serviceKind: "EP" | "GROUP";
  status: "ATTENDED" | "NO_SHOW";
  planName: string | null;
  consumed: number | null;
};

export type MembershipsResponse = {
  balances: SessionBalance[];
  memberships: MembershipItem[];
  consumption: ConsumptionItem[];
};

// ---------- Calendario del socio (B5) y de su ficha (D3) ----------

export type CalendarEntry = {
  bookingId: string;
  day: string;
  sessionName: string;
  startTime: string;
  endTime: string;
  centerName: string;
  trainerName: string | null;
  serviceKind: "EP" | "GROUP";
  status: BookingStatus;
  feedbackAvg: number | null;
};

export type MemberCalendarResponse = {
  month: string;
  entries: CalendarEntry[];
  summary: { attended: number; booked: number; noShow: number };
};

// ---------- Socios (D2 · D3) ----------

export type MemberState = "PROSPECT" | "TRIAL" | "ACTIVE" | "DELINQUENT" | "FROZEN" | "CANCELLED";

export type MemberListItem = {
  id: string;
  name: string;
  email: string;
  state: MemberState;
  centerName: string;
  planName: string | null;
  photoUrl: string | null;
};

export type MembersResponse = {
  page: number;
  /** null = no hay más páginas (scroll infinito de D2). */
  nextPage: number | null;
  counts: { all: number; active: number; delinquent: number; frozen: number; trial: number; cancelled: number };
  members: MemberListItem[];
};

export type MemberDetailResponse = {
  member: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    state: MemberState;
    centerName: string;
    joinedAt: string;
    photoUrl: string | null;
    planNames: string[];
  };
  stats: { attended: number; booked: number; noShow: number; adherencePct: number };
  memberships: {
    id: string;
    planName: string;
    serviceKind: ServiceKind;
    status: string;
    remaining: number | null;
    total: number | null;
    priceCents: number;
    centerName: string;
    renewsAt: string | null;
  }[];
  payments: { id: string; date: string; amountCents: number; status: string; method: string }[];
  upcoming: MemberBookingSummary[];
  recent: MemberBookingSummary[];
};

export type MemberBookingSummary = {
  bookingId: string;
  day: string;
  sessionName: string;
  startTime: string;
  endTime: string;
  serviceKind: "EP" | "GROUP";
  status: BookingStatus;
  feedbackAvg: number | null;
};

// ---------- Equipo (D6 · D7) ----------

export type StaffAllocation = { centerId: string; centerName: string; pct: number | null; isPrimary: boolean };

export type StaffMemberItem = {
  id: string;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
  image: string | null;
  visibleInApp: boolean;
  joinedAt: string;
  invitationPending: boolean;
  allocations: StaffAllocation[];
};

export type StaffResponse = {
  canManage: boolean;
  centers: { id: string; name: string }[];
  staff: StaffMemberItem[];
};

export type CreateStaffInput = { name: string; email: string; role: Role; centerId: string | null };

export type UpdateStaffInput = {
  id: string;
  name?: string;
  role?: Role;
  image?: string | null;
  visibleInApp?: boolean;
  allocations?: { centerId: string; pct: number }[];
};

// ---------- Feedback 1-10 por socio (C4) ----------

export type FeedbackAxis =
  | "rpe"
  | "technique"
  | "attitude"
  | "energy"
  | "mobility"
  | "pain"
  | "adherence"
  | "progress";

export type FeedbackScores = Record<FeedbackAxis, number | null>;

export type FeedbackMember = {
  bookingId: string;
  memberId: string;
  name: string;
  attended: boolean;
  monthlyCount: number;
  planNames: string[];
  aptitude: { zone: string | null; light: "RED" | "AMBER" | "GREEN" } | null;
  scores: FeedbackScores;
  note: string | null;
};

export type SessionFeedbackResponse = {
  session: {
    id: string;
    name: string;
    classType: string;
    startTime: string;
    endTime: string;
    centerName: string;
    trainerName: string | null;
    occurrenceDate: string;
  };
  members: FeedbackMember[];
};

export type SaveFeedbackInput = {
  bookingId: string;
  scores: Partial<FeedbackScores>;
  note?: string | null;
};

/** F5 §6.3: la felicitación de cumpleaños, del mismo endpoint que consume la web. */
export type BirthdayGreetingResponse = {
  greeting: { id: string; title: string; body: string } | null;
};

/** F4 §5.3: valoración vencida del socio — el gate de la app, espejo del portal. */
export type PendingAssessmentResponse = {
  assessment: { id: string; kind: string; label: string; dueDate: string } | null;
};

// ---------- Socios del entrenador (rediseño móvil) ----------
// No es el listado de gestión de dirección (`MembersResponse`): el ámbito es la
// gente a la que ESTE entrenador da sesión, y lo que se enseña es adherencia y
// aptitud, no estado comercial.

export type AptitudeLight = "GREEN" | "AMBER" | "RED";

export type TrainerMemberRow = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  kinds: ("EP" | "GROUP")[];
  adherencePct: number;
  attendedCount: number;
  planNames: string;
  nextLabel: string | null;
  light: AptitudeLight | null;
  zone: string | null;
  condition: string | null;
  adaptation: string | null;
};

export type TrainerMembersResponse = {
  counts: { all: number; ep: number; group: number; alerts: number };
  needAdaptation: TrainerMemberRow[];
  members: TrainerMemberRow[];
};

export type TrainerMemberFilter = "all" | "ep" | "group" | "alerts";

export type TrainerMemberSession = {
  bookingId: string;
  day: string;
  sessionName: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  feeling: AptitudeLight | null;
  scores: Record<FeedbackAxis, number | null> | null;
};

export type TrainerMemberNote = {
  id: string;
  body: string;
  important: boolean;
  authorName: string | null;
  createdAt: string;
};

export type TrainerMemberDetailResponse = {
  member: {
    id: string;
    name: string;
    firstName: string;
    phone: string | null;
    photoUrl: string | null;
    joinedAt: string;
    ageYears: number | null;
    planNames: string[];
  };
  balances: {
    subscriptionId: string;
    planName: string;
    serviceKind: ServiceKind;
    unlimited: boolean;
    remaining: number | null;
    used: number | null;
    total: number | null;
  }[];
  aptitude: { light: AptitudeLight; zone: string | null; condition: string; adaptation: string | null } | null;
  stats: { adherencePct: number; sessionsThisMonth: number; rpeAvg: number | null };
  sessions: TrainerMemberSession[];
  notes: TrainerMemberNote[];
  canManageMesocycles: boolean;
};

// ---------- Mesociclos (pestaña «Plan» de la ficha) ----------

export type MesocycleStatus = "DRAFT" | "APPROVED" | "ARCHIVED";

export type MesocycleListItem = {
  id: string;
  title: string;
  status: MesocycleStatus;
  createdAt: string;
  approvedAt: string | null;
};

export type MesocyclesResponse = { aiConfigured: boolean; mesocycles: MesocycleListItem[] };

export type MesocycleExercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  load: string | null;
  description: string;
  rationale: string;
};

export type MesocycleBlock = { id: string; name: string; durationMin: number; exercises: MesocycleExercise[] };

export type MesocycleDay = {
  id: string;
  label: string;
  venue: string;
  focus: string;
  warmup: string[];
  blocks: MesocycleBlock[];
};

export type MesocyclePhase = {
  id: string;
  name: string;
  weekFrom: number;
  weekTo: number;
  notes: string | null;
  days: MesocycleDay[];
};

export type MesocycleDetailResponse = {
  id: string;
  memberId: string;
  title: string;
  status: MesocycleStatus;
  objective: string;
  /** Lo que NO se puede programar, heredado del screening de la valoración. */
  safetyCriteria: string[];
  weeklyLayout: string[];
  milestones: { week: number; text: string }[];
  createdAt: string;
  approvedAt: string | null;
  phases: MesocyclePhase[];
};

export type GenerateMesocycleInput = { memberId: string; level: string; weeks: number; availability: string };

// ---------- Tareas (F10) ----------

export type TaskStatus = "PENDIENTE" | "EN_CURSO" | "HECHA";
export type TaskPriority = "ALTA" | "MEDIA" | "BAJA";

export type TaskItem = {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
  resolvedAt: string | null;
  recipientUserId: string;
  recipientName: string | null;
  createdByName: string | null;
  /** «Te la asignó dirección»: la encargó otra persona. */
  assignedByOther: boolean;
  mine: boolean;
};

export type TasksResponse = {
  canAssign: boolean;
  scope: "mine" | "team";
  counts: { todo: number; doing: number; done: number };
  tasks: TaskItem[];
  done: TaskItem[];
  assignables: { id: string; name: string; role: Role }[];
};

export type CreateTaskInput = {
  title: string;
  body?: string | null;
  category?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  recipientUserId?: string | null;
};

// ---------- Leads (F8) ----------

export type LeadStage = "SIN_CONTACTAR" | "SEGUIMIENTO" | "CON_FECHA_VALORACION" | "CERRADO" | "NO_CERRADO";

export type LeadItem = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: LeadStage;
  channel: string;
  goals: string;
  centerName: string;
  ownerName: string | null;
  createdAt: string;
  contactedAt: string;
};

export type LeadsResponse = {
  counts: Record<"SIN_CONTACTAR" | "SEGUIMIENTO" | "CON_FECHA_VALORACION" | "CERRADO", number>;
  leads: LeadItem[];
};

// ---------- Aforo de clases ----------

export type CapacitySession = {
  id: string;
  occurrenceDate: string;
  name: string;
  startTime: string;
  endTime: string;
  centerName: string;
  capacity: number;
  booked: number;
  waiting: number;
  full: boolean;
};

export type CapacityResponse = {
  date: string | null;
  maxCapacity: number;
  centers: { id: string; name: string; defaultGroupCapacity: number | null }[];
  sessions: CapacitySession[];
};

// ---------- Descarte de asistente (ventana de 24 h del entrenador) ----------

export type DiscardPreview = {
  memberName: string;
  sessionName: string;
  startsAt: string;
  hoursUntil: number;
  withinWindow: boolean;
  /** Qué pasa con el bono si se descarta sin tocar nada. */
  refundsByDefault: boolean;
  /** El toggle «Devolver de todos modos» solo aparece con permiso de ajuste. */
  canForceRefund: boolean;
  planName: string | null;
  balanceBefore: number | null;
  balanceAfterIfRefunded: number | null;
  notice: string;
};

export type DiscardResult = { refunded: boolean; withinWindow: boolean; overridden: boolean };

export type DiscardInput = { reason?: string | null; forceRefund?: boolean; notifyMember?: boolean };

// ---------- Hueco de EP ----------

export type CreateEpSlotInput = {
  centerId?: string;
  date: string;
  startTime: string;
  durationMin: number;
  memberId?: string | null;
};

// ---------- Historial de consumo del socio ----------

export type ConsumptionMovement = {
  id: string;
  day: string;
  concept: string;
  reason: string | null;
  serviceKind: "EP" | "GROUP" | null;
  /** Signo del movimiento: −1 al gastar, +1 al devolver, +N en la renovación. */
  delta: number;
  tone: "neutral" | "critical" | "good";
};

export type ConsumptionResponse = {
  balances: {
    subscriptionId: string;
    planName: string;
    serviceKind: ServiceKind;
    unlimited: boolean;
    remaining: number | null;
    used: number | null;
    total: number | null;
    renewsAt: string | null;
  }[];
  summary: { spent: number; returned: number; noShow: number };
  movements: ConsumptionMovement[];
};

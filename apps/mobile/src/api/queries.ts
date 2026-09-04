import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, LONG_REQUEST_TIMEOUT_MS } from "./client";
import type {
  ActivityResponse,
  AddStaffBookingResponse,
  BirthdayGreetingResponse,
  PendingAssessmentResponse,
  AgendaResponse,
  AnnouncementsResponse,
  BookSessionResponse,
  BriefDetailResponse,
  BriefListResponse,
  CancelBookingResponse,
  DashboardResponse,
  EvolutionResponse,
  NotificationsResponse,
  OrganizationResponse,
  SaveAnnouncementInput,
  SaveStaffSessionInput,
  StaffAgendaResponse,
  StaffSessionAttendeesResponse,
  TrainerPanelResponse,
  CheckoutResponse,
  CreateStaffInput,
  MemberCalendarResponse,
  MemberDetailResponse,
  MemberState,
  MembersResponse,
  MembershipsResponse,
  ProductsResponse,
  SaveFeedbackInput,
  SaveProductInput,
  SessionFeedbackResponse,
  StaffResponse,
  UpdateStaffInput,
  CapacityResponse,
  ConsumptionResponse,
  CreateEpSlotInput,
  CreateTaskInput,
  DiscardInput,
  DiscardPreview,
  DiscardResult,
  GenerateMesocycleInput,
  LeadStage,
  LeadsResponse,
  MesocycleDetailResponse,
  MesocyclesResponse,
  TaskStatus,
  TasksResponse,
  TrainerMemberDetailResponse,
  TrainerMemberFilter,
  TrainerMembersResponse,
} from "./types";

// `enabled` en las dos consultas del portal: son endpoints de SOCIO —el
// servidor las cierra con un 403 a cualquier otro rol— y la pantalla que las
// usa es la ruta índice del grupo (tabs), a la que también llega quien no lo
// es. Sin la opción, esa visita disparaba dos peticiones condenadas al 403.
export function useActivity(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["activity"],
    queryFn: () => apiRequest<ActivityResponse>("/portal/activity"),
    enabled: opts.enabled ?? true,
  });
}

export function useAgenda(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["agenda"],
    queryFn: () => apiRequest<AgendaResponse>("/portal/agenda"),
    enabled: opts.enabled ?? true,
  });
}

export function useBookSession() {
  const queryClient = useQueryClient();
  return useMutation({
    // Una serie recurrente es una sola fila de sesión: sin el día concreto, la
    // reserva caería siempre sobre la ocurrencia base.
    mutationFn: ({ sessionId, occurrenceDate }: { sessionId: string; occurrenceDate?: string }) =>
      apiRequest<BookSessionResponse>("/portal/agenda/book", { method: "POST", body: { sessionId, occurrenceDate } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
      queryClient.invalidateQueries({ queryKey: ["member-calendar"] });
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      apiRequest<CancelBookingResponse>(`/portal/agenda/${bookingId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
      queryClient.invalidateQueries({ queryKey: ["member-calendar"] });
    },
  });
}

/**
 * Cumpleaños y valoración vencida: los dos avisos que la web resuelve en el
 * layout del portal. La app los pide al entrar por el mismo endpoint, para que
 * un socio que solo usa el móvil no se salte ninguno de los dos.
 */
export function useBirthdayGreeting(enabled: boolean) {
  return useQuery({
    queryKey: ["portal-greeting"],
    queryFn: () => apiRequest<BirthdayGreetingResponse>("/portal/greeting"),
    enabled,
  });
}

export function useDismissBirthdayGreeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ dismissed: boolean }>("/portal/greeting", { method: "POST", body: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-greeting"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function usePendingAssessment(enabled: boolean) {
  return useQuery({
    queryKey: ["portal-valoracion"],
    queryFn: () => apiRequest<PendingAssessmentResponse>("/portal/valoracion"),
    enabled,
  });
}

export function useNotifications(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiRequest<NotificationsResponse>("/notifications"),
    enabled: opts.enabled ?? true,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ resolved: boolean }>(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// ---------- Mi evolución (socio) ----------

export function useEvolution() {
  return useQuery({ queryKey: ["evolucion"], queryFn: () => apiRequest<EvolutionResponse>("/portal/evolucion") });
}

// ---------- Panel del entrenador ----------

export function useTrainerPanel(day?: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["trainer-panel", day ?? "today"],
    queryFn: () => apiRequest<TrainerPanelResponse>(day ? `/trainer/panel?day=${day}` : "/trainer/panel"),
    enabled: opts.enabled ?? true,
  });
}

// ---------- Session Brief ----------

export function useBriefList() {
  return useQuery({ queryKey: ["brief-list"], queryFn: () => apiRequest<BriefListResponse>("/trainer/brief") });
}

export function useBriefDetail(sessionId: string, occurrenceDate?: string) {
  return useQuery({
    queryKey: ["brief-detail", sessionId, occurrenceDate ?? null],
    queryFn: () =>
      apiRequest<BriefDetailResponse>(`/trainer/brief/${sessionId}${occurrenceDate ? `?d=${occurrenceDate}` : ""}`),
    enabled: Boolean(sessionId),
  });
}

export function useSaveDebrief(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, feeling }: { bookingId: string; feeling: "GREEN" | "AMBER" | "RED" }) =>
      apiRequest<{ saved: boolean }>(`/trainer/brief/${sessionId}/debrief`, { method: "POST", body: { bookingId, feeling } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brief-detail", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["trainer-panel"] });
    },
  });
}

// ---------- Agenda operativa (entrenador/dirección) ----------

export function useStaffAgenda(date?: string, centerId?: string) {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (centerId) params.set("centerId", centerId);
  const qs = params.toString();
  return useQuery({
    queryKey: ["staff-agenda", date ?? "today", centerId ?? null],
    queryFn: () => apiRequest<StaffAgendaResponse>(`/agenda${qs ? `?${qs}` : ""}`),
  });
}

/** Alta y edición comparten hoja (C3): con `id` va a PATCH, sin él a POST. */
export function useSaveStaffSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: SaveStaffSessionInput) =>
      apiRequest<{ id: string }>(id ? `/agenda/sessions/${id}` : "/agenda/sessions", {
        method: id ? "PATCH" : "POST",
        body: input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-agenda"] });
      queryClient.invalidateQueries({ queryKey: ["trainer-panel"] });
    },
  });
}

export function useDeleteStaffSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => apiRequest<{ deleted: boolean }>(`/agenda/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff-agenda"] }),
  });
}

/** Roster + lista de espera de una ocurrencia de grupo reducido, y a quién se le puede dar una plaza. */
export function useStaffSessionAttendees(sessionId: string, occurrenceDate: string) {
  return useQuery({
    queryKey: ["staff-session-attendees", sessionId, occurrenceDate],
    queryFn: () =>
      apiRequest<StaffSessionAttendeesResponse>(
        `/agenda/sessions/${sessionId}/bookings?date=${occurrenceDate}`
      ),
    enabled: Boolean(sessionId && occurrenceDate),
  });
}

/** Alta puntual de un socio en la ocurrencia (RB-AGENDA-003), desde el mostrador. */
export function useAddStaffBooking(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, occurrenceDate }: { memberId: string; occurrenceDate: string }) =>
      apiRequest<AddStaffBookingResponse>(`/agenda/sessions/${sessionId}/bookings`, {
        method: "POST",
        body: { memberId, occurrenceDate },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-session-attendees", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["staff-agenda"] });
    },
  });
}

/** Baja de un socio del roster (RB-RES-006): devuelve la sesión a su bono. */
export function useRemoveStaffBooking(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      apiRequest<{ cancelled: boolean }>(`/agenda/sessions/${sessionId}/bookings/${bookingId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-session-attendees", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["staff-agenda"] });
    },
  });
}

// ---------- Panel de control / anuncios / organización (dirección) ----------

export function useDashboard(centerId?: string | null) {
  return useQuery({
    queryKey: ["dashboard", centerId ?? null],
    queryFn: () => apiRequest<DashboardResponse>(`/admin/dashboard${centerId ? `?centerId=${centerId}` : ""}`),
  });
}

export function useAnnouncements() {
  return useQuery({ queryKey: ["anuncios"], queryFn: () => apiRequest<AnnouncementsResponse>("/admin/anuncios") });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveAnnouncementInput) => apiRequest<{ id: string }>("/admin/anuncios", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["anuncios"] }),
  });
}

export function useToggleAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest<{ updated: boolean }>(`/admin/anuncios/${id}`, { method: "PATCH", body: { active } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["anuncios"] }),
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ deleted: boolean }>(`/admin/anuncios/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["anuncios"] }),
  });
}

export function useOrganization() {
  return useQuery({ queryKey: ["organization"], queryFn: () => apiRequest<OrganizationResponse>("/admin/organization") });
}

// ---------- Catálogo y productos (A2 · D4 · D5) ----------

export function useProducts() {
  return useQuery({ queryKey: ["products"], queryFn: () => apiRequest<ProductsResponse>("/products") });
}

export function useSaveProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: SaveProductInput & { id?: string }) =>
      apiRequest<{ id: string }>(id ? `/products/${id}` : "/products", { method: id ? "PATCH" : "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ deleted: boolean }>(`/products/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

/** Compra del bono: devuelve la URL de Stripe Checkout (o el modo manual). */
export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => apiRequest<CheckoutResponse>("/checkout", { method: "POST", body: { planId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
    },
  });
}

// ---------- Mis bonos y calendario del socio (B4 · B5) ----------

export function useMemberships() {
  return useQuery({ queryKey: ["memberships"], queryFn: () => apiRequest<MembershipsResponse>("/portal/memberships") });
}

export function useMemberCalendar(month: string) {
  return useQuery({
    queryKey: ["member-calendar", month],
    queryFn: () => apiRequest<MemberCalendarResponse>(`/portal/member-calendar?month=${month}`),
  });
}

// ---------- Socios (D2 · D3) ----------

/** Listado paginado (scroll infinito) de socios. */
export function useMembers(search: string, state?: MemberState) {
  return useInfiniteQuery({
    queryKey: ["members", search.trim(), state ?? null],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam) });
      if (search.trim()) params.set("search", search.trim());
      if (state) params.set("state", state);
      return apiRequest<MembersResponse>(`/members?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    // Al cambiar el filtro o el texto buscado, la lista anterior se queda a la
    // vista hasta que llega la nueva en vez de vaciarse a esqueleto.
    placeholderData: keepPreviousData,
  });
}

export function useMemberDetail(memberId: string) {
  return useQuery({
    queryKey: ["member-detail", memberId],
    queryFn: () => apiRequest<MemberDetailResponse>(`/members/${memberId}`),
    enabled: Boolean(memberId),
  });
}

export function useMemberCalendarOf(memberId: string, month: string) {
  return useQuery({
    queryKey: ["member-calendar-of", memberId, month],
    queryFn: () => apiRequest<MemberCalendarResponse>(`/members/${memberId}/calendar?month=${month}`),
    enabled: Boolean(memberId),
  });
}

// ---------- Equipo (D6 · D7) ----------

export function useStaff() {
  return useQuery({ queryKey: ["staff"], queryFn: () => apiRequest<StaffResponse>("/staff") });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStaffInput) => apiRequest<{ id: string }>("/staff", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateStaffInput) =>
      apiRequest<{ updated: boolean }>(`/staff/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
  });
}

export function useRemoveStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ removed: boolean }>(`/staff/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });
}

// ---------- Feedback 1-10 por socio (C4) ----------

export function useSessionFeedback(sessionId: string, occurrenceDate?: string) {
  return useQuery({
    queryKey: ["session-feedback", sessionId, occurrenceDate ?? null],
    queryFn: () =>
      apiRequest<SessionFeedbackResponse>(
        `/trainer/sessions/${sessionId}/feedback${occurrenceDate ? `?d=${occurrenceDate}` : ""}`
      ),
    enabled: Boolean(sessionId),
  });
}

export function useSaveSessionFeedback(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveFeedbackInput) =>
      apiRequest<{ saved: boolean; feeling: string; average: number | null }>(
        `/trainer/sessions/${sessionId}/feedback`,
        { method: "POST", body: input }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-feedback", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["trainer-panel"] });
      queryClient.invalidateQueries({ queryKey: ["brief-detail", sessionId] });
    },
  });
}

// ---------- Socios del entrenador (rediseño móvil) ----------

export function useTrainerMembers(filter: TrainerMemberFilter, search: string) {
  const params = new URLSearchParams({ filter });
  if (search.trim()) params.set("search", search.trim());
  return useQuery({
    queryKey: ["trainer-members", filter, search.trim()],
    queryFn: () => apiRequest<TrainerMembersResponse>(`/trainer/members?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}

export function useTrainerMemberDetail(memberId: string) {
  return useQuery({
    queryKey: ["trainer-member", memberId],
    queryFn: () => apiRequest<TrainerMemberDetailResponse>(`/trainer/members/${memberId}`),
    enabled: Boolean(memberId),
  });
}

export function useAddMemberNote(memberId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiRequest<{ id: string }>(`/trainer/members/${memberId}`, { method: "POST", body: { body } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trainer-member", memberId] }),
  });
}

// ---------- Mesociclos ----------

export function useMesocycles(memberId: string, enabled = true) {
  return useQuery({
    queryKey: ["mesocycles", memberId],
    queryFn: () => apiRequest<MesocyclesResponse>(`/trainer/members/${memberId}/mesocycles`),
    enabled: enabled && Boolean(memberId),
  });
}

export function useMesocycleDetail(mesocycleId: string | null) {
  return useQuery({
    queryKey: ["mesocycle", mesocycleId],
    queryFn: () => apiRequest<MesocycleDetailResponse>(`/mesocycles/${mesocycleId}`),
    enabled: Boolean(mesocycleId),
  });
}

/**
 * Generación con IA: 60-120 s. Quien la llame monta el velo de marca
 * (`BrandLoader` + `usePacedLoader`), que es el único estado de espera
 * bloqueante de la app.
 */
export function useGenerateMesocycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, ...input }: GenerateMesocycleInput) =>
      apiRequest<{ mesocycleId: string }>(`/trainer/members/${memberId}/mesocycles`, {
        method: "POST",
        body: input,
        // Sin este margen la petición se aborta a los 12 s (el timeout normal)
        // y la generación nunca llega a terminar.
        timeoutMs: LONG_REQUEST_TIMEOUT_MS,
      }),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ["mesocycles", variables.memberId] }),
  });
}

export function useApproveMesocycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mesocycleId: string) =>
      apiRequest<{ approved: boolean }>(`/mesocycles/${mesocycleId}/approve`, { method: "POST" }),
    onSuccess: (_data, mesocycleId) => {
      queryClient.invalidateQueries({ queryKey: ["mesocycle", mesocycleId] });
      queryClient.invalidateQueries({ queryKey: ["mesocycles"] });
    },
  });
}

// ---------- Tareas ----------

export function useTasks(scope: "mine" | "team" = "mine", opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["tasks", scope],
    queryFn: () => apiRequest<TasksResponse>(`/tasks${scope === "team" ? "?scope=team" : ""}`),
    enabled: opts.enabled ?? true,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => apiRequest<{ id: string }>("/tasks", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useSetTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      apiRequest<{ status: TaskStatus }>(`/tasks/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

// ---------- Leads ----------

export function useLeads(stage: LeadStage | null, search = "", opts: { enabled?: boolean } = {}) {
  const params = new URLSearchParams();
  if (stage) params.set("stage", stage);
  if (search.trim()) params.set("search", search.trim());
  const qs = params.toString();
  return useQuery({
    queryKey: ["leads", stage ?? "all", search.trim()],
    queryFn: () => apiRequest<LeadsResponse>(`/leads${qs ? `?${qs}` : ""}`),
    enabled: opts.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: LeadStage; note?: string; claimOwner?: boolean }) =>
      apiRequest<{ updated: boolean }>(`/leads/${id}`, { method: "PATCH", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });
}

// ---------- Aforo de clases ----------

export function useCenterCapacity(date?: string) {
  return useQuery({
    queryKey: ["capacity", date ?? "today"],
    queryFn: () => apiRequest<CapacityResponse>(`/capacity${date ? `?date=${date}` : ""}`),
  });
}

export function useUpdateCapacity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId?: string; capacity?: number; centerId?: string; defaultGroupCapacity?: number | null }) =>
      apiRequest<{ capacity?: number; defaultGroupCapacity?: number | null }>("/capacity", { method: "PATCH", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["capacity"] });
      queryClient.invalidateQueries({ queryKey: ["staff-agenda"] });
    },
  });
}

// ---------- Descarte de asistente (ventana de 24 h del entrenador) ----------

/** El efecto sobre el bono ANTES de confirmar: es lo que pinta el aviso de la hoja. */
export function useDiscardPreview(sessionId: string, bookingId: string | null) {
  return useQuery({
    queryKey: ["discard-preview", sessionId, bookingId],
    queryFn: () => apiRequest<DiscardPreview>(`/agenda/sessions/${sessionId}/bookings/${bookingId}/discard`),
    enabled: Boolean(sessionId && bookingId),
  });
}

export function useDiscardAttendee(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, ...body }: DiscardInput & { bookingId: string }) =>
      apiRequest<DiscardResult>(`/agenda/sessions/${sessionId}/bookings/${bookingId}/discard`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-session-attendees", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["staff-agenda"] });
      queryClient.invalidateQueries({ queryKey: ["trainer-panel"] });
    },
  });
}

// ---------- Hueco de EP ----------

export function useCreateEpSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEpSlotInput) => apiRequest<{ id: string }>("/agenda/ep-slots", { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-agenda"] });
      queryClient.invalidateQueries({ queryKey: ["trainer-panel"] });
    },
  });
}

// ---------- Historial de consumo del socio ----------

export function useConsumption() {
  return useQuery({ queryKey: ["consumption"], queryFn: () => apiRequest<ConsumptionResponse>("/portal/consumption") });
}

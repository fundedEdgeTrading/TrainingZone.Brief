import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./client";
import type {
  ActivityResponse,
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
} from "./types";

export function useActivity() {
  return useQuery({ queryKey: ["activity"], queryFn: () => apiRequest<ActivityResponse>("/portal/activity") });
}

export function useAgenda() {
  return useQuery({ queryKey: ["agenda"], queryFn: () => apiRequest<AgendaResponse>("/portal/agenda") });
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

export function useNotifications() {
  return useQuery({ queryKey: ["notifications"], queryFn: () => apiRequest<NotificationsResponse>("/notifications") });
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

export function useTrainerPanel(day?: string) {
  return useQuery({
    queryKey: ["trainer-panel", day ?? "today"],
    queryFn: () => apiRequest<TrainerPanelResponse>(day ? `/trainer/panel?day=${day}` : "/trainer/panel"),
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

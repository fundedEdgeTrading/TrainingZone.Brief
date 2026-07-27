import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./client";
import type {
  ActivityResponse,
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
    mutationFn: (sessionId: string) =>
      apiRequest<BookSessionResponse>("/portal/agenda/book", { method: "POST", body: { sessionId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      apiRequest<CancelBookingResponse>(`/portal/agenda/${bookingId}/cancel`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agenda"] }),
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

export function useCreateStaffSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveStaffSessionInput) => apiRequest<{ id: string }>("/agenda/sessions", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff-agenda"] }),
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

export function useDashboard() {
  return useQuery({ queryKey: ["dashboard"], queryFn: () => apiRequest<DashboardResponse>("/admin/dashboard") });
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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./client";
import type {
  ActivityResponse,
  AgendaResponse,
  BookSessionResponse,
  CancelBookingResponse,
  NotificationsResponse,
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

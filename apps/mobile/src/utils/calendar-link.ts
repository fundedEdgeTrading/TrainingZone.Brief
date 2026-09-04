import * as WebBrowser from "expo-web-browser";
import { minutesOf } from "./format";
import type { UpcomingBooking } from "@/api/types";

/**
 * «Añadir al calendario» (B3): abre el formulario de evento del calendario web
 * en el navegador del dispositivo. Una integración nativa necesitaría
 * `expo-calendar` y un rebuild (F4).
 *
 * La duración sale de la propia sesión. Estaba fijada a una hora —y duplicada
 * en dos pantallas—, así que una clase de 45 o de 90 minutos entraba en el
 * calendario del socio con la hora de fin equivocada.
 */
export async function addBookingToCalendar(booking: UpcomingBooking) {
  const start = new Date(booking.startsAt);
  const minutes = Math.max(15, minutesOf(booking.endTime) - minutesOf(booking.startTime));
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]|\.\d{3}/g, "");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: booking.sessionName,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: `${booking.centerName}${booking.trainerName ? ` · ${booking.trainerName}` : ""}`,
    location: booking.room ? `${booking.centerName} · ${booking.room}` : booking.centerName,
  });
  await WebBrowser.openBrowserAsync(`https://calendar.google.com/calendar/render?${params.toString()}`);
}

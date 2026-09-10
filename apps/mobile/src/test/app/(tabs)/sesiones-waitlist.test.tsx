/**
 * E7-03 · T8 (E2-10): WAITLISTED se distingue de BOOKED en el calendario del
 * socio — antes ambas se etiquetaban "Reservada".
 */
import { fireEvent } from "@testing-library/react-native";

import { agendaResponse, calendarEntry, memberCalendarResponse } from "@/test/fixtures";
import { renderWithProviders, screen } from "@/test/render";
import { reply } from "@/test/server";

import SesionesScreen from "@/app/(tabs)/sesiones";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() } }));

describe("Sesiones · lista de espera visible (T8 / E2-10)", () => {
  it("una reserva WAITLISTED se etiqueta «En espera», nunca «Reservada»", async () => {
    reply("GET /portal/agenda", agendaResponse({ upcomingBookings: [] }));
    reply(
      "GET /portal/member-calendar",
      memberCalendarResponse({ entries: [calendarEntry({ status: "WAITLISTED" })] }),
    );

    renderWithProviders(<SesionesScreen />);

    fireEvent.press(await screen.findByText("Historial"));

    expect(await screen.findByText("En espera")).toBeOnTheScreen();
    expect(screen.queryByText("Reservada")).not.toBeOnTheScreen();
  });
});

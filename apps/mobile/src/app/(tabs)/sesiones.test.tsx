/**
 * E7-03 · T3: con `cancelWindowHours` en 24, el texto dice 24 — no el literal
 * de 12 h que arrastraba la pantalla (E2-06).
 */
import { Alert } from "react-native";
import { fireEvent } from "@testing-library/react-native";

import { agendaResponse, upcomingBooking } from "@/test/fixtures";
import { renderWithProviders, screen } from "@/test/render";
import { reply } from "@/test/server";

import SesionesScreen from "./sesiones";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() } }));

describe("Sesiones · ventana de cancelación (T3 / E2-06)", () => {
  it("con cancelWindowHours 24, el aviso dice 24 h, no un literal de 12", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    reply(
      "GET /portal/agenda",
      agendaResponse({
        upcomingBookings: [
          upcomingBooking({ canCancelFreely: false, cancelWindowHours: 24, sessionName: "Grupo reducido" }),
        ],
      }),
    );
    reply("GET /portal/member-calendar", { month: "2026-03", entries: [], summary: { attended: 0, booked: 0, noShow: 0 } });

    renderWithProviders(<SesionesScreen />);

    fireEvent.press(await screen.findByText("Cancelar"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Cancelar la reserva",
      expect.stringContaining("Faltan menos de 24 h"),
      expect.anything(),
    );
  });
});

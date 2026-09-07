/**
 * E7-03 · T4 (E2-11): la hoja de reserva no anuncia descuento de bono cuando
 * la sesión está llena y la reserva va a lista de espera.
 */
import { Alert } from "react-native";
import { fireEvent } from "@testing-library/react-native";

import { storeTokens } from "@/api/client";
import { agendaResponse, bookableSession, meResponse, sessionBalance } from "@/test/fixtures";
import { renderWithProviders, screen } from "@/test/render";
import { reply } from "@/test/server";
import { todayIso } from "@/utils/format";

import AgendaScreen from "./agenda";

const today = todayIso();

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() } }));

describe("Agenda · hoja de reserva sin bono en lista de espera (T4 / E2-11)", () => {
  it("una sesión llena no anuncia ningún descuento de bono", async () => {
    reply(
      "GET /portal/agenda",
      agendaResponse({
        sessions: [
          bookableSession({ occurrenceDate: today, capacity: 4, bookedCount: 4, canBook: true, classType: "GROUP" }),
        ],
        balances: [sessionBalance({ serviceKind: "GROUP", remaining: 3 })],
      }),
    );

    renderWithProviders(<AgendaScreen />);

    fireEvent.press(await screen.findByText("Esperar"));

    expect(await screen.findByText("No se descuenta hasta obtener plaza")).toBeOnTheScreen();
    expect(screen.queryByText(/quedarán/)).not.toBeOnTheScreen();
  });

  it("una sesión con plaza sí anuncia el descuento", async () => {
    reply(
      "GET /portal/agenda",
      agendaResponse({
        sessions: [
          bookableSession({ occurrenceDate: today, capacity: 4, bookedCount: 1, canBook: true, classType: "GROUP" }),
        ],
        balances: [sessionBalance({ serviceKind: "GROUP", remaining: 3 })],
      }),
    );

    renderWithProviders(<AgendaScreen />);

    fireEvent.press(await screen.findByText("Reservar"));

    expect(await screen.findByText(/quedarán 2/)).toBeOnTheScreen();
  });
});

describe("Agenda · sin bono vivo no se puede reservar (E5-14)", () => {
  it("al intentar reservar sin bono vivo se explica por qué, con la acción de comprar", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    reply(
      "GET /me",
      meResponse({ role: "MEMBER", member: { id: "m1", firstName: "Ana", centerName: "TZ", hasActiveMembership: false } }),
    );
    await storeTokens({ accessToken: "a", refreshToken: "r" });
    reply(
      "GET /portal/agenda",
      agendaResponse({
        sessions: [bookableSession({ occurrenceDate: today, capacity: 4, bookedCount: 1, canBook: true, classType: "GROUP" })],
        balances: [sessionBalance({ serviceKind: "GROUP", remaining: 3 })],
      }),
    );

    renderWithProviders(<AgendaScreen />);

    fireEvent.press(await screen.findByText("Reservar"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Tu bono ha caducado",
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: "Ver planes" })]),
    );
    // No se abre la hoja de confirmación: no hay reserva que hacer sin bono.
    expect(screen.queryByText("Confirmar reserva")).not.toBeOnTheScreen();
  });
});

/**
 * E7-03 · T1 y T2 de la batería base: el defecto número uno del producto
 * (E3-01) y la desmarcación de asistencia fantasma (E2-03).
 */
import { fireEvent } from "@testing-library/react-native";

import { briefDetailResponse, briefRosterEntry } from "@/test/fixtures";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import { lastRequest, reply } from "@/test/server";

import BriefDetailScreen from "./[id]";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "session-1" }),
  router: { canGoBack: () => false, back: jest.fn(), replace: jest.fn() },
}));

describe("Session Brief · condiciones sin regla (T1 / E3-01)", () => {
  it("un socio con una condición declarada y ninguna matchedRule aparece en Requieren atención, en ámbar", async () => {
    reply(
      "GET /trainer/brief/session-1",
      briefDetailResponse({
        roster: [
          briefRosterEntry({
            bookingId: "booking-hta",
            member: { id: "m-1", firstName: "Elena", lastName: "Ruiz", state: "ACTIVE" },
            conditions: [{ zone: null, description: "Hipertensión controlada con medicación", type: "HYPERTENSION" }],
            matchedRules: [],
            light: null,
          }),
        ],
      }),
    );

    renderWithProviders(<BriefDetailScreen />);

    expect(await screen.findByText("Requieren atención")).toBeOnTheScreen();
    expect(screen.getByText("Elena Ruiz")).toBeOnTheScreen();
    expect(screen.getByText("Condición sin regla asignada")).toBeOnTheScreen();
    expect(screen.queryByText("Sin restricciones")).not.toBeOnTheScreen();
  });

  it("sin ninguna condición, el socio aparece en Sin restricciones", async () => {
    reply(
      "GET /trainer/brief/session-1",
      briefDetailResponse({ roster: [briefRosterEntry({ member: { id: "m-2", firstName: "Iker", lastName: "Soto", state: "ACTIVE" } })] }),
    );

    renderWithProviders(<BriefDetailScreen />);

    expect(await screen.findByText("Sin restricciones")).toBeOnTheScreen();
    expect(screen.getByText("Iker Soto")).toBeOnTheScreen();
    expect(screen.queryByText("Requieren atención")).not.toBeOnTheScreen();
  });

  it("una condición con regla y otra sin regla: la luz resultante es la más restrictiva (RED)", async () => {
    reply(
      "GET /trainer/brief/session-1",
      briefDetailResponse({
        roster: [
          briefRosterEntry({
            conditions: [
              { zone: "hombro", description: "Tendinopatía de hombro", type: "INJURY" },
              { zone: null, description: "Diabetes tipo 2", type: "DIABETES" },
            ],
            matchedRules: [{ injuryZone: "hombro", blockArea: "Empuje sobre cabeza", light: "RED", adaptation: "Evitar press militar" }],
            light: "RED",
          }),
        ],
      }),
    );

    renderWithProviders(<BriefDetailScreen />);

    expect(await screen.findByText("Requieren atención")).toBeOnTheScreen();
    expect(screen.getByText("Empuje sobre cabeza")).toBeOnTheScreen();
    expect(screen.getByText("Condición sin regla asignada")).toBeOnTheScreen();
  });
});

describe("Session Brief · desmarcar asistencia (T2 / E2-03)", () => {
  it("tocar el check dos veces envía la operación al servidor", async () => {
    reply(
      "GET /trainer/brief/session-1",
      briefDetailResponse({
        roster: [briefRosterEntry({ bookingId: "booking-1", debrief: { feeling: "GREEN" } })],
      }),
    );
    reply("DELETE /trainer/brief/session-1/debrief", { saved: true });

    renderWithProviders(<BriefDetailScreen />);

    const checkbox = await screen.findByLabelText("Quitar asistencia");
    fireEvent.press(checkbox);

    await waitFor(() => expect(lastRequest("DELETE /trainer/brief/session-1/debrief")).toBeDefined());
    expect(lastRequest("DELETE /trainer/brief/session-1/debrief")?.body).toEqual({ bookingId: "booking-1" });
  });
});

/**
 * E7-03 (E8-12): "Más" no pinta un cero que un segundo después dice "7" — un
 * esqueleto marca la diferencia entre "sin nada pendiente" y "aún no se sabe".
 */
import { storeTokens } from "@/api/client";
import { meResponse } from "@/test/fixtures";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import { reply } from "@/test/server";

import MoreScreen from "./mas";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() } }));

describe("Más · estado de carga de los tiles (E8-12)", () => {
  it("el tile de Tareas se anuncia \"cargando\" antes de saber el contador real", async () => {
    reply("GET /me", meResponse({ role: "TRAINER", member: null }));
    await storeTokens({ accessToken: "a", refreshToken: "r" });
    reply("GET /tasks", { canAssign: false, scope: "mine", counts: { todo: 7, doing: 0, done: 0 }, tasks: [], done: [], assignables: [] });
    reply("GET /leads", { counts: { SIN_CONTACTAR: 0, SEGUIMIENTO: 0, CON_FECHA_VALORACION: 0, CERRADO: 0 }, leads: [] });
    reply("GET /notifications", { notifications: [] });

    renderWithProviders(<MoreScreen />);

    expect(await screen.findByLabelText("Tareas, cargando")).toBeOnTheScreen();

    await waitFor(() => expect(screen.getByLabelText("Tareas, 7 pendientes")).toBeOnTheScreen());
  });
});

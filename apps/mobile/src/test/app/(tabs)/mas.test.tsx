/**
 * E7-03 (E8-12): "Más" no pinta un cero que un segundo después dice "7" — un
 * esqueleto marca la diferencia entre "sin nada pendiente" y "aún no se sabe".
 */
import { storeTokens } from "@/api/client";
import { membershipItem, meResponse } from "@/test/fixtures";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import { reply, replyDelayed } from "@/test/server";

import MoreScreen from "@/app/(tabs)/mas";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() } }));

describe("Más · estado de carga de los tiles (E8-12)", () => {
  it("el tile de Tareas se anuncia \"cargando\" antes de saber el contador real", async () => {
    reply("GET /me", meResponse({ role: "TRAINER", member: null }));
    await storeTokens({ accessToken: "a", refreshToken: "r" });
    // Con latencia: sin ella, el doble resuelve dentro del mismo tick del
    // render y el estado de carga nunca llega a observarse.
    replyDelayed("GET /tasks", { canAssign: false, scope: "mine", counts: { todo: 7, doing: 0, done: 0 }, tasks: [], done: [], assignables: [] }, 30);
    reply("GET /leads", { counts: { SIN_CONTACTAR: 0, SEGUIMIENTO: 0, CON_FECHA_VALORACION: 0, CERRADO: 0 }, leads: [] });
    reply("GET /notifications", { notifications: [] });

    renderWithProviders(<MoreScreen />);

    expect(await screen.findByLabelText("Tareas, cargando")).toBeOnTheScreen();

    await waitFor(() => expect(screen.getByLabelText("Tareas, 7 pendientes")).toBeOnTheScreen());
  });
});

/**
 * El fallo reportado: el socio con bono de entrenamiento personal y bono de
 * grupos veía aquí un solo bono —el primero no ilimitado— y del otro no sabía
 * ni que existía.
 */
describe("Más · el socio con varios bonos los ve todos", () => {
  it("pinta una tarjeta por bono, con el saldo de cada uno", async () => {
    reply("GET /me", meResponse({ role: "MEMBER" }));
    await storeTokens({ accessToken: "a", refreshToken: "r" });
    reply("GET /portal/memberships", {
      balances: [],
      consumption: [],
      memberships: [
        membershipItem({ id: "ep", planName: "Entrenamiento personal · Bono 8", serviceKind: "EP", remaining: 3, total: 8 }),
        membershipItem({ id: "grupos", planName: "Grupos reducidos · Bono 12", serviceKind: "GROUP", remaining: 10, total: 12 }),
      ],
    });
    reply("GET /notifications", { notifications: [] });

    renderWithProviders(<MoreScreen />);

    expect(await screen.findByText("Entrenamiento personal · Bono 8")).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByText("Grupos reducidos · Bono 12")).toBeOnTheScreen());
    expect(screen.getByText("DE 8")).toBeOnTheScreen();
    expect(screen.getByText("DE 12")).toBeOnTheScreen();
  });
});

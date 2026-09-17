/**
 * El socio con dos bonos (entrenamiento personal y grupos) veía aquí el saldo
 * de UNO solo: la tarjeta se quedaba con el primer bono numerado y del otro no
 * decía nada, aunque sus movimientos sí salían en el listado de abajo.
 */
import { renderWithProviders, screen } from "@/test/render";
import { reply } from "@/test/server";

import ConsumptionScreen from "@/app/(tabs)/consumo";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() } }));

const balance = (overrides: Record<string, unknown> = {}) => ({
  subscriptionId: "sub-1",
  planName: "Bono 8 sesiones",
  serviceKind: "GROUP",
  unlimited: false,
  remaining: 5,
  used: 3,
  total: 8,
  renewsAt: null,
  ...overrides,
});

describe("Historial de consumo · saldo de cada bono", () => {
  it("con dos bonos enseña los dos saldos, cada uno con su plan", async () => {
    reply("GET /portal/consumption", {
      balances: [
        balance({ subscriptionId: "ep", planName: "Entrenamiento personal · Bono 8", serviceKind: "EP", remaining: 3, used: 5, total: 8 }),
        balance({ subscriptionId: "grupos", planName: "Grupos reducidos · Bono 12", remaining: 10, used: 2, total: 12 }),
      ],
      summary: { spent: 7, returned: 0 },
      detailSince: null,
      movements: [],
    });

    renderWithProviders(<ConsumptionScreen />);

    expect(await screen.findByText("3/8")).toBeOnTheScreen();
    expect(screen.getByText("10/12")).toBeOnTheScreen();
    expect(screen.getByText(/Entrenamiento personal · Bono 8 · disponibles/)).toBeOnTheScreen();
    expect(screen.getByText(/Grupos reducidos · Bono 12 · disponibles/)).toBeOnTheScreen();
  });

  it("con un solo bono la tarjeta no repite el nombre del plan", async () => {
    reply("GET /portal/consumption", {
      balances: [balance()],
      summary: { spent: 3, returned: 0 },
      detailSince: null,
      movements: [],
    });

    renderWithProviders(<ConsumptionScreen />);

    expect(await screen.findByText("5/8")).toBeOnTheScreen();
    expect(screen.getByText("Disponibles")).toBeOnTheScreen();
  });
});

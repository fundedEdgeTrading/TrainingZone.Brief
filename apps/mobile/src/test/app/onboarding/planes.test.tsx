/**
 * E7-03 · T5 y T6: la app dejó de inventar el "/mes" para un bono puntual y
 * de poner "Más elegido" a cualquier cosa (E5-12).
 */
import { productItem, productsResponse } from "@/test/fixtures";
import { renderWithProviders, screen } from "@/test/render";
import { reply } from "@/test/server";

import PlansScreen from "@/app/onboarding/planes";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() } }));

describe("Elige tu plan (T5 / T6 · E5-12)", () => {
  it("un producto no recurrente no lleva /mes, y sin featured nadie lleva la insignia", async () => {
    reply(
      "GET /products",
      productsResponse({
        products: [productItem({ id: "p1", planType: "SESSION_PACK", featured: false, priceCents: 8000 })],
      }),
    );

    renderWithProviders(<PlansScreen />);

    expect(await screen.findByText("Bono 8 sesiones")).toBeOnTheScreen();
    expect(screen.queryByText("/mes")).not.toBeOnTheScreen();
    expect(screen.queryByText("Más elegido")).not.toBeOnTheScreen();
  });

  it("un producto recurrente lleva /mes, y con featured sí lleva la insignia", async () => {
    reply(
      "GET /products",
      productsResponse({
        products: [productItem({ id: "p2", planType: "MONTHLY", featured: true, priceCents: 4500 })],
      }),
    );

    renderWithProviders(<PlansScreen />);

    expect(await screen.findByText("/mes")).toBeOnTheScreen();
    expect(screen.getByText("Más elegido")).toBeOnTheScreen();
  });
});

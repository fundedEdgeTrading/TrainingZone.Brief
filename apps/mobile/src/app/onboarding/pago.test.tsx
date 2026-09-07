/**
 * E5-12: la pantalla de pago no anuncia "siguiente cobro" para un bono
 * puntual (antes calculaba "hoy + 1 mes" para CUALQUIER producto).
 */
import { productItem, productsResponse } from "@/test/fixtures";
import { renderWithProviders, screen } from "@/test/render";
import { reply } from "@/test/server";

import CheckoutScreen from "./pago";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ planId: "p1" }),
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() },
}));

describe("Confirmar y pagar (E5-12)", () => {
  it("un bono puntual no anuncia siguiente cobro", async () => {
    reply("GET /products", productsResponse({ products: [productItem({ id: "p1", planType: "SESSION_PACK" })] }));

    renderWithProviders(<CheckoutScreen />);

    expect(await screen.findByText("Cobro único")).toBeOnTheScreen();
    expect(screen.queryByText("Siguiente cobro")).not.toBeOnTheScreen();
  });

  it("una cuota recurrente anuncia el siguiente cobro sin fecha calculada en el móvil", async () => {
    reply("GET /products", productsResponse({ products: [productItem({ id: "p1", planType: "MONTHLY" })] }));

    renderWithProviders(<CheckoutScreen />);

    expect(await screen.findByText("Primer cobro hoy")).toBeOnTheScreen();
    expect(screen.getByText("Siguiente cobro")).toBeOnTheScreen();
    expect(screen.getByText("Al mes de la fecha de alta")).toBeOnTheScreen();
  });
});

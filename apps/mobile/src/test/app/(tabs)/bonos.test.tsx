/**
 * E7-03 · T7 (E5-13): "Caduca el" vs "Renueva el", y cancelAt/pauseUntil ya
 * no viajan al dispositivo sin pintarse.
 */
import { membershipItem } from "@/test/fixtures";
import { renderWithProviders, screen } from "@/test/render";
import { reply } from "@/test/server";

import MembershipsScreen from "@/app/(tabs)/bonos";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() } }));

describe("Mis bonos · Caduca vs Renueva (T7 / E5-13)", () => {
  it("un bono no recurrente dice Caduca el", async () => {
    reply("GET /portal/memberships", {
      balances: [],
      consumption: [],
      memberships: [membershipItem({ isRecurring: false, renewsAt: "2026-04-16" })],
    });

    renderWithProviders(<MembershipsScreen />);

    expect(await screen.findByText(/Caduca el/)).toBeOnTheScreen();
    expect(screen.queryByText(/Renueva el/)).not.toBeOnTheScreen();
  });

  it("una cuota recurrente dice Renueva el", async () => {
    reply("GET /portal/memberships", {
      balances: [],
      consumption: [],
      memberships: [membershipItem({ isRecurring: true, renewsAt: "2026-04-16" })],
    });

    renderWithProviders(<MembershipsScreen />);

    expect(await screen.findByText(/Renueva el/)).toBeOnTheScreen();
  });

  it("con cancelAt, dice Termina el y no Renovación automática", async () => {
    reply("GET /portal/memberships", {
      balances: [],
      consumption: [],
      memberships: [membershipItem({ isRecurring: true, renewsAt: "2026-04-16", cancelAt: "2026-04-16" })],
    });

    renderWithProviders(<MembershipsScreen />);

    expect(await screen.findByText(/Termina el/)).toBeOnTheScreen();
    expect(screen.queryByText(/Renueva el/)).not.toBeOnTheScreen();
    expect(screen.getByText("Baja programada")).toBeOnTheScreen();
  });

  it("con pauseUntil, dice Congelado hasta el", async () => {
    reply("GET /portal/memberships", {
      balances: [],
      consumption: [],
      memberships: [membershipItem({ status: "FROZEN", pauseUntil: "2026-05-01" })],
    });

    renderWithProviders(<MembershipsScreen />);

    expect(await screen.findByText(/Congelado hasta el/)).toBeOnTheScreen();
  });
});

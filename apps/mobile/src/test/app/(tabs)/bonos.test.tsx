/**
 * E7-03 · T7 (E5-13): "Caduca el" vs "Renueva el", y cancelAt/pauseUntil ya
 * no viajan al dispositivo sin pintarse.
 */
import { membershipItem } from "@/test/fixtures";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
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

/**
 * El fallo reportado: un socio con bono de entrenamiento personal y bono de
 * grupos solo veía uno de los dos, y las sesiones del otro parecían perdidas.
 */
describe("Mis bonos · un socio con dos bonos ve los dos", () => {
  it("lista los dos bonos con su saldo por separado", async () => {
    reply("GET /portal/memberships", {
      balances: [],
      consumption: [],
      memberships: [
        membershipItem({
          id: "ep",
          planName: "Entrenamiento personal · Bono 8 sesiones",
          serviceKind: "EP",
          remaining: 3,
          total: 8,
          used: 5,
        }),
        membershipItem({
          id: "grupos",
          planName: "Grupos reducidos · Bono 12 sesiones",
          serviceKind: "GROUP",
          remaining: 10,
          total: 12,
          used: 2,
        }),
      ],
    });

    renderWithProviders(<MembershipsScreen />);

    expect(await screen.findByText("Entrenamiento personal · Bono 8 sesiones")).toBeOnTheScreen();
    expect(screen.getByText("Grupos reducidos · Bono 12 sesiones")).toBeOnTheScreen();
    expect(screen.getByText("3")).toBeOnTheScreen();
    expect(screen.getByText("DE 8")).toBeOnTheScreen();
    expect(screen.getByText("10")).toBeOnTheScreen();
    expect(screen.getByText("DE 12")).toBeOnTheScreen();
  });

  it("el consumo se reparte por bono, no por nombre de plan", async () => {
    // Dos bonos del MISMO plan (una renovación anticipada): cruzarlos por
    // nombre repetía el consumo de uno dentro del otro.
    reply("GET /portal/memberships", {
      balances: [],
      consumption: [
        {
          bookingId: "b1",
          subscriptionId: "viejo",
          day: "2026-03-02",
          sessionName: "Funcional 19:00",
          startTime: "19:00",
          serviceKind: "GROUP",
          status: "ATTENDED",
          planName: "Bono 8 sesiones",
          consumed: 1,
        },
      ],
      memberships: [
        membershipItem({ id: "viejo", remaining: 0, total: 8, used: 8 }),
        membershipItem({ id: "nuevo", remaining: 8, total: 8, used: 0 }),
      ],
    });

    renderWithProviders(<MembershipsScreen />);

    // Se abre el consumo del bono nuevo: no ha gastado nada todavía.
    fireEvent.press((await screen.findAllByText("Ver consumo"))[1]);
    expect(await screen.findByText("Todavía no has gastado ninguna sesión de este bono.")).toBeOnTheScreen();
  });
});

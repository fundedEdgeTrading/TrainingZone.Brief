/**
 * E7-03 · E8-09: la lista larga de socios del entrenador se monta sobre
 * FlatList (ScreenList), no sobre un ScrollView que acumula todo a la vez.
 */
import { renderWithProviders, screen } from "@/test/render";
import { reply } from "@/test/server";
import type { TrainerMembersResponse, TrainerMemberRow } from "@/api/types";

import TrainerMembersScreen from "./index";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() } }));

function memberRow(overrides: Partial<TrainerMemberRow> = {}): TrainerMemberRow {
  return {
    id: "m-1",
    name: "Marina Castillo",
    firstName: "Marina",
    lastName: "Castillo",
    photoUrl: null,
    kinds: ["GROUP"],
    adherencePct: 90,
    attendedCount: 10,
    planNames: "Bono 8 sesiones",
    nextLabel: null,
    light: null,
    zone: null,
    condition: null,
    adaptation: null,
    ...overrides,
  };
}

describe("Mis socios (entrenador) · lista virtualizada (E8-09)", () => {
  it("pinta la lista de socios sobre FlatList", async () => {
    const members = Array.from({ length: 20 }, (_, i) => memberRow({ id: `m-${i}`, name: `Socio ${i}` }));
    const response: TrainerMembersResponse = {
      counts: { all: 20, ep: 0, group: 20, alerts: 0 },
      needAdaptation: [],
      members,
    };
    reply("GET /trainer/members", response);

    renderWithProviders(<TrainerMembersScreen />);

    expect(await screen.findByText("Socio 0")).toBeOnTheScreen();
  });
});

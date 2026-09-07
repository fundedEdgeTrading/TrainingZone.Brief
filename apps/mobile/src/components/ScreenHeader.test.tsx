/**
 * E8-08: ScreenHeader y SectionTitle declaran accessibilityRole="header"
 * para que el rotor de VoiceOver pueda saltar entre secciones.
 */
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { render, screen } from "@/test/render";

describe("accessibilityRole=header (E8-08)", () => {
  it("ScreenHeader lo declara", () => {
    render(<ScreenHeader title="Mis bonos" />);
    expect(screen.getByRole("header", { name: "Mis bonos" })).toBeOnTheScreen();
  });

  it("SectionTitle lo declara", () => {
    render(<SectionTitle label="Últimos consumos" />);
    expect(screen.getByRole("header", { name: "Últimos consumos" })).toBeOnTheScreen();
  });
});

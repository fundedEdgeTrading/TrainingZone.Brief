/**
 * E8-10: el botón sm (altura fija) tope el escalado del texto para que el
 * 200 % de WCAG 1.4.4 no lo desborde.
 */
import { Button } from "@/components/Button";
import { render, screen } from "@/test/render";

describe("Button · maxFontSizeMultiplier (E8-10)", () => {
  it("el texto del botón declara un tope de escalado", () => {
    render(<Button title="Reservar" onPress={() => {}} />);
    expect(screen.getByText("Reservar").props.maxFontSizeMultiplier).toBeLessThanOrEqual(2);
  });
});

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

describe("Button · hitSlop en sm (E8-11)", () => {
  it("el botón sm lleva hitSlop hasta alcanzar 44 px de área efectiva", () => {
    render(<Button title="Ver consumo" size="sm" onPress={() => {}} />);
    const pressable = screen.getByRole("button");
    // 36 (HEIGHT.sm) + 4 arriba + 4 abajo = 44 (layout.touchMin).
    expect(pressable.props.hitSlop).toBe(4);
  });

  it("md y lg ya llegan a 44 px por su cuenta: sin hitSlop añadido", () => {
    render(<Button title="Confirmar" size="lg" onPress={() => {}} />);
    expect(screen.getByRole("button").props.hitSlop).toBeUndefined();
  });
});

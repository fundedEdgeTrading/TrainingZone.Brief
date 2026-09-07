/**
 * E8-03: el TextInput recibe accessibilityLabel con el texto de la etiqueta,
 * y el error se anuncia (no solo se pinta en rojo).
 */
import { Field } from "@/components/Field";
import { render, screen } from "@/test/render";

describe("Field", () => {
  it("el campo se anuncia con el texto de su etiqueta", () => {
    render(<Field label="Email" value="" onChangeText={() => {}} />);

    expect(screen.getByLabelText("Email")).toBeOnTheScreen();
  });

  it("el error se anuncia, no solo se pinta en rojo", () => {
    render(<Field label="Email" value="" onChangeText={() => {}} error="El email no es válido." />);

    const input = screen.getByLabelText("Email");
    expect(input.props.accessibilityHint).toBe("El email no es válido.");
  });
});

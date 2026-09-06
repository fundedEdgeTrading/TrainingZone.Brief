/**
 * E7-03 · T14: EmptyState pinta un título con nombre accesible (texto plano,
 * lo que ya lee cualquier lector de pantalla) y su descripción opcional.
 */
import { EmptyState } from "@/components/EmptyState";
import { render, screen } from "@/test/render";

describe("EmptyState", () => {
  it("pinta el título y, si lo hay, la descripción", () => {
    render(<EmptyState icon="users" title="Sin resultados" description="Prueba con otro nombre." />);

    expect(screen.getByText("Sin resultados")).toBeOnTheScreen();
    expect(screen.getByText("Prueba con otro nombre.")).toBeOnTheScreen();
  });

  it("la descripción es opcional", () => {
    render(<EmptyState title="Sin sesiones" />);

    expect(screen.getByText("Sin sesiones")).toBeOnTheScreen();
  });
});

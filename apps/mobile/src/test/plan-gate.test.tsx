/**
 * E6-01 · Un 402 llega a la pantalla como "tu plan no incluye esto", no como
 * un fallo de carga.
 *
 * Reintentar no arregla un módulo no contratado: sin esta distinción, quien
 * abre el Session Brief con plan Esencial ve "no se pudo cargar · desliza para
 * reintentar" y se queda dando vueltas contra una pantalla que nunca cargará.
 */
import { ApiError } from "@/api/client";
import { QueryErrorState, isPlanRequiredError } from "@/components/QueryErrorState";
import { renderWithProviders, screen } from "@/test/render";

const CARGA = { title: "No se pudo cargar el Session Brief", description: "Desliza hacia abajo para reintentar." };

describe("QueryErrorState", () => {
  it("un 402 se reconoce como falta de plan, no como error de carga", () => {
    expect(isPlanRequiredError(new ApiError("Tu plan no incluye esta funcionalidad.", 402))).toBe(true);
    expect(isPlanRequiredError(new ApiError("No se ha encontrado esa sesión.", 404))).toBe(false);
    expect(isPlanRequiredError(new Error("fallo de red"))).toBe(false);
  });

  it("con 402 enseña el mensaje del servidor y cómo resolverlo", () => {
    renderWithProviders(
      <QueryErrorState error={new ApiError("Tu plan no incluye esta funcionalidad.", 402)} {...CARGA} />
    );

    expect(screen.getByText("Tu plan no incluye esta funcionalidad.")).toBeOnTheScreen();
    expect(screen.getByText(/otro plan/i)).toBeOnTheScreen();
    // Y NO le pide reintentar algo que no depende de él.
    expect(screen.queryByText(CARGA.description)).toBeNull();
  });

  it("cualquier otro error mantiene el estado de carga de siempre", () => {
    renderWithProviders(<QueryErrorState error={new ApiError("Se ha roto", 500)} {...CARGA} />);

    expect(screen.getByText(CARGA.title)).toBeOnTheScreen();
    expect(screen.getByText(CARGA.description)).toBeOnTheScreen();
  });
});

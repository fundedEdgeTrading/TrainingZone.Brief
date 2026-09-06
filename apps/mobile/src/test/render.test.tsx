/**
 * E7-01 · El envoltorio común monta de verdad, y ningún test arrastra caché ni
 * reintentos a otro.
 */
import { useQuery } from "@tanstack/react-query";
import { Text } from "react-native";

import { apiRequest } from "@/api/client";
import { meResponse } from "@/test/fixtures";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import { reply, replyError, requests } from "@/test/server";
import type { MeResponse } from "@/api/types";

function Nombre() {
  const { data, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiRequest<MeResponse>("/me"),
  });
  if (error) return <Text>Error: {(error as Error).message}</Text>;
  return <Text>{data?.name ?? "Cargando"}</Text>;
}

describe("renderWithProviders", () => {
  it("monta con QueryClient y AuthProvider, y resuelve una consulta", async () => {
    reply("GET /me", meResponse({ name: "Marina Castillo" }));

    renderWithProviders(<Nombre />);

    expect(await screen.findByText("Marina Castillo")).toBeOnTheScreen();
  });

  it("no reintenta: un fallo declarado falla a la primera", async () => {
    replyError("GET /me", "Se ha roto", 500);

    renderWithProviders(<Nombre />);

    await waitFor(() => expect(screen.getByText(/Se ha roto/)).toBeOnTheScreen());
    // Con el `retry: 1` de producción serían dos: el cliente de test lo apaga
    // para que un fallo esperado no consuma el timeout del test.
    expect(requests().filter((c) => c.path === "/me")).toHaveLength(1);
  });

  it("cada render parte de una caché vacía", async () => {
    reply("GET /me", meResponse({ name: "Otra persona" }));

    renderWithProviders(<Nombre />);

    // Si el QueryClient se compartiera entre tests, aquí saldría el nombre del
    // primero sin llegar a pedir nada.
    expect(await screen.findByText("Otra persona")).toBeOnTheScreen();
    expect(requests().filter((c) => c.path === "/me")).toHaveLength(1);
  });
});

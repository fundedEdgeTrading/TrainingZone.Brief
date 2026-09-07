"use client";

import { useSearchParams } from "next/navigation";

/**
 * E9-14 · El aviso de "no se ha podido iniciar el pago", leído en el cliente.
 *
 * La página lo pintaba desde `searchParams`, y leer `searchParams` en el
 * servidor obliga a renderizar en cada petición: el 100 % de las visitas pagaba
 * el coste de un caso que solo ocurre cuando alguien vuelve de un checkout que
 * ha fallado. Aquí, la ficha se cachea y el aviso lo pone el navegador.
 */
export function CheckoutNotice() {
  const params = useSearchParams();
  if (params.get("checkout") !== "error") return null;

  return (
    <div className="mb-6 rounded-control border border-critical/30 bg-critical-bg px-4 py-3 text-sm text-critical">
      {params.get("motivo") || "No se ha podido iniciar el pago. Inténtalo de nuevo."}
    </div>
  );
}

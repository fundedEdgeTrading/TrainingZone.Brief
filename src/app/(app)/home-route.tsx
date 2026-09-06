"use client";

import { createContext, useContext } from "react";

/**
 * Ruta de inicio del rol que tiene la sesión abierta, publicada al cliente
 * (E8-01).
 *
 * Un `error.tsx` es un componente de cliente y no puede resolver la sesión, pero
 * sí se pinta **dentro** del layout de `(app)`, así que el layout —que ya conoce
 * el rol— la deja aquí y el estado crítico ofrece la salida correcta en vez de
 * un "/" para todos.
 *
 * El valor por defecto es "/", que no es un parche: `src/app/page.tsx` redirige
 * a `defaultRouteForRole`, así que fuera del layout (en `global-error.tsx` o en
 * el `not-found.tsx` raíz) el enlace acaba igualmente donde debe, solo que con
 * un salto de más.
 */
const HomeRouteContext = createContext<string>("/");

export function HomeRouteProvider({ href, children }: { href: string; children: React.ReactNode }) {
  return <HomeRouteContext.Provider value={href}>{children}</HomeRouteContext.Provider>;
}

export function useHomeRoute() {
  return useContext(HomeRouteContext);
}

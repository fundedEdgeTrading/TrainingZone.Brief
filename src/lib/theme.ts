import type { ThemePreference } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isPublicPath } from "@/lib/public-paths";

/**
 * Tema de la aplicación por usuario (handoff "Modo oscuro").
 *
 * La fuente de verdad es `User.theme`, no el navegador: quien elige oscuro lo
 * encuentra oscuro al volver a entrar desde cualquier dispositivo. El layout
 * raíz lo lee y lo escribe en `<html data-theme>` dentro del primer HTML del
 * servidor, así que no hay destello blanco ni efecto de cliente.
 */

export function isThemedPath(pathname: string | null | undefined): boolean {
  // Sin ruta conocida (el proxy no llegó a marcarla) se responde en claro: es
  // el tema de siempre y el que no rompe ninguna pantalla pública.
  if (!pathname) return false;
  // Las públicas se quedan siempre en claro: no hay sesión de la que leer la
  // preferencia. Se comparte la lista con el proxy justamente para que "ruta
  // pública" signifique lo mismo en los dos sitios.
  return !isPublicPath(pathname);
}

export async function themeForUser(userId: string): Promise<ThemePreference> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { theme: true },
  });
  return user?.theme ?? "LIGHT";
}

export function themeAttribute(theme: ThemePreference): "light" | "dark" {
  return theme === "DARK" ? "dark" : "light";
}

/**
 * Variante del logo que toca según el tema.
 *
 * Los assets de marca vienen en pareja (`tz-logo-black.png` / `-white.png`) y
 * la organización guarda UNO en `logoUrl`. En oscuro, el negro quedaba
 * literalmente invisible sobre el sidebar (#201f1c): el nombre del centro
 * desaparecía de la cabecera. Solo se cambia cuando el fichero declara su
 * variante en el nombre — un logo propio de cliente se sirve tal cual, porque
 * no sabemos si tiene contrapartida.
 */
export function logoUrlForTheme(logoUrl: string | null | undefined, theme: "light" | "dark"): string | null {
  if (!logoUrl) return null;
  const wanted = theme === "dark" ? "white" : "black";
  const other = theme === "dark" ? "black" : "white";
  return logoUrl.replace(new RegExp(`-${other}(?=\\.[a-z0-9]+$)`, "i"), `-${wanted}`);
}

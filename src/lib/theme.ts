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

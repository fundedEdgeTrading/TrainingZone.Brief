"use server";

import { revalidatePath } from "next/cache";
import type { ThemePreference } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export type ThemeActionResult = { ok: true } | { ok: false; error: string };

/**
 * Cambia el tema de quien lo pide y de nadie más: el `id` sale de la sesión,
 * nunca del cliente. Vale para los ocho roles — la tarjeta Apariencia es la
 * misma en el perfil del socio y en el del personal.
 */
export async function updateMyThemeAction(theme: ThemePreference): Promise<ThemeActionResult> {
  const session = await requireSession();

  if (theme !== "LIGHT" && theme !== "DARK") {
    return { ok: false, error: "Tema no válido." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { theme },
  });

  // El `data-theme` lo escribe el layout raíz: hay que revalidar el layout
  // entero, no solo la página del perfil, o la siguiente navegación seguiría
  // sirviendo el HTML con el tema anterior.
  revalidatePath("/", "layout");
  return { ok: true };
}

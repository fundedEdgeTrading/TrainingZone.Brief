import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TIMEZONE } from "@/lib/date-utils";

export const TIMEZONE_COOKIE = "tz";

/**
 * Zona horaria de referencia para todo lo que se mide en horas de pared
 * (agenda, cuentas atrás, fichaje). Prioridad:
 *
 * 1. La detectada en el navegador y guardada en la cookie por `TimezoneSync`:
 *    es la hora que el usuario tiene delante, contra la que compara.
 * 2. La del centro (`Center.timezone`), única fuente disponible cuando no hay
 *    navegador detrás — p. ej. la API móvil.
 * 3. España, valor por defecto del esquema.
 *
 * Nunca la del servidor: en producción corre en UTC, y de ahí venían los
 * "quedan X minutos" con dos horas de desfase.
 */
export async function resolveTimezone(centerTimezone?: string | null): Promise<string> {
  return (await timezoneFromCookie()) ?? centerTimezone ?? DEFAULT_TIMEZONE;
}

/**
 * Igual que `resolveTimezone`, pero solo consulta el centro si hace falta
 * (es decir, si el navegador no ha dejado su zona en la cookie).
 */
export async function resolveTimezoneForCenter(centerId?: string | null): Promise<string> {
  const fromCookie = await timezoneFromCookie();
  if (fromCookie) return fromCookie;
  if (!centerId) return DEFAULT_TIMEZONE;
  const center = await prisma.center.findUnique({ where: { id: centerId }, select: { timezone: true } });
  return center?.timezone || DEFAULT_TIMEZONE;
}

async function timezoneFromCookie(): Promise<string | null> {
  try {
    const value = (await cookies()).get(TIMEZONE_COOKIE)?.value;
    // La cookie la escribe el navegador: se valida antes de dársela a `Intl`.
    return value && isValidTimezone(value) ? value : null;
  } catch {
    // Fuera de una petición (jobs, scripts) no hay cookies que leer.
    return null;
  }
}

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

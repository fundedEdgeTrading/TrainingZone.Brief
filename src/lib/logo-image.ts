/**
 * Logos de organización en las páginas públicas (E9-12).
 *
 * Dos problemas distintos, y el segundo es el grave:
 *
 *  · **CLS.** Los logos eran `<img>` sin dimensiones, justo encima del `<h1>`:
 *    la página se recolocaba entera al cargar la imagen, en el bloque donde se
 *    decide la conversión.
 *  · **LCP a merced de un tercero.** `logoUrl` es una URL arbitraria que escribe
 *    cada organización. Un gimnasio puede pegar un PNG de 3 MB y hundir el LCP
 *    de su propia página sin enterarse.
 *
 * `next/image` resuelve los dos —reserva la caja y sirve una versión
 * optimizada—, pero optimizar exige declarar de qué hosts se aceptan imágenes.
 * Y ahí la tentación es abrir `hostname: "**"`, que convierte el optimizador en
 * un proxy de imágenes abierto para cualquiera que descubra la URL. No se hace:
 * se optimiza lo que viene de un host conocido y lo demás se sirve tal cual,
 * pero **siempre con la caja declarada**, que es la mitad que arregla el CLS.
 *
 * Módulo puro: lo comparten el componente y `next.config.ts`.
 */

/**
 * Caja del logo en la ficha pública. Es un máximo, no un tamaño: la imagen va
 * con `object-contain` dentro, así que un logo cuadrado y uno apaisado ocupan
 * la misma altura y ninguno deforma.
 */
export const LOGO_BOX = { width: 160, height: 36 } as const;

/**
 * Hosts de los que se aceptan logos para optimizar.
 *
 * Se configuran con `NEXT_PUBLIC_LOGO_HOSTS` (lista separada por comas). Se
 * admite el comodín de subdominio de Next (`*.midominio.com`). Sin variable, la
 * lista está vacía: solo se optimizan los logos servidos desde el propio
 * dominio, que son los que empiezan por `/`.
 */
export function logoHosts(env: Record<string, string | undefined> = process.env): string[] {
  return (env.NEXT_PUBLIC_LOGO_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
}

export type LogoKind = "local" | "optimizable" | "foreign";

/**
 * Cómo hay que servir este logo.
 *
 *  · `local` — ruta relativa del propio despliegue: `next/image` sin más.
 *  · `optimizable` — host declarado: `next/image`, que lo redimensiona y lo
 *    convierte a un formato moderno aunque el original pese 3 MB.
 *  · `foreign` — cualquier otro: `<img>` con la caja declarada. Se pierde la
 *    optimización, no el CLS.
 */
export function classifyLogo(url: string, hosts: string[] = logoHosts()): LogoKind {
  const trimmed = url.trim();
  if (!trimmed) return "foreign";
  // Una ruta relativa sale del propio despliegue: no hay tercero al que
  // autorizar.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return "local";

  let hostname: string;
  try {
    hostname = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return "foreign";
  }

  return hosts.some((pattern) => hostMatches(hostname, pattern)) ? "optimizable" : "foreign";
}

/** `*.midominio.com` casa con cualquier subdominio, pero no con el dominio pelado (igual que Next). */
function hostMatches(hostname: string, pattern: string): boolean {
  const lower = pattern.toLowerCase();
  if (lower.startsWith("*.")) return hostname.endsWith(lower.slice(1)) && hostname !== lower.slice(2);
  return hostname === lower;
}

/** Los `remotePatterns` de `next.config.ts`, derivados de la misma lista. */
export function logoRemotePatterns(env: Record<string, string | undefined> = process.env) {
  return logoHosts(env).map((hostname) => ({ protocol: "https" as const, hostname }));
}

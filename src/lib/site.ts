/**
 * Identidad pública del producto y origen canónico, en un solo sitio (E9-03).
 *
 * Antes de esto, `NEXTAUTH_URL` se leía por su cuenta en seis módulos con seis
 * copias del mismo `||` en cadena, y la marca vivía en cuatro líneas sueltas del
 * layout raíz. Un cambio de nombre o de dominio era arqueología; ahora es una
 * línea.
 *
 * El módulo se mantiene **puro** (nada de Prisma, nada de `next/*`): lo importan
 * las plantillas de correo, que tienen que poder renderizarse y probarse sin
 * base de datos.
 */

export const BRAND = {
  /**
   * Nombre del producto. El logo (`apta-logo.tsx`) siempre dijo "Apta" mientras
   * el `<title>` decía "TRAINING ZONE": dos marcas para el mismo dominio, y
   * Google indexando las dos. Manda el logo — TRAINING ZONE es el centro
   * piloto, no la plataforma.
   */
  name: "Apta",

  /**
   * `<title>` de la portada. "TRAINING ZONE" era una marca desconocida ocupando
   * los 60 caracteres más valiosos y sin una sola palabra clave; este lleva la
   * consulta principal delante y el nombre detrás.
   */
  title: "Software de gestión para gimnasios y centros de entrenamiento · Apta",

  /**
   * Plantilla del resto de páginas: cada una pone su propio título y hereda el
   * sufijo de marca.
   */
  titleTemplate: "%s · Apta",

  /**
   * Descripción por defecto. Se usa en la meta `description` y en la tarjeta que
   * sale al compartir el enlace.
   */
  description:
    "Apta es el software con el que un centro de entrenamiento personal y grupos reducidos lleva su agenda, sus bonos, sus cobros y sus socios desde un único sitio.",

  locale: "es_ES",
} as const;

/** Cuando no hay nada configurado, el desarrollo en local. */
const FALLBACK_ORIGIN = "http://localhost:3000";

/**
 * Origen público canónico, sin barra final: `https://midominio.com`.
 *
 * Se lee en este orden:
 * 1. `NEXT_PUBLIC_SITE_URL`, para poder separar el dominio de marketing del de
 *    autenticación el día que dejen de ser el mismo.
 * 2. `NEXTAUTH_URL` / `AUTH_URL`, que es lo que hay configurado hoy.
 * 3. `RENDER_EXTERNAL_URL`, que el propio Render inyecta: sirve de red de
 *    seguridad en un despliegue de vista previa donde nadie ha puesto las otras.
 *
 * Un valor sin protocolo se normaliza a `https://` en vez de propagarse roto:
 * poner el host a secas es el error de configuración más común, y aquí no
 * revienta hasta que alguien abre un correo con un enlace que no navega.
 */
export function publicOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    FALLBACK_ORIGIN;

  const trimmed = raw.trim();
  if (!trimmed) return FALLBACK_ORIGIN;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    // `new URL` descarta de paso la ruta, la query y el hash: lo que se quiere
    // es el origen, y un `NEXTAUTH_URL` con `/api/auth` detrás rompería toda
    // URL construida a partir de él.
    return new URL(withProtocol).origin;
  } catch {
    return FALLBACK_ORIGIN;
  }
}

/**
 * URL absoluta a partir de una ruta. Los clientes de correo no tienen un origen
 * desde el que resolver rutas relativas, así que toda imagen y todo enlace de
 * una plantilla la necesita.
 */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${publicOrigin()}${path.startsWith("/") ? "" : "/"}${path}`;
}

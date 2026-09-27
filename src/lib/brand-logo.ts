import { absoluteUrl } from "@/lib/site";

/**
 * Qué logo se pinta en cada fondo. Única fuente para el menú lateral, el
 * portal, la cabecera de los emails y el login de la app: antes cada superficie
 * decidía a su manera y un logo negro subido por el gimnasio quedaba invisible
 * sobre fondo oscuro (la cabecera de TODOS los emails lo es, con o sin tema
 * oscuro).
 *
 * Orden para el fondo oscuro:
 *  1. `logoDarkUrl` que haya subido el gimnasio (del mismo nivel que el logo).
 *  2. La pareja por nombre de fichero de los assets propios
 *     (`tz-logo-black.png` ↔ `-white.png`, ver `logoUrlForTheme`).
 *  3. El logo normal sobre una pastilla clara (`darkOnPlate`): se lee siempre y
 *     respeta los colores de la marca. Invertirlo con un filtro estropearía
 *     cualquier logo a color.
 */

/**
 * Pareja por nombre de fichero de los assets propios.
 *
 * Los assets de marca vienen en pareja (`tz-logo-black.png` / `-white.png`) y
 * la organización guarda UNO en `logoUrl`. En oscuro, el negro quedaba
 * literalmente invisible sobre el sidebar (#201f1c): el nombre del centro
 * desaparecía de la cabecera. Solo se cambia cuando el fichero declara su
 * variante en el nombre; un logo subido por el gimnasio no la tiene, y para
 * eso están `logoDarkUrl` y la pastilla de `resolveBrandLogo`.
 */
export function logoUrlForTheme(logoUrl: string | null | undefined, theme: "light" | "dark"): string | null {
  if (!logoUrl) return null;
  const wanted = theme === "dark" ? "white" : "black";
  const other = theme === "dark" ? "black" : "white";
  return logoUrl.replace(new RegExp(`-${other}(?=\\.[a-z0-9]+$)`, "i"), `-${wanted}`);
}

export type LogoSource = { logoUrl: string | null; logoDarkUrl: string | null };

export type BrandLogo = {
  /** Para fondo claro. */
  light: string;
  /** Para fondo oscuro. Igual a `light` cuando va sobre pastilla. */
  dark: string;
  /** En fondo oscuro, `dark` (= `light`) se pinta sobre una pastilla clara. */
  darkOnPlate: boolean;
};

/**
 * El primer nivel con logo propio manda, con SU versión oscura: el logo de un
 * centro nunca se combina con la versión oscura del de la organización (serían
 * dos marcas distintas). `null` si ningún nivel tiene logo: se pinta el de Apta.
 */
export function resolveBrandLogo(...levels: (LogoSource | null | undefined)[]): BrandLogo | null {
  const level = levels.find((l) => l?.logoUrl);
  if (!level?.logoUrl) return null;
  const light = level.logoUrl;

  if (level.logoDarkUrl) return { light, dark: level.logoDarkUrl, darkOnPlate: false };

  const paired = logoUrlForTheme(light, "dark");
  if (paired && paired !== light) return { light, dark: paired, darkOnPlate: false };

  return { light, dark: light, darkOnPlate: true };
}

/** Logo por defecto (Apta/Training Zone) en su versión para fondo oscuro. */
export const DEFAULT_DARK_LOGO = "/brand/tz-logo-white.png";

/** La pareja por defecto, para las pantallas que pintan una imagen siempre. */
export const DEFAULT_BRAND_LOGO: BrandLogo = {
  light: "/brand/tz-logo-black.png",
  dark: DEFAULT_DARK_LOGO,
  darkOnPlate: false,
};

/** Lo que recibe la cabecera de un email: URL absoluta y si va sobre pastilla. */
export type EmailLogo = { url: string; onPlate: boolean };

/**
 * Logo de la cabecera de los emails, que es oscura siempre. Sin logo propio,
 * el de Apta en blanco (lo de siempre).
 */
export function emailBrandLogo(...levels: (LogoSource | null | undefined)[]): EmailLogo {
  const logo = resolveBrandLogo(...levels);
  if (!logo) return { url: absoluteUrl(DEFAULT_DARK_LOGO), onPlate: false };
  return { url: absoluteUrl(logo.dark), onPlate: logo.darkOnPlate };
}

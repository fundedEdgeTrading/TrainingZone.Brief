/**
 * Reglas de indexación, en un solo sitio (E9-02).
 *
 * Antes de esto `grep -rn "robots\|noindex" src/` no devolvía nada: el único
 * freno era el redirect del proxy, que evita SERVIR el contenido pero no evita
 * que Google descubra e indexe la URL. Y había seis rutas públicas con un token
 * firmado dentro de la propia URL, sin `noindex`, que viajan en el pie de todos
 * los correos transaccionales. Un `/gestionar-suscripcion/<token>` indexado es
 * acceso sin contraseña al método de pago de una persona, expuesto en la SERP:
 * un incidente de datos personales, no un problema de posicionamiento.
 *
 * El módulo se mantiene sin Prisma y sin `next/*` en tiempo de ejecución (solo
 * el tipo `Metadata`), para poder probarlo sin base de datos.
 */

import type { Metadata } from "next";

import { PUBLIC_PATHS } from "@/lib/public-paths";

/**
 * Lo único que queremos en el índice.
 *
 * Es un subconjunto estricto de `PUBLIC_PATHS` —hay un test que lo comprueba—:
 * "servible sin sesión" y "publicable" no son lo mismo. `/login`,
 * `/demo-checkout` o `/servicio-no-disponible` son públicas y no pintan nada en
 * una SERP; las seis con token, además, no deben ni visitarse.
 */
export const INDEXABLE_PATHS: readonly string[] = [
  "/planes",
  "/privacidad",
  "/hazte-socio",
  // E9-11
  "/funcionalidades",
  "/para",
  "/centros",
];

/**
 * Rutas públicas que NO se indexan, listadas una a una en `Disallow`.
 *
 * El `Disallow: /` final ya las cubriría, pero se escriben igualmente: un
 * robots.txt es también documentación operativa, y quien lo audite tiene que
 * poder leer que las rutas con token están excluidas sin deducirlo de una regla
 * comodín.
 */
export const TOKEN_PATHS = [
  "/onboarding",
  "/verificar-email",
  "/recuperar-clave",
  "/gestionar-suscripcion",
  "/preferencias",
  "/baja",
] as const;

/** Públicas, sin token, y aun así fuera del índice. */
export const NOINDEX_PUBLIC_PATHS = [
  "/login",
  "/activar",
  "/demo-checkout",
  "/servicio-no-disponible",
  "/lead-form",
  "/hazte-socio/gracias",
  "/api/",
] as const;

/**
 * `index:false, follow:false` para todo lo privado. `follow:false` y no
 * `follow:true` a propósito: desde una pantalla autenticada no hay nada que
 * Google deba seguir.
 */
export const NOINDEX: Metadata["robots"] = { index: false, follow: false };

/**
 * Lo que lleva una página cuyo token viaja en la URL.
 *
 * `nocache` le pide además a Google que no guarde copia ni fragmento, y
 * `referrer: no-referrer` es la mitad que no es de SEO: sin él, cualquier
 * recurso de terceros que cargue la página (o un enlace de salida) manda la URL
 * COMPLETA —token incluido— en la cabecera `Referer`.
 */
export const TOKEN_PAGE_METADATA: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/** Igual que la anterior pero con título, que es como se usa en cada página. */
export function tokenPageMetadata(title: string): Metadata {
  return { ...TOKEN_PAGE_METADATA, title };
}

/**
 * Reglas de `robots.txt`, derivadas de `PUBLIC_PATHS`.
 *
 * La forma es allowlist, no denylist: `Disallow: /` de fondo y `Allow` para lo
 * publicable. Enumerar lo privado exigiría mantener a mano una lista de 39
 * rutas que nadie recordará actualizar; con la regla al revés, una pantalla
 * nueva nace fuera del índice, que es el fallo seguro.
 */
export function robotsRules() {
  return {
    userAgent: "*",
    allow: [...INDEXABLE_PATHS],
    disallow: [...TOKEN_PATHS, ...NOINDEX_PUBLIC_PATHS, "/"],
  };
}

/** Toda ruta indexable tiene que ser, antes, una ruta pública. */
export function indexablePathsArePublic(): boolean {
  return INDEXABLE_PATHS.every((path) => PUBLIC_PATHS.some((p) => path.startsWith(p)) || path === "/");
}

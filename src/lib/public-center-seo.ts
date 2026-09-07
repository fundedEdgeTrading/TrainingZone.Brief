/**
 * Metadatos de una página pública de centro (E9-04).
 *
 * Las dos plantillas (`/hazte-socio/[org]/[centro]` y `/lead-form/[org]/[centro]`)
 * tenían `metadata` ESTÁTICOS pese a que el nombre del centro está disponible en
 * el render: cien centros eran cien URLs con el mismo título y el mismo cuerpo
 * salvo el `<h1>`. Google los agrupa, elige una sola canónica y las noventa y
 * nueve restantes desaparecen — es decir, la propuesta de valor "cada centro con
 * su página" no existía funcionalmente.
 *
 * Módulo puro: solo el tipo `Metadata`, nada de Prisma. Se prueba sin base de
 * datos.
 */

import type { Metadata } from "next";

import { BRAND } from "@/lib/site";

/** Lo mínimo que hace falta para componer título, descripción y canónica. */
export type PublicCenterSeo = {
  orgName: string;
  orgSlug: string;
  centerName: string;
  centerSlug: string;
  city: string | null;
  neighborhood: string | null;
  /** Párrafo propio del centro. Es el campo que decide si esto posiciona. */
  description: string | null;
  /**
   * Interruptor de publicación (E9-05). Por defecto APAGADO: publicar los datos
   * de un centro es una decisión suya, no un efecto colateral de migrar. Un
   * centro sin publicar sigue siendo alcanzable por su enlace directo —el
   * gimnasio lo reparte a mano— pero ni entra en el sitemap ni se indexa.
   */
  publicPage: boolean;
};

/** La URL pública de alta de socios de un centro. Fuente única: la usa el sitemap, la canónica y la puesta en marcha. */
export function membershipPath(orgSlug: string, centerSlug: string): string {
  return `/hazte-socio/${orgSlug}/${centerSlug}`;
}

/**
 * Etiquetas de caché de la ficha pública (E9-14).
 *
 * Viven aquí, junto a las rutas, porque son la otra cara de la misma cadena: la
 * página se cachea con una etiqueta y quien edita la invalida con la misma, y si
 * las dos puntas no escriben exactamente lo mismo el cambio no se ve y nadie se
 * entera hasta que un gimnasio se queja de que su teléfono nuevo no sale.
 *
 * Se etiqueta por **slug** y no por id: la página se cachea antes de saber el id
 * del centro (la clave de caché es la URL), así que el id no está disponible en
 * el punto donde se declara la etiqueta.
 */
export function centerPublicTag(orgSlug: string, centerSlug: string): string {
  return `center-public:${orgSlug}/${centerSlug}`;
}

/**
 * Catálogo de una organización. Va aparte del centro porque su ciclo de vida es
 * otro: cambiar una tarifa afecta a la ficha de TODOS sus centros a la vez.
 */
export function orgCatalogTag(orgSlug: string): string {
  return `org-catalog:${orgSlug}`;
}

/** La URL del formulario de leads embebible. No se indexa (canoniza a la de arriba). */
export function leadFormPath(orgSlug: string, centerSlug: string): string {
  return `/lead-form/${orgSlug}/${centerSlug}`;
}

/**
 * Título del centro. Lleva delante el nombre —que es lo que se busca cuando ya
 * se conoce— y detrás la intención local, que es lo que lo hace aparecer cuando
 * no. La plantilla del layout raíz añade el sufijo de marca.
 */
export function centerTitle(center: PublicCenterSeo): string {
  if (center.city) return `${center.centerName} · Gimnasio en ${center.city}`;
  return `${center.centerName} · Hazte socio`;
}

/**
 * Descripción. Manda el párrafo propio del centro: sin él la plantilla
 * compartida sigue siendo contenido duplicado aunque el título cambie. Cuando no
 * lo hay se compone uno con lo que se sepa, que al menos no es idéntico entre
 * centros.
 */
export function centerDescription(center: PublicCenterSeo): string {
  if (center.description?.trim()) return truncate(center.description.trim(), 300);

  const place = [center.neighborhood, center.city].filter(Boolean).join(", ");
  if (place) {
    return `${center.centerName}, centro de entrenamiento en ${place}. Consulta cuotas y bonos, y hazte socio online en unos minutos.`;
  }
  return `${center.centerName}, de ${center.orgName}. Consulta cuotas y bonos, y hazte socio online en unos minutos.`;
}

/**
 * Metadatos de `/hazte-socio/[org]/[centro]`.
 *
 * Declara SU PROPIA URL como canónica: es la página con precios, y es la que
 * tiene que ganar frente a `/lead-form`, que compite por la misma intención.
 */
export function centerMembershipMetadata(center: PublicCenterSeo): Metadata {
  const title = centerTitle(center);
  const description = centerDescription(center);
  const url = membershipPath(center.orgSlug, center.centerSlug);

  return {
    title,
    description,
    robots: center.publicPage ? undefined : { index: false, follow: true },
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: BRAND.name,
      locale: BRAND.locale,
      title,
      description,
      url,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Metadatos de `/lead-form/[org]/[centro]`.
 *
 * `index:false, follow:true` y canónica hacia `/hazte-socio`: las dos compiten
 * por la misma intención y, sin esto, Google elegiría probablemente el
 * formulario —que es el que el gimnasio embebe en su web y por tanto el que
 * recibe enlaces—, y el visitante aterrizaría en un formulario en vez de en la
 * página con los precios.
 */
export function centerLeadFormMetadata(center: PublicCenterSeo): Metadata {
  const title = center.city ? `${center.centerName} · Pide tu valoración en ${center.city}` : `${center.centerName} · Pide tu valoración`;

  return {
    title,
    description: centerDescription(center),
    robots: { index: false, follow: true },
    alternates: { canonical: membershipPath(center.orgSlug, center.centerSlug) },
  };
}

/** Lo que se sirve cuando el centro no existe o no tiene un solo dato propio. */
export const GENERIC_CENTER_METADATA: Metadata = {
  title: "Hazte socio",
  description: BRAND.description,
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

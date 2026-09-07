/**
 * Datos estructurados (E9-07).
 *
 * `grep -rn "application/ld+json\|schema.org"` no devolvía nada. Sin marcado, la
 * FAQ que ya está escrita en `planes/faq.tsx` no puede salir como resultado
 * enriquecido, y una ficha de centro no se distingue de cualquier otra página.
 *
 * Dos reglas gobiernan este módulo, y las dos son de "mejor nada que a medias":
 *
 *  · **Marcado incompleto es peor que ausente.** Un `SportsActivityLocation` sin
 *    dirección ni coordenadas no gana nada y sí puede acarrear una acción manual
 *    por datos estructurados inválidos. Por eso el constructor devuelve `null`.
 *  · **Nunca un precio que no sea el que se cobra.** `PlatformPlan.priceLabel`
 *    es solo presentación ("desde 49 €/mes"): marcarlo como `price` es afirmar
 *    un importe que puede no coincidir con el cargo real.
 *
 * Módulo puro: devuelve objetos planos, sin `next/*` ni Prisma, así que su forma
 * se puede comprobar en test sin levantar nada.
 */

import { BRAND, absoluteUrl } from "@/lib/site";
import { toSchemaOpeningHours, type OpeningHours } from "@/lib/opening-hours";

/** Todo objeto de este módulo lleva su contexto: se emiten sueltos, no en un `@graph`. */
type JsonLdNode = Record<string, unknown> & { "@context": "https://schema.org"; "@type": string };

/**
 * `Organization` en el layout raíz: quién es Apta, con su logo y su URL
 * canónica. Es lo que permite que el nombre de marca se resuelva a una entidad
 * en vez de a una cadena.
 */
export function organizationJsonLd(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.name,
    url: absoluteUrl("/"),
    description: BRAND.description,
    logo: absoluteUrl("/opengraph-image"),
    areaServed: { "@type": "Country", name: "España" },
  };
}

/**
 * `FAQPage` derivado del array `FAQS`, no escrito a mano.
 *
 * Es la diferencia entre un marcado que envejece bien y uno que miente: si
 * mañana cambia una respuesta y el JSON-LD sigue diciendo lo anterior, el
 * resultado enriquecido enseña algo que la página no dice — y eso sí es motivo
 * de penalización.
 */
export function faqPageJsonLd(faqs: readonly { q: string; a: string }[]): JsonLdNode | null {
  if (faqs.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export type CenterJsonLdInput = {
  name: string;
  url: string;
  description: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  openingHours: OpeningHours | null;
  /** Planes del centro. El importe SÍ es canónico aquí: es el que se cobra. */
  offers: readonly { name: string; priceCents: number }[];
};

/**
 * `SportsActivityLocation` de un centro — **solo** si tiene dirección y
 * coordenadas.
 *
 * Sin `address` no hay negocio local que describir y sin `geo` Google no puede
 * situarlo: lo que quedaría es una entidad a medias que no gana ningún resultado
 * enriquecido y sí puede costar una advertencia. `null` es la respuesta correcta.
 */
export function centerJsonLd(center: CenterJsonLdInput): JsonLdNode | null {
  if (!center.address || center.lat === null || center.lng === null) return null;

  const openingHours = toSchemaOpeningHours(center.openingHours);

  return {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: center.name,
    url: center.url,
    ...(center.description ? { description: center.description } : {}),
    ...(center.phone ? { telephone: center.phone } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: center.address,
      ...(center.city ? { addressLocality: center.city } : {}),
      ...(center.postalCode ? { postalCode: center.postalCode } : {}),
      // D-P3: solo España durante 12 meses.
      addressCountry: "ES",
    },
    geo: { "@type": "GeoCoordinates", latitude: center.lat, longitude: center.lng },
    ...(openingHours.length ? { openingHours } : {}),
    ...(center.offers.length
      ? {
          makesOffer: center.offers.map((offer) => ({
            "@type": "Offer",
            name: offer.name,
            // Aquí el importe SÍ es canónico: es exactamente el que la página
            // enseña y el que se cobra en el checkout. Distinto del
            // `priceLabel` del catálogo de plataforma, que es presentación.
            price: (offer.priceCents / 100).toFixed(2),
            priceCurrency: "EUR",
            availability: "https://schema.org/InStock",
          })),
        }
      : {}),
  };
}

/**
 * Oferta de un plan de plataforma, **sin `price`**.
 *
 * `priceLabel` es una cadena de presentación y los importes reales viven en
 * Stripe, resueltos por entorno (RB-PLAN-001). Marcar el rótulo como precio
 * sería afirmar un importe que puede no coincidir con el cargo. Se emite la
 * oferta sin precio hasta que exista un importe canónico que leer.
 */
export function platformOffersJsonLd(plans: readonly { name: string; code: string }[]): JsonLdNode | null {
  if (plans.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${BRAND.name} · software de gestión para gimnasios`,
    description: BRAND.description,
    brand: { "@type": "Brand", name: BRAND.name },
    offers: plans.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      url: absoluteUrl("/planes"),
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
    })),
  };
}

/**
 * Serializa para meter en un `<script type="application/ld+json">`.
 *
 * `<` se escapa: un `</script>` dentro de cualquier cadena —el nombre de un
 * centro lo escribe el gimnasio— cerraría la etiqueta y convertiría el resto del
 * JSON en HTML ejecutable.
 */
export function serializeJsonLd(node: JsonLdNode | null): string {
  if (!node) return "";
  return JSON.stringify(node).replace(/</g, "\\u003c");
}

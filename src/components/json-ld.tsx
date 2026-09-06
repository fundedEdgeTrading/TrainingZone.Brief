import { serializeJsonLd } from "@/lib/json-ld";

type JsonLdNode = Parameters<typeof serializeJsonLd>[0];

/**
 * E9-07 · Un bloque de datos estructurados.
 *
 * Componente de servidor: el JSON-LD tiene que estar en el HTML de la primera
 * respuesta. Google renderiza JavaScript, pero lo hace en una segunda pasada y
 * con retraso; un marcado que solo existe tras hidratar es un marcado que tarda
 * semanas en contar.
 */
export function JsonLd({ node }: { node: JsonLdNode }) {
  const json = serializeJsonLd(node);
  if (!json) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

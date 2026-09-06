import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { citySlug } from "@/lib/landing-pages";

/**
 * E11-08 · Geometría real de una ciudad, en TopoJSON.
 *
 * **Por qué una ruta y no una columna.** La otra opción era guardar el anillo en
 * `PostalCodeArea.ring`, pero `prisma/schema.prisma` está congelado este
 * trimestre. La ruta además tiene una ventaja propia: la geometría es un
 * fichero estático que cambia cuando el ayuntamiento publica una revisión, es
 * decir casi nunca, así que se cachea agresivamente y no toca la base de datos.
 *
 * **Una ciudad por petición, y solo la que se está mirando.** Servir el país
 * entero para pintar Zaragoza sería mandar al cliente noventa y nueve ciudades
 * que no va a ver — y el mapa carga en una pantalla de dirección que a menudo se
 * abre desde una tableta con datos móviles.
 *
 * Cuando una ciudad no tiene geometría publicada se responde 404 **a propósito**:
 * el cliente lo trata como "usa la teselación", que es el respaldo, y la leyenda
 * lo dice.
 */

/** Un día. La geometría de un barrio no cambia entre dos visitas. */
export const revalidate = 86_400;

const GEO_DIR = path.join(process.cwd(), "src", "data", "geo");

export async function GET(_request: Request, { params }: { params: Promise<{ ciudad: string }> }) {
  const { ciudad } = await params;

  // El slug se normaliza y se vuelve a comprobar: es lo único que separa esta
  // ruta de un `readFile` con la ruta que escriba quien llame. Sin esto,
  // `/api/geo/..%2F..%2F.env` es una lectura arbitraria de disco.
  const slug = citySlug(ciudad);
  if (!slug || slug !== ciudad.toLowerCase()) {
    return NextResponse.json({ error: "Ciudad no reconocida." }, { status: 400 });
  }

  try {
    const file = await readFile(path.join(GEO_DIR, `${slug}.topo.json`), "utf8");
    return new NextResponse(file, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        // Inmutable dentro de su ventana: el fichero se sustituye entero cuando
        // hay revisión, y entonces cambia el despliegue.
        "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    // 404 y no 500: "esta ciudad no tiene geometría publicada" es un estado
    // normal, no una avería, y el mapa sabe qué hacer con él.
    return NextResponse.json({ error: "Sin geometría publicada para esta ciudad." }, { status: 404 });
  }
}

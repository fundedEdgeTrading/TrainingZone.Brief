import { ImageResponse } from "next/og";

import { BRAND } from "@/lib/site";

/**
 * E9-03 · Tarjeta por defecto al compartir un enlace.
 *
 * Sin OG, cada enlace compartido salía como texto plano — y en venta B2B a
 * dueños de gimnasio la recomendación ocurre por mensajería, así que la tarjeta
 * es la primera impresión del producto más veces que la propia portada.
 *
 * Se genera aquí en vez de servir un PNG del repositorio para no tener que
 * mantener un binario a mano cada vez que cambie el nombre o el claim: el texto
 * sale de `BRAND`. Next la enlaza sola desde el layout raíz y la heredan todas
 * las rutas que no declaren la suya.
 */
export const alt = `${BRAND.name} · ${BRAND.description}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#1D1D1C",
          color: "#F4F0E8",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: "-0.02em" }}>{BRAND.name}</div>
          <div style={{ width: 10, height: 10, borderRadius: 10, background: "#C8A24C" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.12, letterSpacing: "-0.02em", maxWidth: 940 }}>
            Software de gestión para gimnasios y centros de entrenamiento
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.35, color: "#A8A296", maxWidth: 880 }}>
            Agenda, bonos, cobros y socios desde un único sitio.
          </div>
        </div>
      </div>
    ),
    size,
  );
}

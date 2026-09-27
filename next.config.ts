import type { NextConfig } from "next";

import {
  NO_REFERRER_HEADER,
  SIGNED_TOKEN_ROUTES,
  UPLOADED_FILE_CSP_HEADER,
  UPLOADED_FILE_ROUTES,
  securityHeaders,
} from "./src/lib/security-headers";
import { logoRemotePatterns } from "./src/lib/logo-image";

const nextConfig: NextConfig = {
  // "Mi plan" + "Comprar/renovar" se fusionaron en "Mi membresía" (handoff
  // NavBar premium 1b). 308 real a nivel de red para no romper enlaces
  // guardados o compartidos hacia las rutas antiguas.
  async redirects() {
    return [
      { source: "/portal/plan", destination: "/portal/membresia", permanent: true },
      { source: "/portal/comprar", destination: "/portal/membresia", permanent: true },
    ];
  },

  // E1-09. La política vive en `src/lib/security-headers.ts`, donde se puede
  // leer el porqué de cada directiva y donde la fija un test.
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders(process.env.NODE_ENV === "production") },
      // Van después para que su `Referrer-Policy` gane a la general: cuando dos
      // reglas coinciden en la misma clave, Next se queda con la última.
      //
      // E9-02 lo dice además en la propia página, con `referrer: "no-referrer"`
      // en su metadata. No es duplicado: la cabecera protege la respuesta que
      // sirve el servidor y la meta viaja con el documento, así que la URL con
      // token sigue sin filtrarse si alguien guarda la página o la abre desde
      // una caché.
      ...SIGNED_TOKEN_ROUTES.map((source) => ({ source, headers: [NO_REFERRER_HEADER] })),
      // Imágenes subidas: su propia CSP, más cerrada que la general.
      ...UPLOADED_FILE_ROUTES.map((source) => ({ source, headers: [UPLOADED_FILE_CSP_HEADER] })),
    ];
  },

  /**
   * Las imágenes viajan dentro del formulario como `data:` URL (ver
   * `components/ui/dropzone.tsx`), y el tope por defecto de una server action
   * es 1 MB. El caso más grande es una entrada de evolución con tres fotos de
   * hasta 2 MB cada una (el navegador las reescala antes; en base64 ocupan 4/3).
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  /**
   * E9-12 · Logos de organización.
   *
   * `logoUrl` es una URL arbitraria que escribe cada gimnasio, así que la
   * pregunta no es "cómo optimizo cualquier imagen" sino "de quién acepto
   * imágenes". Abrir `hostname: "**"` convertiría el optimizador de Next en un
   * proxy de imágenes abierto para cualquiera que descubra la ruta; la lista
   * sale de `NEXT_PUBLIC_LOGO_HOSTS` y lo que no case se sirve sin optimizar
   * pero con su caja declarada (ver `components/org-logo.tsx`).
   */
  images: {
    remotePatterns: logoRemotePatterns(),
    // Un logo no necesita más de esto, y cada tamaño extra es una variante más
    // que cachear.
    imageSizes: [16, 32, 48, 64, 96, 128, 160, 256],
    // Un SVG remoto es un documento que puede llevar script dentro: se sirve
    // como descarga y con CSP propia si algún día se activa.
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment",
  },
};

export default nextConfig;

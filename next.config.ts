import type { NextConfig } from "next";

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

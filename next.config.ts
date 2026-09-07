import type { NextConfig } from "next";
import { NO_REFERRER_HEADER, SIGNED_TOKEN_ROUTES, securityHeaders } from "./src/lib/security-headers";

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
      ...SIGNED_TOKEN_ROUTES.map((source) => ({ source, headers: [NO_REFERRER_HEADER] })),
    ];
  },
};

export default nextConfig;

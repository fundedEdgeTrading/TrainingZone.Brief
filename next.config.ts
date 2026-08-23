import type { NextConfig } from "next";

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
};

export default nextConfig;

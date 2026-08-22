import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Morph del avatar del socio entre la lista y su ficha: los dos nodos
    // comparten `viewTransitionName` y el navegador interpola posición y
    // tamaño. Donde no hay soporte, la navegación es un corte seco.
    viewTransition: true,
  },
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

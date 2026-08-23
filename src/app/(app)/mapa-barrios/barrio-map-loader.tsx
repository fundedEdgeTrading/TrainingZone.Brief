"use client";

import dynamic from "next/dynamic";

export type { BarrioMapProps } from "./barrio-map";

// Leaflet necesita `window`/DOM: se carga solo en cliente. El dynamic import con
// ssr:false debe vivir en un componente cliente (no está permitido directamente
// en un Server Component), de ahí este loader intermedio — el mismo patrón que
// `postal-heatmap-loader.tsx` en el panel de control.
const BarrioMap = dynamic(() => import("./barrio-map"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-tz-sand animate-pulse" />,
});

export default BarrioMap;

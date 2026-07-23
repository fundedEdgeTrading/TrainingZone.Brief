"use client";

import dynamic from "next/dynamic";

export type { MapMetric } from "./postal-heatmap";

// Leaflet necesita `window`/DOM: se carga solo en cliente. El dynamic import con
// ssr:false debe vivir en un componente cliente (no está permitido directamente
// en un Server Component), de ahí este loader intermedio.
const PostalHeatmap = dynamic(() => import("./postal-heatmap"), {
  ssr: false,
  loading: () => <div className="w-full h-[452px] bg-tz-sand animate-pulse" />,
});

export default PostalHeatmap;

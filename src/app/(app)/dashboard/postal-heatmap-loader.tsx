"use client";

import dynamic from "next/dynamic";

// Leaflet necesita `window`/DOM: se carga solo en cliente. El dynamic import con
// ssr:false debe vivir en un componente cliente (no está permitido directamente
// en un Server Component), de ahí este loader intermedio.
const PostalHeatmap = dynamic(() => import("./postal-heatmap"), {
  ssr: false,
  loading: () => <div className="w-full h-[380px] rounded-xl bg-tz-sand animate-pulse" />,
});

export default PostalHeatmap;

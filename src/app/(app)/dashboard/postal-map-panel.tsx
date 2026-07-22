"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/kpi-card";
import PostalHeatmap from "./postal-heatmap-loader";

type ProvinceStat = { code: string; name: string; lat: number; lng: number; leads: number; members: number; total: number };
type ProvinceRow = { code: string; name: string; leads: number; members: number; total: number };

/** BI-3: mapa de calor + lista de "Distribución por provincia" en un único cliente:
 * comparten estado (provincia seleccionada) para poder resaltar cruzado entre ambos —
 * clicar una fila de la lista vuela el mapa hasta su burbuja y viceversa. Reciben
 * siempre el mismo dataset (getPostalProvinceStats), así que sus totales nunca
 * pueden divergir entre sí. */
export function PostalMapPanel({
  points,
  pageItems,
  page,
  totalPages,
  total,
  maxTotal,
  otherParams,
}: {
  points: ProvinceStat[];
  pageItems: ProvinceRow[];
  page: number;
  totalPages: number;
  total: number;
  maxTotal: number;
  otherParams: Record<string, string>;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const buildUrl = (targetPage: number) => {
    const sp = new URLSearchParams(otherParams);
    sp.set("postalPage", String(targetPage));
    return `/dashboard?${sp.toString()}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
      <Card title="Mapa de calor (leads + clientes)" meta="por provincia del código postal — RB-LEAD-010" delay={0.64}>
        {points.length === 0 ? (
          <p className="text-sm text-brand-muted">Sin códigos postales geolocalizables todavía.</p>
        ) : (
          <PostalHeatmap points={points} selectedCode={selected} onSelectProvince={setSelected} />
        )}
      </Card>

      <Card title="Distribución por provincia" meta={`${total} provincias con datos`} delay={0.68}>
        {pageItems.length === 0 ? (
          <p className="text-sm text-brand-muted">Sin códigos postales registrados todavía.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {pageItems.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setSelected(p.code)}
                  className={`w-full flex items-center gap-3 text-sm text-left rounded-lg px-2 py-1.5 -mx-2 transition-colors duration-150 ${
                    selected === p.code ? "bg-tz-sand" : "hover:bg-tz-sand/60"
                  }`}
                >
                  <span className="w-24 shrink-0 font-semibold text-brand-text truncate">{p.name}</span>
                  <div className="flex-1 h-3 rounded-full bg-tz-sand overflow-hidden">
                    <div
                      className="h-full bg-tz-black rounded-full transition-[width] duration-500 ease-out"
                      style={{ width: `${(p.total / maxTotal) * 100}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-xs text-brand-muted text-right tz-nums">
                    {p.leads} leads · {p.members} clientes
                  </span>
                </button>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2 border-t border-tz-sand">
                {page > 1 && (
                  <Link href={buildUrl(1)} className="px-3 py-1 text-xs rounded-md bg-tz-sand text-tz-black hover:bg-opacity-80 transition-all">
                    Primero
                  </Link>
                )}
                {page > 1 && (
                  <Link href={buildUrl(page - 1)} className="px-3 py-1 text-xs rounded-md bg-tz-sand text-tz-black hover:bg-opacity-80 transition-all">
                    ← Anterior
                  </Link>
                )}
                <span className="text-xs text-brand-muted mx-2">
                  Página {page} de {totalPages}
                </span>
                {page < totalPages && (
                  <Link href={buildUrl(page + 1)} className="px-3 py-1 text-xs rounded-md bg-tz-sand text-tz-black hover:bg-opacity-80 transition-all">
                    Siguiente →
                  </Link>
                )}
                {page < totalPages && (
                  <Link href={buildUrl(totalPages)} className="px-3 py-1 text-xs rounded-md bg-tz-sand text-tz-black hover:bg-opacity-80 transition-all">
                    Último
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export default PostalMapPanel;

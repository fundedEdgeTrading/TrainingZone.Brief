"use client";

import { useId, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export type FeedbackFilterOption = { value: string; label: string };

// Bespoke, no `FilterBar` genérico: el handoff pide búsqueda + DOS grupos de
// chips (centro y alineación) + orden, y `FilterBar` (components/ui/filter-bar.tsx)
// solo soporta un grupo. Reutiliza la misma clase visual (tarjeta, franja
// dorada superior, chips pill) para no introducir un lenguaje nuevo.
export function FeedbackFilterBar({
  searchDefault,
  centerOptions,
  centerDefault,
  catOptions,
  catDefault,
  sortOptions,
  sortDefault,
}: {
  searchDefault?: string;
  centerOptions: FeedbackFilterOption[];
  centerDefault?: string;
  catOptions: FeedbackFilterOption[];
  catDefault?: string;
  sortOptions: FeedbackFilterOption[];
  sortDefault?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toggleId = useId();
  const [query, setQuery] = useState(searchDefault ?? "");
  const [centerId, setCenterId] = useState(centerDefault ?? "");
  const [cat, setCat] = useState(catDefault ?? "all");
  const [sort, setSort] = useState(sortDefault ?? "divergencia");

  const parts: string[] = [];
  if (query.trim()) parts.push(`«${query.trim()}»`);
  const centerOpt = centerOptions.find((o) => o.value === centerId && o.value !== "");
  if (centerOpt) parts.push(centerOpt.label);
  const catOpt = catOptions.find((o) => o.value === cat && o.value !== "all");
  if (catOpt) parts.push(catOpt.label);
  const activeCount = parts.length;

  function applyFilters() {
    const p = new URLSearchParams();
    if (query.trim()) p.set("q", query.trim());
    if (centerId) p.set("centerId", centerId);
    if (cat && cat !== "all") p.set("cat", cat);
    if (sort && sort !== "divergencia") p.set("sort", sort);
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function clearFilters() {
    setQuery("");
    setCenterId("");
    setCat("all");
    setSort("divergencia");
    router.push(pathname);
  }

  return (
    <div
      className="relative bg-brand-card border border-brand-border rounded-card overflow-hidden"
      style={{ boxShadow: "0 1px 2px rgba(29,29,28,.04), 0 6px 24px -14px rgba(29,29,28,.16)" }}
    >
      <div className="h-[3px]" style={{ background: "linear-gradient(90deg,#1d1d1c 0%,#c8ab72 55%,#e7dfd2 100%)" }} />
      <div className="p-3.5 md:p-6">
        {/* Checkbox-only toggle (sin JS): colapsado por defecto en móvil para
            no comerse la pantalla; en md+ siempre expandido, como antes. */}
        <input type="checkbox" id={toggleId} className="peer sr-only" />

        <div className="flex items-center justify-between gap-3 md:mb-4">
          <label
            htmlFor={toggleId}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer md:cursor-default md:pointer-events-none"
          >
            <span className="w-[30px] h-[30px] rounded-lg bg-tz-black inline-flex items-center justify-center shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f4f0e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-bold tracking-[.14em] uppercase text-brand-text-2">FILTRAR FEEDBACK</span>
              {activeCount > 0 && (
                <span className="block md:hidden text-[11.5px] text-faint truncate">{parts.join(" · ")}</span>
              )}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="md:hidden shrink-0 ml-1 text-brand-muted transition-transform duration-200 peer-checked:rotate-180"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </label>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-[7px] text-[12.5px] font-semibold text-brand-muted hover:bg-brand-bg hover:text-brand-text-2 px-2 py-1.5 rounded-lg transition-colors duration-200 shrink-0"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              <span className="hidden sm:inline">Limpiar</span>
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-pill bg-tz-black text-tz-bone text-[10.5px] font-bold">
                {activeCount}
              </span>
            </button>
          )}
        </div>

        <div className="hidden peer-checked:block md:block mt-4 md:mt-0">
        <label className="block text-[11px] font-bold uppercase tracking-[.1em] text-brand-muted mb-2">Búsqueda</label>
        <div className="relative mb-4 md:mb-[22px]">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 flex pointer-events-none">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8ab72" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre..."
            className="w-full rounded-control border border-brand-border bg-white pl-[46px] pr-4 py-[13px] text-[15px] text-brand-text placeholder:text-faint outline-none transition-[border-color,box-shadow] duration-200 focus:border-brand-ink focus:ring-[3px] focus:ring-tz-black/[0.08]"
          />
        </div>

        <label className="block text-[11px] font-bold uppercase tracking-[.1em] text-brand-muted mb-2.5">Centro</label>
        <div className="flex flex-wrap gap-2 items-center mb-4 md:mb-[22px]">
          {centerOptions.map((opt) => {
            const active = opt.value === centerId;
            return (
              <button
                key={opt.value || "__all_centers__"}
                type="button"
                onClick={() => setCenterId(opt.value)}
                className={`inline-flex items-center gap-[7px] px-[15px] py-2 rounded-pill text-[13px] font-semibold cursor-pointer transition-all duration-[180ms] ease-[cubic-bezier(.2,.8,.2,1)] ${
                  active
                    ? "bg-tz-black text-tz-bone border border-transparent"
                    : "bg-white border border-brand-border text-brand-text-2"
                }`}
                style={active ? { boxShadow: "0 6px 16px -8px rgba(29,29,28,.5)" } : undefined}
              >
                <span className="w-[7px] h-[7px] rounded-[2px] shrink-0" style={{ background: active ? "var(--color-tz-bone)" : "var(--color-faint)" }} />
                {opt.label}
              </button>
            );
          })}
        </div>

        <label className="block text-[11px] font-bold uppercase tracking-[.1em] text-brand-muted mb-2.5">Alineación</label>
        <div className="flex flex-wrap gap-2 items-center mb-4 md:mb-[22px]">
          {catOptions.map((opt) => {
            const active = opt.value === cat;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCat(opt.value)}
                className={`inline-flex items-center gap-[7px] px-[15px] py-2 rounded-pill text-[13px] font-semibold cursor-pointer transition-all duration-[180ms] ease-[cubic-bezier(.2,.8,.2,1)] ${
                  active
                    ? "bg-tz-black text-tz-bone border border-transparent"
                    : "bg-white border border-brand-border text-brand-text-2"
                }`}
                style={active ? { boxShadow: "0 6px 16px -8px rgba(29,29,28,.5)" } : undefined}
              >
                <span className="w-[7px] h-[7px] rounded-[2px] shrink-0" style={{ background: active ? "var(--color-tz-bone)" : "var(--color-faint)" }} />
                {opt.label}
              </button>
            );
          })}
        </div>

        <label className="block text-[11px] font-bold uppercase tracking-[.1em] text-brand-muted mb-2.5">Orden</label>
        <div className="flex flex-wrap gap-2 items-center">
          {sortOptions.map((opt) => {
            const active = opt.value === sort;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSort(opt.value)}
                className={`inline-flex items-center gap-[7px] px-[15px] py-2 rounded-pill text-[13px] font-semibold cursor-pointer transition-all duration-[180ms] ease-[cubic-bezier(.2,.8,.2,1)] ${
                  active
                    ? "bg-tz-black text-tz-bone border border-transparent"
                    : "bg-white border border-brand-border text-brand-text-2"
                }`}
                style={active ? { boxShadow: "0 6px 16px -8px rgba(29,29,28,.5)" } : undefined}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 mt-4 md:mt-6 pt-4 md:pt-5 border-t border-[#ede7dc] flex-wrap">
          <span className="text-[12.5px] text-faint">
            {activeCount === 0 ? "Sin filtros aplicados" : `Filtrando · ${parts.join(" · ")}`}
          </span>
          <Button type="button" onClick={applyFilters}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h18M6 12h12M10 19h4" />
            </svg>
            Filtrar
          </Button>
        </div>
        </div>
      </div>
    </div>
  );
}

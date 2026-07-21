"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { BadgeTone } from "@/components/ui/badge";

export type FilterOption = { value: string; label: string; tone?: BadgeTone };

type FilterBarProps = {
  kicker: string;
  searchName: string;
  searchPlaceholder: string;
  searchDefault?: string;
  chipName: string;
  chipLabel: string;
  chipOptions: FilterOption[];
  chipDefault?: string;
};

const TONE_HEX: Record<BadgeTone, string> = {
  good: "#4b5a22",
  critical: "#8a3420",
  warning: "#8a5a12",
  trial: "#5c4a34",
  prospect: "#5b4552",
  neutral: "#6e6a5e",
};

const TONE_BG_CLASS: Record<BadgeTone, string> = {
  good: "bg-good-bg",
  critical: "bg-critical-bg",
  warning: "bg-warning-bg",
  trial: "bg-trial-bg",
  prospect: "bg-prospect-bg",
  neutral: "bg-neutral-bg",
};

export function FilterBar({
  kicker,
  searchName,
  searchPlaceholder,
  searchDefault,
  chipName,
  chipLabel,
  chipOptions,
  chipDefault,
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(searchDefault ?? "");
  const [chip, setChip] = useState(chipDefault ?? "");

  const parts: string[] = [];
  if (query.trim()) parts.push(`«${query.trim()}»`);
  const chipOpt = chipOptions.find((o) => o.value === chip && o.value !== "");
  if (chipOpt) parts.push(chipOpt.label);
  const activeCount = parts.length;

  function applyFilters() {
    const p = new URLSearchParams();
    if (query.trim()) p.set(searchName, query.trim());
    if (chip) p.set(chipName, chip);
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function clearFilters() {
    setQuery("");
    setChip("");
    router.push(pathname);
  }

  return (
    <div
      className="relative bg-brand-card border border-brand-border rounded-card overflow-hidden"
      style={{ boxShadow: "0 1px 2px rgba(29,29,28,.04), 0 6px 24px -14px rgba(29,29,28,.16)" }}
    >
      <div
        className="h-[3px]"
        style={{ background: "linear-gradient(90deg,#1d1d1c 0%,#c8ab72 55%,#e7dfd2 100%)" }}
      />
      <div className="p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-[30px] h-[30px] rounded-lg bg-tz-black inline-flex items-center justify-center shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f4f0e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4h18l-7 8v6l-4 2v-8z" />
              </svg>
            </span>
            <span className="text-[11px] font-bold tracking-[.14em] uppercase text-brand-text-2">{kicker}</span>
          </div>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-[7px] text-[12.5px] font-semibold text-brand-muted hover:bg-brand-bg hover:text-brand-text-2 px-2 py-1.5 rounded-lg transition-colors duration-200"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              Limpiar
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-pill bg-tz-black text-tz-bone text-[10.5px] font-bold">
                {activeCount}
              </span>
            </button>
          )}
        </div>

        <label className="block text-[11px] font-bold uppercase tracking-[.1em] text-brand-muted mb-2">Búsqueda</label>
        <div className="relative mb-[22px]">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 flex pointer-events-none">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8ab72" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </span>
          <input
            type="text"
            name={searchName}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-control border border-brand-border bg-white pl-[46px] pr-4 py-[13px] text-[15px] text-brand-text placeholder:text-faint outline-none transition-[border-color,box-shadow] duration-200 focus:border-brand-ink focus:ring-[3px] focus:ring-tz-black/[0.08]"
          />
        </div>

        <label className="block text-[11px] font-bold uppercase tracking-[.1em] text-brand-muted mt-[22px] mb-2.5">{chipLabel}</label>
        <div className="flex flex-wrap gap-2 items-center">
          {chipOptions.map((opt) => {
            const active = opt.value === chip;
            const useToneStyle = active && opt.value !== "" && opt.tone;
            const fg = useToneStyle ? TONE_HEX[opt.tone!] : undefined;
            return (
              <button
                key={opt.value || "__all__"}
                type="button"
                onClick={() => setChip(opt.value)}
                className={`inline-flex items-center gap-[7px] px-[15px] py-2 rounded-pill text-[13px] font-semibold cursor-pointer transition-all duration-[180ms] ease-[cubic-bezier(.2,.8,.2,1)] ${
                  !active
                    ? "bg-white border border-brand-border text-brand-text-2"
                    : useToneStyle
                      ? `${TONE_BG_CLASS[opt.tone!]} border border-transparent`
                      : "bg-tz-black text-tz-bone border border-transparent"
                }`}
                style={
                  active
                    ? useToneStyle
                      ? { color: fg, boxShadow: `inset 0 0 0 1px ${fg}33, 0 4px 12px -8px ${fg}66` }
                      : { boxShadow: "0 6px 16px -8px rgba(29,29,28,.5)" }
                    : undefined
                }
              >
                <span
                  className="w-[7px] h-[7px] rounded-[2px] shrink-0"
                  style={{ background: !active ? "var(--color-faint)" : useToneStyle ? fg : "var(--color-tz-bone)" }}
                />
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 mt-6 pt-5 border-t border-[#ede7dc] flex-wrap">
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
  );
}

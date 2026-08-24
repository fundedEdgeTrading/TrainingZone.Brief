"use client";

import NavIconSvg from "@/components/nav-icons";

/**
 * "PDF" es la impresión del navegador. El panel ya se maqueta para caber en
 * papel y montar un generador propio quedaba fuera del encargo; lo que sí hace
 * falta es que la cifra de los KPI esté pintada cuando se dispara, y de eso se
 * ocupa el suelo de seguridad de `CountUp` (un `setTimeout` que fija el valor
 * final aunque el `requestAnimationFrame` vaya throttled).
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="hidden sm:flex items-center gap-[7px] h-9 px-3.5 rounded-[10px] border border-brand-border bg-brand-card text-[12.5px] font-semibold text-brand-text-2 transition-colors duration-150 hover:border-brand-border-hover hover:text-brand-text"
    >
      <NavIconSvg name="descargar" className="w-3.5 h-3.5" style={{ strokeWidth: 2 }} />
      PDF
    </button>
  );
}

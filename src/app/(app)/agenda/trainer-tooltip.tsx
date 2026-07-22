"use client";

/**
 * Tooltip "premium" (oscuro, con flecha) que aparece al pasar el ratón sobre
 * cualquier elemento coloreado por entrenador: tarjetas de la rejilla y los
 * círculos de color del diálogo de sesión.
 *
 * El wrapper necesita ser el "containing block" del tooltip (absolute/relative).
 * Si `className` ya trae `absolute` (tarjetas de la rejilla) no añadimos
 * `relative` para no chocar en la cascada de Tailwind (ambas tocan `position`).
 */
export function TrainerTooltip({
  name,
  color,
  children,
  className,
  ...rest
}: {
  name: string;
  color: string;
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const needsRelative = !className?.includes("absolute");
  return (
    <div className={`group/tt ${needsRelative ? "relative" : ""} ${className ?? ""}`} {...rest}>
      {children}
      <div
        className="pointer-events-none absolute left-1/2 bottom-full z-50 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg bg-tz-black px-2.5 py-1.5 text-xs font-semibold text-tz-bone opacity-0 shadow-pop transition-[opacity,transform] duration-150 ease-out-soft group-hover/tt:translate-y-0 group-hover/tt:opacity-100"
      >
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
          {name}
        </span>
        <span className="absolute left-1/2 top-full -mt-px h-2 w-2 -translate-x-1/2 rotate-45 bg-tz-black" />
      </div>
    </div>
  );
}

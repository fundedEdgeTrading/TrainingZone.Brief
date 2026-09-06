import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-tz-black text-tz-bone hover:bg-brand-ink-soft shadow-card hover:shadow-hover",
  secondary:
    "bg-white text-brand-text border border-brand-border hover:border-brand-ink hover:bg-tz-bone",
  ghost: "bg-transparent text-brand-text-2 hover:bg-tz-linen/40",
  danger: "bg-critical text-white hover:opacity-90",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-4 py-2 text-sm rounded-control",
  lg: "px-6 py-3 text-[15px] rounded-control",
};

const BASE =
  "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap transition-[background-color,border-color,box-shadow,transform,opacity] duration-200 ease-out-soft active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none";

/**
 * Las clases de un botón, sin el `<button>`. Para cuando la acción es una
 * navegación de verdad y tiene que ser un `<a>` (un `<Link>`): así el enlace se
 * puede abrir en otra pestaña y lo anuncia como enlace el lector de pantalla,
 * pero se ve igual que el botón que tiene al lado.
 */
export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return clsx(BASE, VARIANT[variant], SIZE[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return <button className={buttonClass({ variant, size, className })} {...props} />;
}

export function ButtonSpinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        "inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0",
        className
      )}
    />
  );
}

import clsx from "clsx";

const CONTROL =
  "w-full rounded-control border border-brand-border bg-white px-3.5 py-2.5 text-sm text-brand-text placeholder:text-faint transition-[border-color,box-shadow] duration-200 focus:border-brand-ink focus:ring-2 focus:ring-tz-black/10 focus:outline-none hover:border-brand-border-hover";

const LABEL = "block text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5";

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      {label && <label className={LABEL}>{label}</label>}
      {children}
      {error ? (
        <p className="text-xs text-critical mt-1">{error}</p>
      ) : hint ? (
        <p className="text-xs text-brand-muted mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(CONTROL, className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx(CONTROL, "cursor-pointer", className)} {...props} />;
}

import clsx from "clsx";

export function TableShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={clsx("bg-brand-card border border-brand-border rounded-card overflow-hidden shadow-card", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-tz-bone/60 text-brand-muted text-[11px] font-bold uppercase tracking-[0.08em]">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <th className={clsx("text-left px-5 py-3", className)}>{children}</th>;
}

export function TRow({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={clsx("border-t border-tz-sand transition-colors duration-150 hover:bg-tz-bone/70", className)}
      {...props}
    >
      {children}
    </tr>
  );
}

export function Td({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <td className={clsx("px-5 py-3.5", className)}>{children}</td>;
}

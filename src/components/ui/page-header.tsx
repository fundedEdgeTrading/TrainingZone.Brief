export function PageHeader({
  kicker,
  description,
  actions,
}: {
  kicker?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        {kicker && (
          <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted mb-1">
            {kicker}
          </div>
        )}
        {description && <p className="text-sm text-brand-muted max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

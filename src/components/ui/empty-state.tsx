export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-14 h-14 rounded-full bg-tz-sand flex items-center justify-center mb-4">
        <span className="w-3.5 h-3.5 rounded-full bg-tz-linen" />
      </div>
      <h3 className="font-display font-bold text-base text-brand-text">{title}</h3>
      {description && <p className="text-sm text-brand-muted mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

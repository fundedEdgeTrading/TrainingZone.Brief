import clsx from "clsx";

export type BadgeTone = "good" | "warning" | "critical" | "trial" | "prospect" | "neutral";

const TONE: Record<BadgeTone, string> = {
  good: "bg-good-bg text-good",
  warning: "bg-warning-bg text-warning-text",
  critical: "bg-critical-bg text-critical",
  trial: "bg-trial-bg text-trial",
  prospect: "bg-prospect-bg text-prospect",
  neutral: "bg-neutral-bg text-neutral",
};

export function Badge({
  tone = "neutral",
  dot = true,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em] whitespace-nowrap",
        TONE[tone],
        className
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
      {children}
    </span>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

type ScheduleItem = { sessionId: string; label: string; relative: string; title: string; detail: string };
type AptitudeItem = {
  memberId: string;
  name: string;
  light: "AMBER" | "RED";
  zone: string | null;
  description: string;
  meta: string;
};

const TABS = [
  { key: "debriefs", label: "Debriefs", badgeClass: "bg-warning-bg text-warning-text" },
  { key: "briefs", label: "Briefs", badgeClass: "bg-gold-bg text-gold" },
  { key: "aptitude", label: "Aptitud", badgeClass: "bg-critical-bg text-critical" },
] as const;

export function PendingPanel({
  debriefs,
  briefs,
  aptitude,
}: {
  debriefs: ScheduleItem[];
  briefs: ScheduleItem[];
  aptitude: AptitudeItem[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("debriefs");
  const counts = { debriefs: debriefs.length, briefs: briefs.length, aptitude: aptitude.length };

  return (
    <div>
      <div className="flex gap-1 border-b border-tz-sand mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative flex-1 pt-[9px] pb-3 flex items-center justify-center gap-1.5 text-xs font-bold transition-colors duration-200 ${
              tab === t.key ? "text-brand-text" : "text-brand-text-2 hover:text-brand-text"
            }`}
          >
            {t.label}
            <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-pill text-[10px] font-extrabold ${t.badgeClass}`}>
              {counts[t.key]}
            </span>
            {tab === t.key && (
              <span
                key={tab}
                className="absolute left-2 right-2 -bottom-px h-0.5 bg-brand-ink origin-left"
                style={{ animation: "tzGrow .3s cubic-bezier(.2,.8,.2,1) both" }}
              />
            )}
          </button>
        ))}
      </div>

      {tab === "debriefs" && (
        <ScheduleList items={debriefs} hrefBase="/agenda/session" labelClass="text-warning-text" empty="Sin debriefs pendientes." />
      )}
      {tab === "briefs" && <ScheduleList items={briefs} hrefBase="/brief" labelClass="text-gold" empty="Sin briefs pendientes." />}
      {tab === "aptitude" &&
        (aptitude.length === 0 ? (
          <p className="text-sm text-brand-muted py-6 text-center">Sin alertas de aptitud.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {aptitude.map((a, i) => (
              <Link
                key={a.memberId}
                href={`/members/${a.memberId}`}
                className={`block p-3 rounded-xl border tz-fade-up transition-[transform,border-color] duration-200 hover:-translate-y-[2px] ${
                  a.light === "RED" ? "bg-[#fdf3ef] border-[#f4ddd2] hover:border-[#e8bfae]" : "bg-[#fdf8ef] border-[#f3e3c0] hover:border-[#e8c88a]"
                }`}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <div className={`text-[11px] font-bold uppercase tracking-[.06em] ${a.light === "RED" ? "text-critical" : "text-warning-text"}`}>
                  {a.name}
                </div>
                <div className="text-sm font-bold text-brand-text mt-1">{a.zone ?? "Restricción activa"}</div>
                <div className="text-xs text-brand-muted mt-0.5">{a.description}</div>
                <div className="text-[11px] text-brand-muted-2 mt-1.5">{a.meta}</div>
              </Link>
            ))}
          </div>
        ))}
    </div>
  );
}

function ScheduleList({
  items,
  hrefBase,
  labelClass,
  empty,
}: {
  items: ScheduleItem[];
  hrefBase: string;
  labelClass: string;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-sm text-brand-muted py-6 text-center">{empty}</p>;
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <Link
          key={item.sessionId}
          href={`${hrefBase}/${item.sessionId}`}
          className="block p-3 rounded-xl bg-brand-bg border border-tz-sand tz-fade-up transition-[transform,border-color] duration-200 hover:border-brand-border-hover hover:-translate-y-[2px]"
          style={{ animationDelay: `${i * 0.06}s` }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11px] font-bold uppercase tracking-[.06em] ${labelClass}`}>{item.label}</span>
            <span className="text-[11px] text-brand-muted-2 whitespace-nowrap">{item.relative}</span>
          </div>
          <div className="text-sm font-bold text-brand-text mt-1">{item.title}</div>
          <div className="text-xs text-brand-muted mt-0.5">{item.detail}</div>
        </Link>
      ))}
    </div>
  );
}

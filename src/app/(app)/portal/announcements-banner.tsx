"use client";

import { useEffect, useState } from "react";
import type { MemberAnnouncement } from "@/lib/announcements-queries";

const CATEGORY_LABEL: Record<string, string> = { NEWS: "Novedad", EVENT: "Evento", PROMO: "Promoción", ALERT: "Aviso" };
const CATEGORY_TONE: Record<string, string> = {
  NEWS: "bg-white/15 text-white",
  EVENT: "bg-info-bg text-info",
  PROMO: "bg-warning-bg text-warning",
  ALERT: "bg-critical-bg text-critical",
};

export function AnnouncementsBanner({
  announcements,
  autoplaySeconds = 6,
  pauseOnHover = true,
  accentColor = "var(--color-apta-gold)",
}: {
  announcements: MemberAnnouncement[];
  autoplaySeconds?: number;
  pauseOnHover?: boolean;
  accentColor?: string;
}) {
  const count = announcements.length;
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  // Restarting on every `current` change (auto or manual) gives each slide
  // the full autoplaySeconds window and keeps the progress bar in sync.
  useEffect(() => {
    if (paused || count <= 1) return;
    const id = setInterval(() => {
      setCurrent((c) => (c + 1) % count);
    }, autoplaySeconds * 1000);
    return () => clearInterval(id);
  }, [count, autoplaySeconds, paused, current]);

  if (count === 0) return null;

  const go = (i: number) => setCurrent(((i % count) + count) % count);

  return (
    <div
      className="relative overflow-hidden rounded-[18px] sm:min-h-[272px] bg-brand-ink border border-brand-border-dark tz-fade-up"
      onMouseEnter={() => pauseOnHover && setPaused(true)}
      onMouseLeave={() => pauseOnHover && setPaused(false)}
      // El avance automático también se detiene al entrar con el teclado: si no,
      // el carrusel cambia de diapositiva bajo el foco de quien está tabulando.
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div
        className="flex items-stretch transition-transform duration-[600ms] ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {announcements.map((a) => (
          <div key={a.id} className="flex-[0_0_100%] min-w-0 relative overflow-hidden flex flex-col sm:flex-row box-border">
            {a.imageUrl && (
              <div className="relative order-first sm:order-last w-full aspect-[16/10] sm:aspect-auto sm:flex-[0_1_41%] sm:min-w-[230px] overflow-hidden bg-brand-ink-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 shadow-[inset_0_-1px_0_rgba(255,255,255,.08)] sm:shadow-[inset_1px_0_0_rgba(255,255,255,.08)]" />
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-brand-ink to-transparent sm:hidden" />
                <div className="hidden sm:block absolute inset-y-0 left-0 w-[88px] bg-gradient-to-r from-brand-ink to-transparent" />
              </div>
            )}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-3 px-6 py-6 sm:gap-3.5 sm:px-7 sm:py-[30px] sm:pb-[34px]">
              <div className="flex gap-2 items-center">
                <span
                  className={`text-[11px] font-bold uppercase tracking-[.06em] rounded-full px-2.5 py-[3px] ${
                    CATEGORY_TONE[a.category] ?? "bg-white/15 text-white"
                  }`}
                >
                  {CATEGORY_LABEL[a.category] ?? a.category}
                </span>
                {a.pinned && (
                  <span className="text-[11px] font-bold uppercase tracking-[.06em] rounded-full px-2.5 py-[3px] bg-tz-bone text-tz-black">
                    Destacado
                  </span>
                )}
              </div>
              <div className="font-display font-extrabold text-[21px] sm:text-[23px] leading-[1.08] text-white uppercase tracking-[-.01em] line-clamp-2 text-pretty">
                {a.title}
              </div>
              {a.body && (
                <p className="text-[13.5px] text-brand-muted-2 leading-[1.5] line-clamp-2 text-pretty">{a.body}</p>
              )}
              {a.tags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {a.tags.map((t) => (
                    <span key={t} className="text-[11px] rounded-full px-2.5 py-[3px] bg-white/10 text-brand-muted-2">
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {count > 1 && (
                <div className="flex items-center gap-2.5">
                  <span className="font-display font-bold text-xs tracking-[.1em] text-brand-muted-2">
                    {String(current + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    aria-label="Anterior"
                    onClick={() => go(current - 1)}
                    className="w-[34px] h-[34px] rounded-full border border-white/20 bg-white/[.06] text-tz-bone hover:bg-white/[.16] text-[18px] leading-none flex items-center justify-center"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="Siguiente"
                    onClick={() => go(current + 1)}
                    className="w-[34px] h-[34px] rounded-full border border-white/20 bg-white/[.06] text-tz-bone hover:bg-white/[.16] text-[18px] leading-none flex items-center justify-center"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/[.12] z-20">
          <div
            key={current}
            className="h-full w-full rounded-full origin-left"
            style={{
              background: accentColor,
              animation: `tzProg ${autoplaySeconds}s linear both`,
              animationPlayState: paused ? "paused" : "running",
            }}
          />
        </div>
      )}
    </div>
  );
}

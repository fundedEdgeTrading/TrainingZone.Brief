"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar({
  nav,
  sectionLabel,
  footerLabel,
}: {
  nav: { href: string; label: string }[];
  sectionLabel: string;
  footerLabel: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 bg-tz-sand text-text-2 border-r border-tz-linen flex flex-col sticky top-0 h-screen">
      <div
        className="h-[88px] flex items-center px-6 border-b border-tz-linen shrink-0"
        style={{ animation: "tzNavIn .5s cubic-bezier(.2,.8,.2,1) both" }}
      >
        <div className="tz-logo-wrap">
          <Image
            src="/brand/tz-logo-black.png"
            alt="Training Zone"
            width={220}
            height={37}
            priority
            className="h-[26px] w-auto block"
          />
          <div
            className="tz-logo-shine"
            style={{
              WebkitMaskImage: "url(/brand/tz-logo-black.png)",
              maskImage: "url(/brand/tz-logo-black.png)",
            }}
          />
        </div>
      </div>

      <div
        className="px-3.5 pt-5 pb-2 font-display font-bold text-[11px] tracking-[.16em] uppercase text-muted"
        style={{ animation: "tzNavIn .5s .05s both" }}
      >
        {sectionLabel}
      </div>

      <nav className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto">
        {nav.map((item, i) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-[10px] px-3.5 py-[11px] text-sm transition-[background-color,color,transform] duration-[180ms] ${
                active
                  ? "bg-tz-black text-tz-bone font-bold"
                  : "bg-transparent text-text-2 font-medium hover:bg-tz-linen/40 hover:translate-x-1"
              }`}
              style={{ animation: `tzNavIn .45s ${(0.12 + i * 0.05).toFixed(2)}s both` }}
            >
              <span
                className={`w-[7px] h-[7px] rounded-[2px] shrink-0 transition-colors duration-[180ms] ${
                  active ? "bg-tz-bone" : "bg-faint"
                }`}
              />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        className="px-5 py-4 border-t border-tz-linen text-xs text-muted tracking-[.04em] shrink-0"
        style={{ animation: "tzNavIn .5s .5s both" }}
      >
        <span className="text-tz-black font-bold">TZ</span> · {footerLabel}
      </div>
    </aside>
  );
}

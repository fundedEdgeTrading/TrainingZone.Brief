"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar({
  nav,
}: {
  nav: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 bg-slate-900 text-slate-200 flex flex-col">
      <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-800">
        <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold text-sm">
          TZ
        </div>
        <span className="font-semibold text-white">TRAINING ZONE</span>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1">
        {nav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-indigo-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 text-xs text-slate-500 border-t border-slate-800">
        MVP · Fases F0–F5
      </div>
    </aside>
  );
}

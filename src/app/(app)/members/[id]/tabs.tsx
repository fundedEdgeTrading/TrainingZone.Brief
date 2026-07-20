"use client";

import { useState } from "react";
import clsx from "clsx";

export default function Tabs({
  panels,
}: {
  panels: { key: string; label: string; content: React.ReactNode }[];
}) {
  const [active, setActive] = useState(panels[0]?.key);

  return (
    <div>
      <div className="inline-flex flex-wrap gap-1 max-w-full bg-tz-sand rounded-pill p-1 mb-5">
        {panels.map((p) => (
          <button
            key={p.key}
            onClick={() => setActive(p.key)}
            className={clsx(
              "rounded-pill px-4 py-2 text-sm font-semibold transition-colors duration-200",
              active === p.key
                ? "bg-tz-black text-tz-bone shadow-card"
                : "text-text-2 hover:bg-tz-linen/50"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {panels.map((p) =>
        active === p.key ? (
          <div key={p.key} className="tz-fade-up" style={{ animationDuration: "0.3s" }}>
            {p.content}
          </div>
        ) : null
      )}
    </div>
  );
}

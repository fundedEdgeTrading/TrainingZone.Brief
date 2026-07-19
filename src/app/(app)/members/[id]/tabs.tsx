"use client";

import { useState } from "react";

export default function Tabs({
  panels,
}: {
  panels: { key: string; label: string; content: React.ReactNode }[];
}) {
  const [active, setActive] = useState(panels[0]?.key);

  return (
    <div>
      <div className="flex gap-1 border-b border-tz-linen mb-4">
        {panels.map((p) => (
          <button
            key={p.key}
            onClick={() => setActive(p.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              active === p.key
                ? "border-tz-black text-tz-black"
                : "border-transparent text-muted hover:text-text-2"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {panels.map((p) => (
        <div key={p.key} className={active === p.key ? "block" : "hidden"}>
          {p.content}
        </div>
      ))}
    </div>
  );
}

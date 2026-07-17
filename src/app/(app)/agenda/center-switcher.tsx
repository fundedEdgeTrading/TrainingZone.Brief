"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export default function CenterSwitcher({
  centers,
  currentCenterId,
}: {
  centers: { id: string; name: string }[];
  currentCenterId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      value={currentCenterId}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("center", e.target.value);
        router.push(`${pathname}?${params.toString()}`);
      }}
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
    >
      {centers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

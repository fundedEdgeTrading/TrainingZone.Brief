"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select } from "@/components/ui/field";

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
    <Select
      value={currentCenterId}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("center", e.target.value);
        router.push(`${pathname}?${params.toString()}`);
      }}
      className="w-auto"
    >
      {centers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

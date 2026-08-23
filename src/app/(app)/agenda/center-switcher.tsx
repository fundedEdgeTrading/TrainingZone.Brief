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
        // `replace` + `scroll: false`, como el resto de filtros: cambiar de
        // centro no es navegar a otra pantalla — no debe llenar el historial
        // (volver atrás tenía que deshacer cada cambio de centro uno a uno) ni
        // devolver la agenda al principio de la página.
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }}
      className="w-auto max-w-[190px] sm:max-w-[220px]"
    >
      {centers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

import type { PlanType } from "@prisma/client";

/** El servicio elegido en la app decide el `PlanType` real del dominio. */
export function planTypeFor(serviceKind: "EP" | "GROUP" | "ONLINE", sessionsIncluded: number | null): PlanType {
  if (serviceKind === "EP") return "PERSONAL_TRAINING";
  if (serviceKind === "ONLINE") return "ONLINE";
  return sessionsIncluded ? "SESSION_PACK" : "MONTHLY";
}

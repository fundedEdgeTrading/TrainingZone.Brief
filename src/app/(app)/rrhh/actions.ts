"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { canManageOrg } from "@/lib/rbac";
import { updateCheckinConfig } from "@/lib/checkin-schedule";
import { fulfilTrainerRatingAccess, type TrainerRatingDisclosure } from "@/lib/trainer-rating-access";
import type { ServiceKind } from "@prisma/client";

export type RrhhActionResult = { ok: true } | { ok: false; error: string };

// E10-21 · El módulo de fichajes se apaga (decisión tomada). Aquí vivían
// `clockInAction`, `clockOutAction` y `signEntryAction`; se retiran junto con
// `TimeClockWidget` y `lib/timeclock-queries.ts`. Los fichajes registrados se
// exportaron antes (`npm run export:fichajes`): el plazo de cuatro años del
// art. 34.9 ET sigue corriendo aunque la funcionalidad desaparezca.

export async function updateCheckinConfigAction(formData: FormData): Promise<RrhhActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!canManageOrg(session.user.role) && session.user.role !== "CENTER_DIRECTOR") return { ok: false, error: "Sin permiso." };
  const serviceKind = String(formData.get("serviceKind") ?? "") as ServiceKind;
  const goalCheckinDays = Number(formData.get("goalCheckinDays") ?? 30);
  const trainerRatingDays = Number(formData.get("trainerRatingDays") ?? 90);
  await updateCheckinConfig(session.user.orgId, serviceKind, { goalCheckinDays, trainerRatingDays });
  revalidatePath("/rrhh");
  return { ok: true };
}

export type FulfilAccessResult =
  | { ok: true; disclosure: TrainerRatingDisclosure[] }
  | { ok: false; error: string };

/**
 * E10-16 · Dirección atiende la solicitud de acceso de un entrenador.
 *
 * Devuelve lo que hay que entregarle, ya seudonimizado: la pantalla NO se abre
 * al entrenador, es dirección quien se lo hace llegar. La entrega queda en
 * `AuditLog` con quién la hizo y cuántas valoraciones incluía.
 */
export async function fulfilTrainerRatingAccessAction(trainerUserId: string): Promise<FulfilAccessResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "HR_MANAGER"]);
  const result = await fulfilTrainerRatingAccess(
    session.user.orgId,
    { userId: session.user.id, role: session.user.role },
    trainerUserId,
  );
  if (result.ok) revalidatePath("/rrhh");
  return result;
}

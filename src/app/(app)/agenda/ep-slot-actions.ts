"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireCenterRole } from "@/lib/guard";
import { canManageEpSlots } from "@/lib/rbac";
import { createEpSlot } from "@/lib/agenda-queries";

export type EpSlotActionResult = { ok: true } | { ok: false; error: string };

export async function createEpSlotAction(formData: FormData): Promise<EpSlotActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  if (!canManageEpSlots(session.user.role)) return { ok: false, error: "No tienes permiso para crear franjas de EP." };

  const centerId = String(formData.get("centerId") ?? "");
  await requireCenterRole(centerId, ["CENTER_DIRECTOR", "TRAINER"]);

  const trainerId = String(formData.get("trainerId") ?? "") || session.user.id;
  const dateRaw = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const durationMin = Number(formData.get("durationMin") ?? 60);
  const selfBookable = formData.get("selfBookable") === "on";
  const memberId = String(formData.get("memberId") ?? "") || null;

  if (!centerId || !dateRaw || !startTime) return { ok: false, error: "Completa centro, fecha y hora." };

  await createEpSlot(session.user.orgId, {
    centerId,
    trainerId,
    date: new Date(dateRaw),
    startTime,
    durationMin,
    selfBookable,
    memberId,
  });

  revalidatePath("/agenda");
  return { ok: true };
}

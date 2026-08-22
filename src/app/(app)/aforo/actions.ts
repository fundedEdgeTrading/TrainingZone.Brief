"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireCenterRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export type AforoActionResult = { ok: true } | { ok: false; error: string };

/**
 * Aforo por defecto del centro. Es SOLO el valor con el que nace una sesión
 * nueva: las plantillas y las sesiones ya creadas llevan su propia capacidad y
 * no se tocan aquí (cambiarlas retroactivamente echaría a socios ya inscritos).
 */
export async function updateCenterCapacity(formData: FormData): Promise<AforoActionResult> {
  await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER_ADMIN"]);
  const centerId = String(formData.get("centerId") ?? "");
  const raw = String(formData.get("defaultGroupCapacity") ?? "").trim();

  // Ámbito: dirección de organización manda en todos sus centros; dirección de
  // centro y Entrenador Admin, solo en aquellos a los que están imputados.
  const session = await requireCenterRole(centerId, ["CENTER_DIRECTOR", "TRAINER_ADMIN"]);

  const capacity = raw === "" ? null : Math.round(Number(raw));
  if (capacity !== null && (!Number.isFinite(capacity) || capacity < 1)) {
    return { ok: false, error: "El aforo debe ser un número entero mayor que 0 (o vacío para no fijar ninguno)." };
  }

  const center = await prisma.center.findFirst({
    where: { id: centerId, orgId: session.user.orgId },
    select: { id: true },
  });
  if (!center) return { ok: false, error: "No se ha encontrado ese centro." };

  await prisma.center.update({ where: { id: center.id }, data: { defaultGroupCapacity: capacity } });
  revalidatePath("/aforo");
  return { ok: true };
}

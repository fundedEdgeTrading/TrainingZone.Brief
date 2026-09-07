"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import type { AptitudeLight, InjuryZone, Laterality } from "@prisma/client";
import { INJURY_ZONES, LATERALITIES, defaultSideFor, injuryZoneLabel } from "@/lib/injury-zones";

export type AptitudeRuleActionResult = { ok: true } | { ok: false; error: string };

export async function createAptitudeRule(formData: FormData): Promise<AptitudeRuleActionResult> {
  const session = await requireRole(["OWNER"]);

  // E3-02: la zona de la regla sale del mismo catálogo cerrado que la del
  // registro de salud. Antes eran dos campos de texto libre comparados por
  // igualdad exacta, y bastaba una abreviatura para que la regla no se aplicara.
  const zoneRaw = String(formData.get("zoneCode") ?? "");
  const sideRaw = String(formData.get("side") ?? "");
  const zoneCode = INJURY_ZONES.includes(zoneRaw as InjuryZone) ? (zoneRaw as InjuryZone) : null;
  const declaredSide = LATERALITIES.includes(sideRaw as Laterality) ? (sideRaw as Laterality) : null;
  const blockArea = String(formData.get("blockArea") ?? "").trim();
  const light = String(formData.get("light") ?? "GREEN") as AptitudeLight;
  const adaptation = String(formData.get("adaptation") ?? "").trim() || null;

  if (!zoneCode || !blockArea) return { ok: false, error: "Indica la zona y el bloque de trabajo." };

  // Sin lado declarado la regla vale para los dos, que es el caso normal: una
  // limitación de hombro lo es del hombro lesionado, no del derecho.
  const side = defaultSideFor(zoneCode) ?? declaredSide;

  await prisma.aptitudeRule.create({
    data: {
      orgId: session.user.orgId,
      // Rótulo legible derivado del catálogo; ya no es lo que empareja.
      injuryZone: injuryZoneLabel(zoneCode, side),
      zoneCode,
      side,
      blockArea,
      light,
      adaptation,
      editedByUserId: session.user.id,
    },
  });

  revalidatePath("/health/aptitude-rules");
  return { ok: true };
}

export async function deleteAptitudeRule(id: string): Promise<AptitudeRuleActionResult> {
  const session = await requireRole(["OWNER"]);
  await prisma.aptitudeRule.deleteMany({ where: { id, orgId: session.user.orgId } });
  revalidatePath("/health/aptitude-rules");
  return { ok: true };
}

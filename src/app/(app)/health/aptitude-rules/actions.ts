"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import type { AptitudeLight } from "@prisma/client";

export type AptitudeRuleActionResult = { ok: true } | { ok: false; error: string };

export async function createAptitudeRule(formData: FormData): Promise<AptitudeRuleActionResult> {
  const session = await requireRole(["OWNER"]);

  const injuryZone = String(formData.get("injuryZone") ?? "").trim();
  const blockArea = String(formData.get("blockArea") ?? "").trim();
  const light = String(formData.get("light") ?? "GREEN") as AptitudeLight;
  const adaptation = String(formData.get("adaptation") ?? "").trim() || null;

  if (!injuryZone || !blockArea) return { ok: false, error: "Indica la zona y el bloque de trabajo." };

  await prisma.aptitudeRule.create({
    data: {
      orgId: session.user.orgId,
      injuryZone,
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
  await requireRole(["OWNER"]);
  await prisma.aptitudeRule.delete({ where: { id } });
  revalidatePath("/health/aptitude-rules");
  return { ok: true };
}

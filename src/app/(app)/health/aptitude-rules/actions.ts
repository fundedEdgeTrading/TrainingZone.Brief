"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import type { AptitudeLight } from "@prisma/client";

export async function createAptitudeRule(formData: FormData) {
  const session = await requireRole(["OWNER"]);

  const injuryZone = String(formData.get("injuryZone") ?? "").trim();
  const blockArea = String(formData.get("blockArea") ?? "").trim();
  const light = String(formData.get("light") ?? "GREEN") as AptitudeLight;
  const adaptation = String(formData.get("adaptation") ?? "").trim() || null;

  if (!injuryZone || !blockArea) return;

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
}

export async function deleteAptitudeRule(id: string) {
  await requireRole(["OWNER"]);
  await prisma.aptitudeRule.delete({ where: { id } });
  revalidatePath("/health/aptitude-rules");
}

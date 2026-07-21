"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";

export type ReferenceRangeActionResult = { ok: true } | { ok: false; error: string };

const METRICS = ["bodyFatPct", "bmi", "visceralFatRating", "bodyWaterPct"] as const;

export async function createReferenceRange(formData: FormData): Promise<ReferenceRangeActionResult> {
  const session = await requireRole(["OWNER"]);

  const metric = String(formData.get("metric") ?? "");
  const sex = String(formData.get("sex") ?? "").trim() || null;
  const num = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim().replace(",", ".");
    return raw ? Number(raw) : null;
  };
  const int = (key: string) => {
    const n = num(key);
    return n != null ? Math.round(n) : null;
  };

  if (!METRICS.includes(metric as (typeof METRICS)[number])) return { ok: false, error: "Métrica no válida." };
  const min = num("min");
  const max = num("max");
  if (min == null && max == null) return { ok: false, error: "Indica al menos un límite (mín. o máx.)." };

  await prisma.referenceRange.create({
    data: {
      orgId: session.user.orgId,
      metric,
      sex,
      ageMin: int("ageMin"),
      ageMax: int("ageMax"),
      min,
      max,
      editedByUserId: session.user.id,
    },
  });

  revalidatePath("/health/reference-ranges");
  return { ok: true };
}

export async function deleteReferenceRange(id: string): Promise<ReferenceRangeActionResult> {
  const session = await requireRole(["OWNER"]);
  await prisma.referenceRange.deleteMany({ where: { id, orgId: session.user.orgId } });
  revalidatePath("/health/reference-ranges");
  return { ok: true };
}

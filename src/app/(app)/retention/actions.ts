"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import type { RetentionAlertStatus } from "@prisma/client";

export async function updateAlertStatus(alertId: string, status: RetentionAlertStatus) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  await prisma.retentionAlert.updateMany({
    where: { id: alertId, member: { orgId: session.user.orgId } },
    data: { status, resolvedAt: status === "OPEN" ? null : new Date() },
  });
  revalidatePath("/retention");
}

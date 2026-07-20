"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { resolveNotification } from "@/lib/notifications";

export async function resolveNotificationAction(notificationId: string) {
  const session = await requireSession();
  const result = await resolveNotification(session.user.orgId, session.user.id, notificationId);
  revalidatePath("/", "layout");
  return result;
}

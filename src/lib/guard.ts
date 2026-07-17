import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { defaultRouteForRole } from "@/lib/rbac";

export async function requireRole(allowed: Role[]) {
  const session = await requireSession();
  if (!allowed.includes(session.user.role)) {
    redirect(defaultRouteForRole(session.user.role));
  }
  return session;
}

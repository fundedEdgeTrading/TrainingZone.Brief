import type { NextRequest } from "next/server";
import { listNotificationsForUser } from "@/lib/notifications";
import { requireApiSession } from "../_lib/api-session";
import { apiOk, apiError } from "../_lib/response";

export async function GET(req: NextRequest) {
  const claims = await requireApiSession(req);
  if (!claims) return apiError("No autenticado.", 401);

  const notifications = await listNotificationsForUser(claims.orgId, claims.sub);
  return apiOk({ notifications });
}

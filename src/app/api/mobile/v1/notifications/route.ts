import type { NextRequest } from "next/server";
import { listNotificationsForUser } from "@/lib/notifications";
import { requireApiActiveSession } from "../_lib/api-session";
import { apiOk } from "../_lib/response";

export async function GET(req: NextRequest) {
  const auth = await requireApiActiveSession(req);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const notifications = await listNotificationsForUser(claims.orgId, claims.sub);
  return apiOk({ notifications });
}

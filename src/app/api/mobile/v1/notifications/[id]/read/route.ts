import type { NextRequest } from "next/server";
import { resolveNotification } from "@/lib/notifications";
import { requireApiActiveSession } from "../../../_lib/api-session";
import { apiOk, apiError } from "../../../_lib/response";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiActiveSession(req);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const { id } = await params;
  const result = await resolveNotification(claims.orgId, claims.sub, id);
  if (!result.ok) return apiError("No se ha encontrado esa notificación.", 404);

  return apiOk({ resolved: true });
}

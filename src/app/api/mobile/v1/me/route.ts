import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "../_lib/api-session";
import { memberSummaryFor } from "../_lib/session-user";
import { apiOk, apiError } from "../_lib/response";

export async function GET(req: NextRequest) {
  const claims = await requireApiSession(req);
  if (!claims) return apiError("No autenticado.", 401);

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, name: true, email: true, image: true, role: true, orgId: true, centerId: true },
  });
  if (!user) return apiError("No autenticado.", 401);

  // Gate de compra del handoff (A2): el socio sin ningún bono vivo entra al
  // catálogo del centro en vez de a las tabs. Se resuelve aquí, con la sesión,
  // para no encadenar una petición extra al abrir la app.
  const member = await memberSummaryFor(user.id, user.orgId, user.role);

  return apiOk({ ...user, member });
}

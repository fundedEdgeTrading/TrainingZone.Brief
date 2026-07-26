import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "../_lib/api-session";
import { apiOk, apiError } from "../_lib/response";

export async function GET(req: NextRequest) {
  const claims = await requireApiSession(req);
  if (!claims) return apiError("No autenticado.", 401);

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, name: true, email: true, image: true, role: true, orgId: true, centerId: true },
  });
  if (!user) return apiError("No autenticado.", 401);

  return apiOk(user);
}

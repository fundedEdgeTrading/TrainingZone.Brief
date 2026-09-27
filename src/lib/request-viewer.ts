import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import type { ScopedUser } from "@/lib/center-scope";
import { verifyAccessToken } from "@/lib/mobile-auth";

/** `id/role/orgId/centerId` es exactamente el `ScopedUser` de center-scope. */
export type RequestViewer = ScopedUser & { surface: "web" | "movil" };

/**
 * Identidad de quien pide un fichero, venga de la cookie de sesión (web) o del
 * Bearer de la app. Es lo ÚNICO que cambia entre las dos superficies: los
 * permisos, el ámbito de centro y la traza se aplican igual después. La usan
 * `/api/files` y `/api/progress-photos`; no copies esta función "como espejo".
 */
export async function resolveRequestViewer(req: NextRequest): Promise<RequestViewer | null> {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const claims = await verifyAccessToken(bearer.slice(7));
    if (!claims) return null;
    return {
      id: claims.sub,
      orgId: claims.orgId,
      role: claims.role,
      centerId: claims.centerId ?? null,
      surface: "movil",
    };
  }

  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    orgId: session.user.orgId,
    role: session.user.role,
    centerId: session.user.centerId ?? null,
    surface: "web",
  };
}

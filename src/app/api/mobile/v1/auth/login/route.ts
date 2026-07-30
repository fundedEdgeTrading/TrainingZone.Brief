import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/identity";
import { signAccessToken, issueRefreshToken } from "@/lib/mobile-auth";
import { apiOk, apiError } from "../../_lib/response";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // RB-ID-002: la app envía la organización elegida cuando la identidad tiene
  // varias membresías. Igual que en la web, no se adivina por el cliente.
  orgId: z.string().optional(),
});

// F0: mismas credenciales que el provider Credentials web (auth.config.ts), pero
// emite un par access/refresh token en vez de una cookie de sesión.
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("Email y contraseña son obligatorios.", 400);

  const { email, password, orgId } = parsed.data;
  const result = await authenticate(email, password);
  if (!result.ok) return apiError("Credenciales incorrectas.", 401);

  const membership = orgId
    ? result.memberships.find((m) => m.orgId === orgId)
    : result.memberships.length === 1
      ? result.memberships[0]
      : null;

  // Credenciales correctas pero destino ambiguo: la app pregunta y reintenta con
  // orgId. Se devuelve 409 (conflicto), no 401, para que pueda distinguirlo.
  if (!membership) {
    return apiError("Elige la organización con la que quieres entrar.", 409, {
      organizations: result.memberships.map((m) => ({ id: m.orgId, name: m.orgName, logoUrl: m.orgLogoUrl })),
    });
  }

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({
      sub: membership.userId,
      role: membership.role,
      orgId: membership.orgId,
      centerId: membership.centerId,
    }),
    issueRefreshToken(membership.userId),
  ]);

  return apiOk({
    accessToken,
    refreshToken,
    user: {
      id: membership.userId,
      name: membership.name,
      email,
      image: membership.image,
      role: membership.role,
      orgId: membership.orgId,
      centerId: membership.centerId,
    },
  });
}

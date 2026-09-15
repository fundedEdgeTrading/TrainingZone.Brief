import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, type Membership } from "@/lib/identity";
import { clientIpFrom, throttledAccessAttempt } from "@/lib/login-throttle";
import { signAccessToken, issueRefreshToken } from "@/lib/mobile-auth";
import { apiOk, apiError } from "../../_lib/response";
import { memberSummaryFor } from "../../_lib/session-user";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // RB-ID-002: la app envía la organización elegida cuando la identidad tiene
  // varias membresías. Igual que en la web, no se adivina por el cliente.
  orgId: z.string().optional(),
});

// F0: mismas credenciales que el provider Credentials web (auth.config.ts), pero
// emite un par access/refresh token en vez de una cookie de sesión.
//
// E1-10: esta es la ruta donde se verificó que doce intentos fallidos
// consecutivos se procesaban todos. El freno es `throttledAccessAttempt`, la
// MISMA función que usan la server action del login y `authorize` de Auth.js —
// no una copia "espejo" para el móvil.
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("Email y contraseña son obligatorios.", 400);

  const { email, password, orgId } = parsed.data;

  const outcome = await throttledAccessAttempt<Membership[]>(
    { purpose: "LOGIN", email, ip: clientIpFrom(req.headers) },
    async () => {
      const result = await authenticate(email, password);
      if (!result.ok) return { granted: false };
      return { granted: true, value: result.memberships };
    }
  );

  // Un intento bloqueado sale por aquí con el mismo 401 y el mismo cuerpo que
  // una contraseña equivocada. Si el bloqueo tuviera su propio código —429— o su
  // propio mensaje, el límite serviría para enumerar cuentas de staff, que es
  // exactamente lo que se quiere evitar.
  if (!outcome.ok) return apiError("Credenciales incorrectas.", 401);

  const memberships = outcome.value;
  const membership = orgId
    ? memberships.find((m) => m.orgId === orgId)
    : memberships.length === 1
      ? memberships[0]
      : null;

  // Credenciales correctas pero destino ambiguo: la app pregunta y reintenta con
  // orgId. Se devuelve 409 (conflicto), no 401, para que pueda distinguirlo.
  if (!membership) {
    return apiError("Elige la organización con la que quieres entrar.", 409, {
      organizations: memberships.map((m) => ({ id: m.orgId, name: m.orgName, logoUrl: m.orgLogoUrl })),
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

  // Mismo `user` que devuelve /me, gate de compra incluido: la app decide el
  // destino del login sin una segunda petición.
  const member = await memberSummaryFor(membership.userId, membership.orgId, membership.role);

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
      member,
    },
  });
}

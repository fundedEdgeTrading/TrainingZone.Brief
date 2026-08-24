import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rotateRefreshToken, signAccessToken } from "@/lib/mobile-auth";
import { apiOk, apiError } from "../../_lib/response";

const bodySchema = z.object({ refreshToken: z.string().min(1) });

// F0: rotación de refresh token (RTR) — el cliente cambia su refresh token
// actual por uno nuevo en cada uso y recibe un access token fresco.
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("refreshToken es obligatorio.", 400);

  const result = await rotateRefreshToken(parsed.data.refreshToken);
  if (!result.ok) return apiError("Sesión expirada, vuelve a iniciar sesión.", 401);

  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  // Una baja de plantilla (RB-RRHH-014) borra los refresh token de la persona,
  // así que no debería llegar ninguno; se comprueba igual porque este es el
  // único punto en el que la app nativa vuelve a pasar por la base de datos.
  if (!user || user.deactivatedAt) return apiError("Sesión expirada, vuelve a iniciar sesión.", 401);

  const accessToken = await signAccessToken({ sub: user.id, role: user.role, orgId: user.orgId, centerId: user.centerId });
  return apiOk({ accessToken, refreshToken: result.token });
}

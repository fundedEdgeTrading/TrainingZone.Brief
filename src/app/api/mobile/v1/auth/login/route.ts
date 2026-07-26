import type { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signAccessToken, issueRefreshToken } from "@/lib/mobile-auth";
import { apiOk, apiError } from "../../_lib/response";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// F0: mismo bcrypt/tabla User que el provider Credentials web (auth.config.ts),
// pero emite un par access/refresh token en vez de una cookie de sesión.
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("Email y contraseña son obligatorios.", 400);

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) return apiError("Credenciales incorrectas.", 401);

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({ sub: user.id, role: user.role, orgId: user.orgId, centerId: user.centerId }),
    issueRefreshToken(user.id),
  ]);

  return apiOk({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      orgId: user.orgId,
      centerId: user.centerId,
    },
  });
}

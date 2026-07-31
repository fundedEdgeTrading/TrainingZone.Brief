import { SignJWT, jwtVerify } from "jose";
import { randomBytes, createHash } from "crypto";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// F0 (docs/APP_MOVIL_NATIVA_PLAN.md §4): auth por token para la app nativa,
// en paralelo a la sesión por cookie de NextAuth (que la app no puede leer).
// Access token corto sin estado (no toca BD); refresh token opaco y rotatorio
// persistido en MobileRefreshToken, para poder revocar sesiones de dispositivo.

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_DAYS = 30;

export type ApiTokenClaims = {
  sub: string; // userId
  role: Role;
  orgId: string;
  centerId: string | null;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET no está configurado.");
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(claims: ApiTokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role, orgId: claims.orgId, centerId: claims.centerId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<ApiTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.orgId !== "string" || typeof payload.role !== "string") return null;
    return {
      sub: payload.sub,
      role: payload.role as Role,
      orgId: payload.orgId,
      centerId: (payload.centerId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newOpaqueToken() {
  return randomBytes(32).toString("hex");
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = newOpaqueToken();
  await prisma.mobileRefreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

export type RefreshResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; error: "invalid" | "expired" };

/**
 * Rotación de refresh token (RTR) en cada uso. Si se presenta un token ya
 * rotado (revokedAt set), es indicio de robo/reuso: se revocan todas las
 * sesiones de ese usuario en vez de solo rechazar la petición.
 */
export async function rotateRefreshToken(presentedToken: string): Promise<RefreshResult> {
  const tokenHash = hashToken(presentedToken);
  const existing = await prisma.mobileRefreshToken.findUnique({ where: { tokenHash } });
  if (!existing) return { ok: false, error: "invalid" };

  if (existing.revokedAt || existing.expiresAt.getTime() < Date.now()) {
    await prisma.mobileRefreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: false, error: existing.revokedAt ? "invalid" : "expired" };
  }

  // El token se "reclama" con un UPDATE condicional (`revokedAt: null`), que es
  // atómico: solo una petición puede pasar de no-revocado a revocado. Con la
  // comprobación de arriba a secas, dos refrescos simultáneos con el MISMO
  // token pasaban los dos y se emitían dos tokens válidos — justo el reuso que
  // la rotación existe para detectar, y que así no llegaba a saltar nunca.
  const claimed = await prisma.mobileRefreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count === 0) {
    // Otra petición se lo llevó entre medias: es reuso, se corta la familia.
    await prisma.mobileRefreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: false, error: "invalid" };
  }

  const token = newOpaqueToken();
  const created = await prisma.mobileRefreshToken.create({
    data: {
      userId: existing.userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  // `revokedAt` ya se fijó al reclamarlo; aquí solo queda enlazar el sucesor.
  await prisma.mobileRefreshToken.update({
    where: { id: existing.id },
    data: { replacedById: created.id },
  });

  return { ok: true, userId: existing.userId, token };
}

export async function revokeRefreshToken(presentedToken: string): Promise<void> {
  await prisma.mobileRefreshToken.updateMany({
    where: { tokenHash: hashToken(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function claimsForUser(user: { id: string; role: Role; orgId: string; centerId: string | null }): Promise<ApiTokenClaims> {
  return { sub: user.id, role: user.role, orgId: user.orgId, centerId: user.centerId };
}

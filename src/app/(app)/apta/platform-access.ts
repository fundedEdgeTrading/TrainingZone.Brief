import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Env = Record<string, string | undefined>;

/**
 * QA-ALTA-01 · Quién es de verdad soporte de Apta.
 *
 * El rol `PLATFORM_ADMIN` no basta: es un valor de una columna de `User`, y
 * cualquier OWNER podía escribirlo en su propia plantilla. Con eso entraba en
 * `/apta`, veía todas las organizaciones y daba de alta otras en ACTIVE sin
 * pagar. Hace falta además pertenecer a la organización de la plataforma, que
 * es una fila que ningún cliente puede crear ni renombrar desde la app.
 *
 * La marca es el slug, leído de `PLATFORM_ORG_SLUG` (lo fija el bootstrap de
 * P11): `schema.prisma` está congelado y el slug ya es único. Sin la variable
 * no entra nadie — un back-office abierto por un despiste de configuración es
 * justo el fallo que esto cierra.
 */
export function platformOrgSlug(env: Env = process.env): string | null {
  return env.PLATFORM_ORG_SLUG?.trim() || null;
}

export function isPlatformOrgSlug(slug: string | null | undefined, env: Env = process.env): boolean {
  const expected = platformOrgSlug(env);
  return expected !== null && slug === expected;
}

export async function isPlatformOperator(user: { role: Role; orgId: string }): Promise<boolean> {
  if (user.role !== "PLATFORM_ADMIN") return false;
  const expected = platformOrgSlug();
  if (!expected) return false;
  const org = await prisma.organization.findUnique({ where: { id: user.orgId }, select: { slug: true } });
  return isPlatformOrgSlug(org?.slug);
}

export const APTA_FORBIDDEN = "El back-office de Apta es solo para el equipo de soporte de la plataforma.";

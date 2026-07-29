"use server";

import { z } from "zod";
import { authenticate } from "@/lib/identity";

export type LoginTarget = { orgId: string; orgName: string; orgLogoUrl: string | null };

export type LoginTargetsResult =
  | { ok: true; targets: LoginTarget[] }
  | { ok: false };

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

/**
 * Paso previo del login (RB-ID-002): con credenciales válidas devuelve las
 * organizaciones en las que esa identidad tiene membresía, para que el
 * formulario decida si entra directo (una) o pide elegir (varias).
 *
 * RB-ID-005: el fallo es opaco a propósito — un `{ ok: false }` sin motivo, en
 * lugar de "email no encontrado" / "contraseña incorrecta". Con credenciales
 * malas devuelve lo mismo que con un email inexistente, así que esta acción no
 * puede usarse para averiguar qué cuentas existen.
 */
export async function resolveLoginTargets(email: string, password: string): Promise<LoginTargetsResult> {
  const parsed = schema.safeParse({ email, password });
  if (!parsed.success) return { ok: false };

  const result = await authenticate(parsed.data.email, parsed.data.password);
  if (!result.ok) return { ok: false };

  return {
    ok: true,
    targets: result.memberships.map((m) => ({
      orgId: m.orgId,
      orgName: m.orgName,
      orgLogoUrl: m.orgLogoUrl,
    })),
  };
}

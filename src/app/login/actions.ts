"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { authenticate } from "@/lib/identity";
import { clientIpFrom, throttledAccessAttempt } from "@/lib/login-throttle";

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
 *
 * E1-10: y desde aquí tampoco se puede probar contraseñas sin fin. El freno vive
 * en `login-throttle`, el mismo que usan `authorize` de Auth.js y la ruta móvil;
 * un intento bloqueado devuelve exactamente este mismo `{ ok: false }`, sin
 * motivo, para que el propio límite no delate qué cuentas existen.
 */
export async function resolveLoginTargets(email: string, password: string): Promise<LoginTargetsResult> {
  const parsed = schema.safeParse({ email, password });
  if (!parsed.success) return { ok: false };

  const ip = clientIpFrom(await headers());

  const outcome = await throttledAccessAttempt<LoginTarget[]>(
    { purpose: "LOGIN", email: parsed.data.email, ip },
    async () => {
      const result = await authenticate(parsed.data.email, parsed.data.password);
      if (!result.ok) return { granted: false };

      return {
        granted: true,
        value: result.memberships.map((m) => ({
          orgId: m.orgId,
          orgName: m.orgName,
          orgLogoUrl: m.orgLogoUrl,
        })),
      };
    }
  );

  if (!outcome.ok) return { ok: false };
  return { ok: true, targets: outcome.value };
}

"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fundadorEnabled, fundadorMaxSeats, getPlatformPlan } from "@/lib/platform-plans";
import { provisionDemoOrganization } from "@/lib/provisioning";

export type DemoCheckoutResult = { ok: true; activationUrl: string } | { ok: false; error: string };

const schema = z.object({
  name: z.string().trim().min(1, "Indica un nombre."),
  email: z.string().trim().toLowerCase().email("Email no válido."),
});

/**
 * Sustituto del checkout de Stripe cuando Stripe no está configurado
 * (`isDemoModeActive`, ver `lib/platform-plans.ts`): da de alta la
 * organización igual que lo haría el webhook tras un pago real, sin cobrar
 * nada, para poder enseñar el resto del alta (activación + puesta en marcha).
 */
export async function confirmDemoCheckoutAction(planCode: string, formData: FormData): Promise<DemoCheckoutResult> {
  const plan = getPlatformPlan(planCode);
  if (!plan) return { ok: false, error: "Ese plan no está disponible." };
  // Defensa en profundidad: la pantalla ya bloquea esto, pero la action es
  // invocable directamente (mismas comprobaciones que `createLicenseCheckoutSession`).
  if (plan.limitedOffer) {
    if (!fundadorEnabled()) return { ok: false, error: "Ese plan no está disponible." };
    const maxSeats = fundadorMaxSeats();
    if (maxSeats > 0) {
      const sold = await prisma.organization.count({ where: { platformPlan: plan.code } });
      if (sold >= maxSeats) return { ok: false, error: "La oferta Fundador ha agotado sus plazas." };
    }
  }

  const parsed = schema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const result = await provisionDemoOrganization({ planCode: plan.code, email: parsed.data.email, name: parsed.data.name });
  if (!result.ok) return { ok: false, error: result.error };
  if (!result.activationUrl) return { ok: false, error: "Ya existe una organización activa con ese email — inicia sesión." };

  return { ok: true, activationUrl: result.activationUrl };
}

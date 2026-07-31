"use server";

import { z } from "zod";
import { getPlatformPlan } from "@/lib/platform-plans";
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

  const parsed = schema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const result = await provisionDemoOrganization({ planCode: plan.code, email: parsed.data.email, name: parsed.data.name });
  if (!result.ok) return { ok: false, error: result.error };
  if (!result.activationUrl) return { ok: false, error: "Ya existe una organización activa con ese email — inicia sesión." };

  return { ok: true, activationUrl: result.activationUrl };
}

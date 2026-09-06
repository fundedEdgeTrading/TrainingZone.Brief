"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { resendOwnerActivationByOrgId, createAssistedOrganization } from "@/lib/provisioning";
import { PLATFORM_PLANS } from "@/lib/platform-plans";

type ActionResult = { ok: true; warning?: string } | { ok: false; error: string };

/**
 * E6-08 · back-office `/apta`. Ambas acciones son PLATFORM_ADMIN-only —
 * comprobado aquí de nuevo, no solo en la página: una server action se puede
 * invocar directamente sin pasar por el componente que la pinta.
 */
export async function resendActivationAction(orgId: string): Promise<ActionResult> {
  const session = await requireRole(["PLATFORM_ADMIN"]);
  const result = await resendOwnerActivationByOrgId(orgId, session.user.id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/apta");
  return { ok: true };
}

export async function createAssistedOrgAction(formData: FormData): Promise<ActionResult> {
  const session = await requireRole(["PLATFORM_ADMIN"]);

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const planCode = String(formData.get("planCode") ?? "");
  const paymentMethod = String(formData.get("paymentMethod") ?? "");
  const justification = String(formData.get("justification") ?? "").trim();

  if (!name) return { ok: false, error: "Falta el nombre de la organización." };
  if (!email) return { ok: false, error: "Falta el email del director." };
  if (!PLATFORM_PLANS.some((p) => p.code === planCode)) return { ok: false, error: "Plan no reconocido." };
  if (paymentMethod !== "TRANSFERENCIA" && paymentMethod !== "FACTURA" && paymentMethod !== "OTRO") {
    return { ok: false, error: "Falta el método de cobro." };
  }
  if (!justification) return { ok: false, error: "El justificante del cobro es obligatorio en un alta fuera de Stripe." };

  const result = await createAssistedOrganization({
    name,
    email,
    planCode,
    paymentMethod,
    justification,
    actorUserId: session.user.id,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/apta");
  return { ok: true };
}

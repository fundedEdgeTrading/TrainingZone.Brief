"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { centerScopeFor } from "@/lib/center-scope";
import { runTagRules } from "@/lib/tag-engine";
import {
  createManualTag,
  renameManualTag,
  setManualTagActive,
  type TagActionResult,
} from "@/lib/tags-queries";

/**
 * Acciones del catálogo de etiquetas. Las comprobaciones de verdad —permiso,
 * clase de la etiqueta y organización— viven en `tags-queries.ts`, que es lo que
 * llama también la ficha del socio: una segunda copia aquí sería una segunda
 * oportunidad de que se olvide una.
 *
 * Lo que sí es de aquí: el rol que entra a la pantalla y el plan contratado. Sin
 * `requireFeature` la URL a mano se salta el muro de pago (E6-02), y hay un test
 * que lo vigila.
 */
async function guard() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  await requireFeature("marketing_automatizado");
  return session;
}

export async function createTagAction(formData: FormData): Promise<TagActionResult> {
  const session = await guard();
  const result = await createManualTag(
    session.user,
    String(formData.get("label") ?? ""),
    String(formData.get("color") ?? "neutral")
  );
  if (result.ok) revalidatePath("/etiquetas");
  return result;
}

export async function renameTagAction(id: string, label: string): Promise<TagActionResult> {
  const session = await guard();
  const result = await renameManualTag(session.user, id, label);
  if (result.ok) revalidatePath("/etiquetas");
  return result;
}

export async function setTagActiveAction(id: string, active: boolean): Promise<TagActionResult> {
  const session = await guard();
  const result = await setManualTagActive(session.user, id, active);
  if (result.ok) revalidatePath("/etiquetas");
  return result;
}

export type TagRunActionResult = { ok: true; added: number; removed: number } | { ok: false; error: string };

/**
 * Pasar el motor AHORA, sin esperar al cron.
 *
 * El recuento de «socios afectados» de esta pantalla es el que se usa para
 * decidir si una regla está bien acotada, así que tiene que poder mirarse con el
 * dato de hoy y no con el de la última pasada nocturna. Es la misma función que
 * llama el cron y es idempotente: darle dos veces seguidas no cambia nada.
 *
 * El ámbito de centro es el de quien pulsa: una dirección de centro recalcula
 * SUS centros, no los de al lado. `null` (dirección de organización) deja que el
 * motor resuelva la lista de centros de la organización, que sigue siendo una
 * lista explícita y no un «todos» tácito.
 */
export async function recalcTagsAction(): Promise<TagRunActionResult> {
  const session = await guard();
  const scope = await centerScopeFor(session.user);
  const report = await runTagRules(session.user.orgId, new Date(), { centerIds: scope ?? undefined });
  revalidatePath("/etiquetas");
  revalidatePath("/members");
  return { ok: true, added: report.added, removed: report.removed };
}

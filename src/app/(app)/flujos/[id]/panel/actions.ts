"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { refreshFlowGoals } from "@/lib/flows/panel";
import { getFlow } from "@/lib/flows/queries";
// Registra los resolutores del objetivo. Sin esto `refreshFlowGoals` no tiene
// con qué medir y devuelve 0 sin hacer nada, que se lee como «no lo cumplió
// nadie» y es otra cosa.
import "@/lib/flows/seeds";

/**
 * «Actualizar la medición» · guarda la fotografía del objetivo.
 *
 * EL PANEL NO NECESITA ESTO PARA PINTAR: mide en vivo cada vez que se abre (ver
 * la nota larga de `queries.ts`). Lo que hace este botón es escribir
 * `FlowEnrollment.goalMetAt`, que es donde E2 dejó el hueco y de donde beben la
 * tarjeta de embudo de la ficha del flujo y cualquier consulta futura.
 *
 * Existe porque hoy NADIE llama a `refreshFlowGoals`: el cron de flujos consume
 * la cola y se va. Mientras eso siga así, la fotografía la guarda una persona
 * desde aquí — y la pantalla dice cuándo fue la última vez, para que nadie
 * confunda «nadie lo cumplió» con «nadie lo ha medido».
 *
 * El ámbito de centro y el permiso los resuelve `getFlow`, que devuelve `null`
 * fuera de ámbito. Ninguna comprobación «espejo» aquí.
 */
export async function actualizarMedicionAction(
  flowId: string
): Promise<{ ok: true; medidos: number } | { ok: false; error: string }> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  await requireFeature("marketing_automatizado");

  const flow = await getFlow(session.user, flowId);
  if (!flow) return { ok: false, error: "Ese flujo no existe." };
  if (!flow.goalKind) return { ok: false, error: "Este flujo no declara objetivo: no hay nada que medir." };

  const medidos = await refreshFlowGoals(session.user.orgId, flowId);
  revalidatePath(`/flujos/${flowId}/panel`);
  revalidatePath(`/flujos/${flowId}`);
  return { ok: true, medidos };
}

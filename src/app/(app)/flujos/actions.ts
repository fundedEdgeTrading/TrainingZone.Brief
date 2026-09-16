"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import {
  getFlowsModuleState,
  saveFlow,
  setFlowStatus,
  setFlowsPaused,
  setFlowsTestEmail,
  type FlowActionResult,
} from "@/lib/flows/queries";
import type { FlowDraft } from "@/lib/flows/validate";
import type { FlowStatus } from "@prisma/client";

/**
 * Acciones del módulo de flujos.
 *
 * LAS COMPROBACIONES DE VERDAD —permiso, ámbito de centro y validación del
 * flujo— viven en `flows/queries.ts` y en `flows/validate.ts`. Una segunda
 * copia aquí sería una segunda oportunidad de que se olvide una, que es el
 * patrón que E1 ya dejó fijado con las etiquetas.
 *
 * Lo que sí es de aquí: el rol que entra a la pantalla y el plan contratado.
 * Sin `requireFeature` la URL a mano se salta el muro de pago (E6-02), y el
 * gateo de `/flujos` se hereda a las rutas hijas por prefijo.
 */
async function guard() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  await requireFeature("marketing_automatizado");
  return session;
}

function refresh(flowId?: string) {
  revalidatePath("/flujos");
  if (flowId) revalidatePath(`/flujos/${flowId}`);
}

/**
 * REGLA 4 · La pausa global. Para todo, de todos los flujos, al instante.
 * Lo que estaba encolado NO se pierde: se reanuda al despausar.
 */
export async function setFlowsPausedAction(paused: boolean): Promise<FlowActionResult> {
  const session = await guard();
  const result = await setFlowsPaused(session.user, paused);
  if (result.ok) refresh();
  return result;
}

/** REGLA 5 · El buzón al que van TODOS los envíos de un flujo en borrador. */
export async function setFlowsTestEmailAction(email: string): Promise<FlowActionResult> {
  const session = await guard();
  const result = await setFlowsTestEmail(session.user, email);
  if (result.ok) refresh();
  return result;
}

/**
 * Guardar un flujo. La validación se ejecuta EN EL SERVIDOR, dentro de
 * `saveFlow`: el formulario ayuda, pero un `fetch` a mano se lo salta entero y
 * esto es lo que de verdad escribe.
 */
export async function saveFlowAction(draft: FlowDraft, flowId?: string): Promise<FlowActionResult> {
  const session = await guard();
  const result = await saveFlow(session.user, draft, flowId);
  if (result.ok) refresh(result.id);
  return result;
}

/** Borrador ⟷ activo ⟷ pausado. Activar revalida: encender es encender sobre socios de verdad. */
export async function setFlowStatusAction(flowId: string, status: FlowStatus): Promise<FlowActionResult> {
  const session = await guard();
  const result = await setFlowStatus(session.user, flowId, status);
  if (result.ok) refresh(flowId);
  return result;
}

/** Estado del módulo para el aviso de pausa, que se ve desde cualquier pantalla. */
export async function flowsModuleStateAction() {
  const session = await guard();
  return getFlowsModuleState(session.user);
}

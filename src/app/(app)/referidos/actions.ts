"use server";

import { revalidatePath } from "next/cache";

import { requireFeature } from "@/lib/entitlements";
import { requireRole } from "@/lib/guard";
import {
  markRewardPaid,
  reviewReward,
  saveReferralProgram,
  type ProgramWriteResult,
  type RewardWriteResult,
  type SaveProgramInput,
} from "@/lib/referral-rewards";
import { ensureReferralCode, type ReferralCodeResult } from "@/lib/referrals";

/**
 * Acciones de `/referidos`. Las comprobaciones de verdad —ámbito de centro,
 * orden de los estados, motivo obligatorio del rechazo— viven en
 * `referral-rewards.ts`, que es lo que llamaría también un día la API móvil:
 * una segunda copia aquí sería una segunda oportunidad de que se olvide una.
 *
 * Lo de aquí es el rol que entra a la pantalla y el plan contratado. Sin
 * `requireFeature` la URL a mano se salta el muro de pago (E6-02).
 *
 * NINGUNA de estas acciones mueve dinero. "Validada" quiere decir "esta es
 * buena, aplicadla"; "pagada", "una persona ya la ha aplicado". El descuento
 * del próximo recibo y las sesiones sueltas los aplica esa persona, a mano.
 */
async function guard() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "RECEPTION"]);
  await requireFeature("marketing_automatizado");
  return session;
}

export async function validateRewardAction(rewardId: string): Promise<RewardWriteResult> {
  const session = await guard();
  const result = await reviewReward(session.user, rewardId, "VALIDATED");
  if (result.ok) revalidatePath("/referidos");
  return result;
}

export async function rejectRewardAction(rewardId: string, reason: string): Promise<RewardWriteResult> {
  const session = await guard();
  const result = await reviewReward(session.user, rewardId, "REJECTED", reason);
  if (result.ok) revalidatePath("/referidos");
  return result;
}

export async function markRewardPaidAction(rewardId: string): Promise<RewardWriteResult> {
  const session = await guard();
  const result = await markRewardPaid(session.user, rewardId);
  if (result.ok) revalidatePath("/referidos");
  return result;
}

export async function saveProgramAction(centerId: string, input: SaveProgramInput): Promise<ProgramWriteResult> {
  const session = await guard();
  const result = await saveReferralProgram(session.user, centerId, input);
  if (result.ok) revalidatePath("/referidos");
  return result;
}

/**
 * El código del socio, creado a demanda. Se llama desde la ficha del socio (y
 * mañana desde la app: el enlace es el mismo), nunca desde un cron que sembrara
 * códigos a 300 socios que no los han pedido.
 */
export async function ensureReferralCodeAction(memberId: string): Promise<ReferralCodeResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "RECEPTION", "TRAINER_ADMIN"]);
  await requireFeature("marketing_automatizado");
  const result = await ensureReferralCode(session.user, memberId);
  if (result.ok) revalidatePath(`/members/${memberId}`);
  return result;
}

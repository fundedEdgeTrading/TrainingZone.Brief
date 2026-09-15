"use server";

import { revalidatePath } from "next/cache";
import { requireRole, memberIsInScope, centerIsInScope, OUT_OF_CENTER_SCOPE } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { sendMemberForm } from "@/lib/member-forms";

/**
 * M5 · «Enviar formulario» desde la ficha del socio y desde la del lead
 * (E14-18). Un solo módulo para las dos fichas a propósito: son el mismo botón
 * y la misma comprobación, y duplicarlos «como espejo» es el fallo que este
 * trimestre no se quiere repetir.
 *
 * RECEPCIÓN entra: la historia es literalmente «como recepción quiero mandar el
 * formulario por correo para dejar de meter a mano lo que el cliente ya
 * escribió en un papel». Mandar el enlace no da acceso a ningún dato de salud —
 * eso lo sigue decidiendo `health-access.ts` cuando alguien abre la ficha.
 */
const SEND_ROLES = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"] as const;

export type SendFormResult = { ok: true; url: string } | { ok: false; error: string };

export async function sendMemberFormAction(memberId: string, milestoneKey?: string): Promise<SendFormResult> {
  const session = await requireRole([...SEND_ROLES]);

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { id: true },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };
  // Ámbito de centro, sin excepciones (invariante del trimestre): mandarle el
  // formulario a un socio de otro centro es escribir sobre su ficha.
  if (!(await memberIsInScope(session.user, member.id))) return { ok: false, error: OUT_OF_CENTER_SCOPE };

  const result = await sendMemberForm({
    orgId: session.user.orgId,
    target: { kind: "member", memberId },
    milestoneKey,
    sentByUserId: session.user.id,
  });
  if (!result.ok) return result;

  revalidatePath(`/members/${memberId}`);
  return { ok: true, url: result.url };
}

export async function sendLeadFormAction(leadId: string): Promise<SendFormResult> {
  const session = await requireRole([...SEND_ROLES]);

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, orgId: session.user.orgId },
    select: { id: true, centerId: true },
  });
  if (!lead) return { ok: false, error: "No se ha encontrado ese lead." };
  if (!(await centerIsInScope(session.user, lead.centerId))) {
    return { ok: false, error: "Ese lead no es de tus centros." };
  }

  const result = await sendMemberForm({
    orgId: session.user.orgId,
    target: { kind: "lead", leadId },
    sentByUserId: session.user.id,
  });
  if (!result.ok) return result;

  revalidatePath(`/leads/${leadId}`);
  return { ok: true, url: result.url };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { getMemberForUser } from "@/lib/portal-queries";
import { saveMemberInitialPart } from "@/lib/assessments/member-part";
import { memberInitialPartSchema } from "@/lib/assessments/schemas";
import {
  missingEssentialProfileFields,
  type EssentialProfileField,
} from "@/lib/member-first-session";

export type FirstSessionResult = { ok: true } | { ok: false; error: string };

const PHONE_RE = /^[+\d][\d\s-]{5,}$/;
const POSTAL_CODE_RE = /^\d{5}$/; // mismo criterio que los leads (RB-LEAD-010)

/** Edad admitida, la misma que exige el perfil de la valoración inicial. */
const MIN_AGE = 14;
const MAX_AGE = 100;

function textField(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Valida un campo esencial. Devuelve el valor listo para guardar o el motivo
 * por el que no vale. Vive aquí y no en el cliente porque el muro es la única
 * garantía de que estos datos existen: si la validación fuera solo de
 * navegador, bastaría con desactivar JavaScript para entrar sin ellos.
 */
function validateField(field: EssentialProfileField, raw: string): { value: Date | string } | { error: string } {
  if (!raw) return { error: "Rellena todos los campos para continuar." };

  switch (field) {
    case "birthDate": {
      const date = new Date(`${raw}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) return { error: "La fecha de nacimiento no es válida." };
      // La edad se mide contra hoy en UTC: el muro no necesita la precisión del
      // huso del centro para distinguir a alguien de 13 años de alguien de 40.
      const age = (Date.now() - date.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
      if (age < MIN_AGE) return { error: `Hay que tener al menos ${MIN_AGE} años para entrenar con nosotros.` };
      if (age > MAX_AGE) return { error: "Revisa la fecha de nacimiento." };
      return { value: date };
    }
    case "phone":
      return PHONE_RE.test(raw) ? { value: raw } : { error: "El teléfono no tiene un formato válido." };
    case "postalCode":
      return POSTAL_CODE_RE.test(raw) ? { value: raw } : { error: "El código postal debe tener 5 dígitos." };
    default:
      return { value: raw };
  }
}

/**
 * Cierra el primer tramo del muro: los datos que la importación no pudo traer.
 *
 * Solo escribe los que faltaban. Recalcular aquí la lista —en vez de fiarse de
 * lo que llegue en el formulario— evita que un envío manipulado sobrescriba un
 * dato que dirección ya había corregido a mano en la ficha.
 */
export async function completeEssentialProfileAction(formData: FormData): Promise<FirstSessionResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const missing = missingEssentialProfileFields(member);
  if (!missing.length) return { ok: true };

  const data: Record<string, Date | string> = {};
  for (const field of missing) {
    const result = validateField(field, textField(formData, field));
    if ("error" in result) return { ok: false, error: result.error };
    data[field] = result.value;
  }

  await prisma.member.update({ where: { id: member.id }, data });

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "MEMBER_COMPLETED_ESSENTIAL_PROFILE",
      entityType: "Member",
      entityId: member.id,
      memberId: member.id,
      metadata: { fields: missing },
    },
  });

  revalidatePath("/portal", "layout");
  return { ok: true };
}

/**
 * Cierra el segundo tramo: la parte de la valoración inicial que contesta el
 * socio. La validación real es el esquema zod compartido con el formulario del
 * entrenador, así que un campo que allí es obligatorio no puede colarse vacío
 * por aquí.
 */
export async function submitMemberInitialPartAction(raw: unknown): Promise<FirstSessionResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const parsed = memberInitialPartSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Revisa los datos de la valoración." };
  }

  const result = await saveMemberInitialPart({ memberId: member.id, answers: parsed.data });
  if (!result.ok) return result;

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "MEMBER_FILLED_INITIAL_ASSESSMENT_PART",
      entityType: "Assessment",
      entityId: result.assessmentId,
      memberId: member.id,
    },
  });

  revalidatePath("/portal", "layout");
  return { ok: true };
}

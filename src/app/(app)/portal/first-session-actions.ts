"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { getMemberForUser } from "@/lib/portal-queries";
import { saveMemberInitialPart } from "@/lib/assessments/member-part";
import { memberInitialPartSchema } from "@/lib/assessments/schemas";
import { createSelfDeclaredHealthRecord } from "@/lib/health-access";
import {
  missingEssentialProfileFields,
  needsHealthDeclaration,
  type EssentialProfileField,
} from "@/lib/member-first-session";

export type FirstSessionResult = { ok: true } | { ok: false; error: string };

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
    default:
      return { value: raw };
  }
}

/**
 * Cierra el tramo bloqueante del muro (E5-08): edad, contacto de emergencia y
 * la declaración de salud mínima — lo único que el servicio necesita de
 * verdad para la primera sesión. El resto del perfil (CP, domicilio,
 * teléfono) ya no pasa por aquí: se pide después, sin bloquear.
 *
 * Solo escribe los campos esenciales que faltaban. Recalcular aquí la lista
 * —en vez de fiarse de lo que llegue en el formulario— evita que un envío
 * manipulado sobrescriba un dato que dirección ya había corregido a mano en
 * la ficha.
 */
export async function completeEssentialProfileAction(formData: FormData): Promise<FirstSessionResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const missing = missingEssentialProfileFields(member);
  const missingHealthDeclaration = needsHealthDeclaration(member);
  if (!missing.length && !missingHealthDeclaration) return { ok: true };

  const data: Record<string, Date | string> = {};
  for (const field of missing) {
    const result = validateField(field, textField(formData, field));
    if ("error" in result) return { ok: false, error: result.error };
    data[field] = result.value;
  }

  let healthDeclaration = "";
  if (missingHealthDeclaration) {
    healthDeclaration = textField(formData, "healthDeclaration");
    if (!healthDeclaration) {
      return { ok: false, error: "Cuéntanos si tienes alguna lesión o condición de salud — si no tienes ninguna, escribe «Ninguna»." };
    }
  }

  if (Object.keys(data).length) {
    await prisma.member.update({ where: { id: member.id }, data });
  }

  if (missingHealthDeclaration) {
    await createSelfDeclaredHealthRecord({ memberId: member.id, orgId: session.user.orgId, description: healthDeclaration });
  }

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "MEMBER_COMPLETED_ESSENTIAL_PROFILE",
      entityType: "Member",
      entityId: member.id,
      memberId: member.id,
      metadata: { fields: missing, healthDeclaration: missingHealthDeclaration },
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

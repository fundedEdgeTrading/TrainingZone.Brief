"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { createHealthRecord, resolveHealthRecord } from "@/lib/health-access";
import type { HealthRecordType, HealthSeverity } from "@prisma/client";

const HEALTH_TYPES: HealthRecordType[] = [
  "INJURY",
  "CHRONIC_CONDITION",
  "MEDICATION",
  "SURGERY",
  "PREGNANCY",
  "ALLERGY",
];
const SEVERITIES: HealthSeverity[] = ["LOW", "MEDIUM", "HIGH"];

export type MemberActionResult = { ok: true } | { ok: false; error: string };

// Alta de lesión / condición. El acceso real (permiso + consentimiento +
// auditoría) lo aplica lib/health-access.ts; aquí solo se validan las entradas.
export async function addHealthRecord(formData: FormData): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);

  const memberId = String(formData.get("memberId") ?? "");
  const typeRaw = String(formData.get("type") ?? "");
  const severityRaw = String(formData.get("severity") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const zone = String(formData.get("zone") ?? "").trim() || null;

  const type = HEALTH_TYPES.includes(typeRaw as HealthRecordType) ? (typeRaw as HealthRecordType) : null;
  const severity = SEVERITIES.includes(severityRaw as HealthSeverity) ? (severityRaw as HealthSeverity) : null;
  if (!memberId || !type || !severity || !description) {
    return { ok: false, error: "Completa el tipo, la severidad y la descripción." };
  }

  await createHealthRecord({
    memberId,
    orgId: session.user.orgId,
    actorUserId: session.user.id,
    actorRole: session.user.role,
    input: { type, zone: type === "INJURY" ? zone : null, description, severity },
  });

  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

export async function resolveHealthRecordAction(recordId: string, memberId: string): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);

  await resolveHealthRecord({
    recordId,
    orgId: session.user.orgId,
    actorUserId: session.user.id,
    actorRole: session.user.role,
  });

  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

// Bitácora (observaciones no clínicas): cualquier rol de staff puede anotar.
export async function addMemberNote(formData: FormData): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);

  const memberId = String(formData.get("memberId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!memberId || !body) return { ok: false, error: "Escribe una observación antes de guardar." };

  // El socio debe pertenecer a la organización del actor (aislamiento tenant).
  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { id: true },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };

  await prisma.memberNote.create({
    data: { orgId: session.user.orgId, memberId, authorUserId: session.user.id, body },
  });

  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

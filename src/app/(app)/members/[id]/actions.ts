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

// Alta de lesión / condición. El acceso real (permiso + consentimiento +
// auditoría) lo aplica lib/health-access.ts; aquí solo se validan las entradas.
export async function addHealthRecord(formData: FormData) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);

  const memberId = String(formData.get("memberId") ?? "");
  const typeRaw = String(formData.get("type") ?? "");
  const severityRaw = String(formData.get("severity") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const zone = String(formData.get("zone") ?? "").trim() || null;

  const type = HEALTH_TYPES.includes(typeRaw as HealthRecordType) ? (typeRaw as HealthRecordType) : null;
  const severity = SEVERITIES.includes(severityRaw as HealthSeverity) ? (severityRaw as HealthSeverity) : null;
  if (!memberId || !type || !severity || !description) return;

  await createHealthRecord({
    memberId,
    orgId: session.user.orgId,
    actorUserId: session.user.id,
    actorRole: session.user.role,
    input: { type, zone: type === "INJURY" ? zone : null, description, severity },
  });

  revalidatePath(`/members/${memberId}`);
}

export async function resolveHealthRecordAction(recordId: string, memberId: string) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);

  await resolveHealthRecord({
    recordId,
    orgId: session.user.orgId,
    actorUserId: session.user.id,
    actorRole: session.user.role,
  });

  revalidatePath(`/members/${memberId}`);
}

// Bitácora (observaciones no clínicas): cualquier rol de staff puede anotar.
export async function addMemberNote(formData: FormData) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);

  const memberId = String(formData.get("memberId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!memberId || !body) return;

  // El socio debe pertenecer a la organización del actor (aislamiento tenant).
  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { id: true },
  });
  if (!member) return;

  await prisma.memberNote.create({
    data: { orgId: session.user.orgId, memberId, authorUserId: session.user.id, body },
  });

  revalidatePath(`/members/${memberId}`);
}

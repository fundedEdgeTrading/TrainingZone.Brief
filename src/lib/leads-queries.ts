import { prisma } from "@/lib/prisma";
import type { LeadStatus, Role, Sex } from "@prisma/client";
import { createMemberWithInvitation } from "@/lib/invitations";
import { createNotificationOnce } from "@/lib/notifications";
import { createHealthRecordForLead } from "@/lib/health-access";

export async function listLeadChannels(orgId: string) {
  return prisma.leadChannel.findMany({ where: { orgId, active: true }, orderBy: { label: "asc" } });
}

export async function listNoCloseReasons(orgId: string) {
  return prisma.noCloseReason.findMany({ where: { orgId, active: true }, orderBy: { label: "asc" } });
}

// RB-LEAD-004/011: listas configurables por dirección sin desplegar código.
export async function addLeadChannel(orgId: string, label: string) {
  if (!label.trim()) return { ok: false as const, error: "Indica un nombre para el canal." };
  await prisma.leadChannel.create({ data: { orgId, label: label.trim() } });
  return { ok: true as const };
}

export async function addNoCloseReason(orgId: string, label: string) {
  if (!label.trim()) return { ok: false as const, error: "Indica un nombre para el motivo." };
  await prisma.noCloseReason.create({ data: { orgId, label: label.trim() } });
  return { ok: true as const };
}

export async function listCentersForLead(orgId: string) {
  return prisma.center.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export async function listLeads(
  orgId: string,
  opts: { status?: LeadStatus; centerId?: string; ownerUserId?: string; q?: string } = {}
) {
  return prisma.lead.findMany({
    where: {
      orgId,
      centerId: opts.centerId || undefined,
      status: opts.status || undefined,
      ownerUserId: opts.ownerUserId || undefined,
      ...(opts.q
        ? {
            OR: [
              { firstName: { contains: opts.q, mode: "insensitive" } },
              { lastName: { contains: opts.q, mode: "insensitive" } },
              { phone: { contains: opts.q, mode: "insensitive" } },
              { email: { contains: opts.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { center: { select: { name: true } }, owner: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
  });
}

export async function getLeadDetail(orgId: string, leadId: string) {
  return prisma.lead.findFirst({
    where: { id: leadId, orgId },
    include: {
      center: true,
      owner: { select: { id: true, name: true } },
      convertedMember: { select: { id: true, firstName: true, lastName: true, state: true } },
      notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
}

export type CreateLeadInput = {
  orgId: string;
  centerId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  postalCode: string;
  occupation: string;
  hasChildren?: boolean | null; // BI demográfico (RB-BI-003), opcional
  sex?: Sex | null; // BI-2/RB-BI-005, opcional — "prefiero no decirlo" = null
  goals: string;
  hasTrainedBefore: boolean;
  hasTrainedNote?: string | null;
  channel: string;
  ownerUserId?: string | null; // RB-LEAD-003: presencial → se autoasigna al actor; web → null
  healthNote?: string | null; // RB-LEAD-001: "ninguna" también es una respuesta válida
  actor?: { userId: string; role: Role } | null; // null = autocompletado por el propio lead (formulario público)
};

const POSTAL_CODE_RE = /^\d{5}$/; // RB-LEAD-010: CP español, 5 dígitos

export type LeadWriteResult = { ok: true; leadId: string } | { ok: false; error: string };

export async function createLead(input: CreateLeadInput): Promise<LeadWriteResult> {
  if (!input.firstName.trim() || !input.lastName.trim()) return { ok: false, error: "Nombre y apellidos son obligatorios." };
  if (!input.phone.trim()) return { ok: false, error: "El teléfono es obligatorio (RB-LEAD-002)." };
  if (!POSTAL_CODE_RE.test(input.postalCode.trim())) return { ok: false, error: "El código postal debe tener 5 dígitos (RB-LEAD-010)." };
  if (!input.occupation.trim()) return { ok: false, error: "Indica a qué se dedica el lead." };
  if (!input.goals.trim()) return { ok: false, error: "Indica los objetivos del lead." };
  if (!input.channel.trim()) return { ok: false, error: "Selecciona el canal de origen." };

  const lead = await prisma.lead.create({
    data: {
      orgId: input.orgId,
      centerId: input.centerId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim() || null,
      postalCode: input.postalCode.trim(),
      occupation: input.occupation.trim(),
      hasChildren: input.hasChildren ?? null,
      sex: input.sex ?? null,
      goals: input.goals.trim(),
      hasTrainedBefore: input.hasTrainedBefore,
      hasTrainedNote: input.hasTrainedNote?.trim() || null,
      channel: input.channel.trim(),
      ownerUserId: input.ownerUserId || null,
    },
  });

  if (input.healthNote?.trim()) {
    await createHealthRecordForLead({
      leadId: lead.id,
      orgId: input.orgId,
      description: input.healthNote.trim(),
      actor: input.actor ?? null,
    });
  }

  return { ok: true, leadId: lead.id };
}

export async function assignLeadOwner(orgId: string, leadId: string, ownerUserId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true } });
  if (!lead) return { ok: false as const, error: "Lead no encontrado." };
  await prisma.lead.update({ where: { id: leadId }, data: { ownerUserId } });
  // RB-LEAD-009: la alerta de "sin responsable" se resuelve automáticamente al asignarse uno.
  await prisma.notification.updateMany({
    where: { orgId, entityType: "Lead", entityId: leadId, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
  return { ok: true as const };
}

export async function updateLeadStage(
  orgId: string,
  leadId: string,
  status: Extract<LeadStatus, "SEGUIMIENTO" | "CON_FECHA_VALORACION">
) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true, status: true } });
  if (!lead) return { ok: false as const, error: "Lead no encontrado." };
  if (lead.status === "CERRADO" || lead.status === "NO_CERRADO") {
    return { ok: false as const, error: "Este lead ya está archivado." };
  }
  await prisma.lead.update({ where: { id: leadId }, data: { status } });
  return { ok: true as const };
}

// RB-LEAD-011: motivo obligatorio y bloqueante al archivar como NO_CERRADO.
export async function markLeadNoClose(orgId: string, leadId: string, noCloseReason: string) {
  if (!noCloseReason.trim()) return { ok: false as const, error: "El motivo de no cierre es obligatorio." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true, status: true } });
  if (!lead) return { ok: false as const, error: "Lead no encontrado." };
  if (lead.status === "CERRADO") return { ok: false as const, error: "Un lead ya cerrado no puede archivarse." };
  await prisma.lead.update({ where: { id: leadId }, data: { status: "NO_CERRADO", noCloseReason: noCloseReason.trim() } });
  return { ok: true as const };
}

export async function addLeadNote(orgId: string, leadId: string, authorUserId: string, body: string) {
  if (!body.trim()) return { ok: false as const, error: "La nota no puede estar vacía." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true } });
  if (!lead) return { ok: false as const, error: "Lead no encontrado." };
  await prisma.leadNote.create({ data: { orgId, leadId, authorUserId, body: body.trim() } });
  return { ok: true as const };
}

/**
 * RB-LEAD-005/007 — "Ha cerrado" del entrenador INICIA el alta (crea el Member en TRIAL
 * y traslada todos los datos del lead), pero el Lead solo pasa a CERRADO cuando se
 * confirma un pago (ver confirmLeadClosureForMember). No se recaptura ningún dato.
 */
export async function initiateLeadConversion(
  orgId: string,
  leadId: string,
  opts: { planId?: string | null; trainerId?: string | null }
) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } });
  if (!lead) return { ok: false as const, error: "Lead no encontrado." };
  if (lead.convertedMemberId) return { ok: false as const, error: "Este lead ya tiene un alta en curso." };
  if (!lead.email) return { ok: false as const, error: "Se necesita un email para crear el acceso del cliente." };

  const { member } = await prisma.$transaction(async (tx) => {
    const { member, invitation } = await createMemberWithInvitation(tx, {
      orgId,
      primaryCenterId: lead.centerId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email!,
      phone: lead.phone,
      planId: opts.planId ?? null,
      postalCode: lead.postalCode,
      occupation: lead.occupation,
      hasChildren: lead.hasChildren,
      sex: lead.sex, // RB-LEAD-007: se hereda al Member, sin recapturar (BI-2/RB-BI-005)
      channel: lead.channel,
      originLeadId: lead.id,
      trainerId: opts.trainerId ?? null,
    });

    await tx.lead.update({ where: { id: lead.id }, data: { convertedMemberId: member.id, status: "SEGUIMIENTO" } });
    // RB-LEAD-007: traslada lesiones/patologías (sin recapturar) y bitácora.
    await tx.healthRecord.updateMany({ where: { leadId: lead.id }, data: { leadId: null, memberId: member.id } });
    const notes = await tx.leadNote.findMany({ where: { leadId: lead.id } });
    if (notes.length) {
      await tx.memberNote.createMany({
        data: notes.map((n) => ({ orgId, memberId: member.id, authorUserId: n.authorUserId, body: n.body, createdAt: n.createdAt })),
      });
    }
    if (lead.hasTrainedNote) {
      await tx.memberNote.create({
        data: { orgId, memberId: member.id, body: `¿Ha entrenado antes?: ${lead.hasTrainedBefore ? "Sí" : "No"}. ${lead.hasTrainedNote}` },
      });
    }
    return { member, invitation };
  });

  return { ok: true as const, memberId: member.id };
}

/**
 * Se invoca tras cualquier pago PAID (Stripe confirmado o, mientras F12 no cubra el
 * 100% de los cobros, el registro manual — puente explícito documentado en el plan
 * de implementación). Confirma el cierre del lead y activa al socio.
 */
export async function confirmLeadClosureForMember(orgId: string, memberId: string) {
  const lead = await prisma.lead.findFirst({ where: { orgId, convertedMemberId: memberId } });
  if (!lead || lead.status === "CERRADO") return;
  await prisma.$transaction([
    prisma.lead.update({ where: { id: lead.id }, data: { status: "CERRADO" } }),
    prisma.member.updateMany({
      where: { id: memberId, state: { in: ["TRIAL", "PROSPECT"] } },
      data: { state: "ACTIVE" },
    }),
  ]);
}

/** Si el pago falla/cancela con un cierre en curso, el lead vuelve a SEGUIMIENTO con nota automática. */
export async function revertLeadClosureForFailedPayment(orgId: string, memberId: string) {
  const lead = await prisma.lead.findFirst({ where: { orgId, convertedMemberId: memberId, status: { not: "CERRADO" } } });
  if (!lead) return;
  await prisma.leadNote.create({
    data: { orgId, leadId: lead.id, body: "Pago fallido o cancelado: el alta vuelve a seguimiento." },
  });
}

// RB-LEAD-009 (decisión §11.2): 24h sin responsable → alerta a dirección. Se ejecuta
// desde el programador (F10/route /api/jobs/*).
export async function runLeadOwnerAlertRule(orgId: string) {
  const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const staleLeads = await prisma.lead.findMany({
    where: { orgId, ownerUserId: null, contactedAt: { lt: threshold }, status: "SIN_CONTACTAR" },
  });
  if (!staleLeads.length) return 0;

  const directors = await prisma.user.findMany({
    where: { orgId, OR: [{ role: "OWNER" }, { role: "CENTER_DIRECTOR" }] },
    select: { id: true, role: true, centerId: true },
  });

  let created = 0;
  for (const lead of staleLeads) {
    const recipients = directors.filter((d) => d.role === "OWNER" || d.centerId === lead.centerId);
    for (const recipient of recipients) {
      await createNotificationOnce({
        orgId,
        recipientUserId: recipient.id,
        kind: "ALERT",
        title: `Lead sin responsable: ${lead.firstName} ${lead.lastName}`,
        body: "Lleva más de 24h sin que nadie se lo asigne (RB-LEAD-009). Asígnalo desde el listado de leads.",
        entityType: "Lead",
        entityId: lead.id,
      });
      created++;
    }
  }
  return created;
}

export function leadIsArchived(status: LeadStatus) {
  return status === "CERRADO" || status === "NO_CERRADO";
}

/** RB-BI-009: tasa de cierre y desglose del embudo (SIN_CONTACTAR → SEGUIMIENTO → CON_FECHA_VALORACION → CERRADO/NO_CERRADO). */
export async function getLeadCloseRate(orgId: string, opts: { from?: Date; to?: Date } = {}) {
  const rows = await prisma.lead.groupBy({
    by: ["status"],
    where: {
      orgId,
      ...(opts.from || opts.to ? { createdAt: { gte: opts.from, lte: opts.to } } : {}),
    },
    _count: { _all: true },
  });
  const countFor = (s: LeadStatus) => rows.find((r) => r.status === s)?._count._all ?? 0;
  const funnel = {
    sinContactar: countFor("SIN_CONTACTAR"),
    seguimiento: countFor("SEGUIMIENTO"),
    conFechaValoracion: countFor("CON_FECHA_VALORACION"),
    cerrado: countFor("CERRADO"),
    noCerrado: countFor("NO_CERRADO"),
  };
  const decided = funnel.cerrado + funnel.noCerrado;
  return {
    closeRatePct: decided ? Math.round((funnel.cerrado / decided) * 100) : null,
    funnel,
    total: Object.values(funnel).reduce((s, v) => s + v, 0),
  };
}

export type LeadRow = Awaited<ReturnType<typeof listLeads>>[number];

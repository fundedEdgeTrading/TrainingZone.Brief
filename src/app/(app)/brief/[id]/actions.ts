"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { canViewSessionDebrief } from "@/lib/rbac";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { getClinicalDetailForMember } from "@/lib/health-access";
import { conditionLabel } from "@/lib/aptitude-light";
import { HEALTH_STATUS_LABEL } from "@/lib/health-status";
import type { DebriefFeeling } from "@prisma/client";

export type DebriefActionResult = { ok: true } | { ok: false; error: string };

// Session Debrief (G.1): un toque por persona, <20s para 8 personas.
export async function setDebrief(
  bookingId: string,
  sessionId: string,
  feeling: DebriefFeeling
): Promise<DebriefActionResult> {
  const session = await requireSession();

  // La reserva tiene que ser de una sesión de tu organización y que puedas
  // abrir: sin esto bastaba con estar autenticado (un socio incluido) para
  // marcar el debrief de cualquier reserva conociendo su id.
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, sessionId, session: { orgId: session.user.orgId } },
    select: { session: { select: { trainerId: true, directedByUserId: true } } },
  });
  if (!booking) return { ok: false, error: "No se ha encontrado esa reserva." };
  if (!canViewSessionDebrief(session.user.role, session.user.id, booking.session)) {
    return { ok: false, error: "No tienes permiso para registrar el debrief de esta sesión." };
  }

  await prisma.sessionDebrief.upsert({
    where: { bookingId },
    create: { bookingId, feeling },
    update: { feeling },
  });

  // Un debrief implica que la persona asistió.
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "ATTENDED", checkedInAt: new Date() },
  });

  revalidateSessionViews(sessionId);
  return { ok: true };
}


export type ClinicalDetailEntry = { label: string; description: string; severity: string; status: string };
export type ClinicalDetailResult =
  | { ok: true; entries: ClinicalDetailEntry[] }
  | { ok: false; error: string };

/**
 * E3-05 · "ver detalle clínico". La descripción completa no viaja con el brief:
 * se pide a propósito y la petición queda en `AuditLog`. Para los roles sin
 * autorización no hay detalle, y el mensaje no distingue entre "no puedes" y
 * "no existe" — igual que el resto del módulo de salud.
 */
export async function loadClinicalDetail(
  bookingId: string,
  sessionId: string
): Promise<ClinicalDetailResult> {
  const session = await requireSession();

  // Mismo control que el debrief: la reserva es de una sesión de tu
  // organización y que puedes abrir. Y el socio sale de la reserva, nunca de un
  // `memberId` que mande el cliente.
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, sessionId, session: { orgId: session.user.orgId } },
    select: { memberId: true, session: { select: { trainerId: true, directedByUserId: true } } },
  });
  if (!booking) return { ok: false, error: "No hay detalle disponible." };
  if (!canViewSessionDebrief(session.user.role, session.user.id, booking.session)) {
    return { ok: false, error: "No hay detalle disponible." };
  }

  const records = await getClinicalDetailForMember({
    memberId: booking.memberId,
    orgId: session.user.orgId,
    actorUserId: session.user.id,
    actorRole: session.user.role,
  });
  if (!records) return { ok: false, error: "No hay detalle disponible." };

  return {
    ok: true,
    entries: records.map((r) => ({
      label: conditionLabel({ zone: null, zoneCode: r.zoneCode, side: r.side, type: r.type }),
      description: r.description,
      severity: r.severity,
      status: HEALTH_STATUS_LABEL[r.status],
    })),
  };
}

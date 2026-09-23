import { prisma } from "@/lib/prisma";
import type { LeadCloseType, LeadStatus, Role, Sex } from "@prisma/client";
import { createMemberWithInvitation } from "@/lib/invitations";
import { createNotificationOnce } from "@/lib/notifications";
import { createHealthRecordForLead } from "@/lib/health-access";
import { LEAD_CONSENT_VERSION, resolveLeadHealthCapture } from "@/lib/consent";
import { canCaptureLeadHealthData, evaluateAgeAdmission } from "@/lib/minors";
import { isCenterInScope, type ScopedUser } from "@/lib/center-scope";
import { releaseReferralRewardsForLead } from "@/lib/referral-rewards";
import { sendMemberWelcome } from "@/lib/member-welcome";

/**
 * Ámbito de centro de un lead (center-scope.ts), igual que ya se aplica a
 * socios: dirección de organización ve toda la empresa; el resto del equipo,
 * solo los leads de los centros a los que está imputado. La API móvil ya lo
 * aplicaba (`api/mobile/v1/leads/route.ts`); la web filtraba solo por
 * organización.
 */
export async function leadIsInScope(user: ScopedUser, leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId: user.orgId }, select: { centerId: true } });
  if (!lead) return false;
  return isCenterInScope(user, lead.centerId);
}

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

export async function listCentersForLead(orgId: string, centerIds?: string[]) {
  return prisma.center.findMany({
    where: { orgId, ...(centerIds !== undefined ? { id: { in: centerIds } } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function listLeads(
  orgId: string,
  opts: { status?: LeadStatus; centerId?: string; centerIds?: string[]; ownerUserId?: string; q?: string } = {}
) {
  return prisma.lead.findMany({
    where: {
      orgId,
      ...(opts.centerIds !== undefined ? { centerId: { in: opts.centerIds } } : { centerId: opts.centerId || undefined }),
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

/**
 * E8-15: "la ficha señala qué falta, sin bloquear la gestión comercial". Un
 * lead capturado en el paso 1 (nombre, teléfono, centro, canal) llega aquí
 * con estos campos en blanco; la ficha los lista para que se completen
 * cuando haya tiempo, sin impedir moverlo de etapa mientras tanto.
 */
export function missingLeadFields(lead: { postalCode: string; occupation: string; goals: string }): string[] {
  const missing: string[] = [];
  if (!lead.postalCode.trim()) missing.push("Código postal");
  if (!lead.occupation.trim()) missing.push("Ocupación");
  if (!lead.goals.trim()) missing.push("Objetivos");
  return missing;
}

export type UpdateLeadDetailsInput = {
  postalCode?: string;
  occupation?: string;
  goals?: string;
  email?: string | null;
};

/** Completar los datos diferibles del paso 2, desde la ficha del lead. */
export async function updateLeadDetails(
  orgId: string,
  leadId: string,
  input: UpdateLeadDetailsInput
): Promise<LeadWriteResult> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true } });
  if (!lead) return { ok: false, error: "Lead no encontrado." };

  const postalCode = input.postalCode?.trim();
  if (postalCode && !POSTAL_CODE_RE.test(postalCode)) {
    return { ok: false, error: "El código postal debe tener 5 dígitos (RB-LEAD-010)." };
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      ...(input.postalCode !== undefined ? { postalCode: postalCode ?? "" } : {}),
      ...(input.occupation !== undefined ? { occupation: input.occupation.trim() } : {}),
      ...(input.goals !== undefined ? { goals: input.goals.trim() } : {}),
      ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
    },
  });
  return { ok: true, leadId: lead.id };
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
  /**
   * E10-12: sin fecha de nacimiento no hay forma de saber que quien deja sus
   * datos de salud en el formulario público es menor.
   */
  birthDate?: Date | null;
  ownerUserId?: string | null; // RB-LEAD-003: presencial → se autoasigna al actor; web → null
  /**
   * E10-01: el formulario PÚBLICO ya no manda texto libre, manda el sí/no de
   * `hasHealthCondition`. `healthNote` se conserva para el alta en recepción,
   * donde el interesado está delante y el detalle se puede matizar.
   */
  healthNote?: string | null;
  /** Respuesta al sí/no de salud del formulario público (E10-01). */
  hasHealthCondition?: boolean | null;
  /** Casilla específica del dato de salud, nunca premarcada (E10-01). */
  healthConsent?: boolean;
  /**
   * Casilla comercial, SEPARADA de la de salud (E10-01). `Lead` no tiene
   * columna para ella —el esquema está congelado este trimestre— así que la
   * prueba del consentimiento se guarda en `AuditLog`, que es append-only y es
   * exactamente donde el art. 7.1 quiere poder ir a buscarla. Al convertir el
   * lead se lee de ahí para rellenar `Member.consentMarketing`.
   */
  marketingConsent?: boolean;
  actor?: { userId: string; role: Role } | null; // null = autocompletado por el propio lead (formulario público)
  // Rediseño Leads: alta presencial con cierre inmediato ("Cerrado directamente").
  directClose?: { planId?: string | null } | null;
  /**
   * R1 · De quién viene. "Referido" como CANAL no necesita nada más —`channel`
   * ya es texto y `LeadChannel` es configurable sin desplegar (RB-LEAD-004)—,
   * así que lo único que faltaba era esto: el socio que lo trajo y el código
   * concreto por el que entró. Se pasan aquí, en la creación del lead que YA
   * existe, y no en un embudo paralelo: no hay segundo embudo ni tabla de
   * referidos (D-L3-8). Los rellena `/r/[code]`; el resto del repositorio los
   * deja en blanco y nada cambia.
   */
  referredByMemberId?: string | null;
  referralCodeId?: string | null;
};

const POSTAL_CODE_RE = /^\d{5}$/; // RB-LEAD-010: CP español, 5 dígitos

export type LeadWriteResult = { ok: true; leadId: string } | { ok: false; error: string };

export async function createLead(input: CreateLeadInput): Promise<LeadWriteResult> {
  if (!input.firstName.trim() || !input.lastName.trim()) return { ok: false, error: "Nombre y apellidos son obligatorios." };
  if (!input.phone.trim()) return { ok: false, error: "El teléfono es obligatorio (RB-LEAD-002)." };
  // E8-15: captura en dos pasos — solo nombre, teléfono, centro y canal son
  // obligatorios. El código postal, si se da, sigue teniendo que ser válido;
  // el resto (ocupación, objetivos) se puede dejar en blanco y completar
  // después desde la ficha del lead, sin bloquear la gestión comercial.
  if (input.postalCode.trim() && !POSTAL_CODE_RE.test(input.postalCode.trim())) {
    return { ok: false, error: "El código postal debe tener 5 dígitos (RB-LEAD-010)." };
  }
  if (!input.channel.trim()) return { ok: false, error: "Selecciona el canal de origen." };

  // QA-ALTA-03 · Todo lo que puede hacer fallar el cierre directo se comprueba
  // ANTES de escribir el lead: si no, cada reintento del formulario dejaba un
  // lead huérfano más con los mismos datos.
  if (input.directClose) {
    const email = input.email?.trim();
    if (!email) return { ok: false, error: "El email es obligatorio para cerrar el alta directamente." };
    if (await memberEmailTaken(input.orgId, email)) return { ok: false, error: MEMBER_EMAIL_TAKEN };
    const ageError = await conversionAgeError(input.orgId, input.birthDate);
    if (ageError) return { ok: false, error: ageError };
  }

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
      birthDate: input.birthDate ?? null,
      channel: input.channel.trim(),
      ownerUserId: input.ownerUserId || null,
      // R1 · de quién viene, en la misma escritura que el resto del lead: un
      // update posterior dejaría una ventana en la que el lead existe sin
      // embajador, y esa ventana decide dinero.
      referredByMemberId: input.referredByMemberId ?? null,
      referralCodeId: input.referralCodeId ?? null,
    },
  });

  // E10-01: el dato de salud solo entra si hay casilla marcada. Sin ella el
  // lead se crea igualmente con sus datos de contacto — que es justo lo que
  // pide el escenario "sin casilla marcada": la persona no se queda sin poder
  // pedir cita por no ceder un dato del art. 9.
  const capture = resolveLeadHealthCapture({
    hasCondition: input.hasHealthCondition ?? (input.healthNote?.trim() ? true : null),
    healthConsent: input.healthConsent ?? false,
  });
  // E10-12 · del formulario PÚBLICO no se capta dato de salud de un menor: no
  // hay tutor delante ni forma de acreditar su consentimiento, y el del propio
  // menor de 14 sería nulo (art. 7 LOPDGDD). El lead se crea igual y el
  // circuito de tutores se hace en el centro. En recepción (con actor) el
  // control de edad lo hace el alta de socio, no esta captura.
  const minorBlocksHealth = !input.actor && !canCaptureLeadHealthData({ birthDate: input.birthDate });
  if (capture.capture && !minorBlocksHealth) {
    await createHealthRecordForLead({
      leadId: lead.id,
      orgId: input.orgId,
      // Recepción puede matizar el detalle con la persona delante; el
      // formulario público no manda texto y se queda con la frase minimizada.
      description: input.healthNote?.trim() || capture.description,
      actor: input.actor ?? null,
      consent: { signedAt: capture.consentSignedAt, version: capture.consentVersion },
    });
  }

  // Consta la respuesta comercial, la haya dado o no: el art. 7.1 exige poder
  // demostrar que se pidió y qué se contestó, y un "no" registrado evita
  // volver a preguntar por defecto.
  await prisma.auditLog.create({
    data: {
      orgId: input.orgId,
      actorUserId: input.actor?.userId ?? null,
      action: "LEAD_MARKETING_CONSENT_RECORDED",
      entityType: "Lead",
      entityId: lead.id,
      metadata: { granted: input.marketingConsent === true, consentVersion: LEAD_CONSENT_VERSION },
    },
  });

  // "Cerrado directamente" INICIA el alta, igual que el "Ha cerrado" del
  // embudo: el lead queda en conversión con su socio en TRIAL y solo pasa a
  // CERRADO —y solo entonces libera la recompensa del referido— cuando se
  // confirma el cobro (RB-LEAD-005, `confirmLeadClosureForMember`).
  if (input.directClose) {
    const converted = await initiateLeadConversion(input.orgId, lead.id, {
      planId: input.directClose.planId ?? null,
      closeType: "DIRECTO",
    });
    if (!converted.ok) return converted;
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
  status: Extract<LeadStatus, "SIN_CONTACTAR" | "SEGUIMIENTO" | "CON_FECHA_VALORACION">
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

const MEMBER_EMAIL_TAKEN = "Ya existe un socio con ese email.";

// Sin distinguir mayúsculas: el alta de socios guarda el email en minúsculas y
// el lead lo guarda tal como se tecleó; con igualdad exacta "Ana@" y "ana@"
// pasaban por personas distintas.
async function memberEmailTaken(orgId: string, email: string) {
  const dup = await prisma.member.findFirst({
    where: { orgId, email: { equals: email.trim(), mode: "insensitive" } },
    select: { id: true },
  });
  return dup !== null;
}

async function conversionAgeError(orgId: string, birthDate: Date | null | undefined): Promise<string | null> {
  if (!birthDate) return null;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { allowsMinors: true, minimumAgeYears: true },
  });
  if (!org) return "No se ha encontrado la organización.";
  const admission = evaluateAgeAdmission({ birthDate, policy: org, guardian: null });
  if (admission.ok) return null;
  const hint =
    admission.reason === "falta_consentimiento_del_tutor"
      ? " Da el alta desde Socios, donde se recogen los datos del tutor."
      : "";
  return `${admission.message}${hint}`;
}

/**
 * RB-LEAD-005/007 — "Ha cerrado" del entrenador INICIA el alta (crea el Member en TRIAL
 * y traslada todos los datos del lead), pero el Lead solo pasa a CERRADO cuando se
 * confirma un pago (ver confirmLeadClosureForMember). No se recaptura ningún dato.
 */
export async function initiateLeadConversion(
  orgId: string,
  leadId: string,
  opts: { planId?: string | null; closeType?: LeadCloseType }
) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } });
  if (!lead) return { ok: false as const, error: "Lead no encontrado." };
  if (lead.convertedMemberId) return { ok: false as const, error: "Este lead ya tiene un alta en curso." };
  if (!lead.email) return { ok: false as const, error: "Se necesita un email para crear el acceso del cliente." };

  if (await memberEmailTaken(orgId, lead.email)) return { ok: false as const, error: MEMBER_EMAIL_TAKEN };

  // QA-ALTA-06 · Con fecha de nacimiento, la conversión respeta la misma
  // política de edad que el alta manual (E10-12). Aquí no hay forma de
  // recoger el consentimiento acreditable del tutor, así que un menor admitido
  // se da de alta desde Socios, donde sí se piden sus datos. Sin fecha no se
  // bloquea: el lead de recepción puede no tenerla y el onboarding la pide.
  const ageError = await conversionAgeError(orgId, lead.birthDate);
  if (ageError) return { ok: false as const, error: ageError };

  // El consentimiento comercial del lead no tiene columna en `Lead`: consta en
  // `AuditLog` (E10-01). La última respuesta es la que vale.
  const marketingSource = await prisma.auditLog.findFirst({
    where: { orgId, action: "LEAD_MARKETING_CONSENT_RECORDED", entityType: "Lead", entityId: lead.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, metadata: true },
  });
  const marketingGranted =
    (marketingSource?.metadata as { granted?: unknown } | null | undefined)?.granted === true;

  const { member } = await prisma.$transaction(async (tx) => {
    const { member, invitation } = await createMemberWithInvitation(tx, {
      orgId,
      primaryCenterId: lead.centerId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email!,
      phone: lead.phone,
      birthDate: lead.birthDate, // QA-ALTA-06 · sin ella el socio pierde la política de edad
      // El bono del cierre de lead, si lo hay, nace en el mismo centro del lead
      // (RB-LEAD-005): el flujo de conversión no ofrece elegir otro centro.
      bonos: opts.planId ? [{ planId: opts.planId, centerId: lead.centerId }] : [],
      postalCode: lead.postalCode,
      occupation: lead.occupation,
      hasChildren: lead.hasChildren,
      sex: lead.sex, // RB-LEAD-007: se hereda al Member, sin recapturar (BI-2/RB-BI-005)
      channel: lead.channel,
      originLeadId: lead.id,
    });

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        convertedMemberId: member.id,
        status: "SEGUIMIENTO",
        closeType: opts.closeType ?? "EMBUDO",
        // Cierre online: lo genera la plataforma sin contacto previo → queda sin responsable.
        ownerUserId: opts.closeType === "ONLINE" ? null : undefined,
      },
    });
    // RB-LEAD-007 · los objetivos del lead son el primer objetivo del socio:
    // la ficha los enseña (y la IA los lee) desde `ClientGoal`, igual que un
    // "objetivo personalizado" añadido a mano.
    if (lead.goals.trim()) {
      await tx.clientGoal.create({ data: { orgId, memberId: member.id, label: lead.goals.trim(), isTemplate: false } });
    }
    // El consentimiento comercial se hereda con su prueba: fecha de la
    // respuesta original y un AuditLog que apunta a ella (art. 7.1 RGPD).
    if (marketingSource) {
      if (marketingGranted) {
        await tx.member.update({
          where: { id: member.id },
          data: { consentMarketing: true, consentMarketingAt: marketingSource.createdAt },
        });
      }
      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId: null,
          action: "MEMBER_MARKETING_CONSENT_FROM_LEAD",
          entityType: "Member",
          entityId: member.id,
          memberId: member.id,
          metadata: { leadId: lead.id, sourceAuditLogId: marketingSource.id, granted: marketingGranted },
        },
      });
    }
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

  // QA-ALTA-04 · Sin este envío el socio nacía con una invitación que nadie le
  // mandaba. Fuera de la transacción y sin poder tumbar la conversión: el alta
  // ya está hecha, y "Reenviar bienvenida" en la ficha es la vía de rescate.
  try {
    await sendMemberWelcome(member.id);
  } catch (error) {
    console.error("[leads] error enviando la bienvenida del lead convertido:", error);
  }

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

  // R1 · EL ALTA es este momento, y es el único: aquí el lead pasa a CERRADO
  // con su socio ya creado. Si el lead venía de un referido, aquí se LIBERA la
  // recompensa — y liberar significa crear la tarea a administración, no mover
  // dinero: `referral-rewards.ts` no toca un Payment, ni un recibo, ni un cupón
  // de Stripe. Va fuera de la transacción y sin poder lanzar: el alta del socio
  // no se deshace porque el programa de referidos tenga un mal día.
  await releaseReferralRewardsForLead(orgId, lead.id);
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
  // RB-LEAD-009 exige avisar de CUALQUIER lead sin responsable pasado el
  // plazo, no solo el que aún no se ha contactado: un cierre "Online" (o la
  // baja de quien lo tenía asignado) deja el lead sin dueño en `SEGUIMIENTO`
  // o `CON_FECHA_VALORACION`, y con el filtro estrecho a `SIN_CONTACTAR` esos
  // casos nunca generaban la alerta.
  const staleLeads = await prisma.lead.findMany({
    where: { orgId, ownerUserId: null, contactedAt: { lt: threshold }, status: { notIn: ["CERRADO", "NO_CERRADO"] } },
  });
  if (!staleLeads.length) return 0;

  const directors = await prisma.user.findMany({
    where: { orgId, OR: [{ role: "OWNER" }, { role: "CENTER_DIRECTOR" }], deactivatedAt: null },
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
export async function getLeadCloseRate(
  orgId: string,
  opts: { from?: Date; to?: Date; centerId?: string | null; centerIds?: string[] } = {}
) {
  const rows = await prisma.lead.groupBy({
    by: ["status"],
    where: {
      orgId,
      ...(opts.centerIds !== undefined ? { centerId: { in: opts.centerIds } } : opts.centerId ? { centerId: opts.centerId } : {}),
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

/** Desglose de leads CERRADO por tipo de cierre, para el KPI "Cerrados". */
export async function getLeadCloseTypeBreakdown(orgId: string, centerIds?: string[]) {
  const rows = await prisma.lead.groupBy({
    by: ["closeType"],
    where: { orgId, status: "CERRADO", ...(centerIds !== undefined ? { centerId: { in: centerIds } } : {}) },
    _count: { _all: true },
  });
  const countFor = (t: LeadCloseType) => rows.find((r) => r.closeType === t)?._count._all ?? 0;
  return { embudo: countFor("EMBUDO"), directo: countFor("DIRECTO"), online: countFor("ONLINE") };
}

/** Leads sin responsable asignado y no archivados (requieren asignación). */
export async function countLeadsWithoutOwner(orgId: string, centerIds?: string[]) {
  return prisma.lead.count({
    where: {
      orgId,
      ownerUserId: null,
      status: { notIn: ["CERRADO", "NO_CERRADO"] },
      ...(centerIds !== undefined ? { centerId: { in: centerIds } } : {}),
    },
  });
}

/** Canales de origen — de dónde llegan los leads (gráfica de barras). */
export async function getLeadChannelDistribution(orgId: string, centerIds?: string[]) {
  const rows = await prisma.lead.groupBy({
    by: ["channel"],
    where: { orgId, ...(centerIds !== undefined ? { centerId: { in: centerIds } } : {}) },
    _count: { _all: true },
    orderBy: { _count: { channel: "desc" } },
  });
  return rows.map((r) => ({ label: r.channel, count: r._count._all }));
}

/** Motivos de no cierre — por qué se pierden los leads (gráfica de barras). */
export async function getLeadNoCloseReasonDistribution(orgId: string, centerIds?: string[]) {
  const rows = await prisma.lead.groupBy({
    by: ["noCloseReason"],
    where: {
      orgId,
      status: "NO_CERRADO",
      noCloseReason: { not: null },
      ...(centerIds !== undefined ? { centerId: { in: centerIds } } : {}),
    },
    _count: { _all: true },
    orderBy: { _count: { noCloseReason: "desc" } },
  });
  return rows.map((r) => ({ label: r.noCloseReason as string, count: r._count._all }));
}

export type LeadRow = Awaited<ReturnType<typeof listLeads>>[number];

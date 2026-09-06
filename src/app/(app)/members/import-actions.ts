"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type PlanType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, centerIsInScope, CENTER_OUT_OF_SCOPE } from "@/lib/guard";
import { canImportMembers } from "@/lib/rbac";
import { parseMembersCsv, type ParsedMemberData, type ParsedSubscriptionData } from "@/lib/member-import";
import { absoluteUrl, createMemberInvitation, onboardingUrlFor } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderMemberWelcomeEmail } from "@/lib/emails/templates";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";
import { createSubscriptionFromPlan, resolveSubscriptionTerms } from "@/lib/subscriptions";
import { recordSessionsChange } from "@/lib/session-ledger";

export type ImportSummary = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  /** Cuotas dadas de alta a partir de la columna «Plan» del CSV. */
  subscriptionsCreated: number;
  /** Socios nuevos a los que se les ha enviado el email de acceso. */
  invitationsSent: number;
  errors: { row: number; messages: string[] }[];
};

export type ImportMembersResult =
  | { ok: true; summary: ImportSummary }
  | { ok: false; error: string };

const MAX_ROWS = 5000;

// Campos que la importación escribe sobre un socio existente. Se omiten
// firstName/lastName/email al actualizar solo si el CSV los trae vacíos (no es
// el caso: son obligatorios), y externalRef nunca se toca en update (es la clave).
// `state` se excluye a propósito: si el CSV no trae la columna o trae un valor
// no reconocido, d.state es null y no debe pisar el estado actual del socio.
function commonData(d: ParsedMemberData) {
  return {
    phone: d.phone,
    birthDate: d.birthDate,
    sex: d.sex,
    address: d.address,
    addressLine2: d.addressLine2,
    city: d.city,
    province: d.province,
    postalCode: d.postalCode,
    country: d.country,
    lastAccessAt: d.lastAccessAt,
    lastInteractionAt: d.lastInteractionAt,
    accountCreatedAt: d.accountCreatedAt,
    churnRisk: d.churnRisk,
    primaryAspiration: d.primaryAspiration,
    secondaryAspiration: d.secondaryAspiration,
    mywellnessAccount: d.mywellnessAccount,
    externalId: d.externalId,
  };
}


/** Mismo criterio laxo que las cabeceras: sin acentos, sin mayúsculas, sin dobles espacios. */
function normalizePlanName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type PlanRef = {
  id: string;
  name: string;
  type: PlanType;
  priceCents: number;
  sessionsIncluded: number | null;
};

/**
 * Da de alta la cuota que el socio ya venía pagando. Devuelve `true` solo si ha
 * creado una suscripción nueva.
 *
 * Es idempotente a propósito: una migración real se ejecuta varias veces —el
 * gimnasio corrige el CSV y lo vuelve a subir— y duplicar la cuota significaría
 * cobrar dos veces al mismo socio.
 */
async function upsertImportedSubscription(
  memberId: string,
  centerId: string,
  plan: PlanRef,
  sub: ParsedSubscriptionData,
  joinedAt: Date | null,
  /** Organización y autor de la importación: firman el asiento (E2-15). */
  ledger: { orgId: string; actorUserId: string }
): Promise<boolean> {
  const existing = await prisma.subscription.findFirst({
    where: { memberId, planId: plan.id, status: { in: ["ACTIVE", "FROZEN"] } },
    select: { id: true },
  });

  // Sin fecha de alta de la cuota se usa la de inscripción del socio: es lo más
  // cercano a la verdad y deja el histórico coherente. `new Date()` fecharía
  // todas las altas el día de la importación y falsearía la antigüedad.
  const startDate = sub.startDate ?? joinedAt ?? new Date();
  // E4-30: la importación sigue LA MISMA REGLA que el alta manual. El CSV solo
  // manda cuando trae un saldo (lo que le queda al socio a mitad de bono); si no
  // lo trae, decide el plan, igual que en recepción. Antes había aquí una regla
  // propia —saldo solo para `SESSION_PACK`— que dejaba ilimitada una cuota
  // mensual con sesiones incluidas.
  const terms = resolveSubscriptionTerms(plan, {
    priceCents: sub.priceCents,
    sessionsRemaining: sub.sessionsRemaining ?? undefined,
  });

  if (existing) {
    // La reimportación NO reescribe el saldo salvo que el CSV traiga uno: el
    // gimnasio corrige el fichero y lo vuelve a subir, y devolver el bono a su
    // saldo inicial le regalaría al socio las sesiones ya gastadas.
    const rewritesBalance = sub.sessionsRemaining !== null;
    await prisma.$transaction(async (tx) => {
      const before = await tx.subscription.findUnique({
        where: { id: existing.id },
        select: { sessionsRemaining: true },
      });
      await tx.subscription.update({
        where: { id: existing.id },
        data: {
          priceCents: terms.priceCents,
          startDate,
          ...(rewritesBalance
            ? { sessionsRemaining: terms.sessionsRemaining, sessionsIncluded: terms.sessionsIncluded }
            : {}),
        },
      });

      // E2-15: reescribir el saldo desde el CSV es mover `sessionsRemaining`, y
      // eso deja asiento como cualquier otro movimiento. Es un valor ABSOLUTO,
      // así que el delta es la diferencia contra lo que había.
      if (!rewritesBalance) return;
      const delta = (terms.sessionsRemaining ?? 0) - (before?.sessionsRemaining ?? 0);
      await recordSessionsChange(
        tx,
        {
          orgId: ledger.orgId,
          subscriptionId: existing.id,
          reason: "CORRECTION",
          actorUserId: ledger.actorUserId,
          note: "Saldo reescrito desde la importación de socios.",
        },
        delta
      );
    });
    return false;
  }

  await createSubscriptionFromPlan(prisma, {
    memberId,
    centerId,
    plan,
    startDate,
    priceCents: sub.priceCents,
    sessionsRemaining: sub.sessionsRemaining ?? undefined,
  });
  return true;
}

/** Lo que necesita el email de acceso y no cambia de una fila a otra. */
type InviteContext = {
  orgId: string;
  orgName: string;
  orgLogoUrl: string;
  centerName: string;
  centerAddress: string | null;
};

/**
 * Da acceso al portal a un socio recién importado.
 *
 * Solo para los que se dan de alta en esta pasada: reenviar el enlace a los que
 * ya estaban sería spam en cada corrección del CSV, y además `Invitation` tiene
 * `memberId` único, así que la segunda invitación al mismo socio ni siquiera
 * cabría en la tabla.
 *
 * Sin email no hay nada que enviar, y con la ficha ya activada tampoco: ese
 * socio tiene su contraseña puesta y el enlace de onboarding no le sirve.
 */
async function inviteImportedMember(
  ctx: InviteContext,
  member: { id: string; firstName: string; lastName: string; email: string; userId: string | null }
): Promise<boolean> {
  if (!member.email || member.userId) return false;

  const invitation = await prisma.$transaction((tx) =>
    createMemberInvitation(tx, { orgId: ctx.orgId, memberId: member.id, email: member.email })
  );

  const footer = memberEmailFooterLinks(member.id);
  // Fire-and-forget como el resto de transaccionales: en una importación de
  // 5.000 filas, un SMTP lento no puede ir frenando el bucle fila a fila.
  void sendMail({
    to: member.email,
    // RB-MARCA-001: el socio no ha comprado Apta, ha comprado su gimnasio.
    fromName: ctx.orgName,
    subject: `¡Bienvenida a ${ctx.orgName}, ${member.firstName}! 🎉 Tu acceso te espera`,
    html: renderMemberWelcomeEmail({
      memberFirstName: member.firstName,
      orgName: ctx.orgName,
      orgLogoUrl: ctx.orgLogoUrl,
      centerName: ctx.centerName,
      onboardingUrl: onboardingUrlFor(invitation.token),
      memberFullName: `${member.firstName} ${member.lastName}`,
      postalAddress: ctx.centerAddress ?? undefined,
      prefsToken: footer.token,
    }),
    unsubscribeUrl: footer.oneClickUnsubscribeUrl,
  });

  return true;
}

export async function importMembersCsv(formData: FormData): Promise<ImportMembersResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!canImportMembers(session.user.role)) {
    return { ok: false, error: "Solo la dirección puede importar socios." };
  }
  const orgId = session.user.orgId;

  const centerId = String(formData.get("centerId") ?? "");
  if (!centerId) return { ok: false, error: "Selecciona el centro de destino de la importación." };
  const center = await prisma.center.findFirst({
    where: { id: centerId, orgId },
    select: { id: true, name: true, address: true },
  });
  if (!center) return { ok: false, error: "No se ha encontrado ese centro." };
  // Importar un CSV entero a un centro ajeno sería la vía más rápida de saltarse
  // el ámbito: se comprueba igual que en el alta individual.
  if (!(await centerIsInScope(session.user, center.id))) return { ok: false, error: CENTER_OUT_OF_SCOPE };

  // Marcada por defecto en el formulario, pero dirección puede desmarcarla: una
  // carga de histórico —socios de baja, fichas viejas— no debe disparar cientos
  // de emails de bienvenida a gente que ya no entrena allí.
  const sendInvitations = formData.get("sendInvitations") === "on";

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Adjunta un archivo CSV." };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "No se ha podido leer el archivo." };
  }

  const { rows, fatalError } = parseMembersCsv(text);
  if (fatalError) return { ok: false, error: fatalError };
  if (rows.length === 0) return { ok: false, error: "El CSV no contiene filas de socios." };
  if (rows.length > MAX_ROWS) {
    return { ok: false, error: `El CSV supera el máximo de ${MAX_ROWS} filas por importación.` };
  }

  // Los planes se cargan una vez, no por fila: una importación de 5.000 socios
  // haría 5.000 consultas idénticas.
  const plans = await prisma.membershipPlan.findMany({
    where: { orgId, active: true },
    select: { id: true, name: true, type: true, priceCents: true, sessionsIncluded: true },
  });
  const plansByName = new Map(plans.map((p) => [normalizePlanName(p.name), p]));

  // Igual que los planes: una sola vez, no una consulta por socio invitado.
  const org = sendInvitations
    ? await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } })
    : null;
  const inviteContext: InviteContext = {
    orgId,
    orgName: org?.name ?? "Training Zone",
    orgLogoUrl: absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png"),
    centerName: center.name,
    centerAddress: center.address,
  };

  const summary: ImportSummary = {
    total: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    subscriptionsCreated: 0,
    invitationsSent: 0,
    errors: [],
  };

  for (const row of rows) {
    if (row.errors.length) {
      summary.skipped++;
      summary.errors.push({ row: row.rowNumber, messages: row.errors });
      continue;
    }

    const d = row.data;

    // El plan se valida ANTES de tocar la base: si el CSV nombra una tarifa que
    // no existe, es un error de la fila entera y no vale importar a la persona
    // dejándola sin cuota — quedaría como socio activo que nadie cobra, que es
    // justo el silencio que esta importación viene a evitar.
    let plan: PlanRef | null = null;
    if (row.subscription) {
      plan = plansByName.get(normalizePlanName(row.subscription.planName)) ?? null;
      if (!plan) {
        summary.skipped++;
        summary.errors.push({
          row: row.rowNumber,
          messages: [
            `El plan «${row.subscription.planName}» no existe o está archivado. ` +
              "Créalo en Productos antes de importar, o corrige el nombre en el CSV.",
          ],
        });
        continue;
      }
    }

    try {
      // Localiza al socio existente por la clave estable del origen y, en su
      // defecto, por email dentro de la organización — para no duplicar.
      // externalRef tiene prioridad: email no es único en Member, así que si
      // ambos criterios apuntaran a socios distintos, un OR combinado podría
      // devolver el socio equivocado y sobrescribir sus datos con los de otra
      // persona.
      const existing = d.externalRef
        ? await prisma.member.findFirst({
            where: { orgId, externalRef: d.externalRef },
            select: { id: true, primaryCenterId: true },
          })
        : d.email
          ? await prisma.member.findFirst({
              where: { orgId, email: d.email },
              select: { id: true, primaryCenterId: true },
            })
          : null;

      // El emparejamiento anterior solo acota por organización: sin esta
      // comprobación, una fila cuyo email/externalRef coincidiera con un socio
      // de OTRO centro de la misma organización lo actualizaba igual, fuera del
      // ámbito de quien importa (el centro elegido en el desplegable solo se
      // valida como destino de las filas nuevas, nunca como filtro de las que
      // encuentran coincidencia).
      if (existing && !(await centerIsInScope(session.user, existing.primaryCenterId))) {
        summary.skipped++;
        summary.errors.push({
          row: row.rowNumber,
          messages: ["Esta fila coincide con un socio de un centro fuera de tu ámbito: se ha omitido sin tocarlo."],
        });
        continue;
      }

      if (existing) {
        await prisma.member.update({
          where: { id: existing.id },
          data: {
            firstName: d.firstName,
            lastName: d.lastName,
            ...(d.email ? { email: d.email } : {}),
            ...(d.joinedAt ? { joinedAt: d.joinedAt } : {}),
            ...(d.externalRef ? { externalRef: d.externalRef } : {}),
            ...(d.state ? { state: d.state } : {}),
            externalSource: "mywellness",
            ...commonData(d),
          },
        });
        summary.updated++;
        if (plan && row.subscription) {
          const created = await upsertImportedSubscription(
            existing.id,
            center.id,
            plan,
            row.subscription,
            d.joinedAt,
            { orgId, actorUserId: session.user.id }
          );
          if (created) summary.subscriptionsCreated++;
        }
      } else {
        const member = await prisma.member.create({
          data: {
            orgId,
            primaryCenterId: center.id,
            firstName: d.firstName,
            lastName: d.lastName,
            email: d.email ?? "",
            ...(d.joinedAt ? { joinedAt: d.joinedAt } : {}),
            externalRef: d.externalRef,
            state: d.state ?? "PROSPECT",
            externalSource: "mywellness",
            ...commonData(d),
          },
        });
        summary.created++;
        if (plan && row.subscription) {
          const created = await upsertImportedSubscription(
            member.id,
            center.id,
            plan,
            row.subscription,
            d.joinedAt,
            { orgId, actorUserId: session.user.id }
          );
          if (created) summary.subscriptionsCreated++;
        }
        // Al final de la fila, nunca antes: si el alta del socio o su cuota
        // fallan, no debe quedar un enlace de acceso circulando por ahí para
        // una ficha que no llegó a existir.
        if (sendInvitations && (await inviteImportedMember(inviteContext, { ...member, userId: null }))) {
          summary.invitationsSent++;
        }
      }
    } catch (e) {
      summary.skipped++;
      const msg =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
          ? "Conflicto de duplicado (email o identificador ya existente)."
          : "Error al guardar la fila.";
      summary.errors.push({ row: row.rowNumber, messages: [msg] });
    }
  }

  revalidatePath("/members");
  return { ok: true, summary };
}

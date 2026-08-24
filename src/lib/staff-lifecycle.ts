import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { staffFootprint, futureAssignedSessions, countActiveWithRole } from "@/lib/staff-queries";

/**
 * Baja y reincorporación de plantilla (RB-RRHH-014).
 *
 * Vive fuera de la pantalla porque tiene dos puertas: la sección Equipo de
 * `/organization` y el `DELETE /api/mobile/v1/staff/[id]` de la app nativa. La
 * segunda existía antes y hacía media baja —quitaba la imputación y la
 * visibilidad en la app, pero la persona seguía pudiendo entrar—; con el núcleo
 * aquí las dos hacen exactamente lo mismo.
 *
 * Quién puede llamar y sobre quién es cosa de cada puerta (`canDeleteStaff` +
 * `findStaffInScope` en la web, `canManageStaff` + orgId en la API): aquí solo
 * están las reglas que no dependen de por dónde se entre.
 */

export type StaffTarget = {
  id: string;
  name: string;
  email: string;
  role: Role;
  centerId?: string | null;
  deactivatedAt: Date | null;
};

export type StaffRemovalResult = { ok: true; purged: boolean } | { ok: false; error: string };
export type StaffActionResult = { ok: true } | { ok: false; error: string };

export async function removeStaffMember(params: {
  orgId: string;
  actorUserId: string;
  target: StaffTarget;
}): Promise<StaffRemovalResult> {
  const { orgId, actorUserId, target } = params;

  if (target.deactivatedAt) return { ok: false, error: "Esa persona ya está dada de baja." };
  if (target.id === actorUserId) return { ok: false, error: "No puedes darte de baja a ti mismo." };

  // Una organización sin dirección no tiene quién devuelva el rol a nadie.
  if (target.role === "OWNER") {
    const others = await countActiveWithRole(orgId, "OWNER", target.id);
    if (others === 0) {
      return { ok: false, error: "Es la única Dirección de organización: nombra otra antes de darla de baja." };
    }
  }

  // Con clases suyas por delante, la baja deja huecos sin entrenador en la
  // agenda: se reasignan primero (mismo criterio que la baja de un socio con
  // bono vivo, que obliga a cancelar la suscripción antes).
  const pending = await futureAssignedSessions(orgId, target.id);
  if (pending > 0) {
    return {
      ok: false,
      error: `Tiene ${pending} ${pending === 1 ? "sesión asignada" : "sesiones asignadas"} por delante. Reasígnalas en la agenda antes de darle de baja.`,
    };
  }

  const footprint = await staffFootprint(target.id);

  try {
    await prisma.$transaction(async (tx) => {
      // Común a las dos formas de baja: fuera el acceso y fuera la imputación.
      // Las imputaciones secundarias (dedicación repartida) no vuelven solas al
      // reincorporar: se rehacen desde "Imputar a un centro".
      await tx.centerMembership.deleteMany({ where: { userId: target.id, orgId } });
      await tx.mobileRefreshToken.deleteMany({ where: { userId: target.id } });
      await tx.notification.deleteMany({ where: { recipientUserId: target.id } });
      await tx.invitation.deleteMany({ where: { userId: target.id } });

      if (footprint.hasHistory) {
        // `visibleInApp: false` además de la marca de baja: la app del socio lo
        // lee para decidir a quién enseña junto a una sesión ya pasada.
        await tx.user.update({
          where: { id: target.id },
          data: { deactivatedAt: new Date(), visibleInApp: false },
        });
      } else {
        // Sin rastro no hay histórico que perder, pero sí filas que pueden
        // existir sin contar como trabajo hecho (una plantilla de sesión sin
        // estrenar, un lead asignado y no trabajado): se sueltan antes de
        // borrar. Borrar de verdad libera además el email, que es único por
        // organización, para volver a invitar a esa persona.
        await tx.sessionTemplate.updateMany({ where: { trainerId: target.id }, data: { trainerId: null } });
        await tx.lead.updateMany({ where: { ownerUserId: target.id }, data: { ownerUserId: null } });
        await tx.healthRecord.updateMany({ where: { reportedByUserId: target.id }, data: { reportedByUserId: null } });
        await tx.aptitudeRule.updateMany({ where: { editedByUserId: target.id }, data: { editedByUserId: null } });
        await tx.referenceRange.updateMany({ where: { editedByUserId: target.id }, data: { editedByUserId: null } });
        await tx.workoutProgram.updateMany({ where: { confirmedByUserId: target.id }, data: { confirmedByUserId: null } });
        await tx.chatMessage.updateMany({ where: { senderUserId: target.id }, data: { senderUserId: null } });
        await tx.announcement.updateMany({ where: { createdById: target.id }, data: { createdById: null } });
        await tx.assessment.updateMany({ where: { filledByUserId: target.id }, data: { filledByUserId: null } });
        await tx.mesocycle.updateMany({ where: { approvedByUserId: target.id }, data: { approvedByUserId: null } });
        await tx.user.delete({ where: { id: target.id } });
      }

      // La identidad (`Identity`) sobrevive a propósito: es de la persona, no de
      // esta organización, y puede tener membresía en otro gimnasio de Apta. Sin
      // membresías aquí, `authenticate` ya no la deja entrar en esta.
      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          action: footprint.hasHistory ? "STAFF_DEACTIVATED" : "STAFF_DELETED",
          entityType: "User",
          entityId: target.id,
          metadata: { name: target.name, email: target.email, role: target.role, footprint },
        },
      });
    });
  } catch (error) {
    console.error("removeStaffMember", error);
    return { ok: false, error: "No se ha podido dar de baja a esta persona. Revisa que no tenga trabajo en curso." };
  }

  return { ok: true, purged: !footprint.hasHistory };
}

/** Roles cuyo trabajo pasa en un centro concreto: al volver recuperan su imputación primaria. */
const CENTER_SCOPED_ROLES: Role[] = ["CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"];

export async function restoreStaffMember(params: {
  orgId: string;
  actorUserId: string;
  target: StaffTarget;
}): Promise<StaffActionResult> {
  const { orgId, actorUserId, target } = params;
  if (!target.deactivatedAt) return { ok: false, error: "Esa persona ya está en plantilla." };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { deactivatedAt: null, visibleInApp: true },
    });

    if (target.centerId && CENTER_SCOPED_ROLES.includes(target.role)) {
      await tx.centerMembership.upsert({
        where: { userId_centerId: { userId: target.id, centerId: target.centerId } },
        create: {
          orgId,
          userId: target.id,
          centerId: target.centerId,
          role: target.role,
          isPrimary: true,
          allocationPct: 100,
        },
        update: { isPrimary: true },
      });
    }

    await tx.auditLog.create({
      data: {
        orgId,
        actorUserId,
        action: "STAFF_RESTORED",
        entityType: "User",
        entityId: target.id,
        metadata: { name: target.name, email: target.email, role: target.role },
      },
    });
  });

  return { ok: true };
}

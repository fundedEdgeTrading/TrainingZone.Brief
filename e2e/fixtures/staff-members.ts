import { prisma } from "@/lib/prisma";
import { createStaffWithInvitation } from "@/lib/invitations";
import { setPassword } from "@/lib/identity";
import type { Role } from "@prisma/client";

/**
 * Persona de plantilla para los tests del CRUD de equipo (RB-RRHH-014), dada de
 * alta por el mismo camino que el alta real de dirección
 * (`createStaffWithInvitation` + imputación primaria) y con la contraseña ya
 * fijada, que es lo que el canje de la invitación haría por su cuenta.
 *
 * `withHistory` decide cuál de las dos bajas se prueba: sin rastro la baja
 * borra la fila; con rastro —aquí, una entrada de auditoría suya— la conserva
 * marcada y se puede reincorporar.
 */
export const STAFF_PASSWORD = "demo1234";

export type StaffFixture = { userId: string; email: string; name: string; centerId: string };

export function staffFixtureEmail(tag: string) {
  return `staff.e2e.${tag}@example.com`;
}

export async function createStaffFixture({
  tag,
  role = "RECEPTION",
  withHistory = false,
}: {
  tag: string;
  role?: Role;
  withHistory?: boolean;
}): Promise<StaffFixture> {
  const email = staffFixtureEmail(tag);
  await deleteStaffFixture(tag);

  const reference = await prisma.user.findFirstOrThrow({ where: { email: "entrenador@trainingzone.es" } });
  const orgId = reference.orgId;
  const centerId = reference.centerId!;
  const name = `Equipo E2E ${tag}`;

  const { user } = await prisma.$transaction((tx) =>
    createStaffWithInvitation(tx, { orgId, name, email, role, centerId })
  );
  await prisma.centerMembership.create({
    data: { orgId, userId: user.id, centerId, role, isPrimary: true, allocationPct: 100 },
  });
  await setPassword(user.identityId, STAFF_PASSWORD);

  if (withHistory) {
    // Una entrada de auditoría suya basta como rastro: es exactamente lo que
    // `staffFootprint` mira para decidir que la fila no se puede borrar.
    await prisma.auditLog.create({
      data: { orgId, actorUserId: user.id, action: "MEMBER_VIEWED", entityType: "Member", entityId: `e2e-${tag}` },
    });
  }

  return { userId: user.id, email, name, centerId };
}

/** Borra la persona de prueba y lo que cuelga de ella. Idempotente. */
export async function deleteStaffFixture(tag: string) {
  const email = staffFixtureEmail(tag);
  const user = await prisma.user.findFirst({ where: { email }, select: { id: true, identityId: true } });
  if (!user) {
    await prisma.identity.deleteMany({ where: { email } });
    return;
  }

  await prisma.centerMembership.deleteMany({ where: { userId: user.id } });
  await prisma.mobileRefreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.notification.deleteMany({ where: { recipientUserId: user.id } });
  await prisma.invitation.deleteMany({ where: { userId: user.id } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: user.id } });
  await prisma.auditLog.deleteMany({ where: { entityType: "User", entityId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  // La identidad sobrevive a la baja a propósito (puede tener membresía en otra
  // organización); en un fixture no interesa que sobreviva entre ejecuciones.
  await prisma.identity.deleteMany({ where: { id: user.identityId } });
}

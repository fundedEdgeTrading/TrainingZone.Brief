import type { Prisma, Role } from "@prisma/client";
import { canManageOrg, ROLE_LABEL } from "@/lib/rbac";
import {
  createStaffWithInvitation,
  generateInvitationToken,
  invitationExpiry,
  onboardingUrlFor,
  absoluteUrl,
} from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderStaffInviteEmail } from "@/lib/emails/templates";
import { prisma } from "@/lib/prisma";
import { isPlatformOperator } from "../apta/platform-access";

/**
 * Política de roles de la plantilla, compartida por `/organization` y por
 * `api/mobile/v1/staff`. Estaba escrita dos veces y las dos tenían el mismo
 * agujero (QA-ALTA-01): un único sitio para que la próxima vez no haya espejo
 * que se quede atrás.
 *
 * `PLATFORM_ADMIN` NO es un rol de plantilla: es soporte de Apta. Estaba en
 * esta lista y la guarda solo pedía `canManageOrg`, que es `true` para un
 * OWNER — así que cualquier director se ascendía a soporte de la plataforma.
 */
export const STAFF_ROLES: readonly Role[] = [
  "OWNER",
  "CENTER_DIRECTOR",
  "TRAINER",
  "TRAINER_ADMIN",
  "RECEPTION",
  "HR_MANAGER",
];

// Roles ligados a un centro (exigen imputación). El resto son de ámbito organización.
export const CENTER_SCOPED: readonly Role[] = ["CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"];

export type StaffRoleCheck =
  | { ok: true; role: Role }
  | { ok: false; error: string; status: 400 | 403 };

/**
 * Pura: decide si `actor` puede dar el rol `requested`. Quien llama resuelve
 * antes `actor.isPlatformOperator` (hace falta la base de datos), y solo si de
 * verdad se pide `PLATFORM_ADMIN`.
 */
export function checkStaffRole(
  actor: { role: Role; isPlatformOperator: boolean },
  requested: string
): StaffRoleCheck {
  if (requested === "PLATFORM_ADMIN") {
    // Solo soporte de Apta nombra a soporte de Apta.
    return actor.role === "PLATFORM_ADMIN" && actor.isPlatformOperator
      ? { ok: true, role: "PLATFORM_ADMIN" }
      : { ok: false, error: "No tienes permiso para asignar ese rol.", status: 403 };
  }
  if (!STAFF_ROLES.includes(requested as Role)) return { ok: false, error: "Ese rol no existe.", status: 400 };
  const role = requested as Role;
  // RRHH no puede crear administración de la organización (evita escalada de privilegios).
  if (role === "OWNER" && !canManageOrg(actor.role)) {
    return { ok: false, error: "No tienes permiso para asignar ese rol.", status: 403 };
  }
  return { ok: true, role };
}

/** `checkStaffRole` con la consulta de organización de plataforma resuelta. */
export async function resolveStaffRole(actor: { role: Role; orgId: string }, requested: string): Promise<StaffRoleCheck> {
  const isOperator = requested === "PLATFORM_ADMIN" && (await isPlatformOperator(actor));
  return checkStaffRole({ role: actor.role, isPlatformOperator: isOperator }, requested);
}

/**
 * QA-ALTA-11 · Alta de personal: persona, invitación e imputación primaria,
 * todo o nada. La imputación iba después del commit: si fallaba, quedaba una
 * persona de centro sin centro, con el email ocupado y sin forma de repetir el
 * alta ("ya existe").
 */
export async function createStaffAccount(
  tx: Prisma.TransactionClient,
  params: { orgId: string; name: string; email: string; role: Role; centerId: string | null }
) {
  const created = await createStaffWithInvitation(tx, params);
  if (params.centerId) {
    await tx.centerMembership.create({
      data: {
        orgId: params.orgId,
        userId: created.user.id,
        centerId: params.centerId,
        role: params.role,
        isPrimary: true,
        allocationPct: 100,
      },
    });
  }
  return created;
}

/**
 * QA-ALTA-10 · Reenviar la invitación de alguien que aún no ha entrado. La
 * anterior se borra y se emite otra con token y caducidad nuevos: un enlace
 * reenviado porque "no me llegó" puede estar en el buzón equivocado, y no debe
 * seguir abriendo la cuenta. `Invitation.userId` es único, así que "invalidar"
 * y "crear otra" son la misma transacción.
 *
 * Devuelve `null` si la persona ya aceptó (o nunca tuvo invitación): no hay
 * nada que reenviar y una invitación nueva le reabriría el onboarding.
 *
 * El borrado es condicional y se mira cuántas filas quitó: con dos reenvíos a
 * la vez (doble clic) ambos leen la misma pendiente, y el segundo esperaba al
 * bloqueo del primero para borrar una fila que ya no existía — un 500.
 * Ahora ese segundo no hace nada: el primero ya reenvió.
 */
export async function reissueStaffInvitation(
  tx: Prisma.TransactionClient,
  params: { orgId: string; userId: string; email: string }
) {
  const previous = await tx.invitation.findFirst({
    where: { orgId: params.orgId, userId: params.userId, type: "STAFF", usedAt: null },
    select: { id: true },
  });
  if (!previous) return null;
  const removed = await tx.invitation.deleteMany({ where: { id: previous.id, usedAt: null } });
  if (removed.count === 0) return null;
  return tx.invitation.create({
    data: {
      orgId: params.orgId,
      type: "STAFF",
      token: generateInvitationToken(),
      email: params.email,
      userId: params.userId,
      expiresAt: invitationExpiry(),
    },
  });
}

/**
 * `sendMail` hoy no devuelve nada; con P1 devolverá `{ ok: false }` cuando
 * falle. Se mira sin depender de su tipo para que esto funcione antes y
 * después de que P1 llegue a main.
 */
export function mailFailed(result: unknown): boolean {
  return typeof result === "object" && result !== null && "ok" in result && result.ok === false;
}

/** Correo de invitación del personal: el mismo en el alta, en el reenvío y en la app. */
export async function sendStaffInvite(params: {
  orgId: string;
  name: string;
  email: string;
  role: Role;
  centerId: string | null;
  token: string;
}): Promise<{ ok: boolean }> {
  const [org, inviteCenter] = await Promise.all([
    prisma.organization.findUnique({ where: { id: params.orgId }, select: { name: true, logoUrl: true } }),
    params.centerId
      ? prisma.center.findUnique({ where: { id: params.centerId }, select: { name: true, address: true } })
      : Promise.resolve(null),
  ]);
  const result: unknown = await sendMail({
    to: params.email,
    fromName: org?.name ?? "Training Zone",
    subject: `¡Bienvenida a ${org?.name ?? "Training Zone"}! Tu acceso te espera`,
    html: renderStaffInviteEmail({
      staffFirstName: params.name.split(/\s+/)[0] ?? params.name,
      orgName: org?.name ?? "Training Zone",
      orgLogoUrl: absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png"),
      roleLabel: ROLE_LABEL[params.role],
      onboardingUrl: onboardingUrlFor(params.token),
      centerName: inviteCenter?.name,
      postalAddress: inviteCenter?.address ?? undefined,
    }),
  });
  return { ok: !mailFailed(result) };
}

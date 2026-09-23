import type { Prisma, Role } from "@prisma/client";
import { canManageOrg } from "@/lib/rbac";
import { createStaffWithInvitation } from "@/lib/invitations";
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

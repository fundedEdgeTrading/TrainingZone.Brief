import type { Prisma, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { centerScopeFor, type ScopedUser } from "@/lib/center-scope";
import { canManageStaff } from "@/lib/rbac";

/**
 * Ámbito y ciclo de vida de la plantilla (RB-RRHH-014).
 *
 * El alta y la imputación viven en la pantalla de Organización desde F7; lo que
 * faltaba era el resto del CRUD —editar la ficha de un trabajador y sacarlo del
 * equipo— y que dirección de centro pudiera hacerlo sobre los suyos. Las dos
 * reglas duras están aquí, no en la pantalla:
 *
 *  1. Ámbito: dirección de organización, soporte de plataforma y RRHH ven toda
 *     la organización; dirección de centro, solo a quien esté imputado a alguno
 *     de sus centros — y nunca a los roles de ámbito organización, que no son
 *     "de su centro" y cuya baja sería una escalada de privilegios al revés.
 *  2. Baja: se borra la fila solo si de ella no cuelga nada que deba
 *     sobrevivir; si cuelga, se marca `deactivatedAt` y se conserva.
 */

/** Roles que mandan en toda la organización: fuera del alcance de un centro. */
const ORG_SCOPE_ROLES: Role[] = ["OWNER", "PLATFORM_ADMIN", "HR_MANAGER"];

/**
 * El filtro en sí, sin base de datos: qué plantilla ve un rol con un ámbito de
 * centros ya resuelto. Separado de la consulta para poder fijarlo en un test —
 * es la frontera que impide que dirección de centro edite o dé de baja a quien
 * no es de los suyos, y un `{}` de más aquí la abre entera.
 *
 * `null` no existe como respuesta a propósito: "toda la organización" es un
 * `where` vacío, y así quien llama no distingue dos formas del mismo dato.
 */
export function staffScopeWhere(role: Role, centerIds: string[]): Prisma.UserWhereInput {
  if (canManageStaff(role)) return {};

  return {
    // Un rol de ámbito organización no es "de un centro": dirección de centro
    // no lo ve y, por tanto, tampoco puede tocarlo.
    role: { notIn: ORG_SCOPE_ROLES },
    OR: [
      { centerId: { in: centerIds } },
      { centerMemberships: { some: { centerId: { in: centerIds } } } },
    ],
  };
}

/** Filtro de plantilla para quien pregunta, con su ámbito resuelto contra la BD. */
export async function staffScopeFilter(user: ScopedUser): Promise<Prisma.UserWhereInput> {
  if (canManageStaff(user.role)) return {};
  return staffScopeWhere(user.role, (await centerScopeFor(user)) ?? []);
}

/** La ficha de plantilla de `userId`, si quien pregunta la tiene en su ámbito. */
export async function findStaffInScope(user: ScopedUser, userId: string) {
  return prisma.user.findFirst({
    where: {
      id: userId,
      orgId: user.orgId,
      role: { not: "MEMBER" },
      // Bajo `AND` por lo mismo que en `getStaffWithMemberships`: el ámbito
      // trae su propio filtro de `role` y esparcirlo pisaba a este.
      AND: [await staffScopeFilter(user)],
    },
    select: { id: true, name: true, email: true, role: true, centerId: true, deactivatedAt: true },
  });
}

/**
 * Rastro de trabajo de una persona: todo lo que se perdería o se quedaría
 * anónimo si se borrase su fila. Decide la forma de la baja.
 *
 * Parte de ello ni siquiera se puede borrar sin destruir dato ajeno o de
 * conservación obligatoria (fichajes, valoraciones recibidas, debriefs
 * firmados, mesociclos de sus socios cuelgan con FK obligatoria). El resto son
 * FK opcionales que sí se podrían soltar a `null`, pero hacerlo dejaría el
 * histórico sin autor: quién dio la clase, quién cobró, quién escribió la nota.
 * Con rastro, la baja marca `deactivatedAt` y conserva la fila; sin nada de
 * esto —el alta con el email mal escrito, la invitación que nadie canjeó— se
 * borra de verdad, que además libera el email para volver a invitarlo.
 */
export async function staffFootprint(userId: string) {
  const [timeClock, ratings, debriefs, mesocycles, sessions, payments, notes, leadNotes, audits] =
    await Promise.all([
      prisma.timeClockEntry.count({ where: { userId } }),
      prisma.trainerRating.count({ where: { trainerUserId: userId } }),
      prisma.trainerDebrief.count({ where: { trainerId: userId } }),
      prisma.mesocycle.count({ where: { createdByUserId: userId } }),
      prisma.classSession.count({ where: { OR: [{ trainerId: userId }, { directedByUserId: userId }] } }),
      prisma.payment.count({ where: { soldByUserId: userId } }),
      prisma.memberNote.count({ where: { authorUserId: userId } }),
      prisma.leadNote.count({ where: { authorUserId: userId } }),
      prisma.auditLog.count({ where: { actorUserId: userId } }),
    ]);

  const counts = { timeClock, ratings, debriefs, mesocycles, sessions, payments, notes, leadNotes, audits };
  return {
    ...counts,
    hasHistory: Object.values(counts).some((n) => n > 0),
  };
}

/**
 * Sesiones futuras que todavía tiene asignadas. Una baja con clases pendientes
 * deja huecos sin entrenador en la agenda, así que se corta antes y se pide
 * reasignarlas — el mismo criterio que la baja de socio con bono vivo.
 */
export async function futureAssignedSessions(orgId: string, userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.classSession.count({
    where: {
      orgId,
      trainerId: userId,
      status: { not: "CANCELLED" },
      // Una serie recurrente sigue dando clases hoy aunque su fila arranque en
      // una fecha ya pasada: sus ocurrencias se derivan en lectura de
      // `recurrence`/`recUntil` y no existen como filas propias.
      OR: [
        { date: { gte: today } },
        { recurrence: { not: "NONE" }, OR: [{ recUntil: null }, { recUntil: { gte: today } }] },
      ],
    },
  });
}

/**
 * ¿Puede quien pregunta operar sobre este centro? Quien gestiona plantilla de
 * toda la organización (dirección, soporte, RRHH) no está imputado a ningún
 * centro, así que `isCenterInScope` le daría `false` por un ámbito vacío: la
 * frontera por centro solo aplica a quien la tiene.
 */
export async function canActOnCenter(user: ScopedUser, centerId: string): Promise<boolean> {
  if (canManageStaff(user.role)) return true;
  const scope = (await centerScopeFor(user)) ?? [];
  return scope.includes(centerId);
}

/** ¿Queda alguien más con este rol vivo en la organización? (última dirección). */
export async function countActiveWithRole(orgId: string, role: Role, exceptUserId: string) {
  return prisma.user.count({
    where: { orgId, role, deactivatedAt: null, id: { not: exceptUserId } },
  });
}

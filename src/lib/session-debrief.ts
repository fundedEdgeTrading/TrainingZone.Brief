import { prisma } from "@/lib/prisma";
import { canViewSessionDebrief } from "@/lib/rbac";
import { isCenterInScope } from "@/lib/center-scope";
import { bookingTransitionMessage, checkBookingTransition, statusesEndingAt } from "@/lib/booking-transitions";
import type { DebriefFeeling, Role } from "@prisma/client";

/**
 * Un ÚNICO canal de debrief de sesión (E3-07).
 *
 * Había tres escritores de `SessionDebrief` con dos criterios de `feeling`
 * incompatibles: la web (🟢🟡🔴), su espejo móvil y el endpoint de ocho ejes,
 * que DERIVABA el color de la media. Un entrenador puntuaba ocho ejes en la app
 * (media 8,5 → GREEN), luego tocaba 🔴 en la web, y quedaba `feeling: RED` con
 * `technique: 9, progress: 9`. Nadie reconciliaba. Y peor: rellenar solo el RPE
 * dejaba la media a `null` y la derivación devolvía AMBER — el socio quedaba
 * marcado "regular" para siempre sin que nadie lo hubiera dicho.
 *
 * Promediar movilidad con actitud no significa nada: es un número que parece
 * riguroso y no lo es. Así que el color lo pone el dedo del entrenador, aquí,
 * en un solo sitio, con el mismo contrato para la web y para la app.
 *
 * Y por eso las garantías del trimestre viven AQUÍ, no repetidas en cada
 * llamante: el ámbito de centro (E1-01) y la máquina de estados de la reserva
 * (E2-02, RB-RES-010). Un canal único que no las llevara dentro sería un canal
 * único con dos criterios otra vez.
 */

export const DEBRIEF_FEELINGS: DebriefFeeling[] = ["GREEN", "AMBER", "RED"];

export function isDebriefFeeling(value: unknown): value is DebriefFeeling {
  return typeof value === "string" && DEBRIEF_FEELINGS.includes(value as DebriefFeeling);
}

export type SetDebriefResult = { ok: true } | { ok: false; error: string; status: 400 | 403 | 404 | 409 };

/** La frase que acompaña al color. Opcional: el flujo de sala no se bloquea por ella. */
const MAX_NOTE = 600;

export async function setSessionDebrief({
  bookingId,
  sessionId,
  orgId,
  actorUserId,
  actorRole,
  actorCenterId,
  feeling,
  note,
}: {
  bookingId: string;
  sessionId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
  /** Centro base de quien escribe; con `CenterMembership` forma su ámbito (E1-01). */
  actorCenterId: string | null;
  feeling: DebriefFeeling;
  /** `undefined` = no se toca la que hubiera; `null` o "" = se borra. */
  note?: string | null;
}): Promise<SetDebriefResult> {
  if (!isDebriefFeeling(feeling)) {
    return { ok: false, error: "Falta el estado de la sesión.", status: 400 };
  }
  if (note != null && note.length > MAX_NOTE) {
    return { ok: false, error: `La nota no puede pasar de ${MAX_NOTE} caracteres.`, status: 400 };
  }

  // La reserva tiene que ser de una sesión de tu organización y que puedas
  // abrir: sin esto bastaba con estar autenticado (un socio incluido) para
  // marcar el debrief de cualquier reserva conociendo su id.
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, sessionId, session: { orgId } },
    // `status` para la máquina de estados (E2-02) y `centerId` para el ámbito
    // de centro (E1-01): las dos comprobaciones cuelgan de la misma lectura.
    select: { status: true, session: { select: { centerId: true, trainerId: true, directedByUserId: true } } },
  });
  if (!booking) return { ok: false, error: "No se ha encontrado esa reserva.", status: 404 };

  // E1-01: si el brief de esa sesión no se puede abrir por ámbito de centro,
  // tampoco se puede escribir su debrief. `canViewSessionDebrief` mira el rol y
  // quién dirigió la sesión, nunca el centro.
  const inScope = await isCenterInScope(
    { id: actorUserId, role: actorRole, orgId, centerId: actorCenterId },
    booking.session.centerId
  );
  if (!inScope) return { ok: false, error: "No se ha encontrado esa reserva.", status: 404 };

  if (!canViewSessionDebrief(actorRole, actorUserId, booking.session)) {
    return { ok: false, error: "No tienes permiso para registrar el debrief de esta sesión.", status: 403 };
  }

  // RB-RES-010: un debrief marca asistencia, así que primero hay que poder
  // asistir. Sobre una reserva CANCELLED o WAITLISTED esto guardaba el debrief
  // y ponía `status = ATTENDED` sin preguntar: una asistencia inexistente que
  // ocupaba aforo y falseaba adherencia, retención y KPIs.
  const transition = checkBookingTransition(booking.status, "ATTENDED");
  if (!transition.ok) return { ok: false, error: transition.error, status: 409 };

  const trimmed = note === undefined ? undefined : (note?.trim() || null);

  // Y no se escribe NADA si la reserva ha cambiado entre la lectura y la
  // escritura: la condición de estado viaja dentro del propio UPDATE y el
  // debrief se deshace con la transacción si no se aplica.
  const applied = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: { id: bookingId, status: { in: statusesEndingAt("ATTENDED") } },
      data: { status: "ATTENDED", checkedInAt: new Date() },
    });
    if (updated.count === 0) return false;
    await tx.sessionDebrief.upsert({
      where: { bookingId },
      create: { bookingId, feeling, note: trimmed ?? null },
      update: { feeling, ...(trimmed === undefined ? {} : { note: trimmed }) },
    });
    return true;
  });
  if (!applied) {
    return { ok: false, error: bookingTransitionMessage(booking.status, "ATTENDED"), status: 409 };
  }

  // La revalidación de rutas la hace quien llama (acción de servidor o route
  // handler): necesita el contexto de petición de Next, y meterla aquí ataba el
  // único canal de escritura a poder ejecutarse solo dentro de una request.
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Histórico: de dónde salió el color (escenario "histórico")
// ---------------------------------------------------------------------------

export type FeelingOrigin = "TRAINER" | "DERIVED";

export const FEELING_ORIGIN_LABEL: Record<FeelingOrigin, string> = {
  TRAINER: "Puesto por el entrenador",
  DERIVED: "Derivado de la media de ejes (criterio retirado)",
};

const LEGACY_AXES = ["rpe", "technique", "attitude", "energy", "mobility", "pain", "adherence", "progress"] as const;

export type LegacyAxisScores = Partial<Record<(typeof LEGACY_AXES)[number], number | null>>;

/**
 * Los debriefs existentes se conservan, marcados con el origen de su feeling.
 * No hace falta una columna nueva para saberlo: solo el endpoint de ocho ejes
 * —el que derivaba el color— escribía esos ejes, y desde E3-07 ya no existe.
 * Un debrief con ejes puntuados es, por construcción, uno de los antiguos.
 */
export function feelingOrigin(debrief: LegacyAxisScores | null | undefined): FeelingOrigin {
  if (!debrief) return "TRAINER";
  return LEGACY_AXES.some((axis) => debrief[axis] != null) ? "DERIVED" : "TRAINER";
}

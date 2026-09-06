import { prisma } from "@/lib/prisma";
import { canViewSessionDebrief } from "@/lib/rbac";
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
 */

export const DEBRIEF_FEELINGS: DebriefFeeling[] = ["GREEN", "AMBER", "RED"];

export function isDebriefFeeling(value: unknown): value is DebriefFeeling {
  return typeof value === "string" && DEBRIEF_FEELINGS.includes(value as DebriefFeeling);
}

export type SetDebriefResult = { ok: true } | { ok: false; error: string; status: 400 | 403 | 404 };

/** La frase que acompaña al color. Opcional: el flujo de sala no se bloquea por ella. */
const MAX_NOTE = 600;

export async function setSessionDebrief({
  bookingId,
  sessionId,
  orgId,
  actorUserId,
  actorRole,
  feeling,
  note,
}: {
  bookingId: string;
  sessionId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
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
    select: { session: { select: { trainerId: true, directedByUserId: true } } },
  });
  if (!booking) return { ok: false, error: "No se ha encontrado esa reserva.", status: 404 };
  if (!canViewSessionDebrief(actorRole, actorUserId, booking.session)) {
    return { ok: false, error: "No tienes permiso para registrar el debrief de esta sesión.", status: 403 };
  }

  const trimmed = note === undefined ? undefined : (note?.trim() || null);

  await prisma.sessionDebrief.upsert({
    where: { bookingId },
    create: { bookingId, feeling, note: trimmed ?? null },
    update: { feeling, ...(trimmed === undefined ? {} : { note: trimmed }) },
  });

  // Un debrief implica que la persona asistió.
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "ATTENDED", checkedInAt: new Date() },
  });

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

/**
 * Bitácora del socio: qué se destaca al abrir la ficha y qué se aparta.
 *
 * El caso que resuelve: el entrenador abre la ficha treinta segundos antes de
 * la sesión y el hilo de Actividad puede traer cien hechos. Lo que necesita ver
 * sin buscar son dos cosas — lo que alguien marcó como **importante** (no
 * caduca: "no le mandes remo, se marea") y lo **reciente** de las últimas
 * semanas ("el martes vino con agujetas"). Todo lo demás sigue en el hilo.
 *
 * Archivar es la salida de las notas que ya no aplican: la fila se conserva
 * (nunca se borra una nota de bitácora) pero deja de pintarse en el hilo y en
 * el bloque destacado. Se sigue consultando en "Notas archivadas".
 *
 * Ojo con el alcance: esto es para observaciones puntuales y leves. Un
 * diagnóstico médico o cualquier cosa persistente es una Lesión
 * (`HealthRecord`, sección Salud), que tiene consentimiento, permisos y
 * auditoría propios (ADR-008). La bitácora se ve con los permisos generales de
 * la ficha, así que usarla de historial clínico se salta ese control.
 *
 * Las funciones de aquí son puras a propósito: ordenar y repartir notas es la
 * regla que hay que poder probar sin base de datos ni render.
 */

/** Lo mínimo que necesita una nota para repartirse. Encaja con `MemberNote`. */
export type NoteForHighlight = {
  id: string;
  important: boolean;
  archivedAt: Date | null;
  createdAt: Date;
};

/** Ventana de "reciente": lo de las dos últimas semanas de entreno. */
export const RECENT_NOTE_DAYS = 14;

/** Tope del bloque destacado. Más que esto ya no se lee de un vistazo. */
export const HIGHLIGHT_LIMIT = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isArchived(note: { archivedAt: Date | null }) {
  return note.archivedAt !== null;
}

/** Las que siguen vivas en el hilo. */
export function activeNotes<T extends { archivedAt: Date | null }>(notes: T[]) {
  return notes.filter((n) => !isArchived(n));
}

/** Las apartadas. Siguen siendo consultables, solo que fuera del hilo. */
export function archivedNotes<T extends { archivedAt: Date | null }>(notes: T[]) {
  return notes.filter(isArchived);
}

export function isRecentNote(note: { createdAt: Date }, now: Date, days = RECENT_NOTE_DAYS) {
  return now.getTime() - note.createdAt.getTime() <= days * DAY_MS;
}

/**
 * Lo que se pinta arriba del todo al abrir la ficha: importantes primero (por
 * antiguas que sean) y después las recientes sin archivar, de la más nueva a la
 * más vieja. Una nota archivada NO entra aunque esté marcada como importante —
 * archivar es precisamente decir "esto ya no hace falta tenerlo delante".
 */
export function highlightedNotes<T extends NoteForHighlight>(
  notes: T[],
  now: Date = new Date(),
  { limit = HIGHLIGHT_LIMIT, recentDays = RECENT_NOTE_DAYS }: { limit?: number; recentDays?: number } = {}
): T[] {
  const byNewest = (a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime();
  const vivas = activeNotes(notes);

  const importantes = vivas.filter((n) => n.important).sort(byNewest);
  const recientes = vivas.filter((n) => !n.important && isRecentNote(n, now, recentDays)).sort(byNewest);

  return [...importantes, ...recientes].slice(0, limit);
}

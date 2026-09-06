import type { Prisma } from "@prisma/client";

/**
 * E2-08: la posición en la lista de espera se renumera cuando alguien sale.
 *
 * `bookSessionForMember` escribía `waitlistedCount + 1` UNA vez y nadie volvía
 * a tocar el número: A(1), B(2), A se da de baja, entra C → C se llevaba
 * también la 2. Con posiciones duplicadas y huecos, el `orderBy
 * waitlistPosition` con el que sale el aviso de plaza libre
 * (`session-vacancy-notify.ts`) tampoco significaba nada.
 *
 * Lo que la posición NO es —y por eso la interfaz lo dice— es un turno:
 * RB-RES-007 es una decisión de negocio, no un descuido. Al liberarse un hueco
 * se avisa a TODA la lista a la vez y la plaza es de quien la reclame antes.
 * La posición ordena el aviso y cuenta a cuánta gente tienes delante; no
 * reserva nada.
 *
 * La parte pura vive aquí para poder probarla sin base de datos.
 */

/**
 * Copy compartido entre el portal y la agenda. Es la mitad de la historia que
 * faltaba: un número sin explicación se lee como un turno.
 */
export const WAITLIST_NO_QUEUE_NOTICE =
  "Cuando se libere una plaza se avisa a toda la lista a la vez: es de quien la reclame antes.";

export type WaitlistEntry = { id: string; waitlistPosition: number | null };

/**
 * Posiciones compactadas: 1, 2, 3… sin huecos ni duplicados, respetando el
 * orden en que llegan las filas (la consulta las trae por posición y, a
 * igualdad, por `bookedAt`).
 *
 * Devuelve SOLO las que cambian: renumerar una lista que ya está bien no debe
 * escribir nada.
 */
export function resequencePositions(entries: WaitlistEntry[]): { id: string; waitlistPosition: number }[] {
  const changes: { id: string; waitlistPosition: number }[] = [];
  entries.forEach((entry, index) => {
    const position = index + 1;
    if (entry.waitlistPosition !== position) changes.push({ id: entry.id, waitlistPosition: position });
  });
  return changes;
}

/**
 * Renumera la cola de UNA ocurrencia (una serie recurrente comparte fila de
 * sesión, así que la lista es por día, no por serie).
 *
 * Se llama desde las cuatro salidas de la cola: la baja del propio socio, la
 * cancelación desde el roster, el descarte del entrenador y la promoción a
 * BOOKED. Va dentro de la misma transacción que la salida para que nadie llegue
 * a ver la lista con un hueco.
 */
export async function resequenceWaitlist(
  tx: Prisma.TransactionClient,
  sessionId: string,
  occurrenceDate: Date
): Promise<number> {
  const waiting = await tx.booking.findMany({
    where: { sessionId, occurrenceDate, status: "WAITLISTED" },
    orderBy: [{ waitlistPosition: "asc" }, { bookedAt: "asc" }],
    select: { id: true, waitlistPosition: true },
  });

  const changes = resequencePositions(waiting);
  for (const change of changes) {
    await tx.booking.update({ where: { id: change.id }, data: { waitlistPosition: change.waitlistPosition } });
  }
  return changes.length;
}

import type { AutoTaskCapUsage } from "@/lib/tasks-queries";

/**
 * E14-12 · el tope, dicho en la pantalla.
 *
 * Un tope invisible es un fallo que nadie reporta: sin esto, una dirección que
 * deja de ver tareas nuevas no sabe si es que el centro va bien o que el motor
 * ha dejado de escribir, y lo segundo no se reporta nunca porque no se ve.
 *
 * Se pinta en dos momentos distintos: **cuando el tope ya está actuando** sobre
 * alguien (aviso), y **cuando se está acercando** (nota discreta, a partir del
 * 80 %). Por debajo de eso no se dice nada: un contador permanente de algo que
 * no está pasando es ruido.
 */
export function AutoCapNotice({
  usage,
  userIds,
  nameOf,
  ownUserId,
}: {
  usage: AutoTaskCapUsage;
  /** Las personas que se están viendo en el tablero. */
  userIds: string[];
  nameOf: (userId: string) => string;
  ownUserId: string;
}) {
  const rows = userIds
    .map((userId) => ({ userId, used: usage.usedByUser.get(userId) ?? 0 }))
    .filter((row) => row.used >= usage.cap * 0.8)
    .sort((a, b) => b.used - a.used);

  if (rows.length === 0) return null;

  const reached = rows.filter((row) => row.used >= usage.cap);
  const acting = reached.length > 0;

  return (
    <div
      data-auto-cap-notice={acting ? "alcanzado" : "cerca"}
      className={`rounded-card border p-3.5 text-sm ${
        acting ? "border-warning bg-warning-bg text-warning-text" : "border-brand-border bg-surface-soft text-brand-text-2"
      }`}
    >
      <p className="font-semibold">
        {acting
          ? `Tope de tareas automáticas alcanzado (${usage.cap} por persona y semana)`
          : `Cerca del tope de tareas automáticas (${usage.cap} por persona y semana)`}
      </p>

      <p className="mt-1 text-xs">
        {acting ? (
          <>
            Las reglas del centro han dejado de crear tareas nuevas esta semana para{" "}
            {reached.length === 1 ? "esta persona" : "estas personas"}.{" "}
            <strong>No se descarta nada</strong>: las reglas vuelven a mirar cada noche, así que en cuanto se cierren
            tareas —o el lunes— se escriben las situaciones que sigan sin atender. El tope solo cuenta lo que crea el
            motor: lo que encarga una persona a otra no se limita nunca.
          </>
        ) : (
          <>
            A partir del tope, el motor deja de crear tareas hasta que se cierren las abiertas o empiece la semana
            siguiente. Lo que encarga una persona a otra no cuenta.
          </>
        )}
      </p>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {rows.map((row) => (
          <li
            key={row.userId}
            className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${
              row.used >= usage.cap ? "bg-critical-bg text-critical" : "bg-tz-bone text-brand-text-2"
            }`}
          >
            {row.userId === ownUserId ? "Tú" : nameOf(row.userId)}: {row.used}/{usage.cap}
          </li>
        ))}
      </ul>
    </div>
  );
}

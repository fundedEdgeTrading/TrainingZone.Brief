import Link from "next/link";

export type TaskView = "tablero" | "lista" | "historico";

const LABEL: Record<TaskView, string> = {
  tablero: "Tablero",
  lista: "Lista",
  historico: "Histórico",
};

/**
 * Tablero / lista / histórico. Es navegación real (la vista va en la URL, no en
 * un estado de cliente) para que se pueda compartir un enlace al histórico y
 * para que los filtros de la barra sigan aplicando al cambiar de vista.
 */
export function ViewSwitcher({ current, params }: { current: TaskView; params: Record<string, string | undefined> }) {
  return (
    <div className="inline-flex bg-brand-bg border border-tz-sand rounded-xl p-1 gap-1">
      {(Object.keys(LABEL) as TaskView[]).map((view) => {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
        query.set("vista", view);
        return (
          <Link
            key={view}
            href={`/tareas?${query.toString()}`}
            aria-current={current === view ? "page" : undefined}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 ${
              current === view ? "bg-tz-black text-tz-bone" : "text-brand-text-2 hover:bg-tz-sand/60"
            }`}
          >
            {LABEL[view]}
          </Link>
        );
      })}
    </div>
  );
}

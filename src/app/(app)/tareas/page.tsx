import { requireRole } from "@/lib/guard";
import { canAssignTasks } from "@/lib/rbac";
import { centerScopeFor } from "@/lib/center-scope";
import { parseFilterValues } from "@/lib/filter-params";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { FilterToolbar, type FilterGroup } from "@/components/ui/filter-toolbar";
import { listAssignableUsers, listTasks, type TaskRow } from "@/lib/tasks-queries";
import {
  ACTIVE_TASK_STATUSES,
  DONE_COLUMN_WINDOW_HOURS,
  EMPTY_TASK_SELECTION,
  NO_CATEGORY,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  countOverdueTasks,
  groupTasksByStatus,
  matchesTask,
  sortTasksByUrgency,
  taskCategories,
  type TaskSelection,
} from "@/lib/tasks";
import { NewTaskDrawer } from "./new-task-drawer";
import { TasksBoard } from "./tasks-board";
import { TasksList } from "./tasks-list";
import { ViewSwitcher, type TaskView } from "./view-switcher";
import { PRIORITY_TONE, type TaskCardData } from "./task-card";

/**
 * Tareas del equipo (F10). Sistema aparte del calendario de sesiones
 * (`/agenda`): aquí no se agenda a nadie, se reparte trabajo. `dueDate` es la
 * única fecha de una tarea, y con ella basta para montar más adelante una vista
 * de calendario sin tocar el modelo.
 */
const STAFF_ROLES = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION", "HR_MANAGER"] as const;

type SearchParams = {
  vista?: string;
  q?: string;
  recipientUserId?: string;
  status?: string;
  priority?: string;
  category?: string;
};

function parseView(raw: string | undefined): TaskView {
  return raw === "lista" || raw === "historico" ? raw : "tablero";
}

/** Fechas → ISO: las tarjetas son componentes de cliente. */
function toCardData(task: TaskRow): TaskCardData & { startedAt: string | null } {
  return {
    id: task.id,
    title: task.title,
    body: task.body,
    category: task.category,
    priority: task.priority,
    dueDate: task.dueDate?.toISOString() ?? null,
    startedAt: task.startedAt?.toISOString() ?? null,
    resolvedAt: task.resolvedAt?.toISOString() ?? null,
    recipientUserId: task.recipientUserId,
    recipientName: task.recipient.name,
    createdByName: task.createdBy?.name ?? null,
  };
}

function facetCount(base: TaskRow[], sel: TaskSelection, axis: keyof TaskSelection, value: string) {
  return base.filter((task) => matchesTask(task, { ...sel, [axis]: [value] })).length;
}

export default async function TareasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireRole([...STAFF_ROLES]);
  const { id: userId, orgId, role } = session.user;
  const params = await searchParams;
  const view = parseView(params.vista);

  // Quien reparte trabajo ve el tablero del equipo entero; el resto, lo suyo.
  // La restricción va en la consulta, no en el filtro de pantalla: un eje de la
  // barra se puede quitar desde la URL, un `where` no.
  const canAssign = canAssignTasks(role);
  const scopeToSelf = canAssign ? undefined : userId;

  // Ámbito de centro (center-scope.ts): quien reparte ve el tablero de SUS
  // centros, no el de toda la organización. Antes solo se acotaba a "lo mío"
  // cuando el rol no podía repartir; quien sí podía veía siempre todo.
  const centerScope = await centerScopeFor(session.user);
  const centerIds = centerScope ?? undefined;

  const [tasks, recentlyDone, assignees] = await Promise.all([
    listTasks(orgId, { scope: view === "historico" ? "historico" : "activas", recipientUserId: scopeToSelf, q: params.q, centerIds }),
    view === "tablero"
      ? listTasks(orgId, { scope: "recien-hechas", recipientUserId: scopeToSelf, q: params.q, centerIds })
      : Promise.resolve([] as TaskRow[]),
    listAssignableUsers(orgId, centerIds),
  ]);

  const selection: TaskSelection = {
    ...EMPTY_TASK_SELECTION,
    recipientUserId: parseFilterValues(params.recipientUserId),
    // El histórico es todo "Hecha": ofrecer el eje de estado ahí solo sirve
    // para vaciar la pantalla.
    status: view === "historico" ? [] : parseFilterValues(params.status),
    priority: parseFilterValues(params.priority),
    category: parseFilterValues(params.category),
  };

  const allInView = [...tasks, ...recentlyDone];
  const visible = allInView.filter((task) => matchesTask(task, selection));
  const active = visible.filter((task) => !task.resolvedAt);

  const byStatus = groupTasksByStatus(visible);
  const overdue = countOverdueTasks(active, new Date());

  const categories = taskCategories(allInView);
  const assigneeName = new Map(assignees.map((a) => [a.id, a.name]));

  const filterGroups: FilterGroup[] = [
    // Sin permiso para repartir no hay nadie más en pantalla: el eje sobraría.
    ...(canAssign
      ? [
          {
            name: "recipientUserId",
            label: "Asignada a",
            width: 262,
            options: [...new Set(allInView.map((t) => t.recipientUserId))].map((id) => ({
              value: id,
              label: assigneeName.get(id) ?? allInView.find((t) => t.recipientUserId === id)?.recipient.name ?? "Sin nombre",
              count: facetCount(allInView, selection, "recipientUserId", id),
            })),
          },
        ]
      : []),
    ...(view === "historico"
      ? []
      : [
          {
            name: "status",
            label: "Estado",
            width: 220,
            options: ACTIVE_TASK_STATUSES.map((status) => ({
              value: status,
              label: TASK_STATUS_LABEL[status],
              count: facetCount(allInView, selection, "status", status),
            })),
          },
        ]),
    {
      name: "priority",
      label: "Prioridad",
      width: 220,
      options: TASK_PRIORITIES.map((priority) => ({
        value: priority,
        label: TASK_PRIORITY_LABEL[priority],
        tone: PRIORITY_TONE[priority],
        count: facetCount(allInView, selection, "priority", priority),
      })),
    },
    {
      name: "category",
      label: "Categoría",
      width: 252,
      options: [
        ...categories.map((category) => ({
          value: category,
          label: category,
          count: facetCount(allInView, selection, "category", category),
        })),
        { value: NO_CATEGORY, label: "Sin categoría", count: facetCount(allInView, selection, "category", NO_CATEGORY) },
      ],
    },
  ];

  const assigneeOptions = assignees.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="tz-page space-y-4">
      <PageHeader
        kicker="Tareas del equipo"
        description={
          canAssign
            ? "Encarga trabajo a mano, reasígnalo y sigue en qué punto está. Las tareas completadas salen del tablero y quedan en el histórico."
            : "Tu trabajo pendiente. Muévelo de columna según avances y márcalo hecho al terminar."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ViewSwitcher current={view} params={params} />
            <NewTaskDrawer
              assignees={assigneeOptions}
              categories={categories}
              defaultRecipientId={userId}
              canAssign={canAssign}
            />
          </div>
        }
      />

      {view !== "historico" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <KpiCard label="Abiertas" value={String(active.length)} hint="por hacer" tone="accent" />
          <KpiCard
            label="En curso"
            value={String(byStatus.EN_CURSO.length)}
            hint="ya empezadas"
            tone="warning"
          />
          <KpiCard
            label="Vencidas"
            value={String(overdue)}
            hint="pasadas de fecha"
            tone={overdue > 0 ? "critical" : "default"}
          />
          <KpiCard
            label="Completadas"
            value={String(byStatus.HECHA.length)}
            hint={`últimas ${DONE_COLUMN_WINDOW_HOURS} h`}
            tone="good"
          />
        </div>
      )}

      <FilterToolbar
        groups={filterGroups}
        total={visible.length}
        resultLabel={{ one: "tarea", many: "tareas" }}
        searchPlaceholder="Buscar en el texto de la tarea…"
      />

      {view === "tablero" ? (
        allInView.length === 0 ? (
          <EmptyState title="Sin tareas" description="No hay nada pendiente. Crea la primera con «Nueva tarea»." />
        ) : (
          <TasksBoard
            tasksByStatus={{
              PENDIENTE: byStatus.PENDIENTE.map(toCardData),
              EN_CURSO: byStatus.EN_CURSO.map(toCardData),
              HECHA: byStatus.HECHA.map(toCardData),
            }}
            assignees={assigneeOptions}
            canReassign={canAssign}
          />
        )
      ) : (
        <TasksList
          tasks={(view === "historico" ? visible : sortTasksByUrgency(visible)).map(toCardData)}
          assignees={assigneeOptions}
          canReassign={canAssign && view !== "historico"}
          readOnly={view === "historico"}
          emptyTitle={view === "historico" ? "Histórico vacío" : "Sin tareas"}
          emptyDescription={
            view === "historico"
              ? "Aquí quedan las tareas completadas. Todavía no se ha cerrado ninguna."
              : "No hay nada pendiente que encaje con estos filtros."
          }
        />
      )}
    </div>
  );
}

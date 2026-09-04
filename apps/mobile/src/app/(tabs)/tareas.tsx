import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import {  } from "expo-router";
import { goBack } from "@/utils/navigation";
import { useAuth } from "@/auth/auth-context";
import { canAssignTasks } from "@/auth/routes";
import { useCreateTask, useSetTaskStatus, useTasks } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Chip, ChipRow } from "@/components/Chip";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/Segmented";
import { Sheet } from "@/components/Sheet";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { addDaysToIso, formatDayMonth, todayIso } from "@/utils/format";
import type { TaskItem, TaskPriority, TaskStatus } from "@/api/types";

/**
 * Tareas (F10) en la app. La web tiene un tablero de tres columnas que se
 * arrastra; en una pantalla de 390 px eso no cabe, así que aquí el estado es un
 * `Segmented` y el gesto es una casilla. Los datos y las reglas son los mismos
 * (`canWorkOnTask`): lo que cambia es cómo se toca.
 *
 * El corte principal no es la categoría sino el VENCIMIENTO: lo que vence hoy
 * arriba, en `theme.critical`. Es la pregunta que se hace alguien que abre esto
 * entre dos sesiones.
 */
export default function TasksScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { state } = useAuth();
  const role = state.status === "signedIn" ? state.user.role : null;
  const [tab, setTab] = useState<TaskStatus>("PENDIENTE");
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [composing, setComposing] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useTasks(scope);
  const setStatus = useSetTaskStatus();

  const canAssign = Boolean(role && canAssignTasks(role));
  const today = todayIso();

  const visible = useMemo(() => {
    if (!data) return [];
    if (tab === "HECHA") return data.done;
    return data.tasks.filter((t) => t.status === tab);
  }, [data, tab]);

  const groups = useMemo(() => groupByDue(visible, today), [visible, today]);

  async function move(task: TaskItem, status: TaskStatus) {
    try {
      await setStatus.mutateAsync({ id: task.id, status });
      toast.show(status === "HECHA" ? "Tarea completada." : status === "EN_CURSO" ? "Tarea en curso." : "Tarea reabierta.");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo mover la tarea.", "critical");
    }
  }

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader
          kicker="LO QUE TIENES QUE HACER"
          title="Tareas"
          tight
          right={
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Volver"
                onPress={() => goBack("/mas")}
                style={[styles.iconButton, { borderColor: theme.border }]}
              >
                <Icon name="chevron-left" size={17} color={theme.text} />
              </Pressable>
              {/* El `+` de cabecera solo aparece con permiso de asignar; un
                  entrenador siempre puede crearse tareas a sí mismo desde la
                  hoja, que es lo que abre este mismo botón. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nueva tarea"
                onPress={() => setComposing(true)}
                style={[styles.iconButton, { borderColor: theme.border }]}
              >
                <Icon name="plus" size={17} color={theme.gold} />
              </Pressable>
            </View>
          }
        />
      </FadeInUp>

      <FadeInUp delay={stagger(1)}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "PENDIENTE", label: `Por hacer${data ? ` · ${data.counts.todo}` : ""}` },
            { value: "EN_CURSO", label: `En curso${data ? ` · ${data.counts.doing}` : ""}` },
            { value: "HECHA", label: "Hechas" },
          ]}
        />
      </FadeInUp>

      {canAssign ? (
        <ChipRow>
          <Chip label="Mis tareas" selected={scope === "mine"} onPress={() => setScope("mine")} />
          <Chip label="Todo el equipo" selected={scope === "team"} onPress={() => setScope("team")} />
        </ChipRow>
      ) : null}

      {isLoading ? (
        <SkeletonList rows={4} shape="row" note="Cargando tus tareas…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudieron cargar las tareas" description="Desliza hacia abajo para reintentar." />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="check"
          title={tab === "HECHA" ? "Nada cerrado todavía" : "Nada pendiente"}
          description={tab === "HECHA" ? "Aquí aparece lo que has completado en el último día." : "Cuando alguien te encargue algo, aparecerá aquí."}
        />
      ) : (
        groups.map((group) => (
          <View key={group.label} style={{ gap: 10 }}>
            <Text style={[typo.kicker, { color: group.urgent ? theme.critical : theme.textMuted, marginTop: 4 }]}>
              {group.label}
            </Text>
            {group.tasks.map((task, index) => (
              <FadeInUp key={task.id} delay={stagger(index)}>
                <TaskCard task={task} onMove={move} busy={setStatus.isPending && setStatus.variables?.id === task.id} />
              </FadeInUp>
            ))}
          </View>
        ))
      )}

      <ComposeSheet
        visible={composing}
        onClose={() => setComposing(false)}
        canAssign={canAssign}
        assignables={data?.assignables ?? []}
      />
    </ScreenContainer>
  );
}

/**
 * Cortes por vencimiento. Una tarea sin fecha no es más urgente que una con
 * ella, así que las nulas cierran la lista en vez de encabezarla.
 */
function groupByDue(tasks: TaskItem[], today: string): { label: string; urgent: boolean; tasks: TaskItem[] }[] {
  const weekEnd = addDaysToIso(today, 7);
  const buckets: Record<string, TaskItem[]> = { overdue: [], today: [], week: [], later: [], none: [] };

  for (const task of tasks) {
    if (!task.dueDate) buckets.none.push(task);
    else {
      const day = task.dueDate.slice(0, 10);
      if (day < today) buckets.overdue.push(task);
      else if (day === today) buckets.today.push(task);
      else if (day <= weekEnd) buckets.week.push(task);
      else buckets.later.push(task);
    }
  }

  return [
    { label: "Vencidas", urgent: true, tasks: buckets.overdue },
    { label: "Vence hoy", urgent: true, tasks: buckets.today },
    { label: "Esta semana", urgent: false, tasks: buckets.week },
    { label: "Más adelante", urgent: false, tasks: buckets.later },
    { label: "Sin fecha", urgent: false, tasks: buckets.none },
  ].filter((group) => group.tasks.length > 0);
}

const PRIORITY_TONE: Record<TaskPriority, "critical" | "warning" | "neutral"> = {
  ALTA: "critical",
  MEDIA: "warning",
  BAJA: "neutral",
};

function TaskCard({
  task,
  onMove,
  busy,
}: {
  task: TaskItem;
  onMove: (task: TaskItem, status: TaskStatus) => void;
  busy: boolean;
}) {
  const theme = useTheme();
  const done = task.status === "HECHA";

  return (
    <Card style={[styles.taskCard, done ? { opacity: 0.6 } : null]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, busy }}
        accessibilityLabel={done ? `Reabrir ${task.title}` : `Completar ${task.title}`}
        disabled={busy}
        hitSlop={8}
        onPress={() => onMove(task, done ? "PENDIENTE" : "HECHA")}
        style={[
          styles.checkbox,
          { borderColor: done ? theme.good : theme.border, backgroundColor: done ? theme.good : "transparent" },
        ]}
      >
        {done ? <Icon name="check" size={13} color={theme.inkText} strokeWidth={2.4} /> : null}
      </Pressable>

      <View style={{ flex: 1, gap: 7 }}>
        <Text
          style={[styles.taskTitle, { color: theme.text, textDecorationLine: done ? "line-through" : "none" }]}
        >
          {task.title}
        </Text>
        {task.body ? (
          <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={3}>
            {task.body}
          </Text>
        ) : null}

        <View style={styles.chipRow}>
          {task.dueDate ? <Badge label={formatDayMonth(task.dueDate)} tone="outline" /> : null}
          {task.category ? <Badge label={task.category} tone="neutral" /> : null}
          <Badge label={task.priority} tone={PRIORITY_TONE[task.priority]} />
          {/* Quién la encargó importa: una tarea que te ha puesto dirección no
              se negocia igual que una que te pusiste tú. */}
          {task.assignedByOther && task.createdByName ? (
            <Badge label={`Te la asignó ${task.createdByName.split(" ")[0]}`} tone="gold" />
          ) : null}
          {!task.mine && task.recipientName ? <Badge label={task.recipientName} tone="outline" /> : null}
        </View>

        {!done && task.status === "PENDIENTE" ? (
          <Button
            title="Empezar"
            variant="outline"
            size="sm"
            style={{ alignSelf: "flex-start" }}
            loading={busy}
            onPress={() => onMove(task, "EN_CURSO")}
          />
        ) : null}
      </View>
    </Card>
  );
}

function ComposeSheet({
  visible,
  onClose,
  canAssign,
  assignables,
}: {
  visible: boolean;
  onClose: () => void;
  canAssign: boolean;
  assignables: { id: string; name: string }[];
}) {
  const theme = useTheme();
  const toast = useToast();
  const createTask = useCreateTask();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIA");
  const [due, setDue] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setBody("");
    setPriority("MEDIA");
    setDue(null);
    setRecipient(null);
  }

  async function submit() {
    try {
      await createTask.mutateAsync({ title, body: body || null, priority, dueDate: due, recipientUserId: recipient });
      toast.show("Tarea creada.");
      reset();
      onClose();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo crear la tarea.", "critical");
    }
  }

  const today = todayIso();

  return (
    <Sheet visible={visible} onClose={onClose} kicker="NUEVA TAREA" title="¿Qué hay que hacer?">
      <Field label="Tarea" value={title} onChangeText={setTitle} placeholder="Llamar a Marta para cerrar su prueba" />
      <Field label="Detalle (opcional)" value={body} onChangeText={setBody} multiline placeholder="Contexto que haga falta" />

      <Text style={[typo.label, { color: theme.textMuted }]}>Prioridad</Text>
      <Segmented
        value={priority}
        onChange={setPriority}
        options={[
          { value: "ALTA", label: "Alta" },
          { value: "MEDIA", label: "Media" },
          { value: "BAJA", label: "Baja" },
        ]}
      />

      <Text style={[typo.label, { color: theme.textMuted }]}>Vence</Text>
      <ChipRow>
        <Chip label="Sin fecha" selected={due === null} onPress={() => setDue(null)} />
        <Chip label="Hoy" selected={due === today} onPress={() => setDue(today)} />
        <Chip label="Mañana" selected={due === addDaysToIso(today, 1)} onPress={() => setDue(addDaysToIso(today, 1))} />
        <Chip label="En una semana" selected={due === addDaysToIso(today, 7)} onPress={() => setDue(addDaysToIso(today, 7))} />
      </ChipRow>

      {canAssign && assignables.length > 0 ? (
        <>
          <Text style={[typo.label, { color: theme.textMuted }]}>Para quién</Text>
          <ChipRow>
            <Chip label="Para mí" selected={recipient === null} onPress={() => setRecipient(null)} />
            {assignables.map((person) => (
              <Chip
                key={person.id}
                label={person.name}
                selected={recipient === person.id}
                onPress={() => setRecipient(person.id)}
              />
            ))}
          </ChipRow>
        </>
      ) : null}

      <Button
        title="Crear tarea"
        variant="gold"
        disabled={!title.trim()}
        loading={createTask.isPending}
        onPress={submit}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", gap: 8 },
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  taskCard: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.6, alignItems: "center", justifyContent: "center", marginTop: 2 },
  taskTitle: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});

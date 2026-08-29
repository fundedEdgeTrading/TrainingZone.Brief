import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { resolveNotification } from "@/lib/notifications";
import {
  createManualTask,
  listTasks,
  reassignTask,
  reopenTask,
  setTaskProgress,
  type TaskRow,
} from "@/lib/tasks-queries";
import {
  groupTasksByStatus,
  matchesTask,
  taskStatus,
  EMPTY_TASK_SELECTION,
  MAX_TITLE_LENGTH,
  NO_CATEGORY,
} from "@/lib/tasks";
import { canAssignTasks, canWorkOnTask } from "@/lib/rbac";

/**
 * Tareas manuales (F10). Lo que se fija aquí es el contrato del alta manual y
 * de la reasignación sobre el modelo compartido con el motor de reglas:
 *
 * 1. Crear una tarea deja constancia de **quién la manda** además de quién la
 *    hace. Sin eso, una bandeja llena de encargos anónimos no dice de quién
 *    viene ninguno.
 * 2. Reasignar cambia el destinatario y **NO** toca al creador. Es el punto que
 *    más fácil se rompe al tocar la reasignación —bastaría con reescribir
 *    `createdByUserId` "para que cuadre"— y el que hace que una tarea que pasa
 *    por tres manos siga sabiendo de dónde salió.
 * 3. Completar es `resolveNotification`, el mismo camino que usa la campana: la
 *    tarea sale de las vistas activas y sigue consultable en el histórico.
 *
 * Se prueba contra la base real y no con dobles: el riesgo está en lo que queda
 * escrito en la fila (y en lo que NO se reescribe), que es justo lo que un
 * doble de `prisma` daría por bueno. Cada test monta su propia organización y
 * la borra al terminar, así que no depende de los datos de demo ni los ensucia.
 */

const SUFFIX = "e2e-tasks-test";

type Fixture = {
  orgId: string;
  directorId: string;
  trainerAId: string;
  trainerBId: string;
  deactivatedId: string;
  memberUserId: string;
};

let seq = 0;

async function createUser(orgId: string, tag: string, role: "OWNER" | "TRAINER" | "MEMBER", opts: { deactivated?: boolean } = {}) {
  const email = `${SUFFIX}-${tag}-${seq++}@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "x" } });
  return prisma.user.create({
    data: {
      identityId: identity.id,
      orgId,
      name: `Usuario ${tag}`,
      email,
      role,
      deactivatedAt: opts.deactivated ? new Date() : null,
    },
  });
}

/** Organización mínima con dirección, dos entrenadores, una baja y un socio. */
async function createFixture(tag: string): Promise<Fixture> {
  const org = await prisma.organization.create({ data: { name: `Tareas ${tag}`, slug: `${SUFFIX}-${tag}` } });
  const [director, trainerA, trainerB, deactivated, memberUser] = await Promise.all([
    createUser(org.id, `${tag}-dir`, "OWNER"),
    createUser(org.id, `${tag}-tr-a`, "TRAINER"),
    createUser(org.id, `${tag}-tr-b`, "TRAINER"),
    createUser(org.id, `${tag}-baja`, "TRAINER", { deactivated: true }),
    createUser(org.id, `${tag}-socio`, "MEMBER"),
  ]);
  return {
    orgId: org.id,
    directorId: director.id,
    trainerAId: trainerA.id,
    trainerBId: trainerB.id,
    deactivatedId: deactivated.id,
    memberUserId: memberUser.id,
  };
}

/** Alta con los valores mínimos; cada test cambia solo lo que le importa. */
function taskInput(fx: Fixture, over: Partial<Parameters<typeof createManualTask>[0]> = {}) {
  return {
    orgId: fx.orgId,
    createdByUserId: fx.directorId,
    recipientUserId: fx.trainerAId,
    title: "Llamar a la lista de espera",
    ...over,
  };
}

async function readTask(taskId: string) {
  return prisma.notification.findUniqueOrThrow({ where: { id: taskId } });
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.notification.deleteMany({ where: { orgId: org.id } });
    await prisma.user.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
  // Las credenciales se borran al final y solo las que ya no sostienen ninguna
  // membresía: en mitad de la suite hay varias organizaciones de prueba vivas a
  // la vez, y borrar por prefijo de email dentro del bucle se lleva por delante
  // identidades cuyos usuarios siguen colgando de tareas de otra. Al ir por
  // huérfanas, esta limpieza recoge además lo que dejara una ejecución anterior
  // interrumpida, que si no chocaría con el `@unique` del email.
  await prisma.identity.deleteMany({ where: { email: { startsWith: SUFFIX }, memberships: { none: {} } } });
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ---------- Creación ----------

test("crear una tarea manual guarda destinatario, creador, categoría, prioridad y fecha límite", async () => {
  const fx = await createFixture("crear");
  const dueDate = new Date("2026-09-15T23:59:59.000Z");

  const result = await createManualTask(
    taskInput(fx, { body: "Tres huecos libres", category: "Comercial", priority: "ALTA", dueDate })
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const task = await readTask(result.taskId);
  assert.equal(task.kind, "TASK");
  assert.equal(task.recipientUserId, fx.trainerAId);
  assert.equal(task.createdByUserId, fx.directorId);
  assert.equal(task.title, "Llamar a la lista de espera");
  assert.equal(task.body, "Tres huecos libres");
  assert.equal(task.category, "Comercial");
  assert.equal(task.priority, "ALTA");
  assert.equal(task.dueDate?.toISOString(), dueDate.toISOString());
  // Nace pendiente: ni empezada ni resuelta.
  assert.equal(task.startedAt, null);
  assert.equal(task.resolvedAt, null);
  assert.equal(taskStatus(task), "PENDIENTE");
});

test("sin prioridad ni categoría, la tarea nace en MEDIA y sin cajón", async () => {
  const fx = await createFixture("defaults");
  const result = await createManualTask(taskInput(fx, { category: "   " }));
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const task = await readTask(result.taskId);
  assert.equal(task.priority, "MEDIA");
  // Una categoría de solo espacios es "sin categoría", no una etiqueta vacía
  // que llenaría el eje de filtro de opciones fantasma.
  assert.equal(task.category, null);
});

test("una tarea sin texto o con un texto interminable se rechaza", async () => {
  const fx = await createFixture("validacion");

  const empty = await createManualTask(taskInput(fx, { title: "   " }));
  assert.equal(empty.ok, false);

  const tooLong = await createManualTask(taskInput(fx, { title: "a".repeat(MAX_TITLE_LENGTH + 1) }));
  assert.equal(tooLong.ok, false);

  assert.equal(await prisma.notification.count({ where: { orgId: fx.orgId } }), 0);
});

// El destinatario es una clave ajena: sin esta comprobación, asignar a alguien
// de otra organización no fallaría hasta el `INSERT`, y asignar a un socio o a
// una baja de plantilla no fallaría nunca.
test("no se puede asignar una tarea a un socio, a una baja de plantilla ni a alguien de otra organización", async () => {
  const fx = await createFixture("destinatario");
  const otra = await createFixture("destinatario-ajena");

  for (const recipientUserId of [fx.memberUserId, fx.deactivatedId, otra.trainerAId, ""]) {
    const result = await createManualTask(taskInput(fx, { recipientUserId }));
    assert.equal(result.ok, false, recipientUserId);
  }
  assert.equal(await prisma.notification.count({ where: { orgId: fx.orgId } }), 0);
});

// ---------- Reasignación ----------

test("reasignar cambia quién la hace y conserva quién la mandó", async () => {
  const fx = await createFixture("reasignar");
  const created = await createManualTask(taskInput(fx));
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const result = await reassignTask(fx.orgId, created.taskId, fx.trainerBId);
  assert.equal(result.ok, true);

  const task = await readTask(created.taskId);
  assert.equal(task.recipientUserId, fx.trainerBId);
  // El punto de todo el test: el creador original NO se reescribe.
  assert.equal(task.createdByUserId, fx.directorId);
});

test("reasignar varias veces sigue conservando al creador original", async () => {
  const fx = await createFixture("reasignar-cadena");
  const created = await createManualTask(taskInput(fx));
  assert.equal(created.ok, true);
  if (!created.ok) return;

  for (const to of [fx.trainerBId, fx.directorId, fx.trainerAId]) {
    assert.equal((await reassignTask(fx.orgId, created.taskId, to)).ok, true);
  }

  const task = await readTask(created.taskId);
  assert.equal(task.recipientUserId, fx.trainerAId);
  assert.equal(task.createdByUserId, fx.directorId);
});

test("no se reasigna a un destinatario inválido ni una tarea de otra organización", async () => {
  const fx = await createFixture("reasignar-limites");
  const otra = await createFixture("reasignar-limites-ajena");
  const created = await createManualTask(taskInput(fx));
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.equal((await reassignTask(fx.orgId, created.taskId, fx.memberUserId)).ok, false);
  assert.equal((await reassignTask(fx.orgId, created.taskId, fx.deactivatedId)).ok, false);
  assert.equal((await reassignTask(fx.orgId, created.taskId, otra.trainerAId)).ok, false);
  // La tarea existe, pero no en ESA organización: el ámbito no se salta.
  assert.equal((await reassignTask(otra.orgId, created.taskId, otra.trainerAId)).ok, false);

  assert.equal((await readTask(created.taskId)).recipientUserId, fx.trainerAId);
});

test("una tarea completada ya no se reasigna", async () => {
  const fx = await createFixture("reasignar-hecha");
  const created = await createManualTask(taskInput(fx));
  assert.equal(created.ok, true);
  if (!created.ok) return;

  await resolveNotification(fx.orgId, fx.trainerAId, created.taskId);
  const result = await reassignTask(fx.orgId, created.taskId, fx.trainerBId);
  assert.equal(result.ok, false);
  assert.equal((await readTask(created.taskId)).recipientUserId, fx.trainerAId);
});

// ---------- Estado y filtrado ----------

test("el estado sale de las marcas de tiempo, no de una columna aparte", () => {
  const at = new Date();
  assert.equal(taskStatus({ startedAt: null, resolvedAt: null }), "PENDIENTE");
  assert.equal(taskStatus({ startedAt: at, resolvedAt: null }), "EN_CURSO");
  assert.equal(taskStatus({ startedAt: null, resolvedAt: at }), "HECHA");
  // Empezada y terminada está hecha: `resolvedAt` manda.
  assert.equal(taskStatus({ startedAt: at, resolvedAt: at }), "HECHA");
});

test("mover a «en curso» y de vuelta a «pendiente» solo toca startedAt", async () => {
  const fx = await createFixture("progreso");
  const created = await createManualTask(taskInput(fx));
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.equal((await setTaskProgress(fx.orgId, created.taskId, "EN_CURSO")).ok, true);
  const started = await readTask(created.taskId);
  assert.notEqual(started.startedAt, null);
  assert.equal(started.resolvedAt, null);
  assert.equal(taskStatus(started), "EN_CURSO");

  assert.equal((await setTaskProgress(fx.orgId, created.taskId, "PENDIENTE")).ok, true);
  assert.equal(taskStatus(await readTask(created.taskId)), "PENDIENTE");
});

test("el filtrado por entrenador y por estado se aplica en AND entre ejes", async () => {
  const fx = await createFixture("filtrado");
  const [pendienteA, enCursoA, pendienteB] = await Promise.all([
    createManualTask(taskInput(fx, { title: "Pendiente de A", category: "Comercial" })),
    createManualTask(taskInput(fx, { title: "En curso de A", priority: "ALTA" })),
    createManualTask(taskInput(fx, { title: "Pendiente de B", recipientUserId: fx.trainerBId })),
  ]);
  assert.ok(pendienteA.ok && enCursoA.ok && pendienteB.ok);
  if (!(pendienteA.ok && enCursoA.ok && pendienteB.ok)) return;
  await setTaskProgress(fx.orgId, enCursoA.taskId, "EN_CURSO");

  const tasks = await listTasks(fx.orgId);
  assert.equal(tasks.length, 3);

  const titles = (rows: TaskRow[]) => rows.map((t) => t.title).sort();

  // Por entrenador.
  assert.deepEqual(
    titles(tasks.filter((t) => matchesTask(t, { ...EMPTY_TASK_SELECTION, recipientUserId: [fx.trainerAId] }))),
    ["En curso de A", "Pendiente de A"]
  );
  // Por estado.
  assert.deepEqual(
    titles(tasks.filter((t) => matchesTask(t, { ...EMPTY_TASK_SELECTION, status: ["PENDIENTE"] }))),
    ["Pendiente de A", "Pendiente de B"]
  );
  // Los dos ejes a la vez: AND entre ejes.
  assert.deepEqual(
    titles(
      tasks.filter((t) => matchesTask(t, { ...EMPTY_TASK_SELECTION, recipientUserId: [fx.trainerAId], status: ["PENDIENTE"] }))
    ),
    ["Pendiente de A"]
  );
  // Y OR dentro de un mismo eje.
  assert.equal(
    tasks.filter((t) => matchesTask(t, { ...EMPTY_TASK_SELECTION, recipientUserId: [fx.trainerAId, fx.trainerBId] })).length,
    3
  );
  // Prioridad y categoría, incluido el cajón de las que no tienen.
  assert.deepEqual(titles(tasks.filter((t) => matchesTask(t, { ...EMPTY_TASK_SELECTION, priority: ["ALTA"] }))), [
    "En curso de A",
  ]);
  assert.deepEqual(titles(tasks.filter((t) => matchesTask(t, { ...EMPTY_TASK_SELECTION, category: [NO_CATEGORY] }))), [
    "En curso de A",
    "Pendiente de B",
  ]);

  // El reparto por columna del tablero cuadra con el filtro por estado.
  const byStatus = groupTasksByStatus(tasks);
  assert.deepEqual(titles(byStatus.PENDIENTE), ["Pendiente de A", "Pendiente de B"]);
  assert.deepEqual(titles(byStatus.EN_CURSO), ["En curso de A"]);
  assert.deepEqual(byStatus.HECHA, []);
});

test("la consulta acota por entrenador en el propio where, no solo en pantalla", async () => {
  const fx = await createFixture("ambito");
  await createManualTask(taskInput(fx));
  await createManualTask(taskInput(fx, { recipientUserId: fx.trainerBId }));

  const suyas = await listTasks(fx.orgId, { recipientUserId: fx.trainerBId });
  assert.equal(suyas.length, 1);
  assert.equal(suyas[0].recipientUserId, fx.trainerBId);
});

// ---------- Completar ----------

test("completar saca la tarea de las vistas activas y la deja en el histórico", async () => {
  const fx = await createFixture("completar");
  const created = await createManualTask(taskInput(fx));
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const resolved = await resolveNotification(fx.orgId, fx.trainerAId, created.taskId);
  assert.equal(resolved.ok, true);

  const task = await readTask(created.taskId);
  assert.notEqual(task.resolvedAt, null);
  assert.equal(taskStatus(task), "HECHA");

  // Fuera de las vistas activas...
  assert.deepEqual(await listTasks(fx.orgId, { scope: "activas" }), []);
  // ...pero sigue consultable en el histórico, sin perder de quién venía.
  const historico = await listTasks(fx.orgId, { scope: "historico" });
  assert.equal(historico.length, 1);
  assert.equal(historico[0].id, created.taskId);
  assert.equal(historico[0].createdBy?.id, fx.directorId);
  // Y la columna "Hecha" del tablero la enseña mientras está dentro de ventana.
  assert.equal((await listTasks(fx.orgId, { scope: "recien-hechas" })).length, 1);
});

test("quien no es el destinatario no cierra la tarea salvo que reparta trabajo", async () => {
  const fx = await createFixture("completar-ajena");
  const created = await createManualTask(taskInput(fx));
  assert.equal(created.ok, true);
  if (!created.ok) return;

  // La campana: solo cierra lo suyo.
  assert.equal((await resolveNotification(fx.orgId, fx.trainerBId, created.taskId)).ok, false);
  assert.equal((await readTask(created.taskId)).resolvedAt, null);

  // El tablero de quien reparte: cierra la de otro, y por el mismo camino.
  assert.equal((await resolveNotification(fx.orgId, fx.directorId, created.taskId, { anyRecipient: true })).ok, true);
  assert.notEqual((await readTask(created.taskId)).resolvedAt, null);
});

test("reabrir devuelve la tarea a pendiente sin tocar al creador", async () => {
  const fx = await createFixture("reabrir");
  const created = await createManualTask(taskInput(fx));
  assert.equal(created.ok, true);
  if (!created.ok) return;

  await setTaskProgress(fx.orgId, created.taskId, "EN_CURSO");
  await resolveNotification(fx.orgId, fx.trainerAId, created.taskId);
  assert.equal((await reopenTask(fx.orgId, created.taskId)).ok, true);

  const task = await readTask(created.taskId);
  assert.equal(taskStatus(task), "PENDIENTE");
  assert.equal(task.createdByUserId, fx.directorId);
});

test("una tarea completada no se mueve de columna; primero hay que reabrirla", async () => {
  const fx = await createFixture("mover-hecha");
  const created = await createManualTask(taskInput(fx));
  assert.equal(created.ok, true);
  if (!created.ok) return;

  await resolveNotification(fx.orgId, fx.trainerAId, created.taskId);
  assert.equal((await setTaskProgress(fx.orgId, created.taskId, "EN_CURSO")).ok, false);
  assert.equal(taskStatus(await readTask(created.taskId)), "HECHA");
});

// ---------- Permisos ----------

test("repartir trabajo es de dirección y del entrenador admin; trabajar en lo tuyo, de cualquiera", () => {
  for (const role of ["OWNER", "CENTER_DIRECTOR", "TRAINER_ADMIN"] as const) {
    assert.equal(canAssignTasks(role), true, role);
  }
  for (const role of ["TRAINER", "RECEPTION", "HR_MANAGER", "PLATFORM_ADMIN", "MEMBER"] as const) {
    assert.equal(canAssignTasks(role), false, role);
  }

  const mia = { recipientUserId: "u-1" };
  assert.equal(canWorkOnTask("TRAINER", "u-1", mia), true);
  assert.equal(canWorkOnTask("TRAINER", "u-2", mia), false);
  // Quien reparte puede cerrar la de otro: es quien responde de que se haga.
  assert.equal(canWorkOnTask("CENTER_DIRECTOR", "u-2", mia), true);
});

import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getMemberNotes, setMemberNoteArchived, setMemberNoteImportant } from "@/lib/members-queries";
import {
  activeNotes,
  archivedNotes,
  highlightedNotes,
  isArchived,
  RECENT_NOTE_DAYS,
  type NoteForHighlight,
} from "@/lib/member-notes";

/**
 * Bitácora destacada y archivado.
 *
 * Lo que se protege aquí es la promesa que hace la pantalla al entrenador que
 * abre la ficha antes de entrar a la sala: **lo destacado se ve siempre y lo
 * archivado no estorba, pero no desaparece**. Los dos fallos que rompen esa
 * promesa son simétricos y ninguno da error en pantalla:
 *
 *   · que una nota archivada siga colándose arriba (archivar no serviría de
 *     nada, y con notas viejas el bloque se vuelve ruido que nadie lee), y
 *   · que archivar acabe borrando de facto — que la nota no se pueda volver a
 *     consultar ni recuperar. Una bitácora de la que se pierde información no
 *     es una bitácora.
 *
 * La mitad de arriba prueba el reparto sin base de datos (es una regla, no una
 * consulta) y la de abajo lo escribe de verdad contra Postgres, porque marcar y
 * archivar son `UPDATE`s acotados por `orgId` y lo que importa es lo que queda
 * escrito y lo que devuelve la consulta de la ficha.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const AHORA = new Date("2026-08-29T10:00:00.000Z");

function nota(id: string, overrides: Partial<NoteForHighlight> = {}): NoteForHighlight {
  return {
    id,
    important: false,
    archivedAt: null,
    createdAt: new Date(AHORA.getTime() - DAY_MS), // ayer
    ...overrides,
  };
}

// ---------- El reparto (puro) ----------

test("lo importante sube al bloque destacado por viejo que sea", () => {
  const vieja = nota("vieja-importante", {
    important: true,
    createdAt: new Date(AHORA.getTime() - 300 * DAY_MS),
  });
  const destacadas = highlightedNotes([vieja, nota("de-ayer")], AHORA);

  // Primero la importante: "no le mandes remo, se marea" no caduca, y es lo
  // que hay que leer antes que la observación de ayer.
  assert.deepEqual(
    destacadas.map((n) => n.id),
    ["vieja-importante", "de-ayer"]
  );
});

test("lo reciente entra sin marcar y lo antiguo se queda en el hilo", () => {
  const reciente = nota("reciente", { createdAt: new Date(AHORA.getTime() - 2 * DAY_MS) });
  const antigua = nota("antigua", {
    createdAt: new Date(AHORA.getTime() - (RECENT_NOTE_DAYS + 1) * DAY_MS),
  });

  assert.deepEqual(
    highlightedNotes([antigua, reciente], AHORA).map((n) => n.id),
    ["reciente"]
  );
});

test("una nota archivada no aparece en el bloque destacado ni aunque sea importante", () => {
  const archivada = nota("archivada", { important: true, archivedAt: new Date(AHORA) });

  // El caso que justifica el archivado: la observación era importante en su
  // momento ("vuelve de una sobrecarga"), ya no aplica, y alguien la aparta.
  // Si siguiera arriba, archivar sería un botón que no hace nada.
  assert.deepEqual(highlightedNotes([archivada, nota("viva")], AHORA).map((n) => n.id), ["viva"]);
});

test("el bloque destacado tiene tope y prioriza lo importante", () => {
  const importantes = [1, 2, 3, 4].map((i) =>
    nota(`imp-${i}`, { important: true, createdAt: new Date(AHORA.getTime() - i * DAY_MS) })
  );
  const recientes = [1, 2, 3, 4].map((i) =>
    nota(`rec-${i}`, { createdAt: new Date(AHORA.getTime() - i * DAY_MS) })
  );

  const destacadas = highlightedNotes([...recientes, ...importantes], AHORA, { limit: 5 });

  assert.equal(destacadas.length, 5);
  assert.deepEqual(
    destacadas.map((n) => n.id),
    ["imp-1", "imp-2", "imp-3", "imp-4", "rec-1"]
  );
});

test("activas y archivadas reparten la lista entera sin perder ninguna", () => {
  const notas = [nota("a"), nota("b", { archivedAt: new Date(AHORA) }), nota("c")];

  assert.deepEqual(activeNotes(notas).map((n) => n.id), ["a", "c"]);
  assert.deepEqual(archivedNotes(notas).map((n) => n.id), ["b"]);
  assert.equal(activeNotes(notas).length + archivedNotes(notas).length, notas.length);
});

// ---------- Marcar y archivar (contra la base real) ----------

const SUFFIX = "test-member-notes";

type Fixture = { orgId: string; memberId: string };

async function createFixture(tag: string): Promise<Fixture> {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Bitácora ${tag}`, slug } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: `Bitácora ${tag}`,
      email: `${slug}@example.com`,
    },
  });
  return { orgId: org.id, memberId: member.id };
}

async function writeNote(f: Fixture, body: string, important = false) {
  return prisma.memberNote.create({
    data: { orgId: f.orgId, memberId: f.memberId, body, important },
  });
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: SUFFIX } },
    select: { id: true },
  });
  for (const org of orgs) {
    await prisma.memberNote.deleteMany({ where: { orgId: org.id } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("una nota nace normal y se puede marcar y desmarcar como importante", async () => {
  const f = await createFixture("importante");
  const note = await writeNote(f, "Prefiere entrenar temprano");
  assert.equal(note.important, false, "una nota de bitácora no nace destacada");

  assert.equal(await setMemberNoteImportant(f.orgId, note.id, true), true);
  assert.equal((await prisma.memberNote.findUniqueOrThrow({ where: { id: note.id } })).important, true);

  assert.equal(await setMemberNoteImportant(f.orgId, note.id, false), true);
  assert.equal((await prisma.memberNote.findUniqueOrThrow({ where: { id: note.id } })).important, false);
});

test("marcar una nota de otra organización no toca nada", async () => {
  const a = await createFixture("org-a");
  const b = await createFixture("org-b");
  const note = await writeNote(a, "Nota de la organización A");

  // El `orgId` va dentro del `where`: con el id correcto pero el tenant
  // equivocado, el UPDATE no alcanza ninguna fila.
  assert.equal(await setMemberNoteImportant(b.orgId, note.id, true), false);
  assert.equal((await prisma.memberNote.findUniqueOrThrow({ where: { id: note.id } })).important, false);
});

test("archivar aparta la nota y desarchivar la devuelve tal cual estaba", async () => {
  const f = await createFixture("archivar");
  const note = await writeNote(f, "Vino con agujetas del martes", true);

  assert.equal(await setMemberNoteArchived(f.orgId, note.id, true), true);
  const archivada = await prisma.memberNote.findUniqueOrThrow({ where: { id: note.id } });
  assert.notEqual(archivada.archivedAt, null);
  assert.equal(archivada.important, true, "archivar no borra la marca de importante");

  assert.equal(await setMemberNoteArchived(f.orgId, note.id, false), true);
  const recuperada = await prisma.memberNote.findUniqueOrThrow({ where: { id: note.id } });
  assert.equal(recuperada.archivedAt, null);
  assert.equal(recuperada.important, true);
  assert.equal(recuperada.body, "Vino con agujetas del martes");
});

test("lo archivado sale del bloque destacado pero se sigue consultando", async () => {
  const f = await createFixture("consulta");
  const viva = await writeNote(f, "Está entrenando muy bien la sentadilla", true);
  const apartada = await writeNote(f, "Molestia puntual de la semana pasada", true);
  await setMemberNoteArchived(f.orgId, apartada.id, true);

  // Lo que ve la ficha: la consulta trae las dos (archivar no borra) y el
  // reparto deja arriba solo la viva.
  const notas = await getMemberNotes(f.orgId, f.memberId);
  assert.equal(notas.length, 2, "la nota archivada sigue en la base de datos");

  assert.deepEqual(highlightedNotes(notas, new Date()).map((n) => n.id), [viva.id]);
  assert.deepEqual(activeNotes(notas).map((n) => n.id), [viva.id]);

  // Y sigue siendo consultable con su texto y su autoría intactos: el panel de
  // "Notas archivadas" es exactamente esto.
  const [consultada] = archivedNotes(notas);
  assert.equal(consultada.id, apartada.id);
  assert.equal(consultada.body, "Molestia puntual de la semana pasada");
  assert.equal(isArchived(consultada), true);
});

import { prisma } from "@/lib/prisma";
import { centerScopeFor, intersectCenterScope, isMemberInScope, type ScopedUser } from "@/lib/center-scope";
import { canManageMembers } from "@/lib/rbac";
import {
  AUTOMATIC_TAG_HAND_ERROR,
  TAG_LABEL_MAX,
  canEditTagByHand,
  isAutomaticTagKey,
  tagKeyFromLabel,
  toneOf,
  type MemberTagView,
} from "@/lib/tags";

/**
 * ============================ EL CONTRATO CON E2 ============================
 *
 * E2 (motor de flujos) pregunta dos cosas en caliente y no necesita leer nada
 * más de esta pista. Estos son los nombres, y no cambian:
 *
 *   tagsForMember(user, memberId): Promise<MemberTagView[]>
 *     «¿Qué etiquetas tiene este socio AHORA?» — el estado actual, que vive en
 *     `MemberTag`. El histórico (cuándo se puso, cuándo se quitó y por qué
 *     regla) está en `MemberTagEvent` y NO sale por aquí.
 *
 *   membersWithTag(user, tagKey, opts?): Promise<string[]>
 *     «¿Quién tiene esta etiqueta?» — ids de socio, en orden estable.
 *     `opts.centerIds` REDUCE (nunca amplía) el ámbito de quien pregunta, igual
 *     que el filtro de centro del listado de socios.
 *
 * TRES COSAS QUE HAY QUE SABER ANTES DE LLAMAR:
 *
 * 1. EL ÁMBITO DE CENTRO VA DENTRO. Las dos funciones lo aplican ellas mismas
 *    (`centerScopeFor` / `isMemberInScope`), no lo delegan en quien llama. Si un
 *    socio no es de los centros del usuario, `tagsForMember` devuelve `[]` y
 *    `membersWithTag` no lo incluye — nunca un error que revele que existe.
 *    Una copia «espejo» de esta comprobación en la API móvil es exactamente el
 *    fallo que más se repite en este repositorio: llama a estas funciones.
 *
 * 2. SE PREGUNTA POR CLAVE, NO POR RÓTULO. `tagKey` es la clave estable
 *    (`grupo_reducido`, `impago`…): la condición de un flujo guarda la clave, y
 *    así renombrar una etiqueta en `/etiquetas` no deja flujos apuntando a nada.
 *
 * 3. SOLO LAS ACTIVAS. Una etiqueta desactivada deja de segmentar pero NO se
 *    borra —borrarla se llevaría por delante el histórico de los flujos que la
 *    usaron—, así que sigue viéndose en la ficha del socio que la tenía y
 *    `membersWithTag` deja de devolverla. Si un flujo la cita, no entra nadie
 *    nuevo; los que ya entraron siguen explicables.
 *
 * ===========================================================================
 */

/** Selección mínima para pintar una etiqueta. */
const TAG_VIEW_SELECT = {
  assignedAt: true,
  ruleKey: true,
  assignedBy: { select: { name: true } },
  tagDefinition: { select: { id: true, key: true, label: true, kind: true, description: true, color: true, active: true } },
} as const;

type TagRow = {
  assignedAt: Date;
  ruleKey: string | null;
  assignedBy: { name: string | null } | null;
  tagDefinition: {
    id: string;
    key: string;
    label: string;
    kind: "AUTOMATIC" | "MANUAL";
    description: string | null;
    color: string | null;
    active: boolean;
  };
};

function toView(row: TagRow): MemberTagView {
  return {
    id: row.tagDefinition.id,
    key: row.tagDefinition.key,
    label: row.tagDefinition.label,
    kind: row.tagDefinition.kind,
    tone: toneOf(row.tagDefinition.color),
    description: row.tagDefinition.description,
    assignedAt: row.assignedAt,
    ruleKey: row.ruleKey,
    assignedByName: row.assignedBy?.name ?? null,
  };
}

/** Las automáticas primero, y dentro de cada clase por rótulo: orden estable. */
function byKindThenLabel(a: MemberTagView, b: MemberTagView): number {
  if (a.kind !== b.kind) return a.kind === "AUTOMATIC" ? -1 : 1;
  return a.label.localeCompare(b.label, "es-ES");
}

/** «¿Qué etiquetas tiene este socio ahora?» — contrato con E2. */
export async function tagsForMember(user: ScopedUser, memberId: string): Promise<MemberTagView[]> {
  if (!(await isMemberInScope(user, memberId))) return [];

  const rows = await prisma.memberTag.findMany({
    where: { orgId: user.orgId, memberId },
    select: TAG_VIEW_SELECT,
  });
  return rows.map(toView).sort(byKindThenLabel);
}

/** «¿Quién tiene esta etiqueta?» — contrato con E2. Ids de socio, ya acotados. */
export async function membersWithTag(
  user: ScopedUser,
  tagKey: string,
  opts: { centerIds?: string[] } = {}
): Promise<string[]> {
  const scope = await centerScopeFor(user);
  const centerIds = intersectCenterScope(scope, opts.centerIds ?? []);
  // Ámbito vacío = no manda en ningún centro: no ve a nadie. Sin esta rama,
  // `{ in: [] }` y «sin filtro» se confunden y el resultado sería TODA la
  // organización, que es el fallo clásico de esta comprobación.
  if (centerIds !== undefined && centerIds.length === 0) return [];

  const rows = await prisma.memberTag.findMany({
    where: {
      orgId: user.orgId,
      tagDefinition: { orgId: user.orgId, key: tagKey, active: true },
      ...(centerIds ? { member: { primaryCenterId: { in: centerIds } } } : {}),
    },
    select: { memberId: true },
    orderBy: { assignedAt: "asc" },
  });
  return rows.map((r) => r.memberId);
}

// ---------------------------------------------------------------------------
// El catálogo (`/etiquetas`)
// ---------------------------------------------------------------------------

export type TagDefinitionView = {
  id: string;
  key: string;
  label: string;
  kind: "AUTOMATIC" | "MANUAL";
  tone: ReturnType<typeof toneOf>;
  description: string | null;
  active: boolean;
  /** A cuántos socios del ámbito afecta HOY. */
  affectedMembers: number;
};

/**
 * El catálogo con su recuento de socios afectados (mismo patrón que E3-04 con
 * las reglas de aptitud): DOS consultas en total, no una por etiqueta, y el
 * recuento acotado al ámbito de centro de quien mira — dirección de centro no
 * cuenta socios de otro centro ni siquiera de forma agregada.
 *
 * Una automática con 0 socios, o con TODOS, es una regla mal acotada: el
 * recuento es lo que lo enseña sin tener que leer el código.
 */
export async function listTagDefinitions(user: ScopedUser): Promise<TagDefinitionView[]> {
  const scope = await centerScopeFor(user);

  const [definitions, counts] = await Promise.all([
    prisma.memberTagDefinition.findMany({
      where: { orgId: user.orgId },
      orderBy: [{ kind: "asc" }, { label: "asc" }],
      select: { id: true, key: true, label: true, kind: true, description: true, color: true, active: true },
    }),
    prisma.memberTag.groupBy({
      by: ["tagDefinitionId"],
      where: {
        orgId: user.orgId,
        ...(scope === null ? {} : { member: { primaryCenterId: { in: scope } } }),
      },
      _count: { _all: true },
    }),
  ]);

  const countById = new Map(counts.map((c) => [c.tagDefinitionId, c._count._all]));
  return definitions.map((d) => ({
    id: d.id,
    key: d.key,
    label: d.label,
    kind: d.kind,
    tone: toneOf(d.color),
    description: d.description,
    active: d.active,
    affectedMembers: countById.get(d.id) ?? 0,
  }));
}

/**
 * Las etiquetas ACTIVAS del catálogo, para los desplegables: el «+ Etiqueta» de
 * la ficha (solo manuales) y el filtro de `/members` (las dos clases).
 */
export async function listTagOptions(user: ScopedUser, opts: { kind?: "AUTOMATIC" | "MANUAL" } = {}) {
  return prisma.memberTagDefinition.findMany({
    where: { orgId: user.orgId, active: true, ...(opts.kind ? { kind: opts.kind } : {}) },
    orderBy: [{ kind: "asc" }, { label: "asc" }],
    select: { id: true, key: true, label: true, kind: true, color: true },
  });
}

/**
 * Las CLAVES de las etiquetas de cada socio, para filtrar el listado. Devuelve
 * solo lo que hace falta para decidir si una fila pasa el filtro: una consulta
 * para toda la lista, no una por socio.
 */
export async function tagKeysByMember(user: ScopedUser, memberIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (memberIds.length === 0) return out;

  const scope = await centerScopeFor(user);
  if (scope !== null && scope.length === 0) return out;

  const rows = await prisma.memberTag.findMany({
    where: {
      orgId: user.orgId,
      memberId: { in: memberIds },
      tagDefinition: { active: true },
      ...(scope === null ? {} : { member: { primaryCenterId: { in: scope } } }),
    },
    select: { memberId: true, tagDefinition: { select: { key: true } } },
  });

  for (const row of rows) {
    const list = out.get(row.memberId) ?? [];
    list.push(row.tagDefinition.key);
    out.set(row.memberId, list);
  }
  return out;
}

export type TagActionResult = { ok: true } | { ok: false; error: string };

function normalizeLabel(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, TAG_LABEL_MAX);
}

/**
 * Crear una etiqueta manual. La clave sale del rótulo UNA vez y ya no se toca:
 * renombrar después no puede dejar sin efecto la condición de un flujo.
 */
export async function createManualTag(user: ScopedUser, rawLabel: string, tone: string): Promise<TagActionResult> {
  if (!canManageMembers(user.role)) return { ok: false, error: "No tienes permiso para gestionar etiquetas." };

  const label = normalizeLabel(rawLabel);
  if (label.length < 2) return { ok: false, error: "El rótulo de la etiqueta es obligatorio." };

  const key = tagKeyFromLabel(label);
  if (!key) return { ok: false, error: "Ese rótulo no da una clave válida: usa letras o números." };
  // Las nueve claves del sistema están reservadas: una manual llamada «Impago»
  // conviviría con la automática y nadie sabría cuál manda.
  if (isAutomaticTagKey(key)) return { ok: false, error: "Esa clave la usa una etiqueta automática del sistema." };

  const existing = await prisma.memberTagDefinition.findUnique({
    where: { orgId_key: { orgId: user.orgId, key } },
    select: { id: true, active: true },
  });
  if (existing) {
    // Reactivar en vez de duplicar: la etiqueta desactivada conserva su
    // histórico y sus asignaciones, y crear otra con el mismo nombre partiría
    // la segmentación en dos mitades.
    if (!existing.active) {
      await prisma.memberTagDefinition.update({ where: { id: existing.id }, data: { active: true, label } });
      return { ok: true };
    }
    return { ok: false, error: "Ya existe una etiqueta con ese nombre." };
  }

  await prisma.memberTagDefinition.create({
    data: { orgId: user.orgId, key, label, kind: "MANUAL", color: toneOf(tone) },
  });
  return { ok: true };
}

/** Renombrar: solo manuales, y solo el rótulo. La clave nunca se mueve. */
export async function renameManualTag(user: ScopedUser, id: string, rawLabel: string): Promise<TagActionResult> {
  if (!canManageMembers(user.role)) return { ok: false, error: "No tienes permiso para gestionar etiquetas." };

  const label = normalizeLabel(rawLabel);
  if (label.length < 2) return { ok: false, error: "El rótulo de la etiqueta es obligatorio." };

  const definition = await prisma.memberTagDefinition.findFirst({
    where: { id, orgId: user.orgId },
    select: { id: true, kind: true },
  });
  if (!definition) return { ok: false, error: "Esa etiqueta no existe." };
  // Del rótulo de una automática manda `tags.ts`: la siembra lo devolvería a su
  // sitio en la pasada siguiente y parecería un fallo.
  if (!canEditTagByHand(definition.kind)) return { ok: false, error: AUTOMATIC_TAG_HAND_ERROR };

  await prisma.memberTagDefinition.update({ where: { id: definition.id }, data: { label } });
  return { ok: true };
}

/**
 * Desactivar NO borra. Una etiqueta borrada se lleva por delante el histórico de
 * los flujos que la usaron, así que lo que se apaga es su capacidad de
 * segmentar, no su rastro.
 */
export async function setManualTagActive(user: ScopedUser, id: string, active: boolean): Promise<TagActionResult> {
  if (!canManageMembers(user.role)) return { ok: false, error: "No tienes permiso para gestionar etiquetas." };

  const definition = await prisma.memberTagDefinition.findFirst({
    where: { id, orgId: user.orgId },
    select: { id: true, kind: true },
  });
  if (!definition) return { ok: false, error: "Esa etiqueta no existe." };
  if (!canEditTagByHand(definition.kind)) return { ok: false, error: AUTOMATIC_TAG_HAND_ERROR };

  await prisma.memberTagDefinition.update({ where: { id: definition.id }, data: { active } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Poner y quitar a mano (la ficha del socio)
// ---------------------------------------------------------------------------

async function manualDefinitionInOrg(orgId: string, tagDefinitionId: string) {
  return prisma.memberTagDefinition.findFirst({
    where: { id: tagDefinitionId, orgId },
    select: { id: true, kind: true, active: true },
  });
}

/** Poner una etiqueta manual a un socio. Con permiso y con ámbito de centro. */
export async function assignManualTag(
  user: ScopedUser,
  memberId: string,
  tagDefinitionId: string
): Promise<TagActionResult> {
  if (!canManageMembers(user.role)) return { ok: false, error: "No tienes permiso para etiquetar socios." };
  if (!(await isMemberInScope(user, memberId))) return { ok: false, error: "Este socio no es de tus centros." };

  const definition = await manualDefinitionInOrg(user.orgId, tagDefinitionId);
  if (!definition) return { ok: false, error: "Esa etiqueta no existe." };
  if (!canEditTagByHand(definition.kind)) return { ok: false, error: AUTOMATIC_TAG_HAND_ERROR };
  if (!definition.active) return { ok: false, error: "Esa etiqueta está desactivada." };

  const already = await prisma.memberTag.findUnique({
    where: { memberId_tagDefinitionId: { memberId, tagDefinitionId } },
    select: { id: true },
  });
  // Idempotente también a mano: dos clics no son dos etiquetas ni dos trazas.
  if (already) return { ok: true };

  await prisma.$transaction([
    prisma.memberTag.create({
      data: { orgId: user.orgId, memberId, tagDefinitionId, assignedByUserId: user.id },
    }),
    prisma.memberTagEvent.create({
      data: { orgId: user.orgId, memberId, tagDefinitionId, action: "ADDED", actorUserId: user.id },
    }),
  ]);
  return { ok: true };
}

/**
 * Quitar una etiqueta manual. Una AUTOMÁTICA se rechaza aquí: volvería sola en
 * la siguiente pasada del cron y parecería un fallo. Contradecir al sistema se
 * hace con una etiqueta manual distinta.
 */
export async function removeManualTag(
  user: ScopedUser,
  memberId: string,
  tagDefinitionId: string
): Promise<TagActionResult> {
  if (!canManageMembers(user.role)) return { ok: false, error: "No tienes permiso para etiquetar socios." };
  if (!(await isMemberInScope(user, memberId))) return { ok: false, error: "Este socio no es de tus centros." };

  const definition = await manualDefinitionInOrg(user.orgId, tagDefinitionId);
  if (!definition) return { ok: false, error: "Esa etiqueta no existe." };
  if (!canEditTagByHand(definition.kind)) return { ok: false, error: AUTOMATIC_TAG_HAND_ERROR };

  const row = await prisma.memberTag.findUnique({
    where: { memberId_tagDefinitionId: { memberId, tagDefinitionId } },
    select: { id: true },
  });
  if (!row) return { ok: true };

  await prisma.$transaction([
    prisma.memberTag.delete({ where: { id: row.id } }),
    prisma.memberTagEvent.create({
      data: { orgId: user.orgId, memberId, tagDefinitionId, action: "REMOVED", actorUserId: user.id },
    }),
  ]);
  return { ok: true };
}

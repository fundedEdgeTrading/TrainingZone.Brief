import { prisma } from "@/lib/prisma";
import { orgHasFeature } from "@/lib/entitlements";
import { canManageMembers } from "@/lib/rbac";
import type { ScopedUser } from "@/lib/center-scope";
import { listTagOptions, tagsForMember } from "@/lib/tags-queries";
import { toneOf } from "@/lib/tags";
import { MemberTagsPanel } from "./member-tags-panel";

/**
 * E14-23 · Las etiquetas del socio, en su ficha.
 *
 * Vive en `etiquetas/` y no en `members/[id]/` a propósito: así la ficha solo
 * gana dos líneas (el import y el componente) y todo lo demás —consulta, ámbito
 * de centro, permiso y muro de plano— es de esta pista. Se monta como
 * componente de servidor propio para que su consulta no engorde la de la ficha.
 *
 * Si la organización no tiene `marketing_automatizado`, no se pinta nada: sin
 * plan no corre el motor, así que enseñar un hueco vacío solo confundiría.
 */
export default async function MemberTagsSection({
  user,
  memberId,
}: {
  user: ScopedUser;
  memberId: string;
}) {
  const org = await prisma.organization.findUnique({
    where: { id: user.orgId },
    select: { platformPlan: true, platformStatus: true },
  });
  if (!org || !orgHasFeature(org, "marketing_automatizado")) return null;

  const canEdit = canManageMembers(user.role);
  const [tags, options] = await Promise.all([
    // El ámbito de centro va DENTRO de la consulta: un socio de otro centro
    // devuelve lista vacía, nunca un error que revele que existe.
    tagsForMember(user, memberId),
    canEdit ? listTagOptions(user, { kind: "MANUAL" }) : Promise.resolve([]),
  ]);

  return (
    <MemberTagsPanel
      memberId={memberId}
      tags={tags}
      canEdit={canEdit}
      options={options.map((o) => ({ id: o.id, label: o.label, tone: toneOf(o.color) }))}
    />
  );
}

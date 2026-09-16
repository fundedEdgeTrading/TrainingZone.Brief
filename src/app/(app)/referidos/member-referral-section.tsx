import type { ScopedUser } from "@/lib/center-scope";
import { orgHasFeature } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { canManageMembers } from "@/lib/rbac";
import { canBeAmbassador, referralCodeForMember, referralFunnelFor } from "@/lib/referrals";
import { publicOrigin } from "@/lib/site";
import { MemberReferralPanel } from "./member-referral-panel";

/**
 * E14-30 · "visible en su ficha, y preparado para la app".
 *
 * Vive en `referidos/` y no en `members/[id]/` por lo mismo que la sección de
 * etiquetas de E1: la ficha gana dos líneas —el import y el componente— y todo
 * lo demás (consulta, ámbito de centro, permiso y muro de plan) es de esta
 * pista. Es un componente de servidor propio para que su consulta no engorde la
 * de la ficha, que ya es larga.
 *
 * Sin `marketing_automatizado` no se pinta nada: sin plan no hay programa de
 * referidos, y enseñar un enlace que no lleva a ningún sitio confundiría.
 */
export default async function MemberReferralSection({ user, memberId }: { user: ScopedUser; memberId: string }) {
  const org = await prisma.organization.findUnique({
    where: { id: user.orgId },
    select: { platformPlan: true, platformStatus: true },
  });
  if (!org || !orgHasFeature(org, "marketing_automatizado")) return null;

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: user.orgId },
    select: { state: true },
  });
  if (!member) return null;

  // El ámbito de centro va DENTRO de las dos consultas: un socio de otro centro
  // devuelve null y lista vacía, nunca un error que revele que existe.
  const [code, referred] = await Promise.all([
    referralCodeForMember(user, memberId),
    referralFunnelFor(user, memberId),
  ]);

  // Sin código y sin poder crearlo (o con el socio de baja) no hay nada que
  // enseñar: la ficha no gana una caja vacía.
  if (!code && (!canManageMembers(user.role) || !canBeAmbassador(member.state))) return null;

  return (
    <MemberReferralPanel
      memberId={memberId}
      origin={publicOrigin()}
      initialCode={code?.code ?? null}
      revoked={Boolean(code?.revokedAt)}
      canGenerate={canManageMembers(user.role) && canBeAmbassador(member.state)}
      referred={referred.map((r) => ({
        leadId: r.leadId,
        name: `${r.firstName} ${r.lastName}`.trim(),
        state: r.state,
        viaLink: r.viaLink,
      }))}
    />
  );
}

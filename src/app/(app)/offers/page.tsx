import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { canApproveOffers, canProposeOffers } from "@/lib/rbac";
import { listOffers } from "@/lib/offers-queries";
import { listActiveMembersForSelect } from "@/lib/members-queries";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { BadgeTone } from "@/components/ui/badge";
import { OfferActions } from "./offer-actions-inline";
import { NewOfferForm } from "./new-offer-form";

const STATUS_LABEL: Record<string, string> = {
  SUGERIDA: "Sugerida",
  PENDIENTE_DIRECCION: "Pendiente dirección",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  COMUNICADA: "Comunicada",
};
const STATUS_TONE: Record<string, BadgeTone> = {
  SUGERIDA: "neutral",
  PENDIENTE_DIRECCION: "warning",
  APROBADA: "good",
  RECHAZADA: "critical",
  COMUNICADA: "good",
};

export default async function OffersPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  const canApprove = canApproveOffers(session.user.role);
  const canPropose = canProposeOffers(session.user.role);
  const isTrainer = session.user.role === "TRAINER";

  const [offers, members] = await Promise.all([
    listOffers(session.user.orgId, { trainerUserId: isTrainer ? session.user.id : undefined }),
    listActiveMembersForSelect(session.user.orgId, { trainerId: isTrainer ? session.user.id : undefined }),
  ]);

  return (
    <div className="tz-page space-y-4">
      <PageHeader description="Motor de ofertas personalizadas (RB-RRHH-008/013): sugerida → propuesta → aprobación de dirección → comunicada." />

      {canPropose && (
        <Card title="Proponer oferta manual">
          <NewOfferForm members={members} />
        </Card>
      )}

      {offers.length === 0 ? (
        <EmptyState title="Sin ofertas" description="Todavía no hay ofertas personalizadas en curso." />
      ) : (
        <div className="space-y-2.5">
          {offers.map((o) => (
            <div key={o.id} className="bg-brand-card border border-brand-border rounded-card p-4 shadow-card flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/members/${o.member.id}`} className="font-semibold text-brand-text hover:underline">
                    {o.member.firstName} {o.member.lastName}
                  </Link>
                  <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                </div>
                <p className="text-sm text-brand-text-2 mt-1">{o.description}</p>
                <p className="text-xs text-faint mt-1">
                  {o.proposedBy ? `Propuesta por ${o.proposedBy.name}` : "Generada por el motor"}
                  {o.approvedBy ? ` · Decidida por ${o.approvedBy.name}` : ""}
                </p>
              </div>
              <OfferActions offerId={o.id} status={o.status} canApprove={canApprove} canPropose={canPropose} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

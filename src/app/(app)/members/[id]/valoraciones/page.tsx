import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { listAssessmentsForMember, ASSESSMENT_KIND_ORDER } from "@/lib/assessments/queries";
import { ASSESSMENT_KIND_LABEL } from "@/lib/assessments/schemas";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { OpenAssessmentButton } from "./open-assessment-buttons";

export default async function MemberAssessmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);
  const { id } = await params;

  const member = await prisma.member.findFirst({
    where: { id, orgId: session.user.orgId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) notFound();

  const assessments = await listAssessmentsForMember(session.user.orgId, member.id);
  const doneKinds = new Set(assessments.filter((a) => a.completedAt).map((a) => a.kind));
  const pendingKinds = new Set(assessments.filter((a) => !a.completedAt).map((a) => a.kind));
  const openable = ASSESSMENT_KIND_ORDER.filter((k) => !doneKinds.has(k) && !pendingKinds.has(k));

  return (
    <div className="tz-page space-y-4">
      <div className="space-y-1.5">
        <Link href={`/members/${member.id}`} className="text-sm text-tz-black hover:underline">
          ← Volver a la ficha
        </Link>
        <h1 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black">
          Valoraciones · {member.firstName} {member.lastName}
        </h1>
      </div>

      <div className="bg-brand-card border border-brand-border rounded-card p-5 shadow-card">
        {assessments.length === 0 ? (
          <EmptyState
            title="Sin valoraciones todavía"
            description="La valoración inicial es la que alimenta el Semáforo de Aptitud y el Session Brief de este socio."
            action={<OpenAssessmentButton memberId={member.id} kind="INITIAL" label="Empezar valoración inicial" variant="primary" />}
          />
        ) : (
          <ul className="list-none flex flex-col gap-2">
            {assessments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/members/${member.id}/valoraciones/${a.id}`}
                  className="flex items-center justify-between gap-3 flex-wrap rounded-control border border-brand-border px-4 py-3 hover:border-brand-ink transition-colors duration-200"
                >
                  <span className="font-semibold text-sm text-brand-text">{ASSESSMENT_KIND_LABEL[a.kind]}</span>
                  <span className="flex items-center gap-3 text-xs text-brand-muted">
                    {a.completedAt ? (
                      <>
                        <span>
                          {a.completedAt.toLocaleDateString("es-ES")}
                          {a.filledBy?.name ? ` · ${a.filledBy.name}` : ""}
                        </span>
                        <Badge tone="good">Completada</Badge>
                      </>
                    ) : (
                      <>
                        <span>Vence {a.dueDate.toLocaleDateString("es-ES")}</span>
                        <Badge tone="warning">Pendiente</Badge>
                      </>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {openable.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-tz-sand">
            <span className="text-xs text-brand-muted mr-1">Abrir hito:</span>
            {openable.map((kind) => (
              <OpenAssessmentButton
                key={kind}
                memberId={member.id}
                kind={kind}
                label={ASSESSMENT_KIND_LABEL[kind]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

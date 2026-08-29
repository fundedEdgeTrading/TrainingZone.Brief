import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { getMemberForUser } from "@/lib/portal-queries";
import { getAssessmentMilestones } from "@/lib/assessments/queries";
import { milestoneLabelOf } from "@/lib/assessments/config";

/**
 * Destino del aviso de valoración vencida (F4 §5.3): la vista del socio.
 *
 * El cuestionario en sí NO se rellena aquí. F3 lo dejó del lado del
 * entrenador (`/members/[id]/valoraciones/...`) porque es él quien firma el
 * PAR-Q con el socio delante y quien interpreta el screening. Lo que el socio
 * necesita saber al entrar es que la tiene pendiente y cómo se cierra.
 */
export default async function PortalAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const { id } = await params;
  // Siempre acotada al socio de la sesión: un id ajeno no abre la ficha de otro.
  const assessment = await prisma.assessment.findFirst({
    where: { id, memberId: member.id },
    select: { kind: true, milestoneKey: true, dueDate: true, completedAt: true },
  });
  if (!assessment) redirect("/portal");

  const milestones = await getAssessmentMilestones(member.orgId);

  return (
    <div className="max-w-[720px] mx-auto flex flex-col gap-[18px]">
      <div className="bg-white border border-brand-border rounded-[18px] p-7">
        <div className="text-[11px] font-bold tracking-[.12em] uppercase text-brand-muted">
          {milestoneLabelOf(assessment, milestones)}
        </div>
        <h1 className="font-display font-extrabold text-[24px] text-brand-text mt-1.5 tracking-[-.01em]">
          {assessment.completedAt ? "Valoración ya entregada" : "Tienes una valoración pendiente"}
        </h1>
        <p className="text-[14.5px] text-brand-text-2 leading-[1.6] mt-3">
          {assessment.completedAt
            ? "Ya la tenemos. Queda en tu ficha junto al resto de tu evolución."
            : "La repasáis tu entrenador y tú en la próxima sesión: él la va rellenando contigo delante. Si quieres adelantarla, díselo por el chat del portal."}
        </p>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { getMemberForUser } from "@/lib/portal-queries";

/**
 * Destino del aviso de valoración vencida (F4 §5.3).
 *
 * **El formulario en sí es de F3**, que sustituye el cuerpo de esta página por
 * los campos reales (`vitalsSchema` + el bloque que corresponda al tipo). Aquí
 * solo vive lo que F4 necesita para que el aviso no apunte al vacío: la
 * comprobación de que la valoración es de quien la abre y sigue pendiente.
 */
export default async function PortalAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const { id } = await params;
  // Siempre acotada al socio de la sesión: un id ajeno no abre la ficha de otro.
  const assessment = await prisma.assessment.findFirst({
    where: { id, memberId: member.id },
    select: { kind: true, dueDate: true, completedAt: true },
  });
  if (!assessment) redirect("/portal");

  return (
    <div className="max-w-[720px] mx-auto flex flex-col gap-[18px]">
      <div className="bg-white border border-brand-border rounded-[18px] p-7">
        <div className="text-[11px] font-bold tracking-[.12em] uppercase text-brand-muted">
          Valoración · {assessment.kind}
        </div>
        <h1 className="font-display font-extrabold text-[24px] text-brand-text mt-1.5 tracking-[-.01em]">
          {assessment.completedAt ? "Valoración ya entregada" : "Tu valoración está preparada"}
        </h1>
        <p className="text-[14.5px] text-brand-text-2 leading-[1.6] mt-3">
          {assessment.completedAt
            ? "Ya la tenemos. Tu entrenador la verá en tu ficha junto al resto de tu evolución."
            : "El cuestionario se rellena con tu entrenador en tu próxima sesión. Si prefieres adelantarlo, díselo por el chat del portal y te lo abre."}
        </p>
      </div>
    </div>
  );
}

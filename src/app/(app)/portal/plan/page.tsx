import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { getMemberForUser, getMemberGoals } from "@/lib/portal-queries";
import { listWorkoutPrograms, listSelfAssessments } from "@/lib/workout-programs";
import { Card } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { RequestWorkoutButton, SelfAssessmentForm, TrainerRatingForm } from "./plan-client";

const STATUS_LABEL: Record<string, string> = { DRAFT: "Por confirmar", PENDING_TRAINER: "Por confirmar", ACTIVE: "Activa", COMPLETED: "Completada" };

export default async function PortalPlanPage() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const [goals, programs, assessments] = await Promise.all([
    getMemberGoals(member.id),
    listWorkoutPrograms(session.user.orgId, member.id),
    listSelfAssessments(member.id),
  ]);

  const hasPendingProgram = programs.some((p) => p.status === "DRAFT" || p.status === "PENDING_TRAINER");

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-4">
      <Card title="Tus objetivos" meta={`${goals.length} activos`}>
        {goals.length === 0 ? (
          <p className="text-sm text-brand-muted">Tu entrenador aún no te ha asignado objetivos concretos.</p>
        ) : (
          <ul className="space-y-2">
            {goals.map((g) => (
              <li key={g.id} className="flex items-center justify-between border-t border-tz-sand pt-2 first:border-0 first:pt-0 text-sm">
                <span className={g.achievedAt ? "line-through text-brand-muted" : "text-brand-text"}>{g.label}</span>
                {g.achievedAt && <Badge tone="good">Conseguido</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Tu rutina para casa" meta="generada con ayuda de IA, confirmada por tu entrenador">
        <div className="space-y-3">
          <RequestWorkoutButton hasPending={hasPendingProgram} />
          {programs.length === 0 ? (
            <p className="text-sm text-brand-muted">Todavía no has solicitado ninguna rutina.</p>
          ) : (
            <ul className="space-y-2">
              {programs.map((p) => (
                <li key={p.id} className="border border-brand-border rounded-lg p-3 text-sm flex items-center justify-between">
                  <span className="text-brand-text-2">{p.createdAt.toLocaleDateString("es-ES")}</span>
                  <Badge tone={p.status === "ACTIVE" ? "good" : "neutral"}>{STATUS_LABEL[p.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card title="Autovaloración" meta="cuéntanos cómo vas">
        <SelfAssessmentForm />
        {assessments[0]?.aiRecommendation && (
          <p className="text-sm text-brand-text-2 mt-3 bg-tz-bone border border-brand-border rounded-lg p-3">{assessments[0].aiRecommendation}</p>
        )}
      </Card>

      {member.trainerId && (
        <Card title="Valora a tu entrenador" meta="confidencial — solo lo ve dirección">
          <TrainerRatingForm />
        </Card>
      )}
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole, memberIsInScope } from "@/lib/guard";
import { getMesocycleDetail } from "@/lib/mesocycle-queries";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { PageHeader } from "@/components/ui/page-header";
import { MesocycleEditor } from "./editor";

export default async function MesocycleEditorPage({
  params,
}: {
  params: Promise<{ id: string; mesocycleId: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);
  const { id: memberId, mesocycleId } = await params;

  const mesocycle = await getMesocycleDetail(session.user.orgId, mesocycleId);
  if (!mesocycle || mesocycle.memberId !== memberId) notFound();
  if (!(await memberIsInScope(session.user, memberId))) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Mesociclo"
        description={
          <>
            Plan de entrenamiento del socio, visible solo para el equipo del centro.{" "}
            <Link href={`/members/${memberId}`} className="underline">
              Volver a la ficha
            </Link>
          </>
        }
      />
      <MesocycleEditor memberId={memberId} mesocycle={mesocycle} aiConfigured={isAiConfigured()} />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { TrainerDebriefForm } from "./debrief-form";

export default async function TrainerDebriefPage({ params }: { params: Promise<{ memberId: string }> }) {
  const session = await requireRole(["TRAINER", "OWNER", "CENTER_DIRECTOR"]);
  const { memberId } = await params;

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { firstName: true, lastName: true },
  });
  if (!member) notFound();

  const memberName = `${member.firstName} ${member.lastName}`;

  return (
    <div className="tz-page max-w-[640px] mx-auto space-y-4">
      <Link href="/trainer" className="text-[13px] font-semibold text-brand-text-2 hover:underline w-fit inline-block">
        ← Volver al panel
      </Link>
      <PageHeader kicker="Feedback mensual" description={`Debrief de ${memberName} para este periodo`} />
      <TrainerDebriefForm memberId={memberId} memberName={memberName} />
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireRole, memberIsInScope } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { getMesocycleDetail, conversationOf } from "@/lib/mesocycle-queries";
import { parseRefineRequest } from "@/lib/ai/mesocycle-prompt";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { MesocycleEditor, type RefineRequest } from "./editor";
import type { MesocycleDetail } from "@/lib/mesocycle-queries";

/**
 * Lo que el entrenador ya le ha pedido a la IA, recuperado de `aiConversation`.
 *
 * El primer mensaje `user` es el briefing de generación y no lleva el marcador,
 * así que `parseRefineRequest` lo descarta solo. No hay fecha por petición en el
 * modelo: se rotulan por orden y se enseñan de la más reciente a la más
 * antigua, que es lo que soporta el dato de hoy.
 */
function refineHistoryOf(mesocycle: MesocycleDetail): RefineRequest[] {
  const requests = conversationOf(mesocycle).flatMap((message) => {
    if (message.role !== "user") return [];
    const content =
      typeof message.content === "string"
        ? message.content
        : message.content
            .flatMap((block) => (block.type === "text" ? [block.text] : []))
            .join("\n");
    const request = parseRefineRequest(content);
    return request ? [request] : [];
  });

  return requests
    .map((text, i) => ({ label: `Petición ${i + 1}`, text }))
    .reverse();
}

export default async function MesocycleEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; mesocycleId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);
  const { id: memberId, mesocycleId } = await params;
  // `?d=1-0`: fase 1, día 0. Con la clave repetida llega un array.
  const { d } = await searchParams;
  const initialDay = Array.isArray(d) ? d[0] : d;

  const mesocycle = await getMesocycleDetail(session.user.orgId, mesocycleId);
  if (!mesocycle || mesocycle.memberId !== memberId) notFound();
  if (!(await memberIsInScope(session.user, memberId))) notFound();

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { firstName: true, lastName: true },
  });

  return (
    <MesocycleEditor
      memberId={memberId}
      memberName={member ? `${member.firstName} ${member.lastName}`.trim() : ""}
      mesocycle={mesocycle}
      aiConfigured={isAiConfigured()}
      refineHistory={refineHistoryOf(mesocycle)}
      initialDay={initialDay}
    />
  );
}

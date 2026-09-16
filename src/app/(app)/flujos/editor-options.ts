import { prisma } from "@/lib/prisma";
import type { ScopedUser } from "@/lib/center-scope";
import { listTagOptions } from "@/lib/tags-queries";
import { getAssessmentMilestones } from "@/lib/assessments/queries";
import { centersForFlows } from "@/lib/flows/queries";
import type { FlowEditorOptions } from "./flow-editor";

/**
 * Lo que el editor necesita para pintar sus desplegables. Sale de las fuentes
 * únicas de cada cosa —el catálogo de etiquetas de E1, los hitos de valoración
 * de M5, los centros del ámbito— y NO de listas copiadas aquí: un desplegable
 * con su propia copia del catálogo es una copia que se queda vieja.
 */
export async function flowEditorOptions(user: ScopedUser): Promise<FlowEditorOptions> {
  const [centers, tags, trainers, milestones] = await Promise.all([
    centersForFlows(user),
    listTagOptions(user),
    prisma.user.findMany({
      // `deactivatedAt` y no un `active`: quien está de baja de plantilla no se
      // puede asignar a nada, y una tarea encargada a quien ya no está es una
      // tarea que nadie va a hacer.
      where: { orgId: user.orgId, role: { in: ["TRAINER", "TRAINER_ADMIN"] }, deactivatedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    getAssessmentMilestones(user.orgId),
  ]);

  return {
    centers,
    tags: tags.map((t) => ({ key: t.key, label: t.label, kind: t.kind })),
    trainers: trainers.map((t) => ({ id: t.id, name: t.name || t.email })),
    milestones: milestones.map((m) => ({ key: m.key, label: m.label })),
  };
}
